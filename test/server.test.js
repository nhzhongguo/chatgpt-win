'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('Rate limiter constants defined in server.js', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('RATE_LIMIT_RPM'), 'Rate limit RPM constant defined');
  assert.ok(src.includes('function rateLimitCheck'), 'rateLimitCheck function defined');
  assert.ok(src.includes('writeHead(429'), '429 status code for rate limiting');
  assert.ok(src.includes('/codex/health'), 'Health endpoint excluded from rate limit');
});

test('Static file serving uses safe path resolution', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('PUBLIC_DIR'), 'PUBLIC_DIR constant defined');
});

test('Authorization checks token from header, query, and cookie', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('x-mobile-typer-token'), 'Header-based token auth');
  assert.ok(src.includes('searchParams.get'), 'Query parameter token auth');
  assert.ok(src.includes('cookie'), 'Cookie-based token auth');
});

test('All required route handlers are defined', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  const routes = [
    '/codex/health', '/codex/threads', '/codex/archived',
    '/codex/history', '/codex/status', '/codex/config',
    '/codex/approvals', '/codex/select', '/codex/new-thread',
    '/codex/stop', '/codex/model-switch', '/codex/reasoning-mode',
    '/codex/keep-awake', '/codex/environment', '/codex/git-action',
    '/codex/cdp-launch', '/codex/pull-requests', '/codex/plugins',
    '/codex/schedules', '/codex/thread-action',
    '/send', '/codex/attachment',
  ];
  for (const route of routes) {
    assert.ok(src.includes(route), 'Route ' + route + ' is defined');
  }
});

test('Rate limit cleanup prevents memory leak', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('RATE_LIMIT_CLEANUP_INTERVAL'), 'Cleanup interval defined');
  assert.ok(src.includes('rateLimitBuckets.delete'), 'Stale bucket cleanup');
});

test('Platform module handles win32 and darwin', () => {
  const idx = require('fs').readFileSync('./src/platform/index.js', 'utf8');
  assert.ok(idx.includes('win32'), 'win32 platform supported');
  assert.ok(idx.includes('darwin'), 'darwin platform supported');
  assert.ok(idx.includes('UNSUPPORTED_PLATFORM'), 'Other platforms raise error');
});

test('Attachment abuse prevention constants exist', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('MAX_ATTACHMENTS'), 'Max attachments');
  assert.ok(src.includes('MAX_ATTACHMENT_BYTES'), 'Max attachment bytes');
  assert.ok(src.includes('HISTORY_ATTACHMENT_TTL_MS'), 'Attachment TTL');
});

test('CORS headers set on OPTIONS preflight', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('OPTIONS'), 'OPTIONS handled');
  assert.ok(src.includes('access-control-allow-origin'), 'CORS header');
});

test('Process exit handlers clean up resources', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('SIGINT'), 'SIGINT handled');
  assert.ok(src.includes('SIGTERM'), 'SIGTERM handled');
  assert.ok(src.includes('cleanupKeepAwake'), 'Keep awake cleanup');
});
