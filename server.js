#!/usr/bin/env node
'use strict';

const http = require('http');
const https = require('https');
const os = require('os');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { spawn } = require('child_process');
const { URL } = require('url');
const { CodexAppServer } = require('./src/codex-app-server');

const APP_NAME = process.env.CODEX_MAX_APP_NAME || process.env.CODEX_MINI_APP_NAME || 'ChatGPT Win';
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const TOKEN = process.env.MOBILE_TYPER_TOKEN || crypto.randomBytes(12).toString('base64url');
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY_BYTES = Number(process.env.CODEX_MAX_MAX_BODY_BYTES || process.env.CODEX_MINI_MAX_BODY_BYTES || 28 * 1024 * 1024);
const MAX_TEXT_LENGTH = 8000;
const MAX_ATTACHMENTS = 6;
const MAX_ATTACHMENT_BYTES = Number(process.env.CODEX_MAX_MAX_ATTACHMENT_BYTES || process.env.CODEX_MINI_MAX_ATTACHMENT_BYTES || 8 * 1024 * 1024);
const UPLOAD_DIR = path.join(os.tmpdir(), 'codex-max-uploads');
const HISTORY_ATTACHMENT_TTL_MS = 60 * 60 * 1000;
const HISTORY_ATTACHMENT_LIMIT = 600;
const STATE_DIR = process.env.CODEX_MAX_STATE_DIR || process.env.CODEX_MINI_STATE_DIR || path.join(os.homedir(), '.codex-max');
const STATE_FILE = path.join(STATE_DIR, 'state.json');
const codexAppServer = new CodexAppServer({ cwd: __dirname });

const CODEX_SESSIONS_DIR = path.join(os.homedir(), '.codex', 'sessions');
const CODEX_SESSION_INDEX = path.join(os.homedir(), '.codex', 'session_index.jsonl');
const CODEX_DESKTOP_LOGS_DIR = process.platform === 'darwin'
  ? path.join(os.homedir(), 'Library', 'Logs', 'com.openai.codex')
  : process.platform === 'win32'
    ? path.join(os.homedir(), 'AppData', 'Roaming', 'com.openai.codex', 'logs')
    : path.join(os.homedir(), '.codex', 'logs');
const CODEX_SESSION_TAIL_BYTES = 5 * 1024 * 1024;
const CODEX_ACTIVITY_TAIL_BYTES = 512 * 1024;
const CODEX_ACTIVITY_LOOKBACK_BYTES = CODEX_SESSION_TAIL_BYTES;
const CODEX_RUNTIME_STALE_MS = 2 * 60 * 60 * 1000;
const CODEX_HISTORY_TAIL_BYTES = 128 * 1024 * 1024;
const CODEX_TITLE_SCAN_BYTES = 12 * 1024 * 1024;
const MAX_HISTORY_MESSAGES = 120;
const GUI_FAILURE_REPORT_LIMIT = 80;
const SCHEDULED_TASK_LIMIT = 64;
const SCHEDULED_TASK_MIN_INTERVAL_MINUTES = 5;
const SCHEDULED_TASK_MAX_INTERVAL_MINUTES = 7 * 24 * 60;
const SCHEDULED_TASK_POLL_MS = 30000;
const GITHUB_REQUEST_TIMEOUT_MS = 10000;
const GITHUB_RESPONSE_MAX_BYTES = 2 * 1024 * 1024;
const ENVIRONMENT_MAX_FILES = 80;
const ENVIRONMENT_MAX_BRANCHES = 80;
const ENVIRONMENT_MAX_UNTRACKED_TEXT_BYTES = 1024 * 1024;
const GUI_FAILURE_LOG_SCAN_BYTES = 2 * 1024 * 1024;
const GUI_FAILURE_LOG_RECENT_MS = 15 * 60 * 1000;
const RECENT_SEND_TTL_MS = 5 * 60 * 1000;
const CODEX_THREAD_SYNC_FRESH_MS = process.platform === 'win32' ? 10 * 60 * 1000 : 5000;
const CODEX_DEEPLINK_SETTLE_MS = process.platform === 'win32' ? 1400 : 560;
const CODEX_APP_FOCUS_SETTLE_MS = 100;
const CODEX_CLICK_SETTLE_MS = 60;
const TEXT_PASTE_SETTLE_MS = process.platform === 'win32' ? 180 : 140;
const ATTACHMENT_PASTE_SETTLE_MS = process.platform === 'win32' ? 520 : 220;
const CODEX_COMMAND_SETTLE_MS = process.platform === 'win32' ? 220 : 180;
const CODEX_MODEL_COMMAND_SETTLE_MS = process.platform === 'win32' ? 520 : 450;
const CODEX_REASONING_COMMAND_SETTLE_MS = process.platform === 'win32' ? 520 : 450;
const CODEX_SEND_CONFIRM_TIMEOUT_MS = process.platform === 'win32' ? 1800 : 0;
const CODEX_SESSION_FILE_CACHE_MS = 1200;
const CODEX_THREAD_LIST_CACHE_MS = 1200;
const CODEX_HISTORY_INITIAL_TAIL_BYTES = 8 * 1024 * 1024;
const REASONING_MODE_TARGETS = {
  low: { key: 'low', value: 'low', label: '低', displayName: '低' },
  medium: { key: 'medium', value: 'medium', label: '中', displayName: '中' },
  high: { key: 'high', value: 'high', label: '高', displayName: '高' },
  xhigh: { key: 'xhigh', value: 'xhigh', label: '超高', displayName: '超高' },
  max: { key: 'max', value: 'max', label: '最高', displayName: '最高' },
  ultra: { key: 'ultra', value: 'ultra', label: '极致', displayName: '极致' },
};
const DESKTOP_MODEL_OPTIONS = [
  { key: 'gpt-5.6-sol', id: 'gpt-5.6-sol', label: '5.6 Sol', displayName: '5.6 Sol', source: 'desktop' },
  { key: 'gpt-5.6-terra', id: 'gpt-5.6-terra', label: '5.6 Terra', displayName: '5.6 Terra', source: 'desktop' },
  { key: 'gpt-5.6-luna', id: 'gpt-5.6-luna', label: '5.6 Luna', displayName: '5.6 Luna', source: 'desktop' },
  { key: 'gpt-5.5', id: 'gpt-5.5', label: '5.5', displayName: '5.5', source: 'desktop' },
  { key: 'gpt-5.4', id: 'gpt-5.4', label: '5.4', displayName: '5.4', source: 'desktop' },
  { key: 'gpt-5.4-mini', id: 'gpt-5.4-mini', label: '5.4 Mini', displayName: '5.4 Mini', source: 'desktop' },
  { key: 'gpt-5.2', id: 'gpt-5.2', label: '5.2', displayName: '5.2', source: 'desktop' },
];
const recentSendRequests = new Map();
let lastCodexThreadActivation = { threadId: '', at: 0 };
// ----- Simple in-memory token bucket rate limiter -----
const RATE_LIMIT_RPM = Math.max(10, Math.min(6000, Number(process.env.CODEX_MAX_RATE_LIMIT_RPM) || 120));
const RATE_LIMIT_BURST = Math.max(1, Math.min(100, Math.floor(RATE_LIMIT_RPM / 6) || 20));
const rateLimitBuckets = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60000;

function rateLimitCheck(ip) {
  const now = Date.now();
  let bucket = rateLimitBuckets.get(ip);
  if (!bucket || now - bucket.resetAt >= 60000) {
    bucket = { tokens: RATE_LIMIT_BURST, resetAt: now + 60000 };
    rateLimitBuckets.set(ip, bucket);
  }
  if (bucket.tokens > 0) {
    bucket.tokens -= 1;
    return true;
  }
  return false;
}

setInterval(() => {
  const cutoff = Date.now();
  for (const [ip, bucket] of rateLimitBuckets) {
    if (cutoff - bucket.resetAt >= 120000) rateLimitBuckets.delete(ip);
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);
// -----------------------------------------------------
let codexSessionFilesCache = { at: 0, files: [] };
let threadIndexCache = { mtimeMs: 0, size: 0, byId: null };
const sessionMetaCache = new Map();
const firstUserMessageCache = new Map();
const runtimeSummaryCache = new Map();
const codexThreadListCache = new Map();
let modelCatalogCache = { mtimeMs: -1, path: '', models: null };
let keepAwakeProcess = null;
let keepAwakeStartedAt = '';
let scheduledTaskTimer = null;
const scheduledTaskRuns = new Set();
const pullRequestCache = new Map();
const historyAttachmentCache = new Map();

function fileCacheSignature(stat) {
  return stat ? `${stat.size}:${stat.mtimeMs}` : '';
}

function boundedSet(map, key, value, limit = 300) {
  if (map.size >= limit && !map.has(key)) {
    const firstKey = map.keys().next().value;
    if (firstKey !== undefined) map.delete(firstKey);
  }
  map.set(key, value);
  return value;
}

function invalidateCodexThreadListCache() {
  codexThreadListCache.clear();
}

function isKeepAwakeActive() {
  return Boolean(platform.keepAwakeStatus().enabled);
}

function keepAwakeStatus() {
  return platform.keepAwakeStatus();
}

function startKeepAwake() {
  return platform.startKeepAwake();
}

function stopKeepAwake() {
  return platform.stopKeepAwake();
}

function cleanupKeepAwake() {
  platform.cleanup();
}

function readCodexConfigText() {
  try {
    return fs.readFileSync(path.join(os.homedir(), '.codex', 'config.toml'), 'utf8');
  } catch {
    return '';
  }
}

function tomlStringValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*=\\s*"([^"]*)"\\s*$`, 'm'));
  return match ? match[1] : '';
}

function labelFromModelName(name = '') {
  const text = String(name || '').trim();
  if (!text) return '';
  return text
    .replace(/[（(].*?[）)]/g, '')
    .replace(/^GPT-/i, '')
    .replace(/^gpt-/i, '')
    .replace(/^codex-/i, '')
    .trim() || text;
}

function normalizeModelOption(row = {}) {
  const id = String(row.slug || row.id || row.model || '').trim();
  if (!id) return null;
  const displayName = String(row.display_name || row.name || row.label || id).trim();
  return {
    key: id,
    id,
    label: labelFromModelName(displayName || id),
    displayName: displayName || id,
    source: 'local',
  };
}

function mergeModelOptions(...lists) {
  const rows = [];
  const indexes = new Map();
  for (const list of lists) {
    for (const item of Array.isArray(list) ? list : []) {
      const id = String(item?.id || item?.key || '').trim();
      if (!id) continue;
      const option = { ...item, key: String(item.key || id), id };
      if (indexes.has(id)) rows[indexes.get(id)] = { ...rows[indexes.get(id)], ...option };
      else {
        indexes.set(id, rows.length);
        rows.push(option);
      }
    }
  }
  return rows;
}

function readModelCatalogOptions() {
  const configText = readCodexConfigText();
  const catalogPath = tomlStringValue(configText, 'model_catalog_json');
  const resolvedPath = catalogPath.startsWith('~') ? path.join(os.homedir(), catalogPath.slice(1)) : catalogPath;
  const fallback = () => {
    const current = tomlStringValue(configText, 'model');
    const currentOption = current ? [{ key: current, id: current, label: labelFromModelName(current), displayName: current, source: 'local' }] : [];
    return mergeModelOptions(DESKTOP_MODEL_OPTIONS, currentOption);
  };
  if (!resolvedPath) return fallback();
  let stat;
  try {
    stat = fs.statSync(resolvedPath);
  } catch {
    return fallback();
  }
  if (modelCatalogCache.models && modelCatalogCache.path === resolvedPath && modelCatalogCache.mtimeMs === stat.mtimeMs) {
    return modelCatalogCache.models;
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(resolvedPath, 'utf8'));
    const models = (Array.isArray(parsed.models) ? parsed.models : [])
      .filter(row => row && row.visibility !== 'hide')
      .map(normalizeModelOption)
      .filter(Boolean);
    modelCatalogCache = { path: resolvedPath, mtimeMs: stat.mtimeMs, models };
    return models.length ? mergeModelOptions(DESKTOP_MODEL_OPTIONS, models) : fallback();
  } catch {
    return fallback();
  }
}

function findModelOption(id = '') {
  const targetId = String(id || '').trim();
  if (!targetId) return null;
  return readModelCatalogOptions().find(item => item.id === targetId || item.key === targetId) || null;
}

function emptyCodexMiniState() {
  return {
    pinnedThreadIds: [],
    archivedThreadIds: [],
    titleOverrides: {},
    guiFailureReports: {},
    scheduledTasks: [],
  };
}

function readCodexMiniState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    return {
      pinnedThreadIds: Array.isArray(parsed.pinnedThreadIds) ? parsed.pinnedThreadIds.filter(isCodexThreadId) : [],
      archivedThreadIds: Array.isArray(parsed.archivedThreadIds) ? parsed.archivedThreadIds.filter(isCodexThreadId) : [],
      titleOverrides: parsed.titleOverrides && typeof parsed.titleOverrides === 'object' ? parsed.titleOverrides : {},
      guiFailureReports: normalizeGuiFailureReports(parsed.guiFailureReports),
      scheduledTasks: normalizeScheduledTasks(parsed.scheduledTasks),
    };
  } catch {
    return emptyCodexMiniState();
  }
}

function writeCodexMiniState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const normalized = {
    pinnedThreadIds: [...new Set((state.pinnedThreadIds || []).filter(isCodexThreadId))],
    archivedThreadIds: [...new Set((state.archivedThreadIds || []).filter(isCodexThreadId))],
    titleOverrides: state.titleOverrides && typeof state.titleOverrides === 'object' ? state.titleOverrides : {},
    guiFailureReports: normalizeGuiFailureReports(state.guiFailureReports),
    scheduledTasks: normalizeScheduledTasks(state.scheduledTasks),
  };
  fs.writeFileSync(STATE_FILE, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8');
  invalidateCodexThreadListCache();
  return normalized;
}



function normalizeGuiFailureReports(value) {
  const out = {};
  if (!value || typeof value !== 'object') return out;
  for (const [threadId, rows] of Object.entries(value)) {
    if (!isCodexThreadId(threadId) || !Array.isArray(rows)) continue;
    const normalizedRows = rows
      .map(row => ({
        turnId: typeof row.turnId === 'string' ? row.turnId : '',
        text: truncateText(normalizeHistoryText(row.text || ''), 2000),
        capturedAt: typeof row.capturedAt === 'string' ? row.capturedAt : '',
        completedAt: typeof row.completedAt === 'string' ? row.completedAt : '',
        source: typeof row.source === 'string' ? row.source : 'unknown',
      }))
      .filter(row => row.text)
      .slice(-GUI_FAILURE_REPORT_LIMIT);
    if (normalizedRows.length) out[threadId] = normalizedRows;
  }
  return out;
}

function normalizeIsoTimestamp(value) {
  const ms = Date.parse(String(value || ''));
  return Number.isFinite(ms) ? new Date(ms).toISOString() : '';
}

function normalizeScheduleInterval(value) {
  const minutes = Math.round(Number(value));
  if (!Number.isFinite(minutes)) return 60;
  return Math.max(SCHEDULED_TASK_MIN_INTERVAL_MINUTES, Math.min(SCHEDULED_TASK_MAX_INTERVAL_MINUTES, minutes));
}

function normalizeScheduledTask(row = {}) {
  if (!row || typeof row !== 'object') return null;
  const id = String(row.id || '').trim();
  const prompt = String(row.prompt || '').trim();
  if (!/^[a-zA-Z0-9_-]{8,80}$/.test(id) || !prompt) return null;
  const runMode = row.runMode === 'thread' ? 'thread' : 'standalone';
  const threadId = isCodexThreadId(row.threadId) ? String(row.threadId) : '';
  if (runMode === 'thread' && !threadId) return null;
  const intervalMinutes = normalizeScheduleInterval(row.intervalMinutes);
  const now = new Date();
  return {
    id,
    prompt: prompt.slice(0, MAX_TEXT_LENGTH),
    cwd: String(row.cwd || '').trim().slice(0, 2000),
    threadId: runMode === 'thread' ? threadId : '',
    runMode,
    intervalMinutes,
    enabled: row.enabled !== false,
    createdAt: normalizeIsoTimestamp(row.createdAt) || now.toISOString(),
    updatedAt: normalizeIsoTimestamp(row.updatedAt) || now.toISOString(),
    nextRunAt: normalizeIsoTimestamp(row.nextRunAt) || new Date(now.getTime() + intervalMinutes * 60000).toISOString(),
    lastRunAt: normalizeIsoTimestamp(row.lastRunAt),
    lastStatus: ['idle', 'running', 'started', 'skipped', 'error'].includes(row.lastStatus) ? row.lastStatus : 'idle',
    lastMessage: truncateText(row.lastMessage || '', 500),
    lastThreadId: isCodexThreadId(row.lastThreadId) ? String(row.lastThreadId) : '',
  };
}

function normalizeScheduledTasks(value) {
  const seen = new Set();
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map(normalizeScheduledTask)
    .filter(item => item && !seen.has(item.id) && seen.add(item.id))
    .slice(0, SCHEDULED_TASK_LIMIT)
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt));
}

function nextScheduledRunAt(task, nowMs = Date.now()) {
  const intervalMs = normalizeScheduleInterval(task.intervalMinutes) * 60000;
  const previous = Date.parse(task.nextRunAt || '');
  const base = Number.isFinite(previous) ? previous : nowMs;
  return new Date(Math.max(nowMs + intervalMs, base + intervalMs)).toISOString();
}

function setThreadSetMembership(list, threadId, enabled) {
  const set = new Set((Array.isArray(list) ? list : []).filter(isCodexThreadId));
  if (enabled) set.add(threadId);
  else set.delete(threadId);
  return [...set];
}

function truncateText(value, max = 700) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function extractMessageText(content) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content.map(item => item && (item.text || item.message || '')).filter(Boolean).join('\n');
}

function normalizeHistoryText(value) {
  return String(value || '').replace(/\r\n/g, '\n').trim();
}

function extractPlainTextDeep(value, seen = new Set()) {
  if (value == null) return [];
  if (typeof value === 'string') return [value];
  if (typeof value === 'number' || typeof value === 'boolean') return [String(value)];
  if (typeof value !== 'object') return [];
  if (seen.has(value)) return [];
  seen.add(value);

  const out = [];
  if (Array.isArray(value)) {
    for (const item of value) out.push(...extractPlainTextDeep(item, seen));
    return out;
  }

  for (const key of ['message', 'detail', 'details', 'error', 'reason', 'description', 'status', 'code', 'title', 'text']) {
    if (Object.prototype.hasOwnProperty.call(value, key)) out.push(...extractPlainTextDeep(value[key], seen));
  }
  return out;
}

function isFailureLikePayload(payload = {}) {
  const type = String(payload.type || '').toLowerCase();
  const status = String(payload.status || '').toLowerCase();
  const code = String(payload.code || '').toLowerCase();
  return (
    /(?:error|fail|failed|failure|timeout|rate_limit|unavailable|overload|abort|cancel|interrupt)/.test(type) ||
    /(?:error|fail|failed|failure|timeout|rate_limit|unavailable|overload|abort|cancel|interrupt)/.test(status) ||
    /(?:error|fail|failed|failure|timeout|rate_limit|unavailable|overload|abort|cancel|interrupt)/.test(code) ||
    payload.error != null ||
    payload.detail != null ||
    payload.details != null ||
    payload.reason != null
  );
}

function isTerminalFailurePayload(payload = {}) {
  if (!payload || typeof payload !== 'object') return false;
  const type = String(payload.type || '').toLowerCase();
  return (
    type === 'turn_aborted' ||
    /(?:^|_)(?:failed|failure|error|timeout|cancelled|canceled|aborted|interrupted)$/.test(type) ||
    (
      isFailureLikePayload(payload) &&
      /(?:abort|cancel|interrupt|fail|error|timeout|unavailable|overload)/.test(type)
    )
  );
}

function extractFailureTextFromPayload(payload = {}) {
  if (!payload || typeof payload !== 'object' || !isFailureLikePayload(payload)) return '';
  const text = extractPlainTextDeep(payload)
    .map(value => normalizeHistoryText(value))
    .filter(Boolean)
    .filter(value => !/^(true|false|null|undefined)$/i.test(value))
    .join('\n');
  return truncateText(text, 1600);
}

function emptyCodexFailureText() {
  return 'Codex GUI 这次没有返回可显示回复。会话日志也没有写入可读取的失败提示原文；请在电脑 Codex GUI 查看原始失败提示。';
}

function decodeLogQuotedValue(value) {
  const raw = String(value || '');
  if (!raw) return '';
  try {
    return JSON.parse(`"${raw.replace(/"/g, '\\"')}"`);
  } catch {
    return raw.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
}

function safeParseJsonText(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function extractJsonAssignment(line, key) {
  const marker = `${key}=`;
  const start = line.indexOf(marker);
  if (start < 0) return null;
  const open = line.indexOf('{', start + marker.length);
  if (open < 0) return null;
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = open; i < line.length; i += 1) {
    const ch = line[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return line.slice(open, i + 1);
    }
  }
  return null;
}

function extractDesktopLogFailureText(line) {
  const raw = String(line || '');
  if (!/(?:\berror\b|failed|failure|Forbidden|unexpected status|channel affinity|AiMaMi|revoked|Unauthorized)/i.test(raw)) return '';
  if (/(?:git\.command\.complete|worker_rpc_response_error|Conversation state not found|Received turn\/(?:started|completed) for unknown conversation|Item not found in turn state)/i.test(raw)) return '';
  const candidates = [];
  for (const key of ['error', 'result']) {
    const jsonText = extractJsonAssignment(raw, key);
    const parsed = jsonText ? safeParseJsonText(jsonText) : null;
    const directText = parsed && typeof parsed === 'object'
      ? normalizeHistoryText(parsed.message || parsed.detail || parsed.error || parsed.reason || '')
      : '';
    const text = parsed ? (directText || extractFailureTextFromPayload(parsed) || truncateText(extractPlainTextDeep(parsed).map(value => normalizeHistoryText(value)).filter(Boolean).join('\n'), 2000)) : '';
    if (text) candidates.push(text);
  }
  for (const key of ['errorMessage', 'message', 'detail']) {
    const match = raw.match(new RegExp(`(?:^|\\s)${key}="((?:\\\\.|[^"])*)"`, 'i'));
    if (match) candidates.push(decodeLogQuotedValue(match[1]));
  }
  if (!candidates.length && /(?:unexpected status|Forbidden|channel affinity|AiMaMi)/i.test(raw)) {
    candidates.push(raw.replace(/^\S+\s+\w+\s+\[[^\]]+\]\s*/, '').trim());
  }
  const text = uniqueList(candidates
    .map(value => normalizeHistoryText(value))
    .filter(Boolean)
    .filter(value => !/^Request failed$/i.test(value)))
    .join('\n');
  return truncateText(text, 2000);
}

