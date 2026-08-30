/**
 * 生成手机离线单文件版：把 CSS 与全部 JS（含依赖库）内联进一个 HTML。
 * 产物：dist/周行事例批注台-手机版.html（及 dist/index-offline.html）
 * 运行：node scripts/build-offline.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'dist');
fs.mkdirSync(OUT, { recursive: true });

let html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

// 内联 CSS
html = html.replace(/<link rel="stylesheet" href="([^"]+)">/, (m, href) => {
  const p = path.join(ROOT, href.split('?')[0]);
  return '<style>\n' + fs.readFileSync(p, 'utf8') + '\n</style>';
});

// 内联全部本地脚本（保持顺序）；外部地址跳过
html = html.replace(/<script src="([^"]+)"><\/script>/g, (m, src) => {
  if (/^https?:/.test(src)) return m;
  const p = path.join(ROOT, src.split('?')[0]);
  if (!fs.existsSync(p)) {
    console.warn('跳过缺失文件: ' + src);
    return m;
  }
  return '<script>\n' + fs.readFileSync(p, 'utf8') + '\n</script>';
});

// 移除 PWA 外链与 Service Worker 注册（离线单文件不需要）
html = html.replace(/<link rel="manifest"[^>]*>\s*/g, '');
html = html.replace(/<link rel="apple-touch-icon"[^>]*>\s*/g, '');
html = html.replace(/<meta name="theme-color"[^>]*>\s*/g, '');
html = html.replace(/<script>\s*if \('serviceWorker' in navigator\)[\s\S]*?<\/script>\s*/g, '');

html = html.replace('<title>周行事例批注台</title>', '<title>周行事例批注台（手机离线版）</title>');

const cnFile = path.join(OUT, '周行事例批注台-手机版.html');
const enFile = path.join(OUT, 'index-offline.html');
fs.writeFileSync(cnFile, html, 'utf8');
fs.writeFileSync(enFile, html, 'utf8');

console.log('已生成（' + (html.length / 1024).toFixed(0) + ' KB）:');
console.log('  ' + cnFile);
console.log('  ' + enFile);
