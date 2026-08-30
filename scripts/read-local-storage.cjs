/**
 * 诊断工具：读取 Chrome/Edge 本地 localStorage 中本应用的数据（只读）。
 * 用途：核对浏览器里真实保存的事件/批注，定位统计与显示不一致问题。
 * 用法：node scripts/read-local-storage.cjs [chrome|edge]
 */
'use strict';

const fs = require('fs');
const path = require('path');

const roots = {
  chrome: path.join(process.env.LOCALAPPDATA, 'Google/Chrome/User Data/Default/Local Storage/leveldb'),
  edge: path.join(process.env.LOCALAPPDATA, 'Microsoft/Edge/User Data/Default/Local Storage/leveldb')
};
const kind = (process.argv[2] || 'chrome').toLowerCase();
const dir = roots[kind];
if (!dir || !fs.existsSync(dir)) {
  console.error('未找到 ' + kind + ' 的 Local Storage 目录');
  process.exit(1);
}

const KEY = Buffer.from('weekly-annotation-desk:v1', 'ascii');
let found = null;
for (const name of fs.readdirSync(dir)) {
  if (!/\.(ldb|log)$/.test(name)) continue;
  let buf;
  try {
    buf = fs.readFileSync(path.join(dir, name));
  } catch (e) {
    continue; // 文件被浏览器占用，跳过
  }
  const ki = buf.indexOf(KEY);
  if (ki < 0) continue;
  let start = -1;
  for (let i = ki + KEY.length; i < buf.length - 3; i++) {
    if (buf[i] === 0x7b && buf[i + 1] === 0 && buf[i + 2] === 0x22 && buf[i + 3] === 0) {
      start = i;
      break;
    }
  }
  if (start < 0) continue;
  let depth = 0;
  let inStr = false;
  let esc = false;
  let end = -1;
  for (let i = start; i < buf.length - 1; i += 2) {
    const c = buf.readUInt16LE(i);
    if (inStr) {
      if (esc) esc = false;
      else if (c === 0x5c) esc = true;
      else if (c === 0x22) inStr = false;
      continue;
    }
    if (c === 0x22) inStr = true;
    else if (c === 0x7b) depth++;
    else if (c === 0x7d) {
      depth--;
      if (depth === 0) {
        end = i + 2;
        break;
      }
    }
  }
  if (end < 0) continue;
  found = JSON.parse(buf.toString('utf16le', start, end));
  break;
}

if (!found) {
  console.error('未找到应用数据（可能从未在本浏览器保存，或浏览器占用日志文件）');
  process.exit(1);
}

console.log('events:', found.events.length, '| annotations:', found.annotations.length, '| files:', found.files.length);
console.log('--- 批注明细 ---');
found.annotations.forEach(a => {
  console.log((a.date || '(无日期)') + ' | P' + (a.priority || '无') + ' | ' + (a.content || '') + ' | ' + (a.createdAt || ''));
});
const ds = found.events.map(e => e.date).filter(Boolean).sort();
if (ds.length) console.log('--- 事件日期范围 ---\n' + ds[0] + ' ~ ' + ds[ds.length - 1] + ' (count=' + ds.length + ')');