function scoreDesktopFailureLine(line, text, options = {}) {
  const raw = String(line || '');
  const failure = String(text || '');
  if (!failure) return 0;
  let score = 1;
  const threadId = isCodexThreadId(options.threadId) ? options.threadId : '';
  const turnId = typeof options.turnId === 'string' ? options.turnId : '';
  if (threadId && raw.includes(threadId)) score += 80;
  if (turnId && raw.includes(turnId)) score += 80;
  if (/Structured turn failed/i.test(failure)) score += 55;
  if (/unexpected status|Forbidden|channel affinity|AiMaMi/i.test(failure)) score += 45;
  if (/refresh token was revoked|log out and sign in again|access token could not be refreshed/i.test(failure)) score += 45;
  if (/Failed to generate thread title/i.test(raw) && /Structured turn failed/i.test(failure)) score += 25;
  if (/Conversation state not found|unknown conversation|Failed to write temporary index tree snapshot|remote\.upstream\.url/i.test(failure)) score -= 80;
  return score;
}

function recentCodexDesktopLogFiles(referenceMs = Date.now()) {
  return walkFiles(CODEX_DESKTOP_LOGS_DIR, file => file.endsWith('.log'))
    .map(file => {
      try {
        const stat = fs.statSync(file);
        return { file, mtimeMs: stat.mtimeMs };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .filter(item => item.mtimeMs >= referenceMs - GUI_FAILURE_LOG_RECENT_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 40)
    .map(item => item.file);
}

function findCodexDesktopFailureText(options = {}) {
  const threadId = isCodexThreadId(options.threadId) ? options.threadId : '';
  const turnId = typeof options.turnId === 'string' ? options.turnId : '';
  const startedMs = Date.parse(options.startedAt || '') || 0;
  const completedMs = Date.parse(options.completedAt || '') || Date.now();
  const minMs = startedMs ? startedMs - 60 * 1000 : completedMs - GUI_FAILURE_LOG_RECENT_MS;
  const maxMs = completedMs + 2 * 60 * 1000;
  const matches = [];
  for (const file of recentCodexDesktopLogFiles(completedMs)) {
    let lines;
    try {
      lines = readTailLinesWithLimit(file, GUI_FAILURE_LOG_SCAN_BYTES);
    } catch {
      continue;
    }
    for (const line of lines) {
      const lineMs = Date.parse(line.slice(0, 24));
      if (Number.isFinite(lineMs) && (lineMs < minMs || lineMs > maxMs)) continue;
      const text = extractDesktopLogFailureText(line);
      const score = scoreDesktopFailureLine(line, text, options);
      if (score >= 50) matches.push({ text, lineMs: Number.isFinite(lineMs) ? lineMs : 0, score });
    }
  }
  matches.sort((a, b) => b.score - a.score || b.lineMs - a.lineMs);
  return matches[0] ? matches[0].text : '';
}

function findStoredGuiFailureText(threadId, options = {}) {
  if (!isCodexThreadId(threadId)) return '';
  const rows = readCodexMiniState().guiFailureReports[threadId] || [];
  const turnId = typeof options.turnId === 'string' ? options.turnId : '';
  if (turnId) {
    const exact = [...rows].reverse().find(row => row.turnId === turnId && row.text);
    if (exact) return exact.text;
  }
  const completedMs = Date.parse(options.completedAt || '') || 0;
  if (completedMs) {
    const close = [...rows].reverse().find(row => {
      const rowMs = Date.parse(row.completedAt || row.capturedAt || '') || 0;
      return row.text && rowMs && Math.abs(rowMs - completedMs) <= GUI_FAILURE_LOG_RECENT_MS;
    });
    if (close) return close.text;
  }
  const latest = rows[rows.length - 1];
  return latest && latest.text ? latest.text : '';
}

function storeGuiFailureText(threadId, report = {}) {
  if (!isCodexThreadId(threadId)) return '';
  const text = truncateText(normalizeHistoryText(report.text || ''), 2000);
  if (!text || text === emptyCodexFailureText()) return '';
  const state = readCodexMiniState();
  const rows = state.guiFailureReports[threadId] || [];
  const turnId = typeof report.turnId === 'string' ? report.turnId : '';
  const completedAt = typeof report.completedAt === 'string' ? report.completedAt : '';
  const existingIndex = rows.findIndex(row => (turnId && row.turnId === turnId) || (completedAt && row.completedAt === completedAt && row.text === text));
  const row = {
    turnId,
    text,
    capturedAt: new Date().toISOString(),
    completedAt,
    source: typeof report.source === 'string' ? report.source : 'codex_desktop',
  };
  if (existingIndex >= 0) rows[existingIndex] = { ...rows[existingIndex], ...row };
  else rows.push(row);
  state.guiFailureReports[threadId] = rows.slice(-GUI_FAILURE_REPORT_LIMIT);
  writeCodexMiniState(state);
  return text;
}

function resolveFailureTextForTurn(threadId, options = {}) {
  const sessionText = normalizeHistoryText(options.failureText || '');
  if (sessionText) {
    storeGuiFailureText(threadId, { ...options, text: sessionText, source: 'codex_session' });
    return sessionText;
  }
  const storedText = findStoredGuiFailureText(threadId, options);
  if (storedText) return storedText;
  const desktopText = findCodexDesktopFailureText({ ...options, threadId });
  if (desktopText) return storeGuiFailureText(threadId, { ...options, text: desktopText, source: 'codex_desktop_log' }) || desktopText;
  return '';
}

function cleanUserHistoryText(value) {
  const text = normalizeHistoryText(value);
  const marker = '## My request for Codex:';
  const index = text.indexOf(marker);
  if (index >= 0) return normalizeHistoryText(text.slice(index + marker.length));
  return text;
}

function isPlaceholderThreadName(value) {
  const text = String(value || '').trim().toLowerCase();
  if (!text) return true;
  return [
    '未命名线程',
    '未命名任务',
    '未命名',
    'untitled',
    'untitled thread',
    'new thread',
  ].includes(text);
}

function summarizeThreadTitle(value, maxLength = 34) {
  let text = cleanUserHistoryText(value)
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\bsk-[a-zA-Z0-9_-]{12,}\b/g, '[key]')
    .replace(/\b[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\b/g, '[token]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/[#>*_[\]()~]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength).trim()}…`;
}

function walkFiles(dir, predicate, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function listCodexSessionFiles(options = {}) {
  const now = Date.now();
  if (!options.force && codexSessionFilesCache.files.length && now - codexSessionFilesCache.at <= CODEX_SESSION_FILE_CACHE_MS) {
    return codexSessionFilesCache.files;
  }
  const files = walkFiles(CODEX_SESSIONS_DIR, file => file.endsWith('.jsonl'));
  codexSessionFilesCache = { at: now, files };
  return files;
}

function threadIdFromSessionFile(file) {
  return (path.basename(file || '').match(/([a-f0-9]{8}-[a-f0-9-]{27,})\.jsonl$/i) || [])[1] || '';
}

function normalizeComparableMessage(value) {
  return cleanUserHistoryText(value).replace(/\s+/g, ' ').trim();
}

function findLatestCodexSessionFile(options = {}) {
  const excludeThreadId = isCodexThreadId(options.excludeThreadId) ? options.excludeThreadId : '';
  const afterMs = Number(options.afterMs) || 0;
  const expectedCwd = validLocalDirectory(options.cwd || '');
  const files = listCodexSessionFiles(afterMs ? { force: true } : {});
  let best = null;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      const threadId = threadIdFromSessionFile(file);
      if (excludeThreadId && threadId === excludeThreadId) continue;
      if (afterMs && stat.mtimeMs < afterMs - 2500) continue;
      if (expectedCwd) {
        const metaCwd = validLocalDirectory(readSessionMeta(file).cwd || '');
        if (metaCwd !== expectedCwd) continue;
      }
      if (!best || stat.mtimeMs > best.mtimeMs) best = { file, mtimeMs: stat.mtimeMs };
    } catch {
      // ignore disappearing files
    }
  }
  return best && best.file;
}

function findCodexSessionFileByName(name) {
  if (!name || name.includes('/') || name.includes('..')) return null;
  const files = listCodexSessionFiles();
  return files.find(file => path.basename(file) === name) || null;
}

function findCodexSessionFileByThreadId(threadId) {
  if (!isCodexThreadId(threadId)) return null;
  const files = listCodexSessionFiles();
  let best = null;
  for (const file of files) {
    if (!path.basename(file).includes(threadId)) continue;
    try {
      const stat = fs.statSync(file);
      if (!best || stat.mtimeMs > best.mtimeMs) best = { file, mtimeMs: stat.mtimeMs };
    } catch {}
  }
  return best && best.file;
}

function isCodexThreadId(value) {
  return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9-]{27,}$/i.test(value);
}

function codexThreadDeepLink(threadId) {
  if (!isCodexThreadId(threadId)) return null;
  // Codex desktop's own “Copy app link” action uses codex://threads/<id>.
  // The previous codex://local/<id> only brought the app forward on this build,
  // but did not navigate the visible UI, so paste could still hit the wrong thread.
  return `codex://threads/${threadId}`;
}

function codexNewThreadDeepLink(cwd = '') {
  const url = new URL('codex://threads/new');
  if (cwd) url.searchParams.set('path', cwd);
  return url.toString();
}

const platform = require('./src/platform')({
  rootDir: __dirname,
  delay,
  isCodexThreadId,
  codexThreadDeepLink,
  codexNewThreadDeepLink,
  CODEX_DEEPLINK_SETTLE_MS,
  CODEX_APP_FOCUS_SETTLE_MS,
  CODEX_CLICK_SETTLE_MS,
  CODEX_THREAD_SYNC_FRESH_MS,
});

function readThreadIndex() {
  let stat = null;
  try { stat = fs.statSync(CODEX_SESSION_INDEX); } catch {}
  if (
    stat &&
    threadIndexCache.byId &&
    threadIndexCache.mtimeMs === stat.mtimeMs &&
    threadIndexCache.size === stat.size
  ) {
    return new Map(threadIndexCache.byId);
  }
  const byId = new Map();
  try {
    const lines = fs.readFileSync(CODEX_SESSION_INDEX, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const item = JSON.parse(line);
        if (!item.id) continue;
        byId.set(item.id, {
          id: item.id,
          name: item.thread_name || '',
          updatedAt: item.updated_at || '',
        });
      } catch {}
    }
  } catch {}
  if (stat) threadIndexCache = { mtimeMs: stat.mtimeMs, size: stat.size, byId: new Map(byId) };
  return byId;
}

function findFirstCodexUserMessage(file, maxBytes = CODEX_TITLE_SCAN_BYTES) {
  let stat;
  try { stat = fs.statSync(file); } catch { return ''; }
  const cacheKey = `${file}:${fileCacheSignature(stat)}:${maxBytes}`;
  if (firstUserMessageCache.has(cacheKey)) return firstUserMessageCache.get(cacheKey);
  const limit = Math.min(stat.size, maxBytes);
  const chunkSize = 64 * 1024;
  const maxLineBytes = 2 * 1024 * 1024;
  let fd;
  let carry = '';
  let skippingLongLine = false;

  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(chunkSize);
    let offset = 0;
    while (offset < limit) {
      const bytes = fs.readSync(fd, buffer, 0, Math.min(chunkSize, limit - offset), offset);
      if (!bytes) break;
      offset += bytes;
      let text = buffer.toString('utf8', 0, bytes);

      if (skippingLongLine) {
        const newline = text.indexOf('\n');
        if (newline < 0) continue;
        text = text.slice(newline + 1);
        skippingLongLine = false;
      }

      carry += text;
      if (carry.length > maxLineBytes) {
        const newline = carry.indexOf('\n');
        if (newline < 0) {
          carry = '';
          skippingLongLine = true;
          continue;
        }
      }

      let newlineIndex;
      while ((newlineIndex = carry.indexOf('\n')) >= 0) {
        const line = carry.slice(0, newlineIndex);
        carry = carry.slice(newlineIndex + 1);
        if (!line.trim()) continue;
        let item;
        try { item = JSON.parse(line); } catch { continue; }
        const payload = item.payload || {};
        if (item.type === 'event_msg' && payload.type === 'user_message') {
          const title = summarizeThreadTitle(payload.message || '');
          if (title) return boundedSet(firstUserMessageCache, cacheKey, title);
        }
      }
    }

    if (carry.trim() && carry.length <= maxLineBytes) {
      try {
        const item = JSON.parse(carry);
        const payload = item.payload || {};
        if (item.type === 'event_msg' && payload.type === 'user_message') {
          return boundedSet(firstUserMessageCache, cacheKey, summarizeThreadTitle(payload.message || ''));
        }
      } catch {}
    }
  } catch {
    return '';
  } finally {
    if (typeof fd === 'number') {
      try { fs.closeSync(fd); } catch {}
    }
  }
  return boundedSet(firstUserMessageCache, cacheKey, '');
}

function readSessionMeta(file) {
  let stat = null;
  try { stat = fs.statSync(file); } catch {}
  const cacheKey = stat ? `${file}:${fileCacheSignature(stat)}` : '';
  if (cacheKey && sessionMetaCache.has(cacheKey)) return sessionMetaCache.get(cacheKey);
  try {
    const fd = fs.openSync(file, 'r');
    try {
      const buffer = Buffer.alloc(64 * 1024);
      const bytes = fs.readSync(fd, buffer, 0, buffer.length, 0);
      const lines = buffer.toString('utf8', 0, bytes).split('\n').filter(Boolean).slice(0, 80);
      for (const line of lines) {
        let item;
        try { item = JSON.parse(line); } catch { continue; }
        if (item.type === 'session_meta' && item.payload) return cacheKey ? boundedSet(sessionMetaCache, cacheKey, item.payload) : item.payload;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  return cacheKey ? boundedSet(sessionMetaCache, cacheKey, {}) : {};
}

function userMessageMatchScore(file, sinceMs = 0, text = '') {
  const expected = normalizeComparableMessage(text);
  const items = readJsonlTailObjects(file, CODEX_TITLE_SCAN_BYTES);
  let score = 0;
  for (const item of items) {
    const payload = item.payload || {};
    if (item.type !== 'event_msg' || payload.type !== 'user_message') continue;
    const t = Date.parse(item.timestamp || '');
    if (sinceMs && Number.isFinite(t) && t < sinceMs - 2500) continue;
    const actual = normalizeComparableMessage(payload.message || '');
    if (!actual && expected) continue;
    score = Math.max(score, 10);
    if (Number.isFinite(t)) score += Math.max(0, Math.min(25, Math.round((t - sinceMs) / 1000) + 20));
    if (expected && actual) {
      if (actual === expected) score += 100;
      else if (actual.includes(expected) || expected.includes(actual)) score += 70;
    }
  }
  return score;
}

function findCodexSessionFileForNewSend(options = {}) {
  const sinceMs = Number(options.sinceMs) || 0;
  const text = typeof options.text === 'string' ? options.text : '';
  const expectedCwd = validLocalDirectory(options.cwd || '');
  const excludeThreadId = isCodexThreadId(options.excludeThreadId) ? options.excludeThreadId : '';
  const files = listCodexSessionFiles({ force: true });
  let best = null;
  for (const file of files) {
    try {
      const stat = fs.statSync(file);
      const threadId = threadIdFromSessionFile(file);
      if (excludeThreadId && threadId === excludeThreadId) continue;
      if (sinceMs && stat.mtimeMs < sinceMs - 2500) continue;
      let score = userMessageMatchScore(file, sinceMs, text);
      if (score <= 0 && text.trim()) continue;
      const metaCwd = validLocalDirectory(readSessionMeta(file).cwd || '');
      if (expectedCwd) {
        if (metaCwd !== expectedCwd) continue;
        score += 35;
      }
      score += Math.max(0, Math.min(20, Math.round((stat.mtimeMs - sinceMs) / 1000) + 10));
      if (!best || score > best.score || (score === best.score && stat.mtimeMs > best.mtimeMs)) {
        best = { file, score, mtimeMs: stat.mtimeMs };
      }
    } catch {
      // ignore disappearing files
    }
  }
  return best && best.file;
}

async function waitForCodexSessionFileForNewSend(options = {}, timeoutMs = 7000) {
  const deadline = Date.now() + timeoutMs;
  let file = null;
  while (Date.now() <= deadline) {
    file = findCodexSessionFileForNewSend(options);
    if (file) return file;
    await delay(220);
  }
  return findCodexSessionFileForNewSend(options);
}

function sessionHasUserMessage(file, text, sinceMs = 0) {
  if (!file || !fs.existsSync(file)) return false;
  const target = normalizeComparableMessage(text);
  if (!target) return false;
  const items = readJsonlTailObjects(file, CODEX_SESSION_TAIL_BYTES);
  for (const item of items) {
    const payload = item.payload || {};
    if (item.type !== 'event_msg' || payload.type !== 'user_message') continue;
    const itemTime = Date.parse(item.timestamp || '') || 0;
    if (sinceMs && itemTime && itemTime < sinceMs - 1200) continue;
    const message = normalizeComparableMessage(payload.message || '');
    if (!message) continue;
    if (message === target || message.includes(target) || target.includes(message)) return true;
  }
  return false;
}

async function waitForUserMessageInSession(file, text, sinceMs = 0, timeoutMs = CODEX_SEND_CONFIRM_TIMEOUT_MS) {
  if (!timeoutMs || !file || !String(text || '').trim()) return true;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    if (sessionHasUserMessage(file, text, sinceMs)) return true;
    await delay(180);
  }
  return false;
}

function readJsonlTailObjects(file, maxBytes) {
  let stat;
  try { stat = fs.statSync(file); } catch { return []; }
  const start = Math.max(0, stat.size - maxBytes);
  let fd;
  try {
    fd = fs.openSync(file, 'r');
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.toString('utf8');
    if (start > 0) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
    }
    return text.split('\n').filter(Boolean).map(line => {
      try { return JSON.parse(line); } catch { return null; }
    }).filter(Boolean);
  } catch {
    return [];
  } finally {
    if (typeof fd === 'number') {
      try { fs.closeSync(fd); } catch {}
    }
  }
}

function summarizeCodexRuntimeItems(items, stat = null) {
  let status = 'idle';
  let active = false;
  let startedAt = '';
  let completedAt = '';
  let updatedAt = stat ? new Date(stat.mtimeMs).toISOString() : '';
  let turnId = '';
  let sawRuntimeActivity = false;
  let sawTaskMarker = false;

  for (const item of items) {
    const payload = item.payload || {};
    if (item.timestamp) updatedAt = item.timestamp;
    if (item.type === 'response_item' || (item.type === 'event_msg' && payload.type && !String(payload.type).startsWith('task_'))) {
      sawRuntimeActivity = true;
    }
    if (item.type === 'turn_context' && payload.turn_id) turnId = payload.turn_id;
    if (item.type === 'event_msg' && payload.type === 'task_started') {
      sawTaskMarker = true;
      status = 'running';
      active = true;
      startedAt = item.timestamp || startedAt;
      completedAt = '';
      turnId = payload.turn_id || turnId;
      updatedAt = item.timestamp || updatedAt;
    }
    if (item.type === 'event_msg' && payload.type === 'task_complete') {
      sawTaskMarker = true;
      status = 'complete';
      active = false;
      completedAt = item.timestamp || completedAt;
      updatedAt = item.timestamp || updatedAt;
    }
    if (item.type === 'event_msg' && isTerminalFailurePayload(payload)) {
      sawTaskMarker = true;
      status = 'error';
      active = false;
      completedAt = item.timestamp || completedAt;
      turnId = payload.turn_id || turnId;
      updatedAt = item.timestamp || updatedAt;
    }
  }

  return { status, active, startedAt, completedAt, updatedAt, turnId, sawRuntimeActivity, sawTaskMarker };
}

function quickCodexRuntimeFromFile(file, stat = null) {
  let fileStat = stat;
  if (!fileStat) {
    try { fileStat = fs.statSync(file); } catch { fileStat = null; }
  }
  const cacheKey = fileStat ? `${file}:${fileCacheSignature(fileStat)}` : '';
  if (cacheKey && runtimeSummaryCache.has(cacheKey)) return runtimeSummaryCache.get(cacheKey);
  const isFresh = fileStat ? Date.now() - fileStat.mtimeMs <= CODEX_RUNTIME_STALE_MS : false;
  let runtime = summarizeCodexRuntimeItems(readJsonlTailObjects(file, CODEX_ACTIVITY_TAIL_BYTES), fileStat);

  if (
    runtime.status === 'idle' &&
    runtime.sawRuntimeActivity &&
    !runtime.sawTaskMarker &&
    isFresh &&
    fileStat &&
    fileStat.size > CODEX_ACTIVITY_TAIL_BYTES
  ) {
    runtime = summarizeCodexRuntimeItems(readJsonlTailObjects(file, CODEX_ACTIVITY_LOOKBACK_BYTES), fileStat);
  }

  if (runtime.status === 'idle' && runtime.sawRuntimeActivity && !runtime.sawTaskMarker && isFresh) {
    runtime.status = 'running';
    runtime.active = true;
  }
  if (runtime.status === 'running' && fileStat && !isFresh) {
    runtime.status = 'idle';
    runtime.active = false;
  }

  const { status, active, startedAt, completedAt, updatedAt, turnId } = runtime;
  return cacheKey
    ? boundedSet(runtimeSummaryCache, cacheKey, { status, active, startedAt, completedAt, updatedAt, turnId }, 600)
    : { status, active, startedAt, completedAt, updatedAt, turnId };
}

function displayPathName(cwd) {
  if (!cwd) return '对话';
  const normalized = path.normalize(cwd);
  if (normalized === os.homedir()) return '~';
  if (normalized === path.parse(normalized).root) return normalized;
  return path.basename(normalized) || normalized;
}

function classifyThreadProject(cwd) {
  const normalized = cwd ? path.normalize(cwd) : '';
  const codexScratchRoot = path.join(os.homedir(), 'Documents', 'Codex');
  const relativeToScratch = normalized ? path.relative(codexScratchRoot, normalized) : '';
  const isGeneratedProjectless = Boolean(
    normalized &&
    relativeToScratch &&
    !relativeToScratch.startsWith('..') &&
    !path.isAbsolute(relativeToScratch) &&
    /^\d{4}-\d{2}-\d{2}(?:$|[\\/])/.test(relativeToScratch)
  );

  if (!normalized || isGeneratedProjectless) {
    return {
      isProjectThread: false,
      projectKey: 'conversation',
      projectName: '对话',
      projectPath: '',
    };
  }

  return {
    isProjectThread: true,
    projectKey: normalized,
    projectName: displayPathName(normalized),
    projectPath: normalized,
  };
}

function listCodexThreads(limit = 80) {
  const normalizedLimit = Math.max(1, Math.min(160, Number(limit) || 80));
  const cacheKey = String(normalizedLimit);
  const cached = codexThreadListCache.get(cacheKey);
  if (cached && Date.now() - cached.at <= CODEX_THREAD_LIST_CACHE_MS) return cached.threads;
  const miniState = readCodexMiniState();
  const pinnedThreadIds = new Set(miniState.pinnedThreadIds || []);
  const archivedThreadIds = new Set(miniState.archivedThreadIds || []);
  const titleOverrides = miniState.titleOverrides || {};
  const byId = readThreadIndex();
  for (const file of listCodexSessionFiles()) {
    const match = path.basename(file).match(/([a-f0-9]{8}-[a-f0-9-]{27,})\.jsonl$/i);
    if (!match) continue;
    const id = match[1];
    try {
      const stat = fs.statSync(file);
      const meta = readSessionMeta(file);
      const runtime = quickCodexRuntimeFromFile(file, stat);
      const project = classifyThreadProject(meta.cwd || '');
      const existing = byId.get(id) || { id, name: '', updatedAt: '' };
      const fallbackName = isPlaceholderThreadName(existing.name) ? findFirstCodexUserMessage(file) : '';
      existing.name = isPlaceholderThreadName(existing.name) ? (fallbackName || '未命名任务') : existing.name;
      existing.nameSource = fallbackName && existing.name === fallbackName ? 'first_user_message' : 'index';
      const override = titleOverrides[id];
      if (override && typeof override.name === 'string' && override.name.trim()) {
        const overrideTime = Date.parse(override.renamedAt || '') || 0;
        const indexTime = Date.parse(existing.updatedAt || '') || 0;
        if (!indexTime || !overrideTime || indexTime <= overrideTime + 2000 || existing.name === override.name || isPlaceholderThreadName(existing.name)) {
          existing.name = override.name.trim();
          existing.nameSource = 'codex_mini_override';
        }
      }
      existing.sessionFile = path.basename(file);
      existing.mtimeMs = stat.mtimeMs;
      existing.updatedAt = existing.updatedAt || meta.timestamp || new Date(stat.mtimeMs).toISOString();
      existing.effectiveUpdatedMs = Math.max(Date.parse(existing.updatedAt) || 0, stat.mtimeMs || 0);
      existing.cwd = meta.cwd || '';
      existing.source = meta.source || '';
      existing.threadSource = meta.thread_source || '';
      existing.runtimeStatus = runtime.status;
      existing.runtimeActive = runtime.active;
      existing.runtimeStartedAt = runtime.startedAt;
      existing.runtimeCompletedAt = runtime.completedAt;
      existing.runtimeUpdatedAt = runtime.updatedAt;
      existing.runtimeTurnId = runtime.turnId;
      existing.pinned = pinnedThreadIds.has(id);
      Object.assign(existing, project);
      byId.set(id, existing);
    } catch {}
  }
  const threads = [...byId.values()]
    .filter(item => item.sessionFile && !archivedThreadIds.has(item.id))
    .map(item => {
      const effectiveUpdatedMs = item.effectiveUpdatedMs || Math.max(Date.parse(item.updatedAt) || 0, item.mtimeMs || 0);
      return { ...item, effectiveUpdatedMs, effectiveUpdatedAt: new Date(effectiveUpdatedMs).toISOString() };
    })
    .sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.effectiveUpdatedMs - a.effectiveUpdatedMs)
    .slice(0, normalizedLimit);
  boundedSet(codexThreadListCache, cacheKey, { at: Date.now(), threads }, 20);
  return threads;
}

