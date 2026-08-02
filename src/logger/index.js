'use strict';

/**
 * 结构化日志模块 - 基于 pino 风格的轻量级日志器
 * 支持 JSON 格式输出、日志级别、上下文关联
 */

const LEVELS = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 };
const LEVEL_NAMES = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'];

class Logger {
  constructor(options = {}) {
    this.level = options.level || process.env.LOG_LEVEL || 'info';
    this.json = options.json !== false && process.env.LOG_FORMAT !== 'text';
    this.context = options.context || {};
    this._minLevel = LEVELS[this.level] || LEVELS.info;
  }

  child(context = {}) {
    return new Logger({
      level: this.level,
      json: this.json,
      context: { ...this.context, ...context },
    });
  }

  _shouldLog(level) {
    return (LEVELS[level] || LEVELS.info) >= this._minLevel;
  }

  _format(level, msg, data = {}) {
    const timestamp = new Date().toISOString();
    const merged = { ...this.context, ...data };
    if (this.json) {
      const entry = { time: timestamp, level: LEVELS[level] || LEVELS.info, levelName: level, msg, ...merged };
      return JSON.stringify(entry);
    }
    const ctxStr = Object.keys(merged).length ? ` ${JSON.stringify(merged)}` : '';
    return `[${timestamp}] ${level.toUpperCase()} ${msg}${ctxStr}`;
  }

  _emit(level, msg, data) {
    if (!this._shouldLog(level)) return;
    const line = this._format(level, msg, data);
    if (LEVELS[level] >= LEVELS.warn) process.stderr.write(`${line}\n`);
    else process.stdout.write(`${line}\n`);
  }

  trace(msg, data) { this._emit('trace', msg, data); }
  debug(msg, data) { this._emit('debug', msg, data); }
  info(msg, data) { this._emit('info', msg, data); }
  warn(msg, data) { this._emit('warn', msg, data); }
  error(msg, data) { this._emit('error', msg, data); }
  fatal(msg, data) { this._emit('fatal', msg, data); process.exit(1); }

  // HTTP request logger helper
  logRequest(req, statusCode, durationMs) {
    this.info('http_request', {
      method: req.method,
      url: req.url,
      status: statusCode,
      durationMs,
      ip: req.socket?.remoteAddress?.replace('::ffff:', '') || '',
    });
  }
}

// Singleton default logger
const defaultLogger = new Logger({ context: { service: 'codex-max' } });

module.exports = { Logger, defaultLogger };
