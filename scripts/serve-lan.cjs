#!/usr/bin/env node
/**
 * 局域网服务器：手机与电脑同一 Wi-Fi 时，手机浏览器访问电脑 IP 即可使用本工具。
 * 用法：
 *   node scripts/serve-lan.cjs            # 默认端口 8080
 *   PORT=9090 node scripts/serve-lan.cjs  # 自定义端口
 * 或直接双击 scripts/serve-lan.bat
 *
 * 特性：自动打印局域网访问地址、生成访问二维码（/qr.svg）、静态资源 no-store 防缓存。
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const qrcode = require('../vendor/qrcode.js');

const ROOT = path.join(__dirname, '..');
const PORT = Number(process.env.PORT) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.xls': 'application/vnd.ms-excel',
  '.csv': 'text/csv; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json'
};

function lanIPv4() {
  const ifaces = os.networkInterfaces();
  const found = [];
  for (const name of Object.keys(ifaces)) {
    for (const info of ifaces[name] || []) {
      if (info.family === 'IPv4' && !info.internal) found.push(info.address);
    }
  }
  return found;
}

const ips = lanIPv4();
const primary = ips[0] || '127.0.0.1';
const baseUrl = 'http://' + primary + ':' + PORT + '/';

function qrSvg(text) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const cells = qr.getModuleCount();
  const size = 280;
  const cell = size / cells;
  let out = '<svg xmlns="http://www.w3.org/2000/svg" width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">';
  out += '<rect width="100%" height="100%" fill="#fff"/>';
  for (let r = 0; r < cells; r++) {
    for (let c = 0; c < cells; c++) {
      if (qr.isDark(r, c)) {
        out += '<rect x="' + (c * cell) + '" y="' + (r * cell) + '" width="' + (cell + 0.5) + '" height="' + (cell + 0.5) + '" fill="#23272B"/>';
      }
    }
  }
  out += '</svg>';
  return out;
}

const server = http.createServer((req, res) => {
  const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (urlPath === '/qr.svg') {
    res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'no-store' });
    res.end(qrSvg(baseUrl));
    return;
  }
  let filePath = path.normalize(path.join(ROOT, urlPath));
  if (!filePath.startsWith(ROOT)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('==============================================');
  console.log('  周行事例批注台 · 局域网访问已启动');
  console.log('==============================================');
  console.log('');
  console.log('  本机访问:   http://127.0.0.1:' + PORT + '/');
  if (ips.length) {
    console.log('  手机访问(同一 Wi-Fi):');
    ips.forEach(ip => console.log('    http://' + ip + ':' + PORT + '/'));
    console.log('');
    console.log('  用手机摄像头扫描以下地址上的二维码:');
    console.log('    http://' + primary + ':' + PORT + '/qr.svg');
  } else {
    console.log('  未检测到局域网 IP，请确认已连接 Wi-Fi/网线。');
  }
  console.log('');
  console.log('  提示: 手机与电脑需在同一网络；首次启动如弹出防火墙提示请选择「允许访问」。');
  console.log('  按 Ctrl+C 停止服务。');
  console.log('==============================================');
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error('端口 ' + PORT + ' 已被占用，可用 PORT=9090 node scripts/serve-lan.cjs 换端口。');
  } else {
    console.error('服务器启动失败:', err.message);
  }
  process.exit(1);
});