function listArchivedCodexThreads(limit = 80) {
  const normalizedLimit = Math.max(1, Math.min(160, Number(limit) || 80));
  const miniState = readCodexMiniState();
  const archivedThreadIds = [...new Set((miniState.archivedThreadIds || []).filter(isCodexThreadId))];
  if (!archivedThreadIds.length) return [];
  const archivedSet = new Set(archivedThreadIds);
  const titleOverrides = miniState.titleOverrides || {};
  const byId = readThreadIndex();
  for (const file of listCodexSessionFiles()) {
    const match = path.basename(file).match(/([a-f0-9]{8}-[a-f0-9-]{27,})\.jsonl$/i);
    if (!match || !archivedSet.has(match[1])) continue;
    const id = match[1];
    try {
      const stat = fs.statSync(file);
      const meta = readSessionMeta(file);
      const runtime = quickCodexRuntimeFromFile(file, stat);
      const project = classifyThreadProject(meta.cwd || '');
      const existing = byId.get(id) || { id, name: '', updatedAt: '' };
      const fallbackName = isPlaceholderThreadName(existing.name) ? findFirstCodexUserMessage(file) : '';
      existing.name = isPlaceholderThreadName(existing.name) ? (fallbackName || '未命名任务') : existing.name;
      const override = titleOverrides[id];
      if (override && typeof override.name === 'string' && override.name.trim()) existing.name = override.name.trim();
      existing.sessionFile = path.basename(file);
      existing.mtimeMs = stat.mtimeMs;
      existing.updatedAt = existing.updatedAt || meta.timestamp || new Date(stat.mtimeMs).toISOString();
      existing.effectiveUpdatedMs = Math.max(Date.parse(existing.updatedAt) || 0, stat.mtimeMs || 0);
      existing.cwd = meta.cwd || '';
      existing.source = meta.source || '';
      existing.threadSource = meta.thread_source || '';
      existing.runtimeStatus = runtime.status;
      existing.runtimeActive = runtime.active;
      Object.assign(existing, project);
      byId.set(id, existing);
    } catch {}
  }
  return archivedThreadIds
    .map(id => {
      const item = byId.get(id) || { id, name: '已归档任务', updatedAt: '', effectiveUpdatedMs: 0 };
      const project = item.projectName ? {} : classifyThreadProject(item.cwd || '');
      const effectiveUpdatedMs = item.effectiveUpdatedMs || Math.max(Date.parse(item.updatedAt) || 0, item.mtimeMs || 0);
      return { ...item, ...project, archived: true, effectiveUpdatedMs, effectiveUpdatedAt: effectiveUpdatedMs ? new Date(effectiveUpdatedMs).toISOString() : '' };
    })
    .sort((a, b) => b.effectiveUpdatedMs - a.effectiveUpdatedMs)
    .slice(0, normalizedLimit);
}

function appServerThreadRuntimeStatus(status = {}) {
  if (status.type === 'active') return { status: 'running', active: true };
  if (status.type === 'systemError') return { status: 'error', active: false };
  return { status: 'idle', active: false };
}

function normalizeAppServerThreads(rows = []) {
  const miniState = readCodexMiniState();
  const pinnedThreadIds = new Set(miniState.pinnedThreadIds || []);
  const titleOverrides = miniState.titleOverrides || {};
  return rows.map(row => {
    const updatedMs = Math.max(0, Number(row.recencyAt || row.updatedAt || row.createdAt || 0) * 1000);
    const updatedAt = updatedMs ? new Date(updatedMs).toISOString() : '';
    const cwd = String(row.cwd || '');
    const project = classifyThreadProject(cwd);
    const runtime = appServerThreadRuntimeStatus(row.status || {});
    const overrideName = String(titleOverrides[row.id]?.name || '').trim();
    const previewName = summarizeThreadTitle(cleanUserHistoryText(row.preview || ''), 50);
    const name = String(row.name || overrideName || previewName || '未命名任务').trim();
    return {
      id: row.id,
      name,
      nameSource: row.name ? 'app_server' : overrideName ? 'local_override' : 'preview',
      preview: row.preview || '',
      sessionFile: row.path ? path.basename(row.path) : '',
      cwd,
      source: typeof row.source === 'string' ? row.source : JSON.stringify(row.source || {}),
      threadSource: typeof row.threadSource === 'string' ? row.threadSource : JSON.stringify(row.threadSource || {}),
      updatedAt,
      effectiveUpdatedAt: updatedAt,
      effectiveUpdatedMs: updatedMs,
      runtimeStatus: runtime.status,
      runtimeActive: runtime.active,
      runtimeStartedAt: '',
      runtimeCompletedAt: '',
      runtimeUpdatedAt: updatedAt,
      runtimeTurnId: codexAppServer.runtimeForThread(row.id)?.activeTurnId || '',
      pinned: typeof row.isPinned === 'boolean' ? row.isPinned : pinnedThreadIds.has(row.id),
      canAcceptDirectInput: row.canAcceptDirectInput,
      ...project,
    };
  }).sort((a, b) => Number(Boolean(b.pinned)) - Number(Boolean(a.pinned)) || b.effectiveUpdatedMs - a.effectiveUpdatedMs);
}

async function handleThreads(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const limit = Math.max(1, Math.min(160, Number(url.searchParams.get('limit')) || 80));
  try {
    const rows = await codexAppServer.listThreads({ limit });
    const threads = normalizeAppServerThreads(rows).slice(0, limit);
    return json(res, 200, {
      ok: true,
      transport: 'app-server',
      threads,
      ...activeDesktopThreadHint(threads),
    });
  } catch (error) {
    const threads = listCodexThreads(limit);
    return json(res, 200, {
      ok: true,
      transport: 'session-files',
      appServerError: error.message || String(error),
      threads,
      ...activeDesktopThreadHint(threads),
    });
  }
}

function activeDesktopThreadHint(threads = []) {
  const activeThreads = threads
    .filter(item => item && item.id && (item.runtimeActive || item.runtimeStatus === 'running'))
    .sort((left, right) => (Date.parse(right.runtimeUpdatedAt || right.updatedAt || '') || 0)
      - (Date.parse(left.runtimeUpdatedAt || left.updatedAt || '') || 0));
  if (activeThreads.length) {
    return { activeThreadId: activeThreads[0].id, activeThreadSource: 'running-thread' };
  }

  // Session records are updated by the desktop app while it is producing a turn.
  // Do not use an idle recent record, otherwise browsing an older mobile task would be overwritten.
  const latestFile = findLatestCodexSessionFile();
  if (!latestFile) return { activeThreadId: '', activeThreadSource: '' };
  try {
    const stat = fs.statSync(latestFile);
    const runtime = quickCodexRuntimeFromFile(latestFile, stat);
    const threadId = threadIdFromSessionFile(latestFile);
    if (threadId && runtime.active && threads.some(item => item.id === threadId)) {
      return { activeThreadId: threadId, activeThreadSource: 'active-session' };
    }
  } catch {
    // A session file can rotate while the list endpoint is being assembled.
  }
  return { activeThreadId: '', activeThreadSource: '' };
}

async function handleArchivedThreads(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const limit = Math.max(1, Math.min(160, Number(url.searchParams.get('limit')) || 80));
  return json(res, 200, {
    ok: true,
    transport: 'local-state',
    threads: listArchivedCodexThreads(limit),
  });
}

async function listWorkspaceThreads(limit = 160) {
  try {
    const rows = await codexAppServer.listThreads({ limit });
    return { transport: 'app-server', threads: normalizeAppServerThreads(rows).slice(0, limit) };
  } catch (error) {
    return {
      transport: 'session-files',
      appServerError: error.message || String(error),
      threads: listCodexThreads(limit),
    };
  }
}

function existingProjectCwds(threads = []) {
  const values = [__dirname, ...threads.map(item => item?.projectPath || item?.cwd || '')];
  const found = new Set();
  for (const value of values) {
    const cwd = String(value || '').trim();
    if (!cwd || found.has(cwd)) continue;
    try {
      if (fs.statSync(cwd).isDirectory()) found.add(cwd);
    } catch {}
  }
  return [...found].slice(0, 20);
}

function normalizePluginRows(payload = {}) {
  const plugins = [];
  const marketplaces = Array.isArray(payload?.marketplaces) ? payload.marketplaces : [];
  for (const marketplace of marketplaces) {
    const marketplaceName = String(marketplace?.interface?.displayName || marketplace?.name || '插件市场').trim();
    for (const plugin of Array.isArray(marketplace?.plugins) ? marketplace.plugins : []) {
      if (!plugin || !plugin.id) continue;
      const details = plugin.interface && typeof plugin.interface === 'object' ? plugin.interface : {};
      plugins.push({
        id: String(plugin.id),
        name: String(details.displayName || plugin.name || plugin.id),
        description: String(details.shortDescription || ''),
        category: String(details.category || ''),
        marketplace: marketplaceName,
        installed: plugin.installed === true,
        enabled: plugin.enabled === true,
        availability: String(plugin.availability || ''),
        version: String(plugin.localVersion || plugin.version || ''),
        brandColor: /^#[0-9a-f]{6}$/i.test(String(details.brandColor || '')) ? String(details.brandColor) : '',
      });
    }
  }
  return plugins.sort((a, b) => Number(b.installed) - Number(a.installed) || a.name.localeCompare(b.name, 'zh-CN'));
}

function normalizeSkillRows(rows = []) {
  const skills = [];
  const seen = new Set();
  for (const row of rows) {
    for (const skill of Array.isArray(row?.skills) ? row.skills : []) {
      const name = String(skill?.name || '').trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      const details = skill.interface && typeof skill.interface === 'object' ? skill.interface : {};
      skills.push({
        name,
        displayName: String(details.displayName || name),
        description: String(details.shortDescription || skill.description || ''),
        enabled: skill.enabled !== false,
        scope: String(skill.scope || ''),
      });
    }
  }
  return skills.sort((a, b) => a.displayName.localeCompare(b.displayName, 'zh-CN'));
}

function normalizeAppRows(rows = []) {
  return rows
    .filter(row => row && row.id)
    .map(row => ({
      id: String(row.id),
      name: String(row.name || row.id),
      description: String(row.description || ''),
      accessible: row.isAccessible === true,
      enabled: row.isEnabled === true,
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
}

function normalizeTomlKey(raw = '') {
  const value = String(raw || '').trim();
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function listConfiguredMcpServers() {
  try {
    const configPath = path.join(os.homedir(), '.codex', 'config.toml');
    const text = fs.readFileSync(configPath, 'utf8');
    const seen = new Set();
    const servers = [];
    for (const match of text.matchAll(/^\s*\[mcp_servers\.([^\]\r\n]+)\]\s*$/gm)) {
      const name = normalizeTomlKey(match[1]);
      if (name.includes('.')) continue;
      if (!name || seen.has(name)) continue;
      seen.add(name);
      servers.push({ name, enabled: true, source: 'config' });
    }
    return servers.sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  } catch {
    return [];
  }
}

async function handlePlugins(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const workspace = await listWorkspaceThreads(160);
  const cwds = existingProjectCwds(workspace.threads);
  const results = await Promise.allSettled([
    codexAppServer.listPlugins(),
    codexAppServer.listSkills(cwds, { forceReload: false }),
    codexAppServer.listApps({ forceRefetch: false }),
  ]);
  const [pluginResult, skillResult, appResult] = results;
  const errors = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason?.message || String(result.reason || '读取失败'));
  return json(res, 200, {
    ok: true,
    transport: 'app-server',
    projectCwds: cwds.map(cwd => ({ cwd, name: displayPathName(cwd) })),
    plugins: pluginResult.status === 'fulfilled' ? normalizePluginRows(pluginResult.value) : [],
    skills: skillResult.status === 'fulfilled' ? normalizeSkillRows(skillResult.value) : [],
    apps: appResult.status === 'fulfilled' ? normalizeAppRows(appResult.value) : [],
    mcpServers: listConfiguredMcpServers(),
    errors,
  });
}

function runLocalCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || undefined,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let settled = false;
    const finish = (error, result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) reject(error);
      else resolve(result);
    };
    const timer = setTimeout(() => {
      try { child.kill(); } catch {}
      finish(new Error(`${command} 命令超时。`));
    }, Math.max(1000, Number(options.timeoutMs) || 8000));
    child.stdout.on('data', chunk => { stdout += String(chunk || ''); });
    child.stderr.on('data', chunk => { stderr += String(chunk || ''); });
    child.on('error', error => finish(error));
    child.on('close', code => {
      if (code === 0) return finish(null, { stdout, stderr });
      const error = new Error(stderr.trim() || `${command} exited with code ${code}`);
      error.code = code;
      finish(error);
    });
  });
}

function parseGitStatusRows(output = '') {
  return String(output || '')
    .split(/\r?\n/)
    .map(line => line.trimEnd())
    .filter(Boolean)
    .slice(0, ENVIRONMENT_MAX_FILES)
    .map(line => {
      const status = line.slice(0, 2).trim() || '?';
      const pathText = line.slice(3).trim() || line.trim();
      return { status, path: pathText };
    });
}

function parseGitNumstat(output = '') {
  return String(output || '').split(/\r?\n/).reduce((summary, line) => {
    const match = line.match(/^(\d+|-)\s+(\d+|-)\s+(.+)$/);
    if (!match) return summary;
    summary.additions += match[1] === '-' ? 0 : Number(match[1]);
    summary.deletions += match[2] === '-' ? 0 : Number(match[2]);
    summary.files += 1;
    return summary;
  }, { additions: 0, deletions: 0, files: 0 });
}

function countGitStatusRows(output = '') {
  return String(output || '').split(/\r?\n/).filter(Boolean).length;
}

function countTextFileLines(buffer) {
  if (!buffer?.length || buffer.includes(0)) return null;
  let lines = 0;
  for (const byte of buffer) {
    if (byte === 10) lines += 1;
  }
  return buffer[buffer.length - 1] === 10 ? lines : lines + 1;
}

async function readUntrackedGitChanges(root) {
  let output = '';
  try {
    const result = await runLocalCommand('git', ['-C', root, 'ls-files', '--others', '--exclude-standard', '-z'], { timeoutMs: 10000 });
    output = String(result.stdout || '');
  } catch {
    return { additions: 0, files: 0 };
  }

  const resolvedRoot = path.resolve(root);
  const rootPrefix = `${resolvedRoot}${path.sep}`;
  return output.split('\0').reduce((summary, relativePath) => {
    if (!relativePath) return summary;
    const absolutePath = path.resolve(resolvedRoot, relativePath);
    if (!absolutePath.startsWith(rootPrefix)) return summary;
    try {
      const stat = fs.lstatSync(absolutePath);
      if (!stat.isFile() || stat.isSymbolicLink() || stat.size > ENVIRONMENT_MAX_UNTRACKED_TEXT_BYTES) return summary;
      const lines = countTextFileLines(fs.readFileSync(absolutePath));
      if (lines === null) return summary;
      summary.additions += lines;
      summary.files += 1;
    } catch {
      // A file can disappear while Git status is being collected.
    }
    return summary;
  }, { additions: 0, files: 0 });
}

function normalizeGitBranch(value = '') {
  const branch = String(value || '').trim();
  if (!branch || branch.length > 240 || branch.startsWith('-')) return '';
  try {
    if (branch.includes('..') || branch.includes('\\0')) return '';
    return branch;
  } catch {
    return '';
  }
}

async function readGitEnvironment(cwd, compareBranch = '') {
  const environment = {
    cwd,
    name: displayPathName(cwd),
    git: {
      available: false,
      branch: '',
      remote: '',
      changes: { additions: 0, deletions: 0, files: 0 },
      files: [],
      branches: [],
      localBranches: [],
      lastCommit: null,
    },
    compare: null,
  };
  let root;
  try {
    const result = await runLocalCommand('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { timeoutMs: 8000 });
    root = String(result.stdout || '').trim();
  } catch {
    return environment;
  }
  if (!root) return environment;

  const results = await Promise.allSettled([
    runLocalCommand('git', ['-C', root, 'branch', '--show-current'], { timeoutMs: 8000 }),
    runLocalCommand('git', ['-C', root, 'remote', 'get-url', 'origin'], { timeoutMs: 8000 }),
    runLocalCommand('git', ['-C', root, 'status', '--short'], { timeoutMs: 8000 }),
    runLocalCommand('git', ['-C', root, 'diff', '--numstat', 'HEAD'], { timeoutMs: 10000 }),
    readUntrackedGitChanges(root),
    runLocalCommand('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads', 'refs/remotes'], { timeoutMs: 8000 }),
    runLocalCommand('git', ['-C', root, 'for-each-ref', '--format=%(refname:short)', 'refs/heads'], { timeoutMs: 8000 }),
    runLocalCommand('git', ['-C', root, 'log', '-1', '--format=%H%x00%s%x00%an%x00%ad', '--date=iso-strict'], { timeoutMs: 8000 }),
  ]);
  const valueAt = index => results[index]?.status === 'fulfilled' ? String(results[index].value.stdout || '').trim() : '';
  const commitParts = valueAt(6).split('\\0');
  const branches = valueAt(5).split(/\r?\n/).map(normalizeGitBranch).filter(Boolean);
  const localBranches = valueAt(7).split(/\r?\n/).map(normalizeGitBranch).filter(Boolean);
  const trackedChanges = parseGitNumstat(valueAt(3));
  const untrackedChanges = results[4]?.status === 'fulfilled' ? results[4].value : { additions: 0, files: 0 };
  environment.git = {
    available: true,
    root,
    branch: valueAt(0),
    remote: valueAt(1),
    changes: {
      additions: trackedChanges.additions + (Number(untrackedChanges?.additions) || 0),
      deletions: trackedChanges.deletions,
      files: Math.max(trackedChanges.files, countGitStatusRows(valueAt(2))),
    },
    files: parseGitStatusRows(valueAt(2)),
    branches: [...new Set(branches)].slice(0, ENVIRONMENT_MAX_BRANCHES),
    localBranches: [...new Set(localBranches)].slice(0, ENVIRONMENT_MAX_BRANCHES),
    lastCommit: commitParts[0] ? {
      hash: commitParts[0],
      subject: commitParts[1] || '',
      author: commitParts[2] || '',
      date: commitParts[3] || '',
    } : null,
  };

  const compare = normalizeGitBranch(compareBranch);
  if (compare && environment.git.branches.includes(compare) && compare !== environment.git.branch) {
    const compareResults = await Promise.allSettled([
      runLocalCommand('git', ['-C', root, 'diff', '--numstat', `HEAD..${compare}`], { timeoutMs: 10000 }),
      runLocalCommand('git', ['-C', root, 'log', '-1', '--format=%H%x00%s%x00%ad', '--date=iso-strict', compare], { timeoutMs: 8000 }),
    ]);
    const compareStat = compareResults[0]?.status === 'fulfilled' ? parseGitNumstat(compareResults[0].value.stdout) : null;
    const compareCommit = compareResults[1]?.status === 'fulfilled' ? String(compareResults[1].value.stdout || '').trim().split('\\0') : [];
    environment.compare = {
      branch: compare,
      changes: compareStat || { additions: 0, deletions: 0, files: 0 },
      lastCommit: compareCommit[0] ? { hash: compareCommit[0], subject: compareCommit[1] || '', date: compareCommit[2] || '' } : null,
    };
  }
  return environment;
}

