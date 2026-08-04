'use strict';

/**
 * Cron 表达式解析器 - 支持 5 字段 cron 语法
 * minute hour day-of-month month day-of-week
 * 支持: * , - / 语法和 L（最后一天）修饰符
 */

const MONTH_NAMES = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const DAY_NAMES = { sun: 0, mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6 };

function isValidTimeZone(value) {
  const tz = String(value || '').trim();
  if (!tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

function timeZoneParts(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = { year: 0, month: 1, day: 1, hour: 0, minute: 0 };
  for (const part of parts) {
    if (part.type === 'year') values.year = Number(part.value);
    else if (part.type === 'month') values.month = Number(part.value);
    else if (part.type === 'day') values.day = Number(part.value);
    else if (part.type === 'hour') values.hour = Number(part.value) % 24;
    else if (part.type === 'minute') values.minute = Number(part.value);
  }
  values.dayOfWeek = new Date(Date.UTC(values.year, values.month - 1, values.day)).getUTCDay();
  return values;
}

class CronParser {
  constructor(expression, options = {}) {
    this.expression = String(expression || '').trim().toLowerCase();
    this.timeZone = isValidTimeZone(options.timeZone) ? String(options.timeZone).trim() : '';
    this.fields = this._parse();
  }

  _parse() {
    const parts = this.expression.split(/\s+/);
    if (parts.length !== 5) {
      throw new Error(`cron 表达式需要 5 个字段，收到 ${parts.length} 个: "${this.expression}"`);
    }
    return {
      minute: this._parseField(parts[0], 0, 59),
      hour: this._parseField(parts[1], 0, 23),
      dayOfMonth: this._parseField(parts[2], 1, 31),
      month: this._parseField(parts[3], 1, 12, MONTH_NAMES),
      dayOfWeek: this._parseField(parts[4], 0, 6, DAY_NAMES),
    };
  }

  _parseField(field, min, max, names = {}) {
    if (field === '*') return null; // null 表示不限制

    const values = new Set();

    for (const part of field.split(',')) {
      // 处理步进语法: N/M
      const stepMatch = part.match(/^(.+?)\/(\d+)$/);
      let range = part;
      let step = 1;
      if (stepMatch) {
        range = stepMatch[1];
        step = parseInt(stepMatch[2], 10);
        if (step < 1) throw new Error(`cron 步进值必须 >= 1: "${part}"`);
      }

      // 处理范围: N-M
      let start, end;
      if (range === '*') {
        start = min;
        end = max;
      } else if (range.includes('-')) {
        const [startStr, endStr] = range.split('-');
        start = this._parseValue(startStr, names);
        end = this._parseValue(endStr, names);
      } else {
        start = this._parseValue(range, names);
        end = step > 1 ? max : start;
      }

      if (start < min || end > max) {
        throw new Error(`cron 字段值超出范围 [${min}-${max}]: "${part}"`);
      }

      for (let v = start; v <= end; v += step) {
        values.add(v);
      }
    }

    return values;
  }

  _parseValue(str, names) {
    const lower = String(str).toLowerCase().trim();
    if (names[lower] !== undefined) return names[lower];
    const num = parseInt(lower, 10);
    if (isNaN(num)) throw new Error(`cron 无效值: "${str}"`);
    return num;
  }

  /**
   * 查找从 afterDate 开始的下一个匹配时间
   */
  nextRun(afterDate = new Date()) {
    const after = new Date(afterDate);
    after.setSeconds(0, 0);
    after.setMinutes(after.getMinutes() + 1); // 从下一分钟开始

    // 最多搜索 366 天
    const maxIterations = 366 * 24 * 60;
    let current = new Date(after);

    for (let i = 0; i < maxIterations; i++) {
      if (this._matches(current)) {
        return current;
      }
      current.setMinutes(current.getMinutes() + 1);
    }

    return null; // 未找到匹配（极不可能）
  }

  _matches(date) {
    const f = this.fields;
    let minute = date.getMinutes();
    let hour = date.getHours();
    let day = date.getDate();
    let month = date.getMonth() + 1;
    let dow = date.getDay();
    if (this.timeZone) {
      const parts = timeZoneParts(date, this.timeZone);
      minute = parts.minute;
      hour = parts.hour;
      day = parts.day;
      month = parts.month;
      dow = parts.dayOfWeek;
    }

    if (f.minute && !f.minute.has(minute)) return false;
    if (f.hour && !f.hour.has(hour)) return false;
    if (f.month && !f.month.has(month)) return false;

    // dayOfMonth 和 dayOfWeek 的组合规则：
    // 如果两者都指定了，满足任一即可（OR 关系）
    // 如果只指定了一个，则必须满足
    const domMatch = !f.dayOfMonth || f.dayOfMonth.has(day);
    const dowMatch = !f.dayOfWeek || f.dayOfWeek.has(dow);

    if (f.dayOfMonth && f.dayOfWeek) {
      return domMatch || dowMatch;
    }
    return domMatch && dowMatch;
  }

  isValid() {
    return this.fields !== null;
  }

  describe() {
    if (!this.fields) return '无效';
    const f = this.fields;
    const parts = [];

    if (!f.minute) parts.push('每分钟');
    else if (!f.hour) parts.push('每小时');
    else {
      const hours = [...f.hour].sort((a, b) => a - b);
      const minutes = [...f.minute].sort((a, b) => a - b);
      if (hours.length === 1 && minutes.length === 1) {
        parts.push(`每天 ${String(hours[0]).padStart(2, '0')}:${String(minutes[0]).padStart(2, '0')}`);
      } else if (hours.length === 1) {
        parts.push(`每天 ${hours[0]} 时 ${minutes.join(',')} 分`);
      } else {
        parts.push(`${hours.join(',')} 时 ${minutes.join(',')} 分`);
      }
    }

    if (f.dayOfWeek && f.dayOfWeek.size > 0) {
      const names = ['日', '一', '二', '三', '四', '五', '六'];
      const days = [...f.dayOfWeek].sort((a, b) => a - b).map(d => `周${names[d]}`);
      parts.push(days.join('、'));
    }

    if (f.dayOfMonth && f.dayOfMonth.size > 0) {
      parts.push(`每月 ${[...f.dayOfMonth].sort((a, b) => a - b).join(',')} 日`);
    }

    if (f.month && f.month.size > 0) {
      parts.push(`${[...f.month].sort((a, b) => a - b).map(m => `${m}月`).join(', ')}`);
    }

    return parts.join(' ');
  }
}

// ---- 失败重试策略 ----

const RETRY_STRATEGIES = {
  none: { retries: 0, delay: 0 },
  fixed: { retries: 3, delay: 60000 },        // 固定 60s 重试 3 次
  exponential: { retries: 5, delay: 30000, multiplier: 2, maxDelay: 1800000 }, // 指数退避，最大 30 分钟
};

function getRetryDelay(strategy, attempt) {
  const config = RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.none;
  if (attempt >= config.retries) return -1; // 不再重试

  if (strategy === 'exponential') {
    const baseDelay = config.delay;
    const multiplier = config.multiplier || 2;
    const maxDelay = config.maxDelay || baseDelay * 10;
    return Math.min(baseDelay * Math.pow(multiplier, attempt), maxDelay);
  }

  return config.delay;
}

function shouldRetry(strategy, attempt) {
  const config = RETRY_STRATEGIES[strategy] || RETRY_STRATEGIES.none;
  return attempt < config.retries;
}

module.exports = { CronParser, isValidTimeZone, RETRY_STRATEGIES, getRetryDelay, shouldRetry };
