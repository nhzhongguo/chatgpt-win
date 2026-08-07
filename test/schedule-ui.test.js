'use strict';

/**
 * P2-5：定时任务工作区 UI 回归测试（前端源码断言）
 * 覆盖：
 *  - 状态 chip 语义类（running/started/error/skipped/paused/idle）与 data-schedule-status
 *  - 运行中/已启动禁用「立即运行」按钮
 *  - 失败行 workspace-row-error + role=alert（lastMessage）
 *  - 只读拦截钩子 data-schedule-action（run/delete/toggle）
 *  - reduced-motion 下脉冲动画关闭
 *  - black-sky 深色覆盖存在
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

test('P2-5: 定时任务 UI 语义状态与操作存在', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf8');

  // 操作按钮挂载只读拦截钩子
  assert.ok(html.includes("run.setAttribute('data-schedule-action', 'run')"), '立即运行按钮挂载 data-schedule-action=run');
  assert.ok(html.includes("remove.setAttribute('data-schedule-action', 'delete')"), '删除按钮挂载 data-schedule-action=delete');
  assert.ok(html.includes("toggle.setAttribute('data-schedule-action', 'toggle')"), '启用切换挂载 data-schedule-action=toggle');

  // 运行中/已启动禁用立即运行
  assert.ok(
    html.includes("if (task.lastStatus === 'running' || task.lastStatus === 'started') run.disabled = true;"),
    '运行中/已启动禁用立即运行按钮'
  );

  // 状态语义键与 chip
  assert.ok(html.includes("const scheduleStatusKey = task.enabled === false ? 'paused'"), '暂停/运行语义键计算存在');
  assert.ok(html.includes('statusChip.setAttribute(\'data-schedule-status\', scheduleStatusKey)'), '状态 chip 暴露 data-schedule-status');
  assert.ok(html.includes("statusChip.textContent = task.enabled === false ? '已暂停'"), '暂停态 chip 文案');
  assert.ok(html.includes('`workspace-schedule-status is-${scheduleStatusKey}`'), 'chip 语义类生成');

  // 失败行
  assert.ok(html.includes("if (task.lastStatus === 'error' && task.lastMessage) {"), '仅失败态渲染错误行');
  assert.ok(html.includes("'workspace-row-error'"), '错误行类存在');
  assert.ok(html.includes("errorLine.setAttribute('role', 'alert')"), '错误行 role=alert');

  // 样式语义类
  for (const cls of ['is-running', 'is-started', 'is-error', 'is-skipped', 'is-paused']) {
    assert.ok(html.includes(`.workspace-schedule-status.${cls}`), `语义样式 ${cls} 存在`);
  }
  assert.ok(html.includes('.workspace-schedule-status.is-running::before'), '运行中脉冲指示点存在');
  assert.ok(html.includes('@media (prefers-reduced-motion: reduce)'), 'reduced-motion 媒体查询存在');
  assert.ok(
    html.includes('.workspace-schedule-status.is-running::before { animation: none; }'),
    'reduced-motion 下脉冲关闭'
  );
  assert.ok(html.includes('body[data-ui-theme="black-sky"] .workspace-schedule-status'), 'black-sky 深色 chip 覆盖存在');
  assert.ok(html.includes('body[data-ui-theme="black-sky"] .workspace-row-error'), 'black-sky 错误行覆盖存在');
  assert.ok(html.includes("'.workspace-row-action', '[data-schedule-action]',"), '只读拦截选择器已包含 data-schedule-action');
});