async function handleEnvironment(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let workspace = { threads: [] };
  try { workspace = await listWorkspaceThreads(160); } catch {}
  const projects = existingProjectCwds(workspace.threads);
  const requestedCwd = String(url.searchParams.get('cwd') || '').trim();
  const cwd = requestedCwd && projects.includes(requestedCwd) ? requestedCwd : (projects[0] || __dirname);
  const compareBranch = url.searchParams.get('compare') || '';
  const gitEnvironment = await readGitEnvironment(cwd, compareBranch);
  const git = gitEnvironment.git || { available: false, branches: [], files: [], changes: { additions: 0, deletions: 0, files: 0 } };
  let cdp = null;
  if (platform.cdpStatus) {
    try { cdp = await platform.cdpStatus(); } catch (error) { cdp = { available: false, code: error.code || 'CDP_STATUS_FAILED', message: error.message || '浏览器状态读取失败。' }; }
  }
  const appServer = codexAppServer.status();
  const processes = [
    { id: `node-${process.pid}`, label: `${APP_NAME} 服务`, command: 'node server.js', pid: process.pid, status: 'running', cwd: __dirname },
  ];
  if (appServer.pid) processes.push({ id: `codex-${appServer.pid}`, label: 'Codex App Server', command: appServer.executable || 'codex', pid: appServer.pid, status: appServer.available ? 'running' : 'stopped', cwd });
  return json(res, 200, {
    ok: true,
    transport: 'app-server',
    cwd,
    name: displayPathName(cwd),
    git,
    compare: gitEnvironment.compare,
    processes,
    browser: {
      available: Boolean(cdp?.available),
      port: Number(cdp?.port) || 9222,
      message: cdp?.available ? 'CDP 浏览器已连接' : '当前没有连接桌面浏览器',
      tabs: [],
    },
    sources: [
      { name: '当前项目', path: cwd, kind: 'workspace' },
      { name: '手机远程页面', path: '/public/index.html', kind: 'web' },
      { name: '本机服务', path: '/server.js', kind: 'server' },
    ],
    capabilities: {
      canCompare: Boolean(git.available),
      canCommit: Boolean(git.available && git.branch),
      canPush: Boolean(git.available && git.branch && git.remote),
      canCheckout: Boolean(git.available && (git.localBranches || git.branches).length),
    },
    limitation: '提交、推送和切换分支都会在这台电脑上执行，并要求手机端再次确认。',
    updatedAt: new Date().toISOString(),
  });
}

async function resolveGitActionTarget(cwdValue = '') {
  let workspace = { threads: [] };
  try { workspace = await listWorkspaceThreads(160); } catch {}
  const projects = existingProjectCwds(workspace.threads);
  const requested = validLocalDirectory(String(cwdValue || '').trim());
  const cwd = requested && projects.includes(requested) ? requested : (projects[0] || __dirname);
  const environment = await readGitEnvironment(cwd);
  if (!environment.git?.available || !environment.git.root) {
    const error = new Error('当前项目不是可操作的 Git 仓库。');
    error.status = 409;
    error.code = 'GIT_REPOSITORY_REQUIRED';
    throw error;
  }
  return { cwd, root: environment.git.root, environment, projects };
}

function gitActionError(message, code = 'GIT_ACTION_FAILED', status = 400) {
  const error = new Error(message);
  error.status = status;
  error.code = code;
  return error;
}

async function handleGitAction(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const action = String(payload.action || '').trim().toLowerCase();
  if (!['commit', 'push', 'checkout'].includes(action)) {
    return json(res, 400, { ok: false, code: 'BAD_GIT_ACTION', message: '不支持的 Git 操作。' });
  }

  try {
    const target = await resolveGitActionTarget(payload.cwd);
    const root = target.root;
    const currentBranch = target.environment.git.branch;
    if (!currentBranch && action !== 'checkout') {
      throw gitActionError('当前处于 detached HEAD，不能直接提交或推送。', 'GIT_DETACHED_HEAD', 409);
    }

    if (action === 'checkout') {
      const branch = normalizeGitBranch(payload.branch);
      const localBranches = new Set(target.environment.git.localBranches || target.environment.git.branches);
      if (!branch || !localBranches.has(branch)) {
        throw gitActionError('只能切换到已存在的本地分支。', 'GIT_BRANCH_NOT_FOUND', 400);
      }
      if (branch === currentBranch) {
        return json(res, 200, { ok: true, action, branch, environment: target.environment, message: '当前已经在这个分支上。' });
      }
      const status = await runLocalCommand('git', ['-C', root, 'status', '--porcelain'], { timeoutMs: 8000 });
      if (String(status.stdout || '').trim()) {
        throw gitActionError('工作区有未提交改动，请先提交或暂存后再切换分支。', 'GIT_WORKTREE_DIRTY', 409);
      }
      await runLocalCommand('git', ['-C', root, 'switch', '--quiet', '--', branch], { timeoutMs: 15000 });
      const environment = await readGitEnvironment(target.cwd);
      return json(res, 200, { ok: true, action, branch, environment, message: `已切换到 ${branch}。` });
    }

    if (action === 'commit') {
      const message = String(payload.message || '').replace(/\s+/g, ' ').trim();
      if (!message) throw gitActionError('提交说明不能为空。', 'EMPTY_COMMIT_MESSAGE', 400);
      if (message.length > 180) throw gitActionError('提交说明不能超过 180 个字符。', 'COMMIT_MESSAGE_TOO_LONG', 400);
      const status = await runLocalCommand('git', ['-C', root, 'status', '--porcelain'], { timeoutMs: 8000 });
      if (!String(status.stdout || '').trim()) throw gitActionError('工作区没有可提交的改动。', 'GIT_WORKTREE_CLEAN', 409);
      await runLocalCommand('git', ['-C', root, 'add', '--all'], { timeoutMs: 20000 });
      const commit = await runLocalCommand('git', ['-C', root, 'commit', '-m', message], { timeoutMs: 30000 });
      const environment = await readGitEnvironment(target.cwd);
      return json(res, 200, {
        ok: true,
        action,
        environment,
        output: String(commit.stdout || '').trim(),
        message: '已提交当前改动。',
      });
    }

    if (!target.environment.git.remote) {
      throw gitActionError('当前仓库没有 origin 远程地址，无法推送。', 'GIT_REMOTE_REQUIRED', 409);
    }
    try {
      await runLocalCommand('git', ['-C', root, 'rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], { timeoutMs: 8000 });
    } catch {
      throw gitActionError('当前分支还没有设置上游分支，暂时不能自动推送。', 'GIT_UPSTREAM_REQUIRED', 409);
    }
    const push = await runLocalCommand('git', ['-C', root, 'push'], { timeoutMs: 60000 });
    const environment = await readGitEnvironment(target.cwd);
    return json(res, 200, {
      ok: true,
      action,
      environment,
      output: String(push.stdout || push.stderr || '').trim(),
      message: '已推送当前分支。',
    });
  } catch (error) {
    return json(res, error?.status || 500, {
      ok: false,
      code: error?.code || 'GIT_ACTION_FAILED',
      message: error?.message || 'Git 操作失败。',
      detail: error?.stderr || '',
    });
  }
}

function githubRepositoryFromRemote(value) {
  const remote = String(value || '').trim();
  const match = remote.match(/^(?:https?:\/\/|ssh:\/\/git@|git@)github\.com(?::|\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/i);
  if (!match) return null;
  const owner = match[1];
  const repo = match[2];
  if (!owner || !repo) return null;
  return { owner, repo, fullName: `${owner}/${repo}` };
}

function fetchGitHubJson(pathname) {
  return new Promise((resolve, reject) => {
    const request = https.request({
      protocol: 'https:',
      hostname: 'api.github.com',
      method: 'GET',
      path: pathname,
      headers: {
        accept: 'application/vnd.github+json',
        'user-agent': `${APP_NAME.replace(/[^a-z0-9._-]/gi, '-')}/1.0`,
      },
    }, response => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', chunk => {
        body += chunk;
        if (Buffer.byteLength(body) > GITHUB_RESPONSE_MAX_BYTES) {
          response.destroy(new Error('GitHub 响应过大。'));
        }
      });
      response.on('error', reject);
      response.on('end', () => {
        const status = Number(response.statusCode) || 0;
        let data;
        try { data = body ? JSON.parse(body) : null; } catch {
          return reject(new Error('GitHub 返回了无法识别的数据。'));
        }
        if (status < 200 || status >= 300) {
          const message = String(data?.message || `GitHub 请求失败（${status}）。`);
          const error = new Error(message);
          error.status = status;
          return reject(error);
        }
        resolve(data);
      });
    });
    request.setTimeout(GITHUB_REQUEST_TIMEOUT_MS, () => request.destroy(new Error('GitHub 请求超时。')));
    request.on('error', reject);
    request.end();
  });
}

async function listGitHubPullRequests(repository) {
  const cached = pullRequestCache.get(repository.fullName);
  if (cached && Date.now() - cached.at < 60000) return cached.rows;
  const pathname = `/repos/${encodeURIComponent(repository.owner)}/${encodeURIComponent(repository.repo)}/pulls?state=open&per_page=50`;
  const payload = await fetchGitHubJson(pathname);
  const rows = Array.isArray(payload) ? payload.map(row => ({
    number: Number(row.number) || 0,
    title: truncateText(row.title || '未命名拉取请求', 240),
    url: String(row.html_url || ''),
    author: String(row.user?.login || ''),
    draft: row.draft === true,
    updatedAt: normalizeIsoTimestamp(row.updated_at),
    head: String(row.head?.ref || ''),
    base: String(row.base?.ref || ''),
  })).filter(row => row.number && /^https:\/\/github\.com\//i.test(row.url)) : [];
  boundedSet(pullRequestCache, repository.fullName, { at: Date.now(), rows }, 30);
  return rows;
}

async function readGitHubProject(cwd) {
  let origin;
  try {
    const result = await runLocalCommand('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { timeoutMs: 8000 });
    origin = String(result.stdout || '').trim();
  } catch {
    return null;
  }
  const repository = githubRepositoryFromRemote(origin);
  if (!repository) return null;
  const pullRequests = await listGitHubPullRequests(repository);
  return {
    cwd,
    name: displayPathName(cwd),
    repository: repository.fullName,
    url: `https://github.com/${repository.fullName}`,
    pullRequests,
  };
}

async function handlePullRequests(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const workspace = await listWorkspaceThreads(160);
  const cwds = existingProjectCwds(workspace.threads).slice(0, 12);
  const results = await Promise.allSettled(cwds.map(readGitHubProject));
  const projects = results
    .filter(result => result.status === 'fulfilled' && result.value)
    .map(result => result.value)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-CN'));
  const errors = results
    .filter(result => result.status === 'rejected')
    .map(result => result.reason?.message || String(result.reason || 'GitHub 读取失败'));
  return json(res, 200, {
    ok: true,
    projects,
    errors,
    updatedAt: new Date().toISOString(),
  });
}

function readTailLines(file) {
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - CODEX_SESSION_TAIL_BYTES);
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.toString('utf8');
    if (start > 0) text = text.slice(text.indexOf('\n') + 1);
    return text.split('\n').filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

function readTailLinesWithLimit(file, maxBytes) {
  const stat = fs.statSync(file);
  const start = Math.max(0, stat.size - maxBytes);
  const fd = fs.openSync(file, 'r');
  try {
    const buffer = Buffer.alloc(stat.size - start);
    fs.readSync(fd, buffer, 0, buffer.length, start);
    let text = buffer.toString('utf8');
    if (start > 0) {
      const firstNewline = text.indexOf('\n');
      text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
    }
    return text.split('\n').filter(Boolean);
  } finally {
    fs.closeSync(fd);
  }
}

function countCodexHistoryMessages(lines, maxNeeded = MAX_HISTORY_MESSAGES) {
  let count = 0;
  let currentTurn = null;
  const need = Math.max(1, Math.min(Number(maxNeeded) || MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES));
  for (const line of lines) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    const payload = item.payload || {};
    if (item.type === 'event_msg' && payload.type === 'task_started') {
      currentTurn = { hasAssistant: false };
      continue;
    }
    if (item.type === 'event_msg' && payload.type === 'user_message') {
      const text = cleanUserHistoryText(payload.message);
      const attachments = extractUserAttachments(payload);
      if (text || attachments.length) count += 1;
    } else if (item.type === 'response_item' && payload.type === 'message' && payload.role === 'assistant' && payload.phase === 'final_answer') {
      const text = normalizeHistoryText(extractMessageText(payload.content));
      if (text) {
        count += 1;
        if (currentTurn) currentTurn.hasAssistant = true;
      }
    } else if (item.type === 'event_msg' && payload.type === 'task_complete') {
      const lastMessage = normalizeHistoryText(payload.last_agent_message || '');
      if (currentTurn && !currentTurn.hasAssistant) count += lastMessage ? 1 : 1;
      currentTurn = null;
    } else if (item.type === 'event_msg' && isTerminalFailurePayload(payload)) {
      if (currentTurn && !currentTurn.hasAssistant) count += 1;
      currentTurn = null;
    }
    if (count >= need) return count;
  }
  return count;
}

function readHistoryLinesAdaptive(file, desiredMessages = MAX_HISTORY_MESSAGES) {
  const stat = fs.statSync(file);
  const maxBytes = Math.min(stat.size, CODEX_HISTORY_TAIL_BYTES);
  const desired = Math.max(1, Math.min(Number(desiredMessages) || MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES));

  if (maxBytes <= CODEX_HISTORY_INITIAL_TAIL_BYTES * 6) {
    return { lines: readTailLinesWithLimit(file, maxBytes), stat, scannedBytes: maxBytes };
  }

  const initialBytes = Math.min(CODEX_HISTORY_INITIAL_TAIL_BYTES, maxBytes);
  const initialLines = readTailLinesWithLimit(file, initialBytes);
  if (countCodexHistoryMessages(initialLines, desired) >= desired) {
    return { lines: initialLines, stat, scannedBytes: initialBytes };
  }

  return { lines: readTailLinesWithLimit(file, maxBytes), stat, scannedBytes: maxBytes };
}

function extractUserAttachments(payload) {
  const paths = [];
  for (const key of ['local_images', 'images']) {
    if (!Array.isArray(payload[key])) continue;
    for (const item of payload[key]) {
      if (typeof item === 'string') paths.push(item);
      else if (item && typeof item.path === 'string') paths.push(item.path);
      else if (item && typeof item.filePath === 'string') paths.push(item.filePath);
    }
  }
  return paths;
}

function historyAttachmentDescriptor(filePath) {
  const absolutePath = path.resolve(String(filePath || ''));
  const mime = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' }[path.extname(absolutePath).toLowerCase()];
  if (!mime) return null;
  try {
    const stat = fs.lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_ATTACHMENT_BYTES) return null;
  } catch { return null; }
  const now = Date.now();
  for (const [id, item] of historyAttachmentCache) {
    if (item.expiresAt <= now) historyAttachmentCache.delete(id);
    else if (item.filePath === absolutePath) return { name: path.basename(absolutePath), url: `/codex/attachment?id=${encodeURIComponent(id)}` };
  }
  while (historyAttachmentCache.size >= HISTORY_ATTACHMENT_LIMIT) historyAttachmentCache.delete(historyAttachmentCache.keys().next().value);
  const id = crypto.randomBytes(18).toString('base64url');
  historyAttachmentCache.set(id, { filePath: absolutePath, mime, expiresAt: now + HISTORY_ATTACHMENT_TTL_MS });
  return { name: path.basename(absolutePath), url: `/codex/attachment?id=${encodeURIComponent(id)}` };
}

function parseCodexThreadHistory(threadId, limit = MAX_HISTORY_MESSAGES) {
  const file = findCodexSessionFileByThreadId(threadId);
  if (!file) {
    return {
      ok: true,
      available: false,
      threadId,
      sessionFile: '',
      messages: [],
      message: '没有找到所选任务的 Codex 会话文件。',
    };
  }

  const messages = [];
  let currentTurn = null;
  function historyDurationText(startedAt = '', completedAt = '') {
    const startMs = Date.parse(startedAt || '');
    const endMs = Date.parse(completedAt || '');
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs < startMs) return '';
    const total = Math.max(0, Math.floor((endMs - startMs) / 1000));
    const minutes = Math.floor(total / 60);
    const seconds = total % 60;
    return minutes ? `${minutes}m ${seconds}s` : `${seconds}s`;
  }
  function historyCompleteLabel(startedAt = '', completedAt = '') {
    const duration = historyDurationText(startedAt, completedAt);
    return duration ? `Codex · 已处理 ${duration}` : 'Codex';
  }
  function historyFailureLabel(startedAt = '', completedAt = '') {
    const duration = historyDurationText(startedAt, completedAt);
    return duration ? `Codex · 失败 ${duration}` : 'Codex';
  }
  const historyTail = readHistoryLinesAdaptive(file, limit);
  for (const line of historyTail.lines) {
    let item;
    try { item = JSON.parse(line); } catch { continue; }
    const payload = item.payload || {};

    if (item.type === 'event_msg' && payload.type === 'task_started') {
      currentTurn = { hasAssistant: false, assistantIndex: -1, failureText: '', startedAt: item.timestamp || '', turnId: payload.turn_id || '' };
      continue;
    }

    if (currentTurn && item.type === 'event_msg') {
      currentTurn.failureText = currentTurn.failureText || extractFailureTextFromPayload(payload);
    }

    if (currentTurn && item.type === 'turn_context') {
      currentTurn.turnId = payload.turn_id || currentTurn.turnId;
    }

    if (item.type === 'event_msg' && payload.type === 'user_message') {
      const text = cleanUserHistoryText(payload.message);
      const attachments = extractUserAttachments(payload);
      if (text || attachments.length) {
        messages.push({
          role: 'user',
          label: attachments.length ? `你 · ${attachments.length} 张图片` : '你',
          text: text || (attachments.length ? ' ' : ''),
          attachments: attachments.map(historyAttachmentDescriptor).filter(Boolean),
          timestamp: item.timestamp || '',
        });
      }
      continue;
    }

    if (item.type === 'response_item' && payload.type === 'message' && payload.role === 'assistant') {
      const isFinal = payload.phase === 'final_answer';
      if (!isFinal) continue;
      const text = normalizeHistoryText(extractMessageText(payload.content));
      if (text) {
        const assistantIndex = messages.length;
        messages.push({
          role: 'assistant',
          label: 'Codex',
          text,
          timestamp: item.timestamp || '',
        });
        if (currentTurn) {
          currentTurn.hasAssistant = true;
          currentTurn.assistantIndex = assistantIndex;
        }
      }
      continue;
    }

    if (item.type === 'event_msg' && payload.type === 'task_complete') {
      const lastMessage = normalizeHistoryText(payload.last_agent_message || '');
      const completedAt = item.timestamp || '';
      if (currentTurn && !currentTurn.hasAssistant) {
        const failureText = resolveFailureTextForTurn(threadId, {
          turnId: currentTurn.turnId || '',
          startedAt: currentTurn.startedAt || '',
          completedAt,
          failureText: currentTurn.failureText || '',
        });
        messages.push({
          role: 'assistant',
          label: failureText ? historyFailureLabel(currentTurn.startedAt, completedAt) : historyCompleteLabel(currentTurn.startedAt, completedAt),
          text: lastMessage || failureText || emptyCodexFailureText(),
          timestamp: completedAt || currentTurn.startedAt || '',
        });
      } else if (currentTurn && currentTurn.hasAssistant && currentTurn.assistantIndex >= 0 && messages[currentTurn.assistantIndex]) {
        messages[currentTurn.assistantIndex].label = historyCompleteLabel(currentTurn.startedAt, completedAt);
      }
      currentTurn = null;
    }

    if (item.type === 'event_msg' && isTerminalFailurePayload(payload)) {
      const failureText = normalizeHistoryText(extractFailureTextFromPayload(payload) || currentTurn?.failureText || '');
      if (currentTurn && !currentTurn.hasAssistant) {
        messages.push({
          role: 'assistant',
          label: historyFailureLabel(currentTurn.startedAt, item.timestamp || ''),
          text: failureText || emptyCodexFailureText(),
          timestamp: item.timestamp || currentTurn.startedAt || '',
        });
      } else if (currentTurn && currentTurn.hasAssistant && currentTurn.assistantIndex >= 0 && messages[currentTurn.assistantIndex]) {
        messages[currentTurn.assistantIndex].label = historyFailureLabel(currentTurn.startedAt, item.timestamp || '');
      }
      currentTurn = null;
    }
  }

  return {
    ok: true,
    available: true,
    threadId,
    sessionFile: path.basename(file),
    truncated: historyTail.stat.size > CODEX_HISTORY_TAIL_BYTES,
    messages: messages.slice(-Math.max(1, Math.min(Number(limit) || MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES))),
  };
}

