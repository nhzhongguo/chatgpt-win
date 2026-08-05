'use strict';

/**
 * 安全模块 - 鉴权、token 管理、限流
 */

const crypto = require('crypto');

class Security {
  constructor(options = {}) {
    this.token = options.initialToken || '';
    this.appName = options.appName || 'ChatGPT Win';
    this.store = options.store || null;
    this.sessionManager = options.sessionManager || null;

    // Rate limiting
    this.RATE_LIMIT_RPM = Math.max(10, Math.min(6000, Number(process.env.CODEX_MAX_RATE_LIMIT_RPM) || 120));
    this.RATE_LIMIT_BURST = Math.max(1, Math.min(100, Math.floor(this.RATE_LIMIT_RPM / 6) || 20));
    this.rateLimitBuckets = new Map();
    this.RATE_LIMIT_CLEANUP_INTERVAL = 60000;

    this._cleanupTimer = setInterval(() => this._cleanupRateLimit(), this.RATE_LIMIT_CLEANUP_INTERVAL);
    if (this._cleanupTimer.unref) this._cleanupTimer.unref();
  }

  // ---- Token ----

  getToken() {
    return this.token;
  }

  rotateToken() {
    this.token = crypto.randomBytes(12).toString('base64url');
    if (this.store) {
      this.store.persistToken(this.token);
      this.store.syncLauncherToken(this.token);
    }
    return this.token;
  }

  // ---- Auth ----

  sessionTokenFromRequest(req) {
    if (!this.sessionManager) return '';
    const fromCookie = this._parseCookies(req.headers.cookie || '').codexMiniSession;
    const fromHeader = req.headers['x-codex-session'];
    return fromCookie || fromHeader || '';
  }

  sessionFromRequest(req) {
    return this.sessionManager ? this.sessionManager.validateSession(this.sessionTokenFromRequest(req)) : null;
  }

  isAuthorized(req) {
    if (this.sessionFromRequest(req)) return true;
    const { URL } = require('url');
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const fromHeader = req.headers['x-mobile-typer-token'];
    const fromQuery = url.searchParams.get('token');
    const fromCookie = this._parseCookies(req.headers.cookie || '').codexMiniToken;
    return fromHeader === this.token || fromQuery === this.token || fromCookie === this.token;
  }

  _parseCookies(header) {
    const cookies = {};
    for (const part of String(header || '').split(';')) {
      const index = part.indexOf('=');
      if (index === -1) continue;
      const key = part.slice(0, index).trim();
      if (!key) continue;
      const value = part.slice(index + 1).trim();
      try { cookies[key] = decodeURIComponent(value); } catch { cookies[key] = value; }
    }
    return cookies;
  }

  // ---- Rate Limiting ----

  /**
   * 双维度限流：IP 与 token 各维护独立令牌桶，任一维度超限即拒绝。
   * @param {string} ip 客户端 IP
   * @param {string} [token] 鉴权 token（可选，命中则额外按 token 维度计数）
   */
  rateLimitCheck(ip, token = '') {
    if (!ip) return false; // 无法确定来源的请求直接拒绝
    const keys = [ip];
    if (token) keys.push(`token:${token}`);
    const now = Date.now();
    for (const key of keys) {
      let bucket = this.rateLimitBuckets.get(key);
      if (!bucket || now - bucket.resetAt >= 60000) {
        bucket = { tokens: this.RATE_LIMIT_BURST, resetAt: now + 60000 };
        this.rateLimitBuckets.set(key, bucket);
      }
      if (bucket.tokens > 0) {
        bucket.tokens -= 1;
      } else {
        return false;
      }
    }
    return true;
  }

  _cleanupRateLimit() {
    const cutoff = Date.now();
    for (const [ip, bucket] of this.rateLimitBuckets) {
      if (cutoff - bucket.resetAt >= 120000) this.rateLimitBuckets.delete(ip);
    }
  }

  destroy() {
    if (this._cleanupTimer) clearInterval(this._cleanupTimer);
    if (this.sessionManager?.destroy) this.sessionManager.destroy();
    this.rateLimitBuckets.clear();
  }
}

module.exports = { Security };
