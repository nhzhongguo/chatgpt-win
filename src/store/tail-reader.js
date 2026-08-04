'use strict';

/**
 * TailReader — 增量尾部读取器（Phase 3.1 性能优化）
 *
 * Codex 会话文件是只追加的 jsonl。旧实现每次轮询都会重新读取整个尾部窗口并
 * 对全部行做 JSON.parse（/codex/status 每 1.4s 轮询一次，是最大 CPU 热点）。
 *
 * TailReader 按 (size, mtimeMs) 缓存每个文件已解析的尾部行：
 * - 文件未变：直接复用缓存，零磁盘读取、零 JSON 解析；
 * - 文件追加：只读取新增字节，增量解析后追加，并按新窗口起点裁掉过期前缀；
 * - 文件回退/重写/截断：整体重读（保持与 readTailLines 完全一致的语义）。
 *
 * 正确性护栏：追加路径前先校验"接缝"字节（上次读取终点前的 64 字节）与当前
 * 文件相同，防止截断后重新写满但 size 更大时产生错位解析。
 */

const fs = require('fs');

const DEFAULT_TAIL_BYTES = 5 * 1024 * 1024;
const EDGE_CHECK_BYTES = 64;
const MAX_CACHED_FILES = 64;

class TailReader {
  constructor(options = {}) {
    this.tailBytes = options.tailBytes || DEFAULT_TAIL_BYTES;
    this.cache = new Map();
  }

  /**
   * 读取文件尾部的已解析行。
   * @param {string} file 会话文件绝对路径
   * @returns {{ items: object[], stat: object|null, reused: boolean }}
   *   items —— 尾部窗口内可解析的 JSON 对象（损坏/空行跳过），保持行序；
   *   stat  —— fs.statSync 结果（文件不存在时为 null）；
   *   reused —— 是否完全命中缓存（本次未发生文件读取/解析）。
   */
  read(file) {
    let stat = null;
    try {
      stat = fs.statSync(file);
    } catch {
      this.cache.delete(file);
      return { items: [], stat: null, reused: false };
    }

    const cached = this.cache.get(file);
    if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) {
      return { items: cached.items, stat, reused: true };
    }

    let entry;
    if (cached && this._canAppend(cached, stat)) {
      entry = this._append(file, cached, stat);
    } else {
      entry = this._readAll(file, stat);
    }
    this.cache.set(file, entry);
    if (this.cache.size > MAX_CACHED_FILES) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) this.cache.delete(oldest);
    }
    return { items: entry.items, stat, reused: false };
  }

  /** 丢弃某个文件的缓存（例如文件被删除时）。 */
  reset(file) {
    this.cache.delete(file);
  }

  /** 清空全部缓存。 */
  resetAll() {
    this.cache.clear();
  }

  _canAppend(cached, stat) {
    if (cached.size >= stat.size) return false; // 回退/截断
    if (stat.size - cached.size > this.tailBytes) return false; // 窗口整体滑动，重读更简单
    // 接缝校验：上次读取终点前的 EDGE_CHECK_BYTES 与当前文件一致才走增量路径
    try {
      const start = Math.max(0, cached.size - EDGE_CHECK_BYTES);
      const length = cached.size - start;
      const buffer = Buffer.alloc(length);
      const fd = fs.openSync(cached.path, 'r');
      try {
        fs.readSync(fd, buffer, 0, length, start);
      } finally {
        fs.closeSync(fd);
      }
      return buffer.toString('utf8') === cached.edgeBytes;
    } catch {
      return false;
    }
  }

  _readAll(file, stat) {
    const start = Math.max(0, stat.size - this.tailBytes);
    const fd = fs.openSync(file, 'r');
    let text = '';
    try {
      if (stat.size > start) {
        const buffer = Buffer.alloc(stat.size - start);
        fs.readSync(fd, buffer, 0, buffer.length, start);
        text = buffer.toString('utf8');
        if (start > 0) {
          const firstNewline = text.indexOf('\n');
          text = firstNewline >= 0 ? text.slice(firstNewline + 1) : '';
        }
      }
    } finally {
      fs.closeSync(fd);
    }
    const parsed = this._parseBuffer(text, start, false);
    return this._buildEntry(file, stat, parsed);
  }

  _append(file, cached, stat) {
    const resumeFrom = cached.endedWithNewline ? cached.size : cached.lastLineStart;
    let keepCount = cached.items.length;
    if (!cached.endedWithNewline) {
      while (keepCount > 0 && cached.offsets[keepCount - 1] >= cached.lastLineStart) keepCount -= 1;
    }
    const fd = fs.openSync(file, 'r');
    let text = '';
    try {
      const length = stat.size - resumeFrom;
      if (length > 0) {
        const buffer = Buffer.alloc(length);
        fs.readSync(fd, buffer, 0, length, resumeFrom);
        text = buffer.toString('utf8');
      }
    } finally {
      fs.closeSync(fd);
    }
    const parsed = this._parseBuffer(text, resumeFrom, false);
    const items = cached.items.slice(0, keepCount).concat(parsed.items);
    const offsets = cached.offsets.slice(0, keepCount).concat(parsed.offsets);
    const newStart = Math.max(0, stat.size - this.tailBytes);
    let drop = 0;
    while (drop < offsets.length && offsets[drop] < newStart) drop += 1;
    if (drop > 0) {
      items.splice(0, drop);
      offsets.splice(0, drop);
    }
    return this._buildEntry(file, stat, { items, offsets, lastLineStart: parsed.lastLineStart, endedWithNewline: parsed.endedWithNewline });
  }

  _parseBuffer(text, baseOffset, dropFirstFragment) {
    const parts = text.split('\n');
    const items = [];
    const offsets = [];
    let pos = 0;
    let lastLineStart = baseOffset;
    for (let i = 0; i < parts.length; i += 1) {
      const line = parts[i];
      const lineStart = baseOffset + pos;
      lastLineStart = lineStart;
      pos += line.length + 1;
      if (i === 0 && dropFirstFragment) continue;
      if (!line) continue;
      try {
        const parsed = JSON.parse(line);
        if (parsed !== null && typeof parsed === 'object') {
          items.push(parsed);
          offsets.push(lineStart);
        }
      } catch {
        // 忽略损坏/半行
      }
    }
    return { items, offsets, lastLineStart, endedWithNewline: text.endsWith('\n') };
  }

  _buildEntry(file, stat, parsed) {
    const size = stat.size;
    const edgeStart = Math.max(0, size - EDGE_CHECK_BYTES);
    let edgeBytes = '';
    const fd = fs.openSync(file, 'r');
    try {
      if (size > edgeStart) {
        const buffer = Buffer.alloc(size - edgeStart);
        fs.readSync(fd, buffer, 0, buffer.length, edgeStart);
        edgeBytes = buffer.toString('utf8');
      }
    } finally {
      fs.closeSync(fd);
    }
    return {
      path: file,
      size,
      mtimeMs: stat.mtimeMs,
      items: parsed.items,
      offsets: parsed.offsets,
      lastLineStart: parsed.lastLineStart,
      endedWithNewline: parsed.endedWithNewline,
      edgeBytes,
    };
  }
}

module.exports = { TailReader, DEFAULT_TAIL_BYTES, EDGE_CHECK_BYTES, MAX_CACHED_FILES };