function appServerTurnLabel(turn = {}, failed = false) {
  const durationMs = Number(turn.durationMs || 0);
  const seconds = durationMs > 0 ? Math.max(0, Math.floor(durationMs / 1000)) : 0;
  const duration = seconds >= 60 ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` : seconds ? `${seconds}s` : '';
  if (failed) return duration ? `Codex · 失败 ${duration}` : 'Codex · 失败';
  return duration ? `Codex · 已处理 ${duration}` : 'Codex';
}

function appServerUserMessage(item = {}, timestamp = '') {
  const textParts = [];
  const attachments = [];
  for (const content of item.content || []) {
    if (content?.type === 'text' && content.text) textParts.push(content.text);
    if (content?.type === 'localImage' && content.path) {
      const attachment = historyAttachmentDescriptor(content.path);
      if (attachment) attachments.push(attachment);
    } else if (content?.type === 'image' && content.url) {
      attachments.push({ filePath: content.url, name: 'image' });
    }
  }
  const text = cleanUserHistoryText(textParts.join('\n'));
  if (!text && !attachments.length) return null;
  return {
    role: 'user',
    label: attachments.length ? `你 · ${attachments.length} 张图片` : '你',
    text: text || ' ',
    attachments,
    timestamp,
  };
}

function appServerActivityText(item = {}) {
  const type = String(item.type || '').trim();
  const activityTypes = new Set(['mcpToolCall', 'fileChange', 'contextCompaction', 'compacted', 'commandExecution', 'shellCommand', 'webSearch', 'imageGeneration', 'imageView', 'browserAction']);
  if (!activityTypes.has(type)) return null;
  const rawTool = String(item.tool || item.name || item.command || '').trim();
  const tool = rawTool.split('.').pop().toLowerCase();
  const args = item.arguments && typeof item.arguments === 'object' ? item.arguments : {};
  const title = String(args.title || item.title || '').replace(/\s+/g, ' ').trim();
  const code = String(args.code || '').trim();

  if (type === 'fileChange') {
    const changes = Array.isArray(item.changes) ? item.changes : [];
    const paths = changes.map(change => change?.path).filter(Boolean).map(shortPath);
    return {
      kind: 'tool',
      category: 'file',
      label: '文件',
      text: paths.length ? `编辑 ${uniqueList(paths, 3).join('、')}` : '编辑文件',
    };
  }
  if (type === 'contextCompaction' || type === 'compacted') {
    return { kind: 'tool', category: 'context', label: '上下文', text: '压缩上下文' };
  }

  const looksLikeImage = tool === 'view_image' || /(?:view_image|查看图片|已查看\s*\d*\s*张?(?:图片|图像)|\bimage(?:s)?\b)/i.test(`${rawTool} ${title}`) || /\bview_image\b/i.test(code);
  if (looksLikeImage) return { kind: 'tool', category: 'image', label: '图片', text: title || '查看图片' };

  const looksLikeBrowser = /(?:browser|chrome|网页|页面|tab|domsnapshot|screenshot|playwright|goto\s*\()/i.test(`${rawTool} ${title} ${code}`);
  const looksLikeCommand = /(?:exec_command|shell_command|powershell|命令|npm\s|node\s|git\s|Get-[A-Za-z]|rg\s|sed\s|\bcat\s)/i.test(`${rawTool} ${title} ${code}`);
  if (looksLikeBrowser) return { kind: 'tool', category: 'browser', label: '浏览器', text: title || '检查网页' };
  if (looksLikeCommand) return { kind: 'tool', category: 'command', label: '命令', text: title || '运行命令' };

  if (type === 'commandExecution' || type === 'shellCommand') {
    return { kind: 'tool', category: 'command', label: '命令', text: title || item.command || '运行命令' };
  }
  if (type === 'webSearch' || /search/i.test(tool)) return { kind: 'tool', category: 'search', label: '搜索', text: title || '搜索资料' };
  return { kind: 'tool', category: 'tool', label: '工具', text: title || rawTool || '使用工具' };
}

function appServerTurnActivities(turn = {}) {
  const activities = [];
  for (const item of turn.items || []) {
    if (!item || !item.type) continue;
    const activity = appServerActivityText(item);
    if (activity) activities.push({ ...activity, id: item.id || '', status: item.status || '' });
  }
  return activities.slice(-500);
}

function historyFromAppServerThread(thread, limit = MAX_HISTORY_MESSAGES) {
  const messages = [];
  // The app server can return turns in cache or newest-first order. The phone
  // must always mirror the desktop conversation from oldest to newest.
  const turns = [...(thread?.turns || [])]
    .map((turn, index) => ({ turn, index }))
    .sort((left, right) => {
      const leftTime = Number(left.turn?.startedAt || left.turn?.createdAt || 0);
      const rightTime = Number(right.turn?.startedAt || right.turn?.createdAt || 0);
      return leftTime - rightTime || left.index - right.index;
    });
  for (const { turn } of turns) {
    const startedAt = Number(turn.startedAt || 0) ? new Date(Number(turn.startedAt) * 1000).toISOString() : '';
    const completedAt = Number(turn.completedAt || 0) ? new Date(Number(turn.completedAt) * 1000).toISOString() : '';
    const agentItems = [];
    const activities = appServerTurnActivities(turn);
    let hasExplicitFinal = false;
    for (const item of turn.items || []) {
      if (item?.type === 'userMessage') {
        const message = appServerUserMessage(item, startedAt);
        if (message) messages.push(message);
      }
      if (item?.type === 'agentMessage' && item.text) {
        agentItems.push(item);
        if (item.phase === 'final_answer') hasExplicitFinal = true;
      }
    }

    const visibleAgents = hasExplicitFinal
      ? agentItems.filter(item => item.phase === 'final_answer')
      : (turn.status === 'completed' ? agentItems.slice(-1) : []);
    for (const item of visibleAgents) {
      const text = normalizeHistoryText(item.text || '');
      if (!text) continue;
      messages.push({
        role: 'assistant',
        label: appServerTurnLabel(turn, false),
        text,
        steps: activities,
        timestamp: completedAt || startedAt,
      });
    }

    if (turn.status === 'failed' && !visibleAgents.length) {
      const failure = normalizeHistoryText(turn.error?.message || turn.error?.additionalDetails || '') || emptyCodexFailureText();
      messages.push({
        role: 'assistant',
        label: appServerTurnLabel(turn, true),
        text: failure,
        steps: activities,
        timestamp: completedAt || startedAt,
      });
    }
  }

  const normalizedLimit = Math.max(1, Math.min(Number(limit) || MAX_HISTORY_MESSAGES, MAX_HISTORY_MESSAGES));
  return {
    ok: true,
    available: Boolean(thread),
    transport: 'app-server',
    threadId: thread?.id || '',
    sessionFile: thread?.path ? path.basename(thread.path) : '',
    truncated: messages.length > normalizedLimit,
    messages: messages.slice(-normalizedLimit),
  };
}

async function handleThreadHistory(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const threadId = url.searchParams.get('thread') || '';
    if (!isCodexThreadId(threadId)) {
      return json(res, 400, { ok: false, code: 'BAD_THREAD_ID', message: '任务 ID 不正确。' });
    }
    const limit = url.searchParams.get('limit') || MAX_HISTORY_MESSAGES;
    try {
      const thread = await codexAppServer.readThread(threadId, true);
      return json(res, 200, historyFromAppServerThread(thread, limit));
    } catch (appServerError) {
      return json(res, 200, {
        ...parseCodexThreadHistory(threadId, limit),
        transport: 'session-files',
        appServerError: appServerError.message || String(appServerError),
      });
    }
  } catch (error) {
    return json(res, 500, { ok: false, code: 'CODEX_HISTORY_FAILED', message: '读取 Codex 聊天记录失败。', detail: String(error && error.message || error) });
  }
}

function extractReasoningText(payload) {
  const parts = [];
  if (Array.isArray(payload.summary)) {
    for (const item of payload.summary) {
      if (typeof item === 'string') parts.push(item);
      else if (item && typeof item.text === 'string') parts.push(item.text);
      else if (item && typeof item.summary === 'string') parts.push(item.summary);
    }
  }
  if (Array.isArray(payload.content)) {
    for (const item of payload.content) {
      if (typeof item === 'string') parts.push(item);
      else if (item && typeof item.text === 'string') parts.push(item.text);
    }
  }
  if (typeof payload.text === 'string') parts.push(payload.text);
  const visible = parts.map(x => String(x).trim()).filter(Boolean).join('\n');
  return visible;
}

function parseToolArguments(payload) {
  const raw = payload.arguments || payload.input || '';
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try { return JSON.parse(raw); } catch { return { raw: String(raw) }; }
}

function shellQuotePattern() {
  return String.raw`(?:(?:"[^"]+")|(?:'[^']+')|(?:\\\S|\S)+)`;
}

function stripShellQuotes(value) {
  let text = String(value || '').trim();
  while ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith("'") && text.endsWith("'"))) {
    text = text.slice(1, -1);
  }
  return text.replace(/\\([\s"'])/g, '$1');
}

function shortPath(value) {
  const text = stripShellQuotes(value).replace(/^~\//, '~/');
  if (!text) return '';
  const home = os.homedir();
  const normalized = text.startsWith(home) ? `~${text.slice(home.length)}` : text;
  if (/^[./~\w-].*\.(?:js|ts|tsx|jsx|html|css|json|jsonl|md|txt|sh|swift|py|yml|yaml|webmanifest|png|jpg|jpeg|gif|svg)$/i.test(normalized)) {
    return normalized.replace(/^\.\//, '');
  }
  return normalized.replace(/^\.\//, '');
}


function isLikelyToolFile(value) {
  const text = stripShellQuotes(value);
  if (!text || text.startsWith('-') || text.startsWith('<') || /^\d+$/.test(text)) return false;
  if (/^[A-Z_]+$/.test(text)) return false;
  return /[./~]/.test(text) || /\.[A-Za-z0-9]{1,12}$/.test(text);
}

function uniqueList(values, limit = 3) {
  const out = [];
  for (const value of values) {
    const text = shortPath(value);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= limit) break;
  }
  return out;
}

function joinToolTargets(values) {
  const list = uniqueList(values, 4);
  if (!list.length) return '';
  return list.join(', ');
}

function extractCommandFiles(cmd) {
  const files = [];
  const token = shellQuotePattern();
  const commandPatterns = [
    new RegExp(String.raw`\bsed\s+(?:-[A-Za-z]+\s+)?${token}\s+(${token})`, 'g'),
    new RegExp(String.raw`\bnl\s+(?:-[A-Za-z]+\s+)*(${token})`, 'g'),
    new RegExp(String.raw`\b(?:cat|head|tail)\s+(?:-[A-Za-z0-9]+\s+)*(?:-n\s+\d+\s+)?(${token})`, 'g'),
  ];
  for (const re of commandPatterns) {
    let match;
    while ((match = re.exec(cmd))) files.push(match[1]);
  }
  const redirectMatch = cmd.match(/<\s*([^\s|;&]+)/);
  if (redirectMatch && !/<<\s*$/.test(cmd.slice(Math.max(0, redirectMatch.index - 3), redirectMatch.index + 1))) files.push(redirectMatch[1]);
  return uniqueList(files.filter(isLikelyToolFile), 4);
}

function extractSearchTargets(cmd) {
  const afterGlob = cmd.replace(/--glob\s+(?:"[^"]+"|'[^']+'|\S+)/g, '');
  const matches = [...afterGlob.matchAll(/(?:^|\s)([./~\w-][^\s|;&]*\.(?:js|ts|tsx|jsx|html|css|json|jsonl|md|txt|sh|swift|py|yml|yaml|webmanifest))(?:\s|$)/gi)];
  return uniqueList(matches.map(match => match[1]), 4);
}

function truncateCommand(cmd, max = 120) {
  const oneLine = String(cmd || '').split('\n')[0].replace(/\s+/g, ' ').trim();
  const home = os.homedir();
  const text = oneLine.startsWith(home) ? `~${oneLine.slice(home.length)}` : oneLine.replace(new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), '~');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function patchStats(patch) {
  const files = [];
  let added = 0;
  let removed = 0;
  for (const line of String(patch || '').split('\n')) {
    const fileMatch = line.match(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/) || line.match(/^@@\s+(.+?)\s*$/);
    if (fileMatch && !fileMatch[1].startsWith('@@')) files.push(fileMatch[1].trim());
    if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('***')) continue;
    if (line.startsWith('+')) added += 1;
    else if (line.startsWith('-')) removed += 1;
  }
  return { files: uniqueList(files, 3), added, removed };
}

function formatToolCall(payload, options = {}) {
  const rawName = String(payload.name || 'tool');
  const name = rawName.split('.').pop();
  const args = parseToolArguments(payload);

  if (name === 'exec_command' || name === 'shell_command') {
    const cmd = String(args.command || args.cmd || args.raw || '').trim();
    const files = extractCommandFiles(cmd);
    if (files.length) return `Read ${files.join(', ')}`;

    if (/\b(?:rg|grep)\b/.test(cmd)) {
      const targets = joinToolTargets(extractSearchTargets(cmd));
      return targets ? `Search ${targets}` : 'Search project files';
    }
    if (/\bfind\b/.test(cmd)) return 'Find files';
    if (/\bls\b/.test(cmd)) return 'List files';
    if (/\bgit\s+diff\b/.test(cmd)) return `Review diff${joinToolTargets(extractSearchTargets(cmd)) ? ` in ${joinToolTargets(extractSearchTargets(cmd))}` : ''}`;
    if (/\bgit\s+status\b/.test(cmd)) return 'Check git status';
    if (/\bgit\b/.test(cmd)) return `Run git: ${truncateCommand(cmd, 90)}`;
    if (/\b(?:node --check|npm run check)\b/.test(cmd)) return 'Run checks';
    if (/\bcurl\b/.test(cmd)) return `Check endpoint: ${truncateCommand(cmd, 100)}`;
    if (/\b(?:npm start|node\s+server\.js)\b/.test(cmd)) return 'Start local service';
    if (/\b(?:osascript|cliclick|open -b com\.openai\.codex)\b/.test(cmd)) return 'Control Codex desktop';
    if (/\.codex\/sessions|session_index\.jsonl|Codex session/.test(cmd)) return 'Inspect Codex session log';
    if (/\b(?:python3|node\s+-)\b/.test(cmd)) return `Run script: ${truncateCommand(cmd, 90)}`;
    return `Run: ${truncateCommand(cmd) || 'local command'}`;
  }

  if (name === 'apply_patch') {
    const patch = typeof args.raw === 'string' ? args.raw : String(payload.arguments || '');
    const stats = patchStats(patch);
    const target = stats.files.length ? stats.files.join(', ') : 'files';
    const delta = stats.added || stats.removed ? ` +${stats.added} -${stats.removed}` : '';
    return `${options.complete ? '已编辑' : '正在编辑'} ${target}${delta}`;
  }

  if (name === 'wait' || name === 'wait_agent' || name === 'wait_threads') return '';
  if (name === 'exec') return '运行命令或工具';
  if (name === 'write_stdin') return '读取命令输出';
  if (name === 'view_image') return `查看图片${args.path ? ` ${shortPath(args.path)}` : ''}`;
  if (name === 'read_mcp_resource') return '读取资源';
  if (name.includes('browser') || name.includes('chrome')) return '检查网页';
  if (name.includes('search')) return '搜索资料';
  if (name.includes('read')) return '读取信息';
  return '使用工具';
}

function cleanVisibleProgress(value) {
  let text = normalizeHistoryText(value || '')
    .replace(/^\*{1,2}|\*{1,2}$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if (/^(?:wait|exec|apply_patch|shell_command)\s*\{/i.test(text)) return '';
  if (/^\{[\s\S]*\}$/.test(text)) return '';
  const hanCount = (text.match(/[\u3400-\u9fff]/g) || []).length;
  const letterCount = (text.match(/[A-Za-z]/g) || []).length;
  if (!hanCount && letterCount > 24) return '';
  return truncateText(text, 220);
}


function contextUsageFromItems(items) {
  let windowTokens = 0;
  let latestUsage = null;
  let updatedAt = '';

  for (const item of items) {
    const payload = item.payload || {};
    if (item.type === 'event_msg' && payload.type === 'task_started') {
      const value = Number(payload.model_context_window || 0);
      if (Number.isFinite(value) && value > 0) windowTokens = value;
    }
    if (item.type !== 'event_msg' || payload.type !== 'token_count') continue;
    const info = payload.info || {};
    const value = Number(info.model_context_window || 0);
    if (Number.isFinite(value) && value > 0) windowTokens = value;
    const usage = info.last_token_usage || info.current_token_usage || null;
    if (usage && typeof usage === 'object') {
      latestUsage = usage;
      updatedAt = item.timestamp || updatedAt;
    }
  }

  if (!latestUsage || !windowTokens) {
    return {
      available: false,
      usedTokens: 0,
      windowTokens: windowTokens || 0,
      remainingTokens: windowTokens || 0,
      percent: null,
      updatedAt,
    };
  }

  const inputTokens = Number(latestUsage.input_tokens || 0) || 0;
  const outputTokens = Number(latestUsage.output_tokens || 0) || 0;
  const totalTokens = Number(latestUsage.total_tokens || 0) || 0;
  let usedTokens = totalTokens || (inputTokens + outputTokens) || inputTokens;
  if (usedTokens > windowTokens * 1.15 && inputTokens > 0 && inputTokens <= windowTokens * 1.15) {
    usedTokens = inputTokens + outputTokens;
  }
  usedTokens = Math.max(0, Math.round(usedTokens));
  const percent = Math.max(0, Math.min(100, (usedTokens / windowTokens) * 100));

  return {
    available: true,
    usedTokens,
    windowTokens,
    remainingTokens: Math.max(0, Math.round(windowTokens - usedTokens)),
    percent,
    updatedAt,
  };
}

function modelInfoFromId(modelId = '', updatedAt = '') {
  const id = String(modelId || '').trim();
  const option = findModelOption(id);
  if (option) return { available: true, id, version: '', source: 'local', label: option.label, displayName: option.displayName, updatedAt };

  if (id === 'gpt-5.5') return { available: true, id, version: '5.5', source: 'official', label: '5.5', displayName: 'GPT-5.5', updatedAt };
  if (id === 'gpt-5.4') return { available: true, id, version: '5.4', source: 'official', label: '5.4', displayName: 'GPT-5.4', updatedAt };
  if (id === 'gpt-5.4-mini') return { available: true, id, version: 'mini', source: 'official', label: 'mini', displayName: 'GPT-5.4 Mini', updatedAt };
  if (id === 'gpt-5.3-codex') return { available: true, id, version: '5.3', source: 'official', label: '5.3', displayName: 'GPT-5.3 Codex', updatedAt };
  if (id === 'gpt-5.2') return { available: true, id, version: '5.2', source: 'official', label: '5.2', displayName: 'GPT-5.2', updatedAt };

  return {
    available: Boolean(id),
    id,
    version: '',
    source: id.startsWith('gpt-') ? 'official' : id ? 'unknown' : '',
    label: labelFromModelName(id),
    displayName: id,
    updatedAt,
  };
}

function currentModelFromItems(items) {
  let modelId = '';
  let updatedAt = '';
  for (const item of items) {
    const payload = item.payload || {};
    if (item.type === 'session_meta' && payload.model) {
      modelId = payload.model;
      updatedAt = item.timestamp || payload.timestamp || updatedAt;
    }
    if (item.type === 'turn_context' && payload.model) {
      modelId = payload.model;
      updatedAt = item.timestamp || updatedAt;
    }
  }
  return modelInfoFromId(modelId, updatedAt);
}

function reasoningModeFromValue(value = '', updatedAt = '') {
  const raw = String(value || '').trim().toLowerCase();
  const aliases = {
    low: 'low',
    '低': 'low',
    medium: 'medium',
    med: 'medium',
    middle: 'medium',
    '中': 'medium',
    high: 'high',
    '高': 'high',
    xhigh: 'xhigh',
    'x-high': 'xhigh',
    'extra-high': 'xhigh',
    extreme: 'xhigh',
    max: 'max',
    maximum: 'max',
    ultra: 'ultra',
    '超高': 'xhigh',
    '最高': 'max',
    '极高': 'max',
    '极致': 'ultra',
  };
  const key = aliases[raw] || '';
  const target = key ? REASONING_MODE_TARGETS[key] : null;
  return {
    available: Boolean(target || raw),
    key: target?.key || '',
    value: target?.value || raw,
    label: target?.label || '',
    displayName: target?.displayName || value || '',
    updatedAt,
  };
}

function currentReasoningModeFromItems(items) {
  let value = '';
  let updatedAt = '';
  for (const item of items) {
    const payload = item.payload || {};
    const settings = payload.collaboration_mode && typeof payload.collaboration_mode === 'object'
      ? payload.collaboration_mode.settings || {}
      : {};
    const reasoning = payload.reasoning && typeof payload.reasoning === 'object' ? payload.reasoning : {};
    const next = payload.reasoning_effort || payload.reasoningMode || payload.reasoning_mode || settings.reasoning_effort || reasoning.effort || '';
    if (item.type === 'turn_context' && next) {
      value = next;
      updatedAt = item.timestamp || updatedAt;
    }
  }
  return reasoningModeFromValue(value, updatedAt);
}

function stepFromEvent(item) {
  const payload = item.payload || {};
  if (item.type === 'event_msg') {
    const failureText = extractFailureTextFromPayload(payload);
    if (failureText) return { kind: 'error', label: '失败', text: failureText, time: item.timestamp };
    if (payload.type === 'task_started') return { kind: 'start', label: '开始', text: '开始处理这条消息', time: item.timestamp };
    if (payload.type === 'task_complete') return { kind: 'complete', label: '完成', text: '回复完成', time: item.timestamp };
    if (payload.type === 'agent_message') return null;
    return null;
  }

  if (item.type === 'response_item') {
    if (payload.type === 'reasoning') {
      return null;
    }
    if (payload.type === 'function_call') {
      const text = formatToolCall(payload);
      return text ? { kind: 'tool', label: '工具', text, callId: payload.call_id || '', time: item.timestamp } : null;
    }
    if (payload.type === 'message') {
      const text = extractMessageText(payload.content);
      if (text && payload.role === 'assistant' && payload.phase === 'commentary') {
        const progress = cleanVisibleProgress(text);
        return progress ? { kind: 'thinking', label: '进度', text: progress, time: item.timestamp } : null;
      }
      if (text && payload.role === 'assistant') return { kind: payload.phase === 'final_answer' ? 'final' : 'assistant', label: '回复', text: truncateText(text, 1200), time: item.timestamp };
    }
  }
  return null;
}

function parseCodexStatus(options = {}) {
  const sinceMs = options.since ? Date.parse(options.since) : 0;
  const wantsExactSession = Boolean(options.threadId || options.sessionFile);
  const requestedFile = options.threadId ? findCodexSessionFileByThreadId(options.threadId) : options.sessionFile ? findCodexSessionFileByName(options.sessionFile) : null;
  const file = requestedFile || (wantsExactSession ? null : findLatestCodexSessionFile({
    afterMs: options.expectNewThread ? sinceMs : 0,
    excludeThreadId: options.excludeThreadId || '',
    cwd: options.cwd || '',
  }));
  if (!file) {
    return {
      ok: true,
      available: false,
      active: Boolean(options.expectNewThread && sinceMs),
      status: wantsExactSession ? 'missing' : options.expectNewThread && sinceMs ? 'waiting' : 'idle',
      threadId: options.threadId || '',
      sessionFile: options.sessionFile || '',
      message: wantsExactSession ? '没有找到所选任务的 Codex 会话文件。' : '还没有找到 Codex 会话文件。',
      steps: [],
      preview: options.expectNewThread && sinceMs ? '已发送，等待 Codex 创建新任务记录…' : '还没有找到这个任务的回复记录。',
      final: '',
      durationMs: 0,
    };
  }

  const rawItems = [];
  for (const line of readTailLines(file)) {
    try { rawItems.push(JSON.parse(line)); } catch { /* ignore partial/corrupt lines */ }
  }

  let startIndex = -1;
  if (sinceMs) {
    for (let i = 0; i < rawItems.length; i += 1) {
      const t = Date.parse(rawItems[i].timestamp || '');
      if (Number.isFinite(t) && t >= sinceMs) {
        startIndex = i;
        break;
      }
    }
  }

  if (startIndex < 0) {
    for (let i = rawItems.length - 1; i >= 0; i -= 1) {
      if (rawItems[i].type === 'event_msg' && rawItems[i].payload && rawItems[i].payload.type === 'task_started') {
        startIndex = i;
        break;
      }
    }
  }
  if (startIndex < 0) startIndex = Math.max(0, rawItems.length - 80);

  // If watching a specific send, begin at the first task_started after that send when possible.
  if (sinceMs) {
    for (let i = startIndex; i < rawItems.length; i += 1) {
      const item = rawItems[i];
      const t = Date.parse(item.timestamp || '');
      if (Number.isFinite(t) && t >= sinceMs && item.type === 'event_msg' && item.payload && item.payload.type === 'task_started') {
        startIndex = i;
        break;
      }
    }
  }

  const turnItems = rawItems.slice(startIndex).filter(item => {
    if (!sinceMs) return true;
    const t = Date.parse(item.timestamp || '');
    return !Number.isFinite(t) || t >= sinceMs;
  });

  let active = Boolean(sinceMs);
  let completed = false;
  let turnId = null;
  let final = '';
  let preview = '';
  let startedAt = '';
  let completedAt = '';
  let sawTaskStarted = false;
  let failureText = '';
  let emptyComplete = false;
  const steps = [];
  const seenThinking = new Set();
  const toolCallsById = new Map();
  const toolStepIndexById = new Map();

  for (const item of turnItems) {
    const payload = item.payload || {};
    failureText = failureText || extractFailureTextFromPayload(payload);
    if (item.type === 'event_msg' && payload.type === 'task_started') {
      active = true;
      sawTaskStarted = true;
      turnId = payload.turn_id || turnId;
      startedAt = startedAt || item.timestamp || '';
    }
    if (item.type === 'turn_context') turnId = payload.turn_id || turnId;
    if (item.type === 'event_msg' && payload.type === 'task_complete') {
      active = false;
      completed = true;
      completedAt = item.timestamp || completedAt;
      const lastMessage = normalizeHistoryText(payload.last_agent_message || '');
      final = lastMessage || final;
      if (!lastMessage && !final && !preview && sawTaskStarted) emptyComplete = true;
    }
    if (item.type === 'event_msg' && isTerminalFailurePayload(payload)) {
      active = false;
      completed = true;
      completedAt = item.timestamp || completedAt;
      turnId = payload.turn_id || turnId;
    }

    if (item.type === 'response_item' && payload.type === 'function_call_output' && payload.call_id && toolStepIndexById.has(payload.call_id)) {
      const callPayload = toolCallsById.get(payload.call_id);
      if (callPayload && String(callPayload.name || '').split('.').pop() === 'apply_patch') {
        const stepIndex = toolStepIndexById.get(payload.call_id);
        if (steps[stepIndex]) steps[stepIndex].text = formatToolCall(callPayload, { complete: true });
      }
    }

    const step = stepFromEvent(item);
    if (!step) continue;
    if (step.kind === 'thinking') {
      const key = step.text || 'thinking';
      if (seenThinking.has(key)) continue;
      seenThinking.add(key);
    }
    if ((step.kind === 'assistant' || step.kind === 'final') && step.text) preview = step.text;
    if (step.kind === 'final' && step.text) final = step.text;
    if (['start', 'thinking', 'tool', 'complete', 'error'].includes(step.kind)) {
      if (step.kind === 'tool' && step.callId) {
        toolCallsById.set(step.callId, payload);
        toolStepIndexById.set(step.callId, steps.length);
      }
      steps.push(step);
    }
  }

  const context = contextUsageFromItems(rawItems);
  const model = currentModelFromItems(rawItems);
  const reasoningMode = currentReasoningModeFromItems(rawItems);
  const threadId = threadIdFromSessionFile(file);
  const failed = completed && !final && (emptyComplete || Boolean(failureText));
  const finalFailureText = failed
    ? (resolveFailureTextForTurn(threadId, { turnId, startedAt, completedAt, failureText }) || emptyCodexFailureText())
    : '';
  const statusSteps = steps.slice(-30);
  if (failed && finalFailureText && !statusSteps.some(step => step.kind === 'error' && step.text === finalFailureText)) {
    statusSteps.push({ kind: 'error', label: '失败', text: finalFailureText, time: completedAt || new Date(fs.statSync(file).mtimeMs).toISOString() });
  }
  const lastStep = statusSteps[statusSteps.length - 1] || steps[steps.length - 1];
  const status = failed ? 'error' : completed ? 'complete' : active ? 'running' : 'idle';
  const waiting = sinceMs && !steps.length;
  const startMs = Date.parse(startedAt || '') || sinceMs || 0;
  const endMs = completedAt ? Date.parse(completedAt) : Date.now();
  const durationMs = startMs ? Math.max(0, endMs - startMs) : 0;
  const toolCount = statusSteps.filter(step => step.kind === 'tool').length;
  const latestProgress = [...statusSteps].reverse().find(step => step.kind === 'thinking')?.text || '';
  return {
    ok: true,
    available: true,
    active: waiting ? true : active,
    status: waiting ? 'waiting' : status,
    turnId,
    sessionFile: path.basename(file),
    threadId,
    updatedAt: lastStep ? lastStep.time : new Date(fs.statSync(file).mtimeMs).toISOString(),
    startedAt,
    completedAt,
    durationMs,
    context,
    model,
    reasoningMode,
    toolCount,
    latestProgress,
    processSummary: latestProgress || (toolCount ? `正在运行 ${toolCount} 个操作` : active ? '正在处理请求' : ''),
    processText: statusSteps.map(step => `${step.label || '事件'}：${step.text || ''}`).join('\\n'),
    preview: final || preview || finalFailureText || (waiting ? '已发送，等待 Codex 开始回复…' : active ? 'Codex 正在回复…' : '暂无可显示回复。'),
    final: final || '',
    error: finalFailureText,
    steps: statusSteps,
  };
}

function handleCodexStatus(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    return json(res, 200, parseCodexStatus({
      since: url.searchParams.get('since') || '',
      sessionFile: url.searchParams.get('session') || '',
      threadId: url.searchParams.get('thread') || '',
      expectNewThread: url.searchParams.get('expectNewThread') === '1',
      excludeThreadId: url.searchParams.get('excludeThread') || '',
      cwd: url.searchParams.get('cwd') || '',
    }));
  } catch (error) {
    return json(res, 500, { ok: false, code: 'CODEX_STATUS_FAILED', message: '读取 Codex 回复状态失败。', detail: String(error && error.message || error) });
  }
}

function handleCodexApprovals(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const threadId = String(url.searchParams.get('thread') || '').trim();
  if (threadId && !isCodexThreadId(threadId)) {
    return json(res, 400, { ok: false, code: 'BAD_THREAD_ID', message: '任务 ID 不正确。' });
  }

  return json(res, 200, {
    ok: true,
    available: codexAppServer.isAvailable(),
    approvals: codexAppServer.listPendingApprovals({ threadId }),
  });
}

async function handleCodexApproval(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const requestId = String(payload.requestId || '').trim();
  const decision = String(payload.decision || '').trim();
  if (!requestId || requestId.length > 200 || !decision) {
    return json(res, 400, { ok: false, code: 'BAD_APPROVAL_REQUEST', message: '授权请求或操作不正确。' });
  }

  try {
    const result = codexAppServer.resolvePendingApproval(requestId, decision);
    return json(res, 200, { ok: true, ...result, message: '已将授权决定发送给 Codex。' });
  } catch (error) {
    const status = Number(error?.status) || 500;
    return json(res, status, {
      ok: false,
      code: error?.code || 'APPROVAL_FAILED',
      message: error?.message || '处理 Codex 授权失败。',
    });
  }
}

async function handleSelectThread(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  if (!isCodexThreadId(threadId)) {
    return json(res, 400, { ok: false, code: 'BAD_THREAD_ID', message: '任务 ID 不正确。' });
  }

  try {
    await activateCodexThread(threadId);
    return json(res, 200, { ok: true, threadId, message: '已切换到所选 Codex 任务。' });
  } catch (error) {
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained });
  }
}


const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml; charset=utf-8',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

function json(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    ...corsHeaders(),
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function corsHeaders() {
  return {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,OPTIONS',
    'access-control-allow-headers': 'content-type,x-mobile-typer-token',
    'access-control-allow-private-network': 'true',
  };
}

function options(res) {
  res.writeHead(204, corsHeaders());
  res.end();
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('输入太长了，请分段发送。'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function isAuthorized(req) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const fromHeader = req.headers['x-mobile-typer-token'];
  const fromQuery = url.searchParams.get('token');
  const fromCookie = parseCookies(req.headers.cookie || '').codexMiniToken;
  return fromHeader === TOKEN || fromQuery === TOKEN || fromCookie === TOKEN;
}

function parseCookies(header) {
  const cookies = {};
  for (const part of String(header || '').split(';')) {
    const index = part.indexOf('=');
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    if (!key) continue;
    const value = part.slice(index + 1).trim();
    try {
      cookies[key] = decodeURIComponent(value);
    } catch {
      cookies[key] = value;
    }
  }
  return cookies;
}

function cleanupRecentSendRequests() {
  const cutoff = Date.now() - RECENT_SEND_TTL_MS;
  for (const [id, entry] of recentSendRequests) {
    if (!entry || entry.createdAt < cutoff) recentSendRequests.delete(id);
  }
}

function normalizeClientRequestId(value) {
  const id = String(value || '').trim();
  return /^[a-zA-Z0-9._:-]{8,120}$/.test(id) ? id : '';
}

function runProcess(command, args, input) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(Object.assign(new Error(stderr.trim() || `${command} exited with code ${code}`), { code, stdout, stderr }));
    });
    if (input) child.stdin.write(input);
    child.stdin.end();
  });
}

