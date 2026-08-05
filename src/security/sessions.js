'use strict';

const crypto = require('crypto');

const DEFAULT_SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const DEFAULT_MAX_SESSIONS = 64;
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function publicSession(record) {
  return {
    deviceName: record.deviceName,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    lastSeenAt: record.lastSeenAt,
  };
}

class SessionManager {
  constructor(options = {}) {
    this.logger = options.logger || console;
    this.sessionTtlMs = Number(options.sessionTtlMs) || DEFAULT_SESSION_TTL_MS;
    this.maxSessions = Number(options.maxSessions) || DEFAULT_MAX_SESSIONS;
    this.cookieSecure = Boolean(options.cookieSecure);
    this.sessions = new Map();

    this.cleanupTimer = setInterval(() => this.cleanup(), DEFAULT_CLEANUP_INTERVAL_MS);
    if (this.cleanupTimer.unref) this.cleanupTimer.unref();
  }

  createSession(deviceName = '') {
    const token = crypto.randomBytes(24).toString('base64url');
    const now = Date.now();
    const normalizedDeviceName = String(deviceName || '')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || '未命名设备';
    const record = {
      tokenHash: hashToken(token),
      deviceName: normalizedDeviceName,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + this.sessionTtlMs).toISOString(),
      lastSeenAt: new Date(now).toISOString(),
    };

    if (this.sessions.size >= this.maxSessions) {
      let oldestKey = null;
      let oldestAt = Number.POSITIVE_INFINITY;
      for (const [key, value] of this.sessions) {
        const lastSeen = Date.parse(value.lastSeenAt) || 0;
        if (lastSeen < oldestAt) {
          oldestAt = lastSeen;
          oldestKey = key;
        }
      }
      if (oldestKey) this.sessions.delete(oldestKey);
    }

    this.sessions.set(record.tokenHash, record);
    return { token, session: publicSession(record) };
  }

  validateSession(token) {
    if (!token) return null;
    const record = this.sessions.get(hashToken(token));
    if (!record) return null;
    if (Date.parse(record.expiresAt) <= Date.now()) {
      this.sessions.delete(record.tokenHash);
      return null;
    }
    record.lastSeenAt = new Date().toISOString();
    return publicSession(record);
  }

  revokeSession(token) {
    if (!token) return;
    this.sessions.delete(hashToken(token));
  }

  revokeAll() {
    this.sessions.clear();
  }

  cleanup() {
    const now = Date.now();
    for (const [key, record] of this.sessions) {
      if (Date.parse(record.expiresAt) <= now) this.sessions.delete(key);
    }
  }

  sessionCookie(token) {
    const maxAge = Math.max(60, Math.floor(this.sessionTtlMs / 1000));
    const secure = this.cookieSecure ? '; Secure' : '';
    return `codexMiniSession=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${secure}`;
  }

  destroy() {
    if (this.cleanupTimer) clearInterval(this.cleanupTimer);
    this.cleanupTimer = null;
    this.revokeAll();
  }
}

module.exports = { SessionManager };
