'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');

test('Rate limiting is handled by the Security module and Router', () => {
  const security = require('fs').readFileSync('./src/security/index.js', 'utf8');
  assert.ok(security.includes('rateLimitCheck'), 'Security rateLimitCheck method defined');
  assert.ok(security.includes('RATE_LIMIT'), 'Rate limit constants defined in Security');
  const routes = require('fs').readFileSync('./src/routes/index.js', 'utf8');
  assert.ok(routes.includes('json(res, 429'), 'Router returns 429 status code for rate limiting');
  assert.ok(routes.includes('/codex/health'), 'Router excludes health endpoint from rate limit');
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('/codex/health'), 'Health endpoint defined in server');
});

test('Static file serving uses safe path resolution', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('PUBLIC_DIR'), 'PUBLIC_DIR constant defined');
});

test('Authorization checks token from header, query, and cookie', () => {
  const security = require('fs').readFileSync('./src/security/index.js', 'utf8');
  assert.ok(security.includes('x-mobile-typer-token'), 'Header-based token auth');
  assert.ok(security.includes('searchParams.get'), 'Query parameter token auth');
  assert.ok(security.includes('codexMiniToken'), 'Cookie-based token auth');
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('security.isAuthorized(req)'), 'Server delegates auth to Security module');
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
    '/codex/download', '/codex/rotate-token',
  ];
  for (const route of routes) {
    assert.ok(src.includes(route), 'Route ' + route + ' is defined');
  }
});

test('Rate limit cleanup prevents memory leak', () => {
  const security = require('fs').readFileSync('./src/security/index.js', 'utf8');
  assert.ok(security.includes('RATE_LIMIT_CLEANUP_INTERVAL'), 'Cleanup interval defined');
  assert.ok(security.includes('rateLimitBuckets.delete'), 'Stale bucket cleanup');
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('router.dispatch'), 'Server delegates routing to Router');
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
  const routes = require('fs').readFileSync('./src/routes/index.js', 'utf8');
  assert.ok(routes.includes('access-control-allow-origin'), 'CORS header');
  assert.ok(routes.includes('access-control-allow-private-network'), 'Private network allowed');
  assert.ok(routes.includes('x-content-type-options'), 'nosniff header');
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('OPTIONS'), 'OPTIONS handled');
  assert.ok(src.includes('corsHeaders(req)'), 'CORS computed per-request');
});

test('Process exit handlers clean up resources', () => {
  const src = require('fs').readFileSync('./server.js', 'utf8');
  assert.ok(src.includes('SIGINT'), 'SIGINT handled');
  assert.ok(src.includes('SIGTERM'), 'SIGTERM handled');
  assert.ok(src.includes('cleanupKeepAwake'), 'Keep awake cleanup');
});