function explainAutomationError(error) {
  const raw = String(error && (error.stderr || error.message) || '');
  const lower = raw.toLowerCase();
  if (process.platform === 'win32') {
    if (lower.includes('codex') || lower.includes('window') || lower.includes('窗口') || lower.includes('start-process')) {
      return {
        code: 'CODEX_WINDOW_NOT_READY',
        message: 'Windows 没能激活 Codex Desktop。请确认 Codex Desktop 已安装、已登录，并且 codex:// 协议能从运行服务的这个桌面会话打开。',
        detail: raw,
      };
    }
    if (lower.includes('clipboard') || lower.includes('剪贴板')) {
      return {
        code: 'WINDOWS_CLIPBOARD_FAILED',
        message: 'Windows 剪贴板写入失败。请确认当前桌面没有其他程序长时间占用剪贴板，然后重试。',
        detail: raw,
      };
    }
    return {
      code: 'WINDOWS_AUTOMATION_FAILED',
      message: 'Windows 自动粘贴失败。请确认 Codex Desktop 正在当前用户桌面运行，且服务不是在锁屏、UAC 或非交互会话里运行。',
      detail: raw,
    };
  }
  if (lower.includes('assistive') || lower.includes('accessibility') || lower.includes('-25211') || lower.includes('not allowed') || lower.includes('not authorized')) {
    return {
      code: 'ACCESSIBILITY_PERMISSION_REQUIRED',
      message: 'Mac 还没有允许这个终端控制键盘。请到 系统设置 → 隐私与安全性 → 辅助功能，允许 Terminal / Ghostty / Codex 正在使用的终端，然后重启服务再试。',
      detail: raw,
    };
  }
  return {
    code: 'MAC_AUTOMATION_FAILED',
    message: 'Mac 自动粘贴失败。请确认当前有可输入的前台应用，并检查辅助功能权限。',
    detail: raw,
  };
}

function explainTargetError(error, target) {
  const raw = String(error && (error.stderr || error.message) || '');
  if (target === 'codex') {
    if (process.platform === 'win32') {
      return {
        code: 'CODEX_FOCUS_FAILED',
        message: '已经收到文字，但没能自动聚焦 Codex 输入框。请确认 Codex Desktop 正在当前 Windows 桌面运行，且服务不是在锁屏或非交互会话里运行。',
        detail: raw,
      };
    }
    return {
      code: 'CODEX_FOCUS_FAILED',
      message: '已经收到文字，但没能自动聚焦 Codex 输入框。请确认 Codex 正在运行，且当前终端已开启辅助功能权限。',
      detail: raw,
    };
  }
  return explainAutomationError(error);
}

async function copyTextToClipboard(text) {
  return platform.copyTextToClipboard(text);
}

function getClickTool() {
  for (const candidate of ['/opt/homebrew/bin/cliclick', '/usr/local/bin/cliclick']) {
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function toCliclickAbsolutePoint(point) {
  // cliclick treats leading +/- as relative movement. Prefix negative absolute
  // coordinates with '=' for multi-display layouts above/left of the main screen.
  return point.split(',').map(part => part.startsWith('-') ? `=${part}` : part).join(',');
}

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function hasFreshCodexThreadActivation(threadId) {
  return false;
}

async function focusTarget(target, threadId = '', options = {}) {
  return platform.focusTarget(target, threadId, options);
}

function codexFocusOptions(threadId = '', options = {}) {
  if (process.platform !== 'win32') return options;
  const normalized = {
    ...options,
    skipComposerClick: options.forceComposerClick === true ? false : true,
  };
  if (
    isCodexThreadId(threadId) &&
    (options.bounceViaNewThread === true || process.env.CODEX_MAX_WIN32_ALWAYS_NEW_THREAD_BOUNCE === '1' || process.env.CODEX_MINI_WIN32_ALWAYS_NEW_THREAD_BOUNCE === '1')
  ) {
    return { ...normalized, bounceViaNewThread: true };
  }
  return normalized;
}

async function activateCodexThread(threadId = '', options = {}) {
  return platform.activateCodexThread(threadId, options);
}

async function activateNewCodexThread(cwd = '') {
  return platform.activateNewCodexThread(cwd);
}

async function activateNewProjectlessCodexThread(anchorThreadId = '') {
  return platform.activateNewProjectlessCodexThread(anchorThreadId);
}

function validLocalDirectory(value) {
  const normalized = value ? path.normalize(value) : '';
  if (!normalized || !path.isAbsolute(normalized)) return '';
  try {
    return fs.statSync(normalized).isDirectory() ? normalized : '';
  } catch {
    return '';
  }
}

function normalizeNewThreadScope(payload = {}) {
  const raw = typeof payload.scope === 'string' ? payload.scope.trim().toLowerCase() : '';
  if (raw === 'conversation' || raw === 'project') return raw;
  if (payload.isProjectThread === false) return 'conversation';
  if (payload.isProjectThread === true) return 'project';
  return '';
}

function projectCwdOrEmpty(value) {
  const cwd = validLocalDirectory(value);
  if (!cwd) return '';
  return classifyThreadProject(cwd).isProjectThread ? cwd : '';
}

function resolveNewThreadTarget(payload = {}) {
  const scope = normalizeNewThreadScope(payload);
  const projectPath = projectCwdOrEmpty(typeof payload.projectPath === 'string' ? payload.projectPath : '');
  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';

  if (threadId && !isCodexThreadId(threadId)) {
    const error = new Error('任务 ID 不正确。');
    error.status = 400;
    error.code = 'BAD_THREAD_ID';
    throw error;
  }

  if (scope === 'conversation') {
    return { scope: 'conversation', cwd: '', anchorThreadId: threadId };
  }

  if (scope === 'project' && projectPath) {
    return { scope: 'project', cwd: projectPath, anchorThreadId: threadId };
  }

  if (threadId) {
    const file = findCodexSessionFileByThreadId(threadId);
    const metaCwd = file ? readSessionMeta(file).cwd || '' : '';
    const metaProject = classifyThreadProject(validLocalDirectory(metaCwd) || '');
    if (metaProject.isProjectThread) {
      return { scope: 'project', cwd: metaProject.projectPath, anchorThreadId: threadId };
    }
    return { scope: 'conversation', cwd: '', anchorThreadId: threadId };
  }

  if (projectPath) return { scope: 'project', cwd: projectPath, anchorThreadId: '' };
  return { scope: 'conversation', cwd: '', anchorThreadId: '' };
}

async function handleNewCodexThread(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  try {
    const target = resolveNewThreadTarget(payload);
    const project = classifyThreadProject(target.cwd);
    try {
      const started = await codexAppServer.startThread({ cwd: project.isProjectThread ? target.cwd : '' });
      const threadId = started.thread.id;
      invalidateCodexThreadListCache();
      return json(res, 200, {
        ok: true,
        pending: false,
        transport: 'app-server',
        threadId,
        cwd: project.isProjectThread ? target.cwd : '',
        projectName: project.projectName,
        projectPath: project.projectPath,
        projectKey: project.projectKey,
        scope: project.isProjectThread ? 'project' : 'conversation',
        message: project.isProjectThread
          ? `已在“${project.projectName}”中新建任务。`
          : '已新建一个对话任务。',
      });
    } catch (appServerError) {
      if (project.isProjectThread) {
        await activateNewCodexThread(target.cwd);
      } else {
        await activateNewProjectlessCodexThread(target.anchorThreadId);
      }
      return json(res, 200, {
        ok: true,
        pending: true,
        transport: 'desktop-gui',
        appServerError: appServerError.message || String(appServerError),
        cwd: project.isProjectThread ? target.cwd : '',
        projectName: project.projectName,
        projectPath: project.projectPath,
        projectKey: project.projectKey,
        scope: project.isProjectThread ? 'project' : 'conversation',
        message: project.isProjectThread
          ? `已在 ChatGPT Desktop 打开“${project.projectName}”的新任务。`
          : '已在 ChatGPT Desktop 打开一个新的对话任务。',
      });
    }
  } catch (error) {
    if (error && error.status) {
      return json(res, error.status, { ok: false, code: error.code || 'BAD_REQUEST', message: error.message || '新建任务失败。' });
    }
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained });
  }
}

function createScheduledTaskRecord(payload = {}, previous = null) {
  const prompt = String(payload.prompt || previous?.prompt || '').trim();
  if (!prompt) {
    const error = new Error('计划内容不能为空。');
    error.status = 400;
    error.code = 'EMPTY_SCHEDULE_PROMPT';
    throw error;
  }
  if (prompt.length > MAX_TEXT_LENGTH) {
    const error = new Error(`计划内容不能超过 ${MAX_TEXT_LENGTH} 个字符。`);
    error.status = 400;
    error.code = 'SCHEDULE_PROMPT_TOO_LONG';
    throw error;
  }
  const runMode = payload.runMode === 'thread' ? 'thread' : 'standalone';
  const threadId = runMode === 'thread' ? String(payload.threadId || previous?.threadId || '').trim() : '';
  if (runMode === 'thread' && !isCodexThreadId(threadId)) {
    const error = new Error('要延续当前任务，请先选择一个有效的 Codex 任务。');
    error.status = 400;
    error.code = 'SCHEDULE_THREAD_REQUIRED';
    throw error;
  }
  const requestedCwd = payload.cwd === undefined ? previous?.cwd || '' : payload.cwd;
  const cwd = requestedCwd ? validLocalDirectory(String(requestedCwd)) : '';
  if (requestedCwd && !cwd) {
    const error = new Error('计划项目目录不存在或不可用。');
    error.status = 400;
    error.code = 'SCHEDULE_PROJECT_UNAVAILABLE';
    throw error;
  }
  const intervalMinutes = normalizeScheduleInterval(payload.intervalMinutes === undefined ? previous?.intervalMinutes : payload.intervalMinutes);
  const now = new Date().toISOString();
  return normalizeScheduledTask({
    id: previous?.id || crypto.randomUUID(),
    prompt,
    cwd,
    threadId,
    runMode,
    intervalMinutes,
    enabled: payload.enabled === undefined ? previous?.enabled !== false : payload.enabled === true,
    createdAt: previous?.createdAt || now,
    updatedAt: now,
    nextRunAt: previous && payload.intervalMinutes === undefined ? previous.nextRunAt : new Date(Date.now() + intervalMinutes * 60000).toISOString(),
    lastRunAt: previous?.lastRunAt || '',
    lastStatus: previous?.lastStatus || 'idle',
    lastMessage: previous?.lastMessage || '',
    lastThreadId: previous?.lastThreadId || '',
  });
}

