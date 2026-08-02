'use strict';

/**
 * HTTPS 证书模块 - 自动生成自签名证书，支持 HTTPS 加密传输
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const CERT_DIR = path.join(os.homedir(), '.codex-max', 'certs');
const CERT_FILE = path.join(CERT_DIR, 'cert.pem');
const KEY_FILE = path.join(CERT_DIR, 'key.pem');
const CERT_VALIDITY_DAYS = 365;
const CERT_KEY_SIZE = 2048;

class CertificateManager {
  constructor(options = {}) {
    this.certDir = options.certDir || CERT_DIR;
    this.certFile = options.certFile || CERT_FILE;
    this.keyFile = options.keyFile || KEY_FILE;
  }

  /**
   * 检查证书是否存在且有效
   */
  hasValidCert() {
    try {
      const cert = fs.readFileSync(this.certFile, 'utf8');
      const key = fs.readFileSync(this.keyFile, 'utf8');
      return cert.includes('BEGIN CERTIFICATE') && key.includes('PRIVATE KEY');
    } catch {
      return false;
    }
  }

  /**
   * 获取证书指纹（用于手机端扫码验证）
   */
  getCertFingerprint() {
    try {
      const cert = fs.readFileSync(this.certFile, 'utf8');
      const pemContent = cert
        .replace(/-----BEGIN CERTIFICATE-----/, '')
        .replace(/-----END CERTIFICATE-----/, '')
        .replace(/\s/g, '');
      const der = Buffer.from(pemContent, 'base64');
      const hash = crypto.createHash('sha256').update(der).digest('hex');
      return hash.match(/.{2}/g).join(':').toUpperCase();
    } catch {
      return '';
    }
  }

  /**
   * 生成自签名证书
   * 注意：使用 Node.js 内置 crypto 模块生成，无需外部依赖
   */
  generateSelfSigned(hostname) {
    // 由于 Node.js crypto 模块不直接支持证书生成，
    // 我们使用一种简化的方法：通过 OpenSSL 命令行工具生成
    const { execSync } = require('child_process');
    const subject = `/CN=${hostname || 'codex-max-local'}/O=CodexMax/OU=Local`;
    
    fs.mkdirSync(this.certDir, { recursive: true });

    try {
      // 尝试使用 OpenSSL
      execSync(
        `openssl req -x509 -newkey rsa:${CERT_KEY_SIZE} -keyout "${this.keyFile}" ` +
        `-out "${this.certFile}" -days ${CERT_VALIDITY_DAYS} -nodes ` +
        `-subj "${subject}" -addext "subjectAltName=IP:127.0.0.1,DNS:localhost"`,
        { stdio: 'pipe', timeout: 10000 }
      );
      // 设置文件权限
      try { fs.chmodSync(this.keyFile, 0o600); } catch {}
      return { ok: true, certFile: this.certFile, keyFile: this.keyFile };
    } catch (error) {
      // OpenSSL 不可用，生成占位标记
      return { ok: false, error: error.message, fallback: true };
    }
  }

  /**
   * 确保证书可用，如果不存在则生成
   */
  ensureCert(hostname) {
    if (this.hasValidCert()) {
      return { ok: true, certFile: this.certFile, keyFile: this.keyFile, fingerprint: this.getCertFingerprint() };
    }
    const result = this.generateSelfSigned(hostname);
    if (result.ok) {
      result.fingerprint = this.getCertFingerprint();
    }
    return result;
  }

  /**
   * 读取证书和密钥
   */
  loadCredentials() {
    try {
      return {
        cert: fs.readFileSync(this.certFile),
        key: fs.readFileSync(this.keyFile),
      };
    } catch {
      return null;
    }
  }
}

module.exports = { CertificateManager };
