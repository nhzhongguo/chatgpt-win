'use strict';

/**
 * HTTP 路由处理模块 - 集中管理所有 API 路由注册和分发
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { URL } = require('url');

// Helpers
function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    'Cache-Control': 'no-store',
  });
  res.end(payload);
}

function readBody(req, maxBytes = 28 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > maxBytes) { req.destroy(); reject(Object.assign(new Error('请求体过大。'), { status: 413, code: 'BODY_TOO_LARGE' })); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function getClientIp(req) {
  return (req.socket?.remoteAddress || '').replace('::ffff:', '') || '';
}

function displayPathName(cwd) {
  if (!cwd) return '对话';
  const normalized = path.normalize(cwd);
  if (normalized === os.homedir()) return '~';
  if (normalized === path.parse(normalized).root) return normalized;
  return path.basename(normalized) || normalized;
}

function existingProjectCwds(threads) {
  const seen = new Set();
  const out = [];
  for (const thread of threads) {
    if (!thread.isProjectThread || !thread.projectPath) continue;
    if (seen.has(thread.projectPath)) continue;
    seen.add(thread.projectPath);
    out.push(thread.projectPath);
  }
  return out;
}

class Router {
  constructor(options = {}) {
    this.routes = [];
    this.logger = options.logger || console;
    this.security = options.security;
    this.store = options.store;
    this.parser = options.parser;
    this.scheduler = options.scheduler;
    this.codexAppServer = options.codexAppServer;
    this.appName = options.appName || 'ChatGPT Win';
    this.publicDir = options.publicDir || path.join(__dirname, '..', 'public');
    this.distDir = options.distDir || path.join(__dirname, '..', 'dist');
    this.serviceVersion = options.serviceVersion || '0.0.0';
  }

  // ---- Route Registration ----

  use(method, pattern, handler) {
    this.routes.push({ method, pattern, handler });
  }

  get(pattern, handler) { this.use('GET', pattern, handler); }
  post(pattern, handler) { this.use('POST', pattern, handler); }
  delete(pattern, handler) { this.use('DELETE', pattern, handler); }

  _match(method, pathname) {
    for (const route of this.routes) {
      if (route.method !== method) continue;
      if (typeof route.pattern === 'string') {
        if (route.pattern === pathname) return { handler: route.handler, params: {} };
      } else if (route.pattern instanceof RegExp) {
        const match = pathname.match(route.pattern);
        if (match) return { handler: route.handler, params: match.groups || {} };
      }
    }
    return null;
  }

  // ---- Auth Wrapper ----

  _requireAuth(handler) {
    return async (req, res, params) => {
      if (!this.security.isAuthorized(req)) {
        return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
      }
      return handler.call(this, req, res, params);
    };
  }

  // ---- Public Routes (no auth) ----

  registerPublicRoutes() {
    // Health check
    this.get('/codex/health', (req, res) => {
      const mem = process.memoryUsage();
      return json(res, 200, {
        ok: true,
        service: this.appName,
        version: this.serviceVersion,
        uptime: Math.floor(process.uptime()),
        memory: { rss: mem.rss, heapUsed: mem.heapUsed, heapTotal: mem.heapTotal },
        platform: process.platform,
        node: process.versions.node,
        timestamp: new Date().toISOString(),
      });
    });
  }

  // ---- Authenticated Routes ----

  registerApiRoutes(handlers) {
    // handlers is an object of named handler functions that need access to server-level state
    // This allows routes to delegate to existing handlers while we migrate incrementally

    // Schedule routes - fully migrated to Scheduler module
    this.use('*', '/codex/schedules', async (req, res) => {
      if (!this.security.isAuthorized(req)) {
        return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
      }

      const workspace = handlers.listWorkspaceThreads ? await handlers.listWorkspaceThreads(160) : { threads: [] };
      const projects = existingProjectCwds(workspace.threads || []).map(cwd => ({ cwd, name: displayPathName(cwd) }));

      if (req.method === 'GET') {
        return json(res, 200, { ok: true, schedules: this.scheduler.getTasks(), projects });
      }

      let payload = {};
      try {
        payload = JSON.parse(await readBody(req) || '{}');
      } catch (error) {
        return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
      }

      const action = String(payload.action || '').trim();
      const id = String(payload.id || '').trim();

      try {
        if (action === 'create') {
          const task = this.scheduler.createTask(payload);
          return json(res, 200, { ok: true, schedule: task, schedules: this.scheduler.getTasks(), projects, message: '已创建计划。' });
        }
        if (action === 'update') {
          const task = this.scheduler.updateTask(id, payload);
          return json(res, 200, { ok: true, schedule: task, schedules: this.scheduler.getTasks(), projects, message: '已更新计划。' });
        }
        if (action === 'toggle') {
          const task = this.scheduler.toggleTask(id, payload.enabled === true);
          return json(res, 200, { ok: true, schedule: task, schedules: this.scheduler.getTasks(), projects, message: payload.enabled ? '已启用计划。' : '已暂停计划。' });
        }
        if (action === 'delete') {
          this.scheduler.deleteTask(id);
          return json(res, 200, { ok: true, schedules: this.scheduler.getTasks(), projects, message: '已删除计划。' });
        }
        if (action === 'run') {
          await this.scheduler.runTask(id, { force: true });
          return json(res, 200, { ok: true, schedules: this.scheduler.getTasks(), projects, message: '已提交本次计划。' });
        }
        return json(res, 400, { ok: false, code: 'BAD_SCHEDULE_ACTION', message: '不支持的计划操作。' });
      } catch (error) {
        return json(res, error?.status || 500, {
          ok: false,
          code: error?.code || 'SCHEDULE_FAILED',
          message: error?.message || '处理计划时出错。',
        });
      }
    });

    // Token rotation
    this.post('/codex/rotate-token', this._requireAuth(async (req, res) => {
      const newToken = this.security.rotateToken();
      return json(res, 200, { ok: true, token: newToken, message: '访问令牌已更新。' });
    }));

    // Threads list
    this.get('/codex/threads', this._requireAuth(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = Math.max(1, Math.min(160, Number(url.searchParams.get('limit')) || 80));
      const includeArchived = url.searchParams.get('archived') === '1';
      const threads = this.parser.listThreads(limit);
      const result = { ok: true, threads, timestamp: new Date().toISOString() };
      if (includeArchived) result.archivedThreads = this.parser.listArchivedThreads(limit);
      return json(res, 200, result);
    }));

    // Thread history
    this.get(/^\/codex\/threads\/(?<threadId>[a-f0-9-]+)\/history$/, this._requireAuth(async (req, res, params) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const limit = Math.max(1, Math.min(120, Number(url.searchParams.get('limit')) || 80));
      const result = this.parser.parseThreadHistory(params.threadId, limit);
      return json(res, 200, result);
    }));

    // History attachment
    this.get('/codex/attachment', this._requireAuth(async (req, res) => {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const id = url.searchParams.get('id');
      if (!id) return json(res, 400, { ok: false, message: '缺少附件 ID。' });
      const attachment = this.parser.getHistoryAttachment(id);
      if (!attachment) return json(res, 404, { ok: false, message: '附件不存在或已过期。' });
      try {
        const data = fs.readFileSync(attachment.filePath);
        res.writeHead(200, { 'Content-Type': attachment.mime, 'Content-Length': data.length, 'Cache-Control': 'private, max-age=3600' });
        res.end(data);
      } catch {
        return json(res, 404, { ok: false, message: '附件文件无法读取。' });
      }
    }));
  }

  // ---- Dispatch ----

  async dispatch(req, res) {
    const startTime = Date.now();
    const { pathname } = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    // Rate limiting
    const ip = getClientIp(req);
    if (!this.security.rateLimitCheck(ip)) {
      this.logger.warn('rate_limited', { ip, path: pathname });
      return json(res, 429, { ok: false, code: 'RATE_LIMITED', message: '请求过于频繁，请稍后再试。' });
    }

    // Try exact match and pattern match
    const match = this._match(req.method, pathname) || this._match('*', pathname);
    if (match) {
      try {
        const result = await match.handler(req, res, match.params);
        this.logger.logRequest(req, res.statusCode || 200, Date.now() - startTime);
        return result;
      } catch (error) {
        this.logger.error('route_error', { path: pathname, error: error.message, stack: error.stack });
        if (!res.headersSent) return json(res, error?.status || 500, { ok: false, code: error?.code || 'INTERNAL_ERROR', message: error.message || '服务器内部错误。' });
      }
      return;
    }

    // Static files
    return this._serveStatic(req, res, pathname);
  }

  _serveStatic(req, res, pathname) {
    // Serve from public dir
    const filePath = path.join(this.publicDir, pathname === '/' ? 'index.html' : pathname);
    const safePath = path.normalize(filePath).replace(/\.\./g, '');
    if (!safePath.startsWith(this.publicDir)) {
      return json(res, 403, { ok: false, message: '禁止访问。' });
    }
    fs.readFile(safePath, (err, data) => {
      if (err) {
        // Try dist dir for built assets
        const distPath = path.join(this.distDir, pathname);
        if (distPath.startsWith(this.distDir)) {
          fs.readFile(distPath, (err2, data2) => {
            if (err2) return json(res, 404, { ok: false, message: '文件不存在。' });
            const ext = path.extname(distPath).toLowerCase();
            const mime = this._getMime(ext);
            res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data2.length });
            res.end(data2);
          });
          return;
        }
        return json(res, 404, { ok: false, message: '文件不存在。' });
      }
      const ext = path.extname(safePath).toLowerCase();
      const mime = this._getMime(ext);
      res.writeHead(200, { 'Content-Type': mime, 'Content-Length': data.length, 'Cache-Control': pathname === '/' ? 'no-store' : 'public, max-age=3600' });
      res.end(data);
    });
  }

  _getMime(ext) {
    const mimes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.gif': 'image/gif',
      '.svg': 'image/svg+xml',
      '.ico': 'image/x-icon',
      '.webp': 'image/webp',
      '.woff': 'font/woff',
      '.woff2': 'font/woff2',
      '.ttf': 'font/ttf',
      '.map': 'application/json',
    };
    return mimes[ext] || 'application/octet-stream';
  }
}

module.exports = { Router, json, readBody, getClientIp };