function scheduledTaskSummary(state = readCodexMiniState()) {
  return normalizeScheduledTasks(state.scheduledTasks);
}

function updateScheduledTaskState(taskId, updater) {
  const state = readCodexMiniState();
  const index = state.scheduledTasks.findIndex(task => task.id === taskId);
  if (index === -1) return null;
  const next = updater({ ...state.scheduledTasks[index] });
  if (!next) return null;
  state.scheduledTasks[index] = normalizeScheduledTask(next);
  writeCodexMiniState(state);
  return state.scheduledTasks[index];
}

async function runScheduledTask(taskId, options = {}) {
  const id = String(taskId || '').trim();
  if (!id || scheduledTaskRuns.has(id)) return null;
  scheduledTaskRuns.add(id);
  try {
    const state = readCodexMiniState();
    const task = state.scheduledTasks.find(item => item.id === id);
    if (!task || !task.enabled) return null;
    const now = Date.now();
    if (!options.force && Date.parse(task.nextRunAt) > now) return null;

    if (task.runMode === 'thread') {
      const runtime = codexAppServer.runtimeForThread(task.threadId);
      const loadedThread = runtime?.status === 'running' ? null : await codexAppServer.readThread(task.threadId, false);
      if (runtime?.status === 'running' || loadedThread?.status?.type === 'active') {
        return updateScheduledTaskState(id, current => ({
          ...current,
          updatedAt: new Date().toISOString(),
          nextRunAt: nextScheduledRunAt(current),
          lastStatus: 'skipped',
          lastMessage: '当前任务仍在运行，已跳过本次计划。',
        }));
      }
    }

    updateScheduledTaskState(id, current => ({
      ...current,
      updatedAt: new Date().toISOString(),
      lastStatus: 'running',
      lastMessage: '',
    }));

    const result = await codexAppServer.sendTurn({
      threadId: task.runMode === 'thread' ? task.threadId : '',
      cwd: task.cwd,
      text: task.prompt,
      clientUserMessageId: `schedule-${task.id}-${Date.now()}`,
    });
    return updateScheduledTaskState(id, current => ({
      ...current,
      updatedAt: new Date().toISOString(),
      nextRunAt: nextScheduledRunAt(current),
      lastRunAt: new Date().toISOString(),
      lastStatus: 'started',
      lastMessage: '已提交给本机 Codex。',
      lastThreadId: result.threadId || current.lastThreadId || '',
    }));
  } catch (error) {
    return updateScheduledTaskState(id, current => ({
      ...current,
      updatedAt: new Date().toISOString(),
      nextRunAt: nextScheduledRunAt(current),
      lastRunAt: new Date().toISOString(),
      lastStatus: 'error',
      lastMessage: truncateText(error?.message || String(error), 500),
    }));
  } finally {
    scheduledTaskRuns.delete(id);
  }
}

async function runDueScheduledTasks() {
  const now = Date.now();
  const due = scheduledTaskSummary().filter(task => task.enabled && Date.parse(task.nextRunAt) <= now);
  for (const task of due) await runScheduledTask(task.id);
}

function startScheduledTaskRunner() {
  if (scheduledTaskTimer) return;
  scheduledTaskTimer = setInterval(() => {
    runDueScheduledTasks().catch(error => console.warn('Scheduled task runner failed:', error.message || error));
  }, SCHEDULED_TASK_POLL_MS);
  scheduledTaskTimer.unref?.();
  runDueScheduledTasks().catch(error => console.warn('Scheduled task runner failed:', error.message || error));
}

function stopScheduledTaskRunner() {
  if (!scheduledTaskTimer) return;
  clearInterval(scheduledTaskTimer);
  scheduledTaskTimer = null;
}

async function handleSchedules(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const workspace = await listWorkspaceThreads(160);
  const projects = existingProjectCwds(workspace.threads).map(cwd => ({ cwd, name: displayPathName(cwd) }));
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, schedules: scheduledTaskSummary(), projects });
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
    const state = readCodexMiniState();
    if (action === 'create') {
      const task = createScheduledTaskRecord(payload);
      state.scheduledTasks = [...state.scheduledTasks, task];
      if (state.scheduledTasks.length > SCHEDULED_TASK_LIMIT) {
        return json(res, 400, { ok: false, code: 'SCHEDULE_LIMIT_REACHED', message: `最多可保留 ${SCHEDULED_TASK_LIMIT} 个计划。` });
      }
      writeCodexMiniState(state);
      return json(res, 200, { ok: true, schedule: task, schedules: scheduledTaskSummary(), projects, message: '已创建计划。' });
    }
    const index = state.scheduledTasks.findIndex(task => task.id === id);
    if (index === -1) {
      return json(res, 404, { ok: false, code: 'SCHEDULE_NOT_FOUND', message: '这个计划不存在或已被删除。' });
    }
    if (action === 'update') {
      const task = createScheduledTaskRecord(payload, state.scheduledTasks[index]);
      state.scheduledTasks[index] = task;
      writeCodexMiniState(state);
      return json(res, 200, { ok: true, schedule: task, schedules: scheduledTaskSummary(), projects, message: '已更新计划。' });
    }
    if (action === 'toggle') {
      const enabled = payload.enabled === true;
      state.scheduledTasks[index] = normalizeScheduledTask({
        ...state.scheduledTasks[index],
        enabled,
        updatedAt: new Date().toISOString(),
        nextRunAt: enabled ? new Date(Date.now() + state.scheduledTasks[index].intervalMinutes * 60000).toISOString() : state.scheduledTasks[index].nextRunAt,
      });
      writeCodexMiniState(state);
      return json(res, 200, { ok: true, schedule: state.scheduledTasks[index], schedules: scheduledTaskSummary(), projects, message: enabled ? '已启用计划。' : '已暂停计划。' });
    }
    if (action === 'delete') {
      state.scheduledTasks.splice(index, 1);
      writeCodexMiniState(state);
      return json(res, 200, { ok: true, schedules: scheduledTaskSummary(), projects, message: '已删除计划。' });
    }
    if (action === 'run') {
      await runScheduledTask(id, { force: true });
      return json(res, 200, { ok: true, schedules: scheduledTaskSummary(), projects, message: '已提交本次计划。' });
    }
    return json(res, 400, { ok: false, code: 'BAD_SCHEDULE_ACTION', message: '不支持的计划操作。' });
  } catch (error) {
    return json(res, error?.status || 500, {
      ok: false,
      code: error?.code || 'SCHEDULE_FAILED',
      message: error?.message || '计划操作失败。',
    });
  }
}

function sanitizeFileName(name, fallback = 'image') {
  const base = path.basename(String(name || fallback)).replace(/[^a-zA-Z0-9._-]+/g, '-').slice(0, 80);
  return base || fallback;
}

function extensionForMime(mime) {
  if (mime === 'image/png') return '.png';
  if (mime === 'image/jpeg') return '.jpg';
  if (mime === 'image/gif') return '.gif';
  if (mime === 'image/webp') return '.webp';
  if (mime === 'image/heic') return '.heic';
  return '.img';
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${Math.round(value / 1024 / 1024)}MB`;
  if (value >= 1024) return `${Math.round(value / 1024)}KB`;
  return `${value}B`;
}

function decodeAttachment(attachment, index) {
  const mime = String(attachment && attachment.type || '').toLowerCase();
  if (!mime.startsWith('image/')) throw new Error('目前只支持图片附件。');
  const dataUrl = String(attachment.dataUrl || '');
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) throw new Error('图片数据格式不正确。');
  const buffer = Buffer.from(match[2], 'base64');
  if (!buffer.length || buffer.length > MAX_ATTACHMENT_BYTES) throw new Error(`单张图片太大，请控制在 ${formatBytes(MAX_ATTACHMENT_BYTES)} 以内。`);
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const ext = path.extname(attachment.name || '') || extensionForMime(mime);
  const fileName = `${Date.now()}-${index}-${sanitizeFileName(attachment.name || `image${ext}`)}`;
  const filePath = path.join(UPLOAD_DIR, fileName.endsWith(ext) ? fileName : `${fileName}${ext}`);
  fs.writeFileSync(filePath, buffer);
  return { filePath, mime, name: attachment.name || path.basename(filePath), size: buffer.length };
}

function decodeAttachments(input) {
  if (!Array.isArray(input)) return [];
  if (input.length > MAX_ATTACHMENTS) throw new Error(`图片最多一次发送 ${MAX_ATTACHMENTS} 张。`);
  return input.map(decodeAttachment);
}

function appleScriptString(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function copyImageToClipboard(file) {
  return platform.copyImageToClipboard(file);
}

async function pressPaste() {
  return platform.pressPaste();
}

async function pressPasteAndEnter() {
  // Keep paste and return as separate automation events. Electron/Codex can
  // accept the pasted text asynchronously; if Return is posted too quickly
  // (especially after iOS dictation commits), the text appears in the composer
  // but the submit key can be swallowed. A short explicit settle plus a fresh
  // System Events command makes the submit step reliable without changing the
  // rest of the send flow.
  await pressPaste();
  await delay(TEXT_PASTE_SETTLE_MS);
  await pressEnter();
}

async function typeTextAndEnter(text) {
  if (platform.typeText) {
    await platform.typeText(text);
    await delay(TEXT_PASTE_SETTLE_MS);
    await pressEnter();
    return;
  }
  await copyTextToClipboard(text);
  await pressPasteAndEnter();
}

async function pasteTextAndEnter(text) {
  if (platform.pasteTextAndEnter) {
    await platform.pasteTextAndEnter(text);
    return;
  }
  await copyTextToClipboard(text);
  await pressPasteAndEnter();
}

async function pasteCodexCommandSelection(command, selection, options = {}) {
  if (platform.runCodexCommandSelection) {
    await platform.runCodexCommandSelection(command, selection, options);
    return;
  }
  await pasteTextAndEnter(command);
  await delay(options.commandSettleMs || CODEX_COMMAND_SETTLE_MS);
  await pasteTextAndEnter(selection);
  await delay(options.selectionSettleMs || CODEX_COMMAND_SETTLE_MS);
}

async function pressEnter() {
  return platform.pressEnter();
}

async function pressCodexShortcut(key, modifiers = []) {
  return platform.pressCodexShortcut(key, modifiers);
}

async function pressCancelCodexResponse() {
  return platform.pressCancelCodexResponse();
}


async function pasteAndEnter(text, target = 'frontmost', attachments = [], threadId = '', options = {}) {
  if (process.platform === 'win32' && target === 'codex') {
    return platform.runExclusive(async () => {
      if (!attachments.length) {
        if (!options.assumeThreadSynced && isCodexThreadId(threadId)) {
          await activateCodexThread(threadId, { allowCached: false });
        }
        if (text) {
          await pasteTextAndEnter(text);
          return;
        }
        await pressEnter();
        return;
      }

      if (!options.assumeThreadSynced && isCodexThreadId(threadId)) {
        await activateCodexThread(threadId, { allowCached: false, preferCdp: false });
      } else {
        await focusTarget('codex', threadId, { ...codexFocusOptions(threadId, options), preferCdp: false });
      }
      for (const attachment of attachments) {
        await copyImageToClipboard(attachment);
        await pressPaste();
        await delay(ATTACHMENT_PASTE_SETTLE_MS);
      }
      if (text) {
        await copyTextToClipboard(text);
        await pressPasteAndEnter();
        return;
      }
      await pressEnter();
    });
  }

  return platform.withClipboardPreserved(async () => {
    await focusTarget(target, threadId, target === 'codex' ? codexFocusOptions(threadId, options) : options);

    for (const attachment of attachments) {
      await copyImageToClipboard(attachment);
      await pressPaste();
      await delay(ATTACHMENT_PASTE_SETTLE_MS);
    }

    if (text) {
      await pasteTextAndEnter(text);
      return;
    }

    await pressEnter();
  });
}

function modelSwitchTargetForCurrent(current = {}, requestedTarget = '') {
  const explicit = String(requestedTarget || '').trim();
  const catalogTarget = findModelOption(explicit);
  if (catalogTarget) return catalogTarget;
  if (!explicit) {
    const options = readModelCatalogOptions();
    if (options.length) return options[0];
  }
  const error = new Error(explicit ? '未找到这个模型。' : '没有读取到可切换的模型。');
  error.status = 400;
  error.code = 'MODEL_TARGET_NOT_FOUND';
  throw error;
}

async function switchCodexGuiModel(threadId = '', targetKey = '', options = {}) {
  if (threadId && !isCodexThreadId(threadId)) {
    const error = new Error('任务 ID 不正确。');
    error.status = 400;
    error.code = 'BAD_THREAD_ID';
    throw error;
  }
  const file = threadId ? findCodexSessionFileByThreadId(threadId) : findLatestCodexSessionFile();
  const targetThreadId = threadId || (file ? threadIdFromSessionFile(file) : '');
  const current = file ? currentModelFromItems(readJsonlTailObjects(file, CODEX_SESSION_TAIL_BYTES)) : modelInfoFromId('');
  const target = modelSwitchTargetForCurrent(current, targetKey);

  if (process.platform === 'win32') {
    await platform.runExclusive(async () => {
      if (!options.assumeThreadSynced && isCodexThreadId(targetThreadId)) {
        await activateCodexThread(targetThreadId, { allowCached: false });
      }
      await pasteCodexCommandSelection('/模型', target.displayName, {
        commandSettleMs: CODEX_MODEL_COMMAND_SETTLE_MS,
        selectionSettleMs: CODEX_COMMAND_SETTLE_MS,
        timeoutMs: 10000,
      });
    });
    return {
      ok: true,
      verified: false,
      threadId: targetThreadId,
      currentModel: current,
      targetModel: { ...target, available: true, updatedAt: new Date().toISOString() },
      focusFallback: '',
      message: `已向 Codex 发送模型切换命令：${target.displayName}`,
    };
  }

  return platform.withClipboardPreserved(async () => {
    await focusTarget('codex', targetThreadId, codexFocusOptions(targetThreadId));
    await pasteCodexCommandSelection('/模型', target.displayName, {
      commandSettleMs: CODEX_MODEL_COMMAND_SETTLE_MS,
      selectionSettleMs: CODEX_COMMAND_SETTLE_MS,
      timeoutMs: 10000,
    });
    const verifiedToolbar = await verifyWindowsToolbarSwitch('model', target);
    return {
      ok: true,
      verified: true,
      threadId: targetThreadId,
      currentModel: current,
      targetModel: { ...target, available: true, updatedAt: new Date().toISOString() },
      toolbar: verifiedToolbar || undefined,
      focusFallback: '',
      message: `已切换到 ${target.displayName}`,
    };
  });
}

function reasoningModeTargetForCurrent(current = {}, requestedTarget = '') {
  const explicit = String(requestedTarget || '').trim();
  if (REASONING_MODE_TARGETS[explicit]) return REASONING_MODE_TARGETS[explicit];
  const order = ['low', 'medium', 'high', 'xhigh'];
  const currentIndex = order.indexOf(current.key);
  const nextKey = order[(currentIndex + 1 + order.length) % order.length] || 'medium';
  return REASONING_MODE_TARGETS[nextKey] || REASONING_MODE_TARGETS.medium;
}

function createSwitchVerificationError(kind, expected, actual = {}) {
  const raw = actual && actual.raw ? `当前 Codex 显示为 ${actual.raw}` : '没有读到 Codex 底部模型/推理状态';
  const label = kind === 'model' ? '模型' : '推理模式';
  const error = new Error(`${label}没有实际切换成功，${raw}。`);
  error.status = 409;
  error.code = kind === 'model' ? 'MODEL_SWITCH_NOT_APPLIED' : 'REASONING_SWITCH_NOT_APPLIED';
  error.actual = actual;
  error.expected = expected;
  return error;
}

function modelLabelsMatch(expected = {}, actualLabel = '') {
  const actual = String(actualLabel || '').trim().toLowerCase();
  if (!actual) return false;
  const candidates = [
    expected.label,
    expected.displayName,
    expected.id,
    expected.key,
    labelFromModelName(expected.displayName || expected.id || expected.key || ''),
  ]
    .map(value => String(value || '').trim().toLowerCase())
    .filter(Boolean);
  return candidates.some(value => value === actual || value.includes(actual) || actual.includes(value));
}

async function verifyWindowsToolbarSwitch(kind, target) {
  if (process.platform !== 'win32' || !platform.getToolbarState) return null;
  let state = null;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await delay(attempt ? 350 : 180);
    state = await platform.getToolbarState();
    if (kind === 'reasoning' && state && state.reasoningLabel === target.displayName) return state;
    if (kind === 'model' && state && modelLabelsMatch(target, state.modelLabel)) return state;
  }
  throw createSwitchVerificationError(kind, target, state);
}

async function switchCodexReasoningMode(threadId = '', targetKey = '', options = {}) {
  if (threadId && !isCodexThreadId(threadId)) {
    const error = new Error('任务 ID 不正确。');
    error.status = 400;
    error.code = 'BAD_THREAD_ID';
    throw error;
  }
  const file = threadId ? findCodexSessionFileByThreadId(threadId) : findLatestCodexSessionFile();
  const targetThreadId = threadId || (file ? threadIdFromSessionFile(file) : '');
  const current = file ? currentReasoningModeFromItems(readJsonlTailObjects(file, CODEX_SESSION_TAIL_BYTES)) : reasoningModeFromValue('');
  const target = reasoningModeTargetForCurrent(current, targetKey);

  if (process.platform === 'win32') {
    if (platform.switchReasoningMode) {
      try {
        const toolbar = await platform.runExclusive(async () => {
          if (!options.assumeThreadSynced && isCodexThreadId(targetThreadId)) {
            await activateCodexThread(targetThreadId, { allowCached: false });
          }
          return platform.switchReasoningMode(target.key);
        });
        return {
          ok: true,
          verified: true,
          threadId: targetThreadId,
          currentReasoningMode: current,
          targetReasoningMode: { ...target, available: true, updatedAt: new Date().toISOString() },
          toolbar,
          focusFallback: '',
          message: `已切换推理模式为 ${target.displayName}`,
        };
      } catch (error) {
        const wrapped = new Error(`CDP 推理模式切换失败：${error.message || '未知错误'}`);
        wrapped.status = error.code === 'CDP_BAD_REASONING_TARGET' ? 400 : 503;
        wrapped.code = error.code || 'CDP_REASONING_FAILED';
        throw wrapped;
      }
    }

    await platform.runExclusive(async () => {
      if (!options.assumeThreadSynced && isCodexThreadId(targetThreadId)) {
        await activateCodexThread(targetThreadId, { allowCached: false });
      }
      await pasteCodexCommandSelection('/推理模式', target.displayName, {
        commandSettleMs: CODEX_REASONING_COMMAND_SETTLE_MS,
        selectionSettleMs: CODEX_COMMAND_SETTLE_MS,
        timeoutMs: 10000,
      });
    });
    return {
      ok: true,
      verified: false,
      threadId: targetThreadId,
      currentReasoningMode: current,
      targetReasoningMode: { ...target, available: true, updatedAt: new Date().toISOString() },
      focusFallback: '',
      message: `已向 Codex 发送推理模式切换命令：${target.displayName}`,
    };
  }

  return platform.withClipboardPreserved(async () => {
    await focusTarget('codex', targetThreadId, codexFocusOptions(targetThreadId));
    await pasteCodexCommandSelection('/推理模式', target.displayName, {
      commandSettleMs: CODEX_REASONING_COMMAND_SETTLE_MS,
      selectionSettleMs: CODEX_COMMAND_SETTLE_MS,
      timeoutMs: 10000,
    });
    const verifiedToolbar = await verifyWindowsToolbarSwitch('reasoning', target);
    return {
      ok: true,
      verified: true,
      threadId: targetThreadId,
      currentReasoningMode: current,
      targetReasoningMode: { ...target, available: true, updatedAt: new Date().toISOString() },
      toolbar: verifiedToolbar || undefined,
      focusFallback: '',
      message: `已切换推理模式为 ${target.displayName}`,
    };
  });
}

async function stopCodexResponse(threadId = '') {
  return platform.runExclusive(async () => {
    await focusTarget('codex', threadId, codexFocusOptions(threadId));
    await pressCancelCodexResponse();
  });
}

async function runCodexThreadCommand(threadId, command, options = {}) {
  return platform.withClipboardPreserved(async () => {
    if (threadId && !isCodexThreadId(threadId)) {
      const error = new Error('任务 ID 不正确。');
      error.status = 400;
      error.code = 'BAD_THREAD_ID';
      throw error;
    }
    await activateCodexThread(threadId);

    if (command === 'archive') {
      await pressCodexShortcut('a', ['command', 'shift']);
      await delay(CODEX_COMMAND_SETTLE_MS);
      return { message: '已归档当前 Codex 任务。' };
    }

    if (command === 'pin') {
      await pressCodexShortcut('p', ['command', 'option']);
      await delay(CODEX_COMMAND_SETTLE_MS);
      return { message: options.pinned ? '已置顶当前 Codex 任务。' : '已取消置顶当前 Codex 任务。' };
    }

    if (command === 'rename') {
      const name = String(options.name || '').replace(/\s+/g, ' ').trim();
      if (!name) {
        const error = new Error('新名称不能为空。');
        error.status = 400;
        error.code = 'EMPTY_THREAD_NAME';
        throw error;
      }
      if (name.length > 120) {
        const error = new Error('新名称太长，请控制在 120 个字符以内。');
        error.status = 400;
        error.code = 'THREAD_NAME_TOO_LONG';
        throw error;
      }
      await pressCodexShortcut('r', ['command', 'option']);
      await delay(CODEX_COMMAND_SETTLE_MS);
      await copyTextToClipboard(name);
      await pressPaste();
      await delay(120);
      await pressEnter();
      await delay(CODEX_COMMAND_SETTLE_MS);
      return { message: '已重命名当前 Codex 任务。', name };
    }

    const error = new Error('不支持的任务操作。');
    error.status = 400;
    error.code = 'BAD_THREAD_ACTION';
    throw error;
  });
}

async function handleThreadAction(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  const action = String(payload.action || '').trim();
  if (!isCodexThreadId(threadId)) {
    return json(res, 400, { ok: false, code: 'BAD_THREAD_ID', message: '任务 ID 不正确。' });
  }

  try {
    const state = readCodexMiniState();
    let result;
    if (action === 'archive') {
      try {
        await codexAppServer.archiveThread(threadId);
        result = { message: '已归档当前任务。', transport: 'app-server' };
      } catch (appServerError) {
        result = await runCodexThreadCommand(threadId, 'archive');
        result.transport = 'desktop-gui';
        result.appServerError = appServerError.message || String(appServerError);
      }
      state.archivedThreadIds = setThreadSetMembership(state.archivedThreadIds, threadId, true);
      state.pinnedThreadIds = setThreadSetMembership(state.pinnedThreadIds, threadId, false);
    } else if (action === 'pin' || action === 'unpin') {
      const pinned = action === 'pin';
      try {
        await codexAppServer.setThreadPinned(threadId, pinned);
        result = {
          message: pinned ? '已置顶当前任务。' : '已取消置顶当前任务。',
          transport: 'app-server',
        };
      } catch (appServerError) {
        result = await runCodexThreadCommand(threadId, 'pin', { pinned });
        result.transport = 'desktop-gui';
        result.appServerError = appServerError.message || String(appServerError);
      }
      state.pinnedThreadIds = setThreadSetMembership(state.pinnedThreadIds, threadId, pinned);
    } else if (action === 'compact') {
      await codexAppServer.compactThread(threadId);
      result = {
        message: '已开始压缩当前任务的上下文。',
        transport: 'app-server',
      };
    } else if (action === 'review') {
      const review = await codexAppServer.startReview(threadId, {
        delivery: 'inline',
        target: { type: 'uncommittedChanges' },
      });
      result = {
        message: '已开始审查当前项目的未提交改动。',
        transport: 'app-server',
        turnId: review?.turn?.id || '',
        reviewThreadId: review?.reviewThreadId || threadId,
      };
    } else if (action === 'rename') {
      const name = String(payload.name || '').replace(/\s+/g, ' ').trim();
      if (!name) {
        return json(res, 400, { ok: false, code: 'EMPTY_THREAD_NAME', message: '新名称不能为空。' });
      }
      if (name.length > 120) {
        return json(res, 400, { ok: false, code: 'THREAD_NAME_TOO_LONG', message: '新名称太长，请控制在 120 个字符以内。' });
      }
      try {
        await codexAppServer.setThreadName(threadId, name);
        result = { message: '已重命名当前任务。', name, transport: 'app-server' };
      } catch (appServerError) {
        result = await runCodexThreadCommand(threadId, 'rename', { name });
        result.transport = 'desktop-gui';
        result.appServerError = appServerError.message || String(appServerError);
      }
      state.titleOverrides = state.titleOverrides || {};
      state.titleOverrides[threadId] = { name: result.name, renamedAt: new Date().toISOString() };
    } else {
      return json(res, 400, { ok: false, code: 'BAD_THREAD_ACTION', message: '不支持的任务操作。' });
    }
    writeCodexMiniState(state);
    const nextThreadId = action === 'archive' ? (listCodexThreads(120)[0]?.id || '') : threadId;
    return json(res, 200, { ok: true, action, threadId, nextThreadId, ...result });
  } catch (error) {
    if (error && error.status) {
      return json(res, error.status, { ok: false, code: error.code || 'BAD_REQUEST', message: error.message || '任务操作失败。' });
    }
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained });
  }
}

async function handleStopCodex(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  if (threadId && !isCodexThreadId(threadId)) {
    return json(res, 400, { ok: false, code: 'BAD_THREAD_ID', message: '任务 ID 不正确。' });
  }

  try {
    const runtime = codexAppServer.runtimeForThread(threadId);
    if (threadId && runtime?.status === 'running' && runtime.activeTurnId) {
      await codexAppServer.interrupt(threadId, runtime.activeTurnId);
      return json(res, 200, { ok: true, threadId, transport: 'app-server', message: '已停止当前回复。' });
    }
    await stopCodexResponse(threadId);
    return json(res, 200, { ok: true, threadId, transport: 'desktop-gui', message: '已向 ChatGPT Desktop 发送停止指令。' });
  } catch (error) {
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained });
  }
}

async function handleModelSwitch(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  const target = typeof payload.target === 'string' ? payload.target : '';
  const assumeThreadSynced = payload.assumeThreadSynced === true;
  try {
    if (isCodexThreadId(threadId) && target) {
      try {
        const models = await codexAppServer.listModels();
        const model = models.find(item => item.id === target || item.model === target);
        if (!model) {
          const error = new Error('未找到这个模型。');
          error.status = 400;
          error.code = 'MODEL_TARGET_NOT_FOUND';
          throw error;
        }
        const file = findCodexSessionFileByThreadId(threadId);
        const current = file ? currentModelFromItems(readJsonlTailObjects(file, CODEX_SESSION_TAIL_BYTES)) : modelInfoFromId('');
        await codexAppServer.updateThreadSettings(threadId, { model: model.model || model.id });
        return json(res, 200, {
          ok: true,
          verified: true,
          transport: 'app-server',
          threadId,
          currentModel: current,
          targetModel: {
            available: true,
            key: model.id,
            id: model.id,
            label: labelFromModelName(model.displayName || model.id),
            displayName: model.displayName || model.id,
            source: 'app-server',
            updatedAt: new Date().toISOString(),
          },
          message: `后续回复将使用 ${model.displayName || model.id}`,
        });
      } catch (appServerError) {
        if (appServerError.status && appServerError.code !== 'MODEL_TARGET_NOT_FOUND') throw appServerError;
      }
    }
    const result = await switchCodexGuiModel(threadId, target, { assumeThreadSynced });
    return json(res, 200, result);
  } catch (error) {
    if (error && error.status) {
      return json(res, error.status, { ok: false, code: error.code || 'BAD_REQUEST', message: error.message || '切换模型失败。' });
    }
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained, message: '没能通过 Codex GUI 切换模型。请确认 Codex Desktop 正在运行，且当前系统的自动化权限正常。' });
  }
}

async function handleReasoningMode(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const threadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  const target = typeof payload.target === 'string' ? payload.target : '';
  const assumeThreadSynced = payload.assumeThreadSynced === true;
  try {
    if (isCodexThreadId(threadId) && REASONING_MODE_TARGETS[target]) {
      try {
        const file = findCodexSessionFileByThreadId(threadId);
        const current = file ? currentReasoningModeFromItems(readJsonlTailObjects(file, CODEX_SESSION_TAIL_BYTES)) : reasoningModeFromValue('');
        const targetMode = REASONING_MODE_TARGETS[target];
        await codexAppServer.updateThreadSettings(threadId, { effort: targetMode.value });
        return json(res, 200, {
          ok: true,
          verified: true,
          transport: 'app-server',
          threadId,
          currentReasoningMode: current,
          targetReasoningMode: { ...targetMode, available: true, updatedAt: new Date().toISOString() },
          message: `后续回复的推理等级为${targetMode.displayName}`,
        });
      } catch {}
    }
    const result = await switchCodexReasoningMode(threadId, target, { assumeThreadSynced });
    return json(res, 200, result);
  } catch (error) {
    if (error && error.status) {
      return json(res, error.status, { ok: false, code: error.code || 'BAD_REQUEST', message: error.message || '切换推理模式失败。' });
    }
    const explained = explainTargetError(error, 'codex');
    return json(res, 500, { ok: false, ...explained, message: '没能通过 Codex GUI 切换推理模式。请确认 Codex Desktop 正在运行，且当前系统的自动化权限正常。' });
  }
}

async function handleSend(req, res) {
  if (!isAuthorized(req)) {
    return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。请使用启动服务时打印出来的完整手机链接。' });
  }

  let payload;
  try {
    const body = await readBody(req);
    payload = JSON.parse(body || '{}');
  } catch (error) {
    return json(res, error.status || 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  const text = typeof payload.text === 'string' ? payload.text : '';
  const target = payload.target === 'codex' ? 'codex' : 'frontmost';
  const selectedThreadId = typeof payload.threadId === 'string' ? payload.threadId : '';
  const assumeThreadSynced = payload.assumeThreadSynced === true;
  const expectNewThread = payload.expectNewThread === true && target === 'codex' && !selectedThreadId;
  const directPasteWithoutClick = process.platform === 'win32' && target === 'codex'
    ? payload.forceComposerClick !== true
    : payload.directPasteWithoutClick === true && expectNewThread;
  const previousThreadId = isCodexThreadId(payload.previousThreadId) ? payload.previousThreadId : '';
  const expectedNewThreadCwd = validLocalDirectory(typeof payload.expectedCwd === 'string' ? payload.expectedCwd : '');
  const clientRequestId = normalizeClientRequestId(payload.clientRequestId);
  cleanupRecentSendRequests();
  if (clientRequestId) {
    const existing = recentSendRequests.get(clientRequestId);
    if (existing?.result) return json(res, 200, { ...existing.result, duplicate: true });
    if (existing?.watch) {
      return json(res, 200, {
        ok: true,
        duplicate: true,
        message: '这条发送请求已经被接收，正在继续等待 Codex 回复。',
        target,
        sentAt: existing.sentAt,
        watch: existing.watch,
      });
    }
  }
  let attachments = [];
  try {
    attachments = decodeAttachments(payload.attachments);
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_ATTACHMENT', message: error.message || '图片附件不正确。' });
  }
  if (!text.trim() && !attachments.length) {
    return json(res, 400, { ok: false, code: 'EMPTY_TEXT', message: '请输入文字或添加图片。' });
  }
  if (text.length > MAX_TEXT_LENGTH) {
    return json(res, 413, { ok: false, code: 'TEXT_TOO_LONG', message: `文字太长了，请控制在 ${MAX_TEXT_LENGTH} 字以内。` });
  }

  try {
    const watchSince = new Date(Date.now() - 750).toISOString();
    const watchSinceMs = Date.parse(watchSince) || Date.now();
    const watchFile = expectNewThread ? null : selectedThreadId ? findCodexSessionFileByThreadId(selectedThreadId) : findLatestCodexSessionFile();
    let watch = target === 'codex' ? {
      since: watchSince,
      threadId: selectedThreadId,
      sessionFile: watchFile ? path.basename(watchFile) : '',
      expectNewThread,
      excludeThreadId: expectNewThread ? previousThreadId : '',
      cwd: expectNewThread ? expectedNewThreadCwd : '',
    } : null;
    if (clientRequestId) {
      recentSendRequests.set(clientRequestId, {
        createdAt: Date.now(),
        sentAt: new Date().toISOString(),
        watch,
      });
    }
    const effectiveThreadId = selectedThreadId || (watchFile ? threadIdFromSessionFile(watchFile) : '');
    let directResult = null;
    let appServerError = null;
    if (target === 'codex') {
      const fileStatus = effectiveThreadId ? parseCodexStatus({ threadId: effectiveThreadId }) : null;
      const appRuntime = effectiveThreadId ? codexAppServer.runtimeForThread(effectiveThreadId) : null;
      const externallyActive = Boolean(fileStatus?.active && !(appRuntime?.status === 'running' && appRuntime.activeTurnId));
      if (!externallyActive) {
        try {
          directResult = await codexAppServer.sendTurn({
            threadId: effectiveThreadId,
            cwd: expectedNewThreadCwd,
            text,
            imagePaths: attachments.map(item => item.filePath),
            clientUserMessageId: clientRequestId || undefined,
          });
          const directThreadId = directResult.threadId;
          const directFile = findCodexSessionFileByThreadId(directThreadId);
          watch = {
            since: watchSince,
            threadId: directThreadId,
            sessionFile: directFile ? path.basename(directFile) : '',
            expectNewThread: false,
            excludeThreadId: '',
            cwd: '',
          };
        } catch (error) {
          appServerError = error;
        }
      }
    }

    if (!directResult) {
      const sendOptions = { assumeThreadSynced, expectNewThread, skipComposerClick: directPasteWithoutClick };
      await pasteAndEnter(text, target, attachments, effectiveThreadId, sendOptions);
    }
    if (!directResult && expectNewThread && watch) {
      const newSessionFile = await waitForCodexSessionFileForNewSend({
        sinceMs: watchSinceMs,
        text,
        cwd: expectedNewThreadCwd,
        excludeThreadId: previousThreadId,
      });
      if (newSessionFile) {
        watch = {
          ...watch,
          threadId: threadIdFromSessionFile(newSessionFile),
          sessionFile: path.basename(newSessionFile),
          expectNewThread: false,
          excludeThreadId: '',
        };
      }
    }
    const result = {
      ok: true,
      message: directResult
        ? (directResult.steered ? '已追加到正在运行的任务。' : '已通过 Codex App Server 发送。')
        : target === 'codex' ? '已发送到 ChatGPT Desktop。' : '已粘贴并按下回车。',
      target,
      transport: directResult ? 'app-server' : target === 'codex' ? 'desktop-gui' : 'frontmost',
      sentAt: new Date().toISOString(),
      attachments: attachments.map(item => ({ name: item.name, size: item.size, type: item.mime })),
      watch,
      focusFallback: '',
    };
    if (appServerError) result.appServerError = appServerError.message || String(appServerError);
    if (clientRequestId) {
      recentSendRequests.set(clientRequestId, {
        createdAt: Date.now(),
        sentAt: result.sentAt,
        watch,
        result,
      });
    }
    return json(res, 200, result);
  } catch (error) {
    if (clientRequestId) recentSendRequests.delete(clientRequestId);
    const explained = explainTargetError(error, target);
    return json(res, 500, { ok: false, ...explained });
  }
}

function serveStatic(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  const relative = path.relative(PUBLIC_DIR, filePath);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
      return res.end('Not found');
    }
    const ext = path.extname(filePath);
    const headers = {
      'content-type': mimeTypes[ext] || 'application/octet-stream',
      'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=3600',
      'content-length': data.length,
    };
    if (ext === '.html' && url.searchParams.get('token') === TOKEN) {
      headers['set-cookie'] = `codexMiniToken=${encodeURIComponent(TOKEN)}; Path=/; SameSite=Lax; Max-Age=31536000`;
    }
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : data);
  });
}

function getLanApiBases() {
  const nets = os.networkInterfaces();
  const bases = new Set();
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) bases.add(`http://${net.address}:${PORT}`);
    }
  }
  return [...bases];
}

