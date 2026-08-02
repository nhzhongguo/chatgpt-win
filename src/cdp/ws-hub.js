'use strict';

/**
 * CDP 实时状态 WebSocket 端点
 * 为手机端提供 WebSocket 长连接，实时推送 CDP 状态变化和 Codex 会话事件
 */

const { URL } = require('url');
const { getCdpConnection } = require('./connection');

// 简易 WebSocket 帧编解码（用于服务端→客户端推送，服务端不需要掩码）
function encodeWsFrameServer(text) {
  const payload = Buffer.from(String(text), 'utf8');
  const headerLength = payload.length < 126 ? 2 : payload.length <= 0xffff ? 4 : 10;
  const frame = Buffer.alloc(headerLength + payload.length);
  frame[0] = 0x81;
  if (payload.length < 126) {
    frame[1] = payload.length;
  } else if (payload.length <= 0xffff) {
    frame[1] = 126;
    frame.writeUInt16BE(payload.length, 2);
  } else {
    frame[1] = 127;
    frame.writeBigUInt64BE(BigInt(payload.length), 2);
  }
  payload.copy(frame, headerLength);
  return frame;
}

function decodeWsFrameClient(buffer) {
  if (buffer.length < 2) return null;
  const second = buffer[1];
  const masked = Boolean(second & 0x80);
  let length = second & 0x7f;
  let headerLength = 2;
  if (length === 126) {
    if (buffer.length < 4) return null;
    length = buffer.readUInt16BE(2);
    headerLength = 4;
  } else if (length === 127) {
    if (buffer.length < 10) return null;
    length = Number(buffer.readBigUInt64BE(2));
    headerLength = 10;
  }
  const maskOffset = headerLength;
  const payloadOffset = maskOffset + (masked ? 4 : 0);
  const frameEnd = payloadOffset + length;
  if (buffer.length < frameEnd) return null;
  let payload = buffer.subarray(payloadOffset, frameEnd);
  if (masked) {
    const mask = buffer.subarray(maskOffset, maskOffset + 4);
    const unmasked = Buffer.alloc(payload.length);
    for (let i = 0; i < payload.length; i += 1) unmasked[i] = payload[i] ^ mask[i % 4];
    payload = unmasked;
  }
  return { text: payload.toString('utf8'), consumed: frameEnd };
}

class CdpWebSocketHub {
  constructor(options = {}) {
    this.security = options.security;
    this.logger = options.logger || console;
    this.clients = new Set(); // Set<net.Socket>
    this.cdpConnection = null;
    this.lastStatus = null;
    this._statusPollTimer = null;
    this._statusPollInterval = options.statusPollInterval || 5000;
  }

  // ---- 客户端管理 ----

  start() {
    // 连接到 CDP 并订阅状态变化
    this.cdpConnection = getCdpConnection();
    this.cdpConnection.onStatusChange(status => {
      this.lastStatus = status;
      this.broadcast({ type: 'cdp_status', data: status });
    });

    // 定期轮询 CDP 状态（即使没有事件，也推送状态更新）
    this._statusPollTimer = setInterval(() => {
      this._pollAndBroadcast().catch(() => {});
    }, this._statusPollInterval);
    if (this._statusPollTimer.unref) this._statusPollTimer.unref();
  }

  stop() {
    if (this._statusPollTimer) { clearInterval(this._statusPollTimer); this._statusPollTimer = null; }
    for (const client of this.clients) {
      try { client.end(); } catch {}
    }
    this.clients.clear();
  }

  async _pollAndBroadcast() {
    if (!this.cdpConnection) return;
    const probe = await this.cdpConnection.probe();
    const status = { ...probe, polledAt: new Date().toISOString() };
    // 只在状态变化时广播
    const changed = JSON.stringify(status) !== JSON.stringify(this.lastStatus);
    if (changed) {
      this.lastStatus = status;
      this.broadcast({ type: 'cdp_status', data: status });
    }
  }

  // ---- 处理 WebSocket 升级 ----

  async handleUpgrade(req, socket, head) {
    // 鉴权
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token') || req.headers['x-mobile-typer-token'];
    if (!this.security || token !== this.security.getToken()) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    // WebSocket 握手
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.write('HTTP/1.1 400 Bad Request\r\n\r\n');
      socket.destroy();
      return;
    }

    const acceptKey = require('crypto').createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write([
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n'));

    this._addClient(socket);

    // 发送当前状态
    if (this.lastStatus) {
      this._sendToClient(socket, { type: 'cdp_status', data: this.lastStatus });
    } else {
      // 立即拉取一次状态
      if (this.cdpConnection) {
        const probe = await this.cdpConnection.probe().catch(() => null);
        if (probe) {
          this.lastStatus = probe;
          this._sendToClient(socket, { type: 'cdp_status', data: probe });
        }
      }
    }
  }

  _addClient(socket) {
    this.clients.add(socket);
    let buffer = Buffer.alloc(0);

    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      while (buffer.length >= 2) {
        const frame = decodeWsFrameClient(buffer);
        if (!frame) break;
        buffer = buffer.subarray(frame.consumed);
        // 处理客户端消息（心跳 ping 等）
        try {
          const msg = JSON.parse(frame.text);
          if (msg.type === 'ping') {
            this._sendToClient(socket, { type: 'pong', timestamp: Date.now() });
          }
        } catch {}
      }
    });

    socket.on('close', () => {
      this.clients.delete(socket);
      this.logger.debug('ws_client_disconnected', { clients: this.clients.size });
    });

    socket.on('error', () => {
      this.clients.delete(socket);
    });

    this.logger.debug('ws_client_connected', { clients: this.clients.size });
  }

  _sendToClient(socket, message) {
    if (socket.destroyed || !socket.writable) return;
    try {
      socket.write(encodeWsFrameServer(JSON.stringify(message)));
    } catch (error) {
      this.logger.debug('ws_send_failed', { error: error.message });
    }
  }

  broadcast(message) {
    const frame = encodeWsFrameServer(JSON.stringify(message));
    for (const socket of this.clients) {
      if (socket.destroyed || !socket.writable) {
        this.clients.delete(socket);
        continue;
      }
      try { socket.write(frame); } catch { this.clients.delete(socket); }
    }
  }

  getClientCount() {
    return this.clients.size;
  }
}

module.exports = { CdpWebSocketHub };
