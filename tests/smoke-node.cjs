/**
 * 端到端冒烟测试：用真实示例文件走核心解析管线（Node 侧）。
 * 覆盖 xlsx / csv / txt 三种形态；docx 因依赖浏览器 DOM，另行用 ZIP/XML 校验。
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');
const Papa = require('../vendor/papaparse.min.js');
const mammoth = require('../vendor/mammoth.browser.min.js');
const PARSER = require('../js/core/parser.js');
const D = require('../js/util/dateutil.js');
const AL = require('../js/util/aliases.js');

let failed = 0;
function check(cond, msg) {
  if (!cond) {
    failed++;
    console.error('  ✗ ' + msg);
  } else {
    console.log('  ✓ ' + msg);
  }
}

const samples = path.join(__dirname, '..', 'samples');
const refWeek = D.getWeekStart('2026-08-31');
const opts = { refWeekStart: refWeek, defaultDuration: 60 };

// ---------- xlsx ----------
console.log('[xlsx] sample-weekly.xlsx');
const xlsxBuf = fs.readFileSync(path.join(samples, 'sample-weekly.xlsx'));
const wb = XLSX.read(xlsxBuf, { type: 'buffer' });
const sheet = wb.Sheets[wb.SheetNames[0]];
const records = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
const px = PARSER.buildTablePreview(records, opts);
check(px.columns[0] === '日期', '表头识别正确');
check(px.rows.length === 8, '8 行数据 (' + px.rows.length + ')');
check(px.rows.every(r => r.status === 'ok'), '全部解析成功');
check(px.rows[6].event.crossDay === true, '跨天事件识别 (发布窗口)');

// ---------- csv ----------
console.log('[csv] sample-weekly.csv');
const csvText = fs.readFileSync(path.join(samples, 'sample-weekly.csv'), 'utf8').replace(/^\uFEFF/, '');
const csvRes = Papa.parse(csvText, { skipEmptyLines: 'greedy' });
const pc = PARSER.buildTablePreview(csvRes.data, opts);
check(pc.rows.length === 8 && pc.rows.every(r => r.status === 'ok'), 'CSV 全部解析成功');

console.log('[csv] sample-with-errors.csv');
const badText = fs.readFileSync(path.join(samples, 'sample-with-errors.csv'), 'utf8').replace(/^\uFEFF/, '');
const badRes = Papa.parse(badText, { skipEmptyLines: 'greedy' });
const pb = PARSER.buildTablePreview(badRes.data, opts);
check(pb.rows.filter(r => r.status === 'ok').length === 1, '错误文件仅 1 行可导入');
check(pb.rows.filter(r => r.status === 'error').length === 3, '3 行错误');

// ---------- txt（自由文本段落） ----------
console.log('[txt] sample-text-weekly.txt');
const txt = fs.readFileSync(path.join(samples, 'sample-text-weekly.txt'), 'utf8');
const lines = txt.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const first = lines[0];
const delim = first.includes('\t') ? '\t' : (first.includes(',') ? ',' : /\s+/);
const isTable = AL.isHeaderRow(first.split(delim), 2);
check(!isTable, '判定为段落形态');
const pp = PARSER.buildParagraphPreview(lines, opts);
check(pp.rows.length === 6 && pp.rows.every(r => r.status === 'ok'), '段落全部解析成功 (' + pp.rows.length + ' 行)');
check(pp.rows[0].event.title === '部门周例会', '段落标题解析');
check(pp.rows[2].event.date === '2026-09-01', 'M-D 日期推断（09-01）');

// ---------- docx：真实周历网格文件（无 DOM，用正则提取表格单元格文本） ----------
console.log('[docx] 2026年下学期周行事历.docx（周历网格）');
const docxBuf = fs.readFileSync(path.join(__dirname, 'fixtures', '2026年下学期周行事历.docx'));
(async () => {
  const html = await mammoth.convertToHtml({ arrayBuffer: docxBuf.buffer.slice(docxBuf.byteOffset, docxBuf.byteOffset + docxBuf.byteLength) });
  const tbl = html.value.match(/<table>([\s\S]*?)<\/table>/);
  check(!!tbl, 'docx 含表格');
  const rows = [...tbl[1].matchAll(/<tr>([\s\S]*?)<\/tr>/g)].map(m =>
    [...m[1].matchAll(/<td>([\s\S]*?)<\/td>/g)].map(c => c[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim())
  );
  check(rows.length >= 20, '网格数据行充足（' + rows.length + '）');
  const gp = PARSER.buildTablePreview(rows, { defaultDuration: 60 });
  check(gp.kind === 'weekgrid', '识别为周历网格模板');
  check(gp.semesterStart === '2026-08-31', '开学首周推算 2026-08-31（实际 ' + gp.semesterStart + '）');
  check(gp.rows.filter(r => r.status === 'ok').length === 57, '解析出 57 条事件（实际 ' + gp.rows.filter(r => r.status === 'ok').length + '）');
  check(gp.rows.filter(r => r.status === 'error').length === 0, '0 条错误');
  const find = (t, d) => gp.rows.find(r => r.event && r.event.title === t && r.event.date === d);
  check(!!find('报到', '2026-08-31'), '8.31报到');
  check(!!find('元旦假', '2027-01-01'), '2027.1.1元旦假');
  check(!!find('期中考', '2026-11-12'), '11.12期中考');
  check(!!find('中秋假', '2026-09-25'), '9.25中秋假');
  console.log(failed ? '冒烟测试失败: ' + failed : '冒烟测试全部通过');
  process.exit(failed ? 1 : 0);
})().catch(e => {
  console.error('  ✗ 异常: ' + e.message);
  process.exit(1);
});