async function handleClientConfig(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  let modelOptions = readModelCatalogOptions();
  let transport = 'session-files';
  try {
    const models = await codexAppServer.listModels();
    if (models.length) {
      const appServerModels = models.map(model => ({
        key: model.id,
        id: model.id,
        label: labelFromModelName(model.displayName || model.id),
        displayName: model.displayName || model.id,
        source: 'app-server',
        isDefault: model.isDefault === true,
        supportedReasoningEfforts: (model.supportedReasoningEfforts || []).map(item => item.reasoningEffort).filter(Boolean),
      }));
      modelOptions = mergeModelOptions(modelOptions, appServerModels);
      transport = 'app-server';
    }
  } catch {}
  return json(res, 200, {
    ok: true,
    service: 'codex-max',
    appName: APP_NAME,
    localOnly: true,
    localApiBases: getLanApiBases(),
    transport,
    modelOptions,
    reasoningOptions: Object.values(REASONING_MODE_TARGETS),
  });
}

async function handleHealth(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  let cdp = null;
  if (platform.cdpStatus) {
    try {
      cdp = await platform.cdpStatus();
    } catch (error) {
      cdp = {
        available: false,
        code: error.code || 'CDP_STATUS_FAILED',
        message: error.message || 'CDP 状态读取失败。',
      };
    }
  }
  return json(res, 200, {
    ok: true,
    service: 'codex-max',
    host: os.hostname(),
    platform: platform.name,
    controlMode: codexAppServer.isAvailable() ? 'app-server' : cdp && cdp.available ? 'cdp' : 'gui',
    appServer: codexAppServer.status(),
    cdp,
    now: new Date().toISOString(),
  });
}

async function handleCdpLaunch(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  if (!platform.launchCodexCdp) {
    return json(res, 400, {
      ok: false,
      code: 'CDP_LAUNCH_UNSUPPORTED',
      message: '当前平台不支持从 ChatGPT Win 启动 CDP 受控版 ChatGPT。',
    });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  try {
    const result = await platform.runExclusive(() => platform.launchCodexCdp({
      forceRestart: payload.forceRestart !== false,
      waitMs: payload.waitMs,
    }));
    return json(res, 200, result);
  } catch (error) {
    return json(res, 503, {
      ok: false,
      code: error.code || 'CDP_LAUNCH_FAILED',
      message: error.message || '启动 Codex CDP 受控版本失败。',
      launch: error.launch,
      cdp: error.cdp,
    });
  }
}

async function handleKeepAwake(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  if (req.method === 'GET') {
    return json(res, 200, { ok: true, ...keepAwakeStatus() });
  }

  let payload = {};
  try {
    payload = JSON.parse(await readBody(req) || '{}');
  } catch (error) {
    return json(res, 400, { ok: false, code: 'BAD_REQUEST', message: error.message || '请求格式不正确。' });
  }

  try {
    const enabled = payload.enabled === true;
    const status = await (enabled ? startKeepAwake() : stopKeepAwake());
    return json(res, 200, {
      ok: true,
      ...status,
      message: status.enabled ? '已开启保持亮屏，电脑不会自动休眠' : '已关闭保持亮屏',
    });
  } catch (error) {
    return json(res, 500, {
      ok: false,
      code: error.code || 'KEEP_AWAKE_FAILED',
      message: error.message || '切换保持亮屏失败。',
    });
  }
}

function getLanUrls() {
  const nets = os.networkInterfaces();
  const urls = new Set([`http://localhost:${PORT}/?token=${TOKEN}`]);
  for (const entries of Object.values(nets)) {
    for (const net of entries || []) {
      if (net.family === 'IPv4' && !net.internal) {
        urls.add(`http://${net.address}:${PORT}/?token=${TOKEN}`);
      }
    }
  }
  return [...urls];
}

function handleHistoryAttachment(req, res) {
  if (!isAuthorized(req)) return json(res, 401, { ok: false, code: 'UNAUTHORIZED', message: '访问令牌不正确。' });
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const id = String(url.searchParams.get('id') || '');
  const item = historyAttachmentCache.get(id);
  if (!item || item.expiresAt <= Date.now()) {
    historyAttachmentCache.delete(id);
    return json(res, 404, { ok: false, code: 'ATTACHMENT_NOT_FOUND', message: '图片预览已失效，请刷新任务记录。' });
  }
  try {
    const stat = fs.lstatSync(item.filePath);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size <= 0 || stat.size > MAX_ATTACHMENT_BYTES) throw new Error('图片文件不可用。');
    res.writeHead(200, { 'Content-Type': item.mime, 'Content-Length': stat.size, 'Cache-Control': 'private, max-age=300', 'X-Content-Type-Options': 'nosniff' });
    fs.createReadStream(item.filePath).on('error', () => res.destroy()).pipe(res);
  } catch {
    historyAttachmentCache.delete(id);
    return json(res, 404, { ok: false, code: 'ATTACHMENT_NOT_FOUND', message: '图片文件不可用。' });
  }
}

const server = http.createServer((req, res) => {
  if (req.method === 'OPTIONS') return options(res);
  if (req.method === 'GET' && req.url.startsWith('/codex/health')) return handleHealth(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/attachment')) return handleHistoryAttachment(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/config')) return handleClientConfig(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/environment')) return handleEnvironment(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/git-action')) return handleGitAction(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/cdp-launch')) return handleCdpLaunch(req, res);
  if (req.method === 'POST' && req.url.startsWith('/send')) return handleSend(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/threads')) return handleThreads(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/archived')) return handleArchivedThreads(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/pull-requests')) return handlePullRequests(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/plugins')) return handlePlugins(req, res);
  if ((req.method === 'GET' || req.method === 'POST') && req.url.startsWith('/codex/schedules')) return handleSchedules(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/history')) return handleThreadHistory(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/approvals')) return handleCodexApprovals(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/approval')) return handleCodexApproval(req, res);
  if (req.method === 'GET' && req.url.startsWith('/codex/status')) return handleCodexStatus(req, res);
  if ((req.method === 'GET' || req.method === 'POST') && req.url.startsWith('/codex/keep-awake')) return handleKeepAwake(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/select')) return handleSelectThread(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/new-thread')) return handleNewCodexThread(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/thread-action')) return handleThreadAction(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/model-switch')) return handleModelSwitch(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/reasoning-mode')) return handleReasoningMode(req, res);
  if (req.method === 'POST' && req.url.startsWith('/codex/stop')) return handleStopCodex(req, res);
  if (req.method === 'GET' || req.method === 'HEAD') return serveStatic(req, res);
  json(res, 405, { ok: false, code: 'METHOD_NOT_ALLOWED', message: 'Method not allowed' });
});

server.listen(PORT, HOST, () => {
  startScheduledTaskRunner();
  const urls = getLanUrls();
  console.log('\nChatGPT Win is running.');
  console.log('Keep this terminal open, make sure Codex Desktop is available, then open one of these URLs on your phone:');
  for (const url of urls) console.log(`  ${url}`);
  console.log('\nTip: phone and this computer must be on the same Wi‑Fi/LAN. Press Ctrl+C to stop.\n');
});

process.on('exit', () => {
  stopScheduledTaskRunner();
  cleanupKeepAwake();
  codexAppServer.close();
});
process.on('SIGINT', () => {
  stopScheduledTaskRunner();
  cleanupKeepAwake();
  codexAppServer.close();
  process.exit(130);
});
process.on('SIGTERM', () => {
  stopScheduledTaskRunner();
  cleanupKeepAwake();
  codexAppServer.close();
  process.exit(143);
});
