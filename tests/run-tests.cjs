/**
 * 核心模块单元测试（Node 环境，无 DOM 依赖）
 * 运行：npm test 或 node tests/run-tests.cjs
 */
'use strict';

const path = require('path');
const D = require('../js/util/dateutil.js');
const AL = require('../js/util/aliases.js');
const RP = require('../js/core/rowparser.js');
const PARSER = require('../js/core/parser.js');
const ST = require('../js/core/stats.js');
const STORE = require('../js/core/store.js');

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + msg);
  }
}

function eq(actual, expected, msg) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (ok) {
    passed++;
  } else {
    failed++;
    console.error('  ✗ FAIL: ' + msg);
    console.error('    期望: ' + JSON.stringify(expected));
    console.error('    实际: ' + JSON.stringify(actual));
  }
}

console.log('== dateutil ==');
eq(D.parseDate('2026-08-31'), '2026-08-31', 'parseDate YYYY-MM-DD');
eq(D.parseDate('2026/8/31'), '2026-08-31', 'parseDate YYYY/M/D');
eq(D.parseDate('2026年8月31日'), '2026-08-31', 'parseDate 中文');
eq(D.parseDate('8月31日'), new Date().getFullYear() + '-08-31', 'parseDate M月D日（当年）');
eq(D.parseDate('2026-02-30'), null, '非法日期返回 null');
eq(D.parseTime('09:00'), 540, 'parseTime 09:00');
eq(D.parseTime('9:30'), 570, 'parseTime 9:30');
eq(D.parseTime('9点30分'), 570, 'parseTime 9点30分');
eq(D.parseTime('下午3点'), 15 * 60, 'parseTime 下午3点');
eq(D.parseTime('0930'), 570, 'parseTime 0930');
eq(D.parseTime('3pm'), 15 * 60, 'parseTime 3pm');
eq(D.parseTime('25:00'), null, 'parseTime 非法');
eq(D.formatMinutes(570), '09:30', 'formatMinutes');
eq(D.parseWeekday('周一'), 0, 'parseWeekday 周一');
eq(D.parseWeekday('星期日'), 6, 'parseWeekday 星期日');
eq(D.parseWeekday('周天'), 6, 'parseWeekday 周天');
eq(D.parseWeekday('礼拜五'), 4, 'parseWeekday 礼拜五');
eq(D.weekdayFromDate('2026-08-31'), 0, '2026-08-31 是周一');
eq(D.weekdayLabel('2026-08-31'), '周一', 'weekdayLabel');
eq(D.getWeekStart('2026-08-31'), '2026-08-31', 'getWeekStart 周一');
eq(D.getWeekStart('2026-08-30'), '2026-08-24', 'getWeekStart 周日归上周');
eq(D.addDays('2026-08-31', 1), '2026-09-01', 'addDays 跨月');
eq(D.getWeekRange('2026-09-02').end, '2026-09-06', 'getWeekRange end');
eq(D.monthGrid(2026, 8).length, 6, '2026-08 六周网格');
eq(D.monthGrid(2026, 8)[0][0], '2026-07-27', '2026-08 网格首日（周一）');
eq(D.dateRange('2026-08-31', '2026-09-02'), ['2026-08-31', '2026-09-01', '2026-09-02'], 'dateRange');

console.log('== aliases ==');
eq(AL.detectField('事项名称'), 'title', '别名 事项名称');
eq(AL.detectField('Start Time'), 'start', '别名 Start Time');
eq(AL.detectField('负责人'), 'owner', '别名 负责人');
eq(AL.detectField('完全无关'), null, '未知列 null');
eq(AL.isHeaderRow(['日期', '事项', '地点'], 2), true, 'isHeaderRow');
eq(AL.isHeaderRow(['2026-08-31', '周一', '09:00'], 2), false, '数据行不是表头');
const det = AL.detectColumns(['日期', '星期', '开始时间', '结束时间', '事项', '地点', '负责人', '备注']);
eq(det.mapping, { date: 0, weekday: 1, start: 2, end: 3, title: 4, location: 5, owner: 6, description: 7 }, 'detectColumns 标准表头');

console.log('== rowparser ==');
const map = { date: 0, weekday: 1, start: 2, end: 3, title: 4, location: 5, owner: 6, description: 7 };
let r = RP.parseRow(['2026-08-31', '周一', '09:00', '10:30', '部门周例会', '3F会议室', '张三', '带电脑'], map, { refWeekStart: '2026-08-31' });
eq(r.ok, true, '标准行解析成功');
eq(r.event, {
  date: '2026-08-31', startTime: '09:00', endTime: '10:30', allDay: false,
  title: '部门周例会', location: '3F会议室', owner: '张三', description: '带电脑'
}, '标准行事件字段');

r = RP.parseRow(['', '周一', '', '', '例会', '', '', ''], map, { refWeekStart: '2026-08-31' });
eq(r.ok, true, '缺失日期按星期推断');
eq(r.event.date, '2026-08-31', '推断日期正确');
eq(r.event.allDay, true, '无时间 -> 全天');

r = RP.parseRow(['2026-08-31', '周一', '22:00', '02:00', '跨天事件', '', '', ''], map, {});
eq(r.ok, true, '跨天事件解析成功');
eq(r.event.crossDay, true, 'crossDay 标记');
eq(r.event.endDate, '2026-09-01', 'endDate 次日');

r = RP.parseRow(['2026-13-01', '周一', '', '', '非法日期', '', '', ''], map, {});
eq(r.ok, false, '非法日期失败');
eq(r.errors.some(e => e.includes('日期')), true, '错误原因含日期');

r = RP.parseRow(['2026-08-31', '周二', '', '', '星期不一致', '', '', ''], map, {});
eq(r.ok, true, '星期不一致不阻断');
eq(r.warnings.length > 0, true, '星期不一致有警告');

r = RP.parseRow(['2026-08-31', '周一', '', '', '', '', '', ''], map, {});
eq(r.ok, false, '缺事项失败');

r = RP.parseRow(['2026-08-31', '周一', '09:00', '', '自动补时长', '', '', ''], map, { defaultDuration: 90 });
eq(r.event.endTime, '10:30', '缺结束时间按默认时长补');

const free = RP.parseFreeTextLine('2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三', { refWeekStart: '2026-08-31' });
eq(free.ok, true, '自由文本行解析成功');
eq(free.event.title, '部门周例会', '自由文本标题');
eq(free.event.location, '3F会议室', '自由文本地点');
eq(free.event.owner, '张三', '自由文本负责人');

console.log('== parser ==');
const records = [
  ['日期', '星期', '开始时间', '结束时间', '事项', '地点', '负责人'],
  ['2026-08-31', '周一', '09:00', '10:30', '部门周例会', '3F会议室', '张三'],
  ['2026-09-01', '周二', '', '', '全天培训', '大教室', '李四'],
  ['bad-date', '周三', '', '', '错误行', '', '']
];
const preview = PARSER.buildTablePreview(records, { refWeekStart: '2026-08-31', defaultDuration: 60 });
eq(preview.columns, ['日期', '星期', '开始时间', '结束时间', '事项', '地点', '负责人'], '表头识别');
eq(preview.rows.length, 3, '数据行数');
eq(preview.rows[0].status, 'ok', '首行 ok');
eq(preview.rows[1].status, 'ok', '次行 ok');
eq(preview.rows[1].event.allDay, true, '全天事件');
eq(preview.rows[2].status, 'error', '错误行标记');

const paraPreview = PARSER.buildParagraphPreview([
  '2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三',
  '随便写的一行没有格式'
], { refWeekStart: '2026-08-31' });
eq(paraPreview.rows[0].status, 'ok', '段落格式行 ok');
eq(paraPreview.rows[1].status, 'error', '无格式行 error');

console.log('== parser: 周历网格模板 ==');
const gridHeader = ['周次', '周一', '周二', '周三', '周四', '周五', '周六', '周日'];
eq(PARSER.isWeekGridHeader(gridHeader), true, '周历网格表头识别');
eq(PARSER.isWeekGridHeader(['日期', '星期', '开始时间', '事项']), false, '标准表头不误判');
const gridRecords = [
  gridHeader,
  ['第1周', '8.31报到', '9.1开课', '2', '3', '4', '5休', '6 休'],
  ['第2周', '7', '8', '9', '10', '11', '12休', '13 休'],
  ['第5周', '28', '29', '30', '10.1', '2国庆假', '3国庆假', '4国庆假'],
  ['第18周', '28', '29', '30', '31', '2027.1.1元旦假', '2休', '3 休']
];
const gp = PARSER.buildTablePreview(gridRecords, { defaultDuration: 60 });
eq(gp.kind, 'weekgrid', '网格预览类型');
eq(gp.rows.filter(r => r.status === 'ok').length, 12, '网格事件行数（纯数字格跳过）');
eq(gp.rows.filter(r => r.status === 'error').length, 0, '网格无错误行');
const gFind = (title, date) => gp.rows.find(r => r.event && r.event.title === title && r.event.date === date);
eq(!!gFind('报到', '2026-08-31'), true, '8.31报到 -> 2026-08-31');
eq(!!gFind('开课', '2026-09-01'), true, '9.1开课 -> 2026-09-01');
eq(!!gFind('休', '2026-09-05'), true, '5休 -> 2026-09-05');
eq(!!gFind('国庆假', '2026-10-02'), true, '2国庆假 -> 2026-10-02');
eq(!!gFind('元旦假', '2027-01-01'), true, '2027.1.1元旦假 -> 2027-01-01');
eq(gp.rows.every(r => r.event.allDay === true), true, '网格事件均为全天');
const gcell = PARSER.parseGridCell('25中秋假', 4, { weekStart: '2026-09-21', semesterYear: 2026 });
eq(gcell.event && gcell.event.date, '2026-09-25', '25中秋假 推算周五');
eq(gcell.event.title, '中秋假', '25中秋假 标题');
const gskip = PARSER.parseGridCell('12.1', 1, { weekStart: '2026-11-30', semesterYear: 2026 });
eq(gskip.skip, true, '纯日期标记格跳过');

console.log('== stats ==');
const annos = [
  { date: '2026-08-31', content: 'a', tags: '会议, 重要', priority: 'P0', createdAt: '2026-08-31T01:00:00Z', author: '' },
  { date: '2026-08-31', content: 'b', tags: '会议', priority: 'P1', createdAt: '2026-08-31T02:00:00Z', author: '' },
  { date: '2026-09-01', content: 'c', tags: '跟进', priority: 'P2', createdAt: '2026-09-01T01:00:00Z', author: '' },
  { date: '2026-09-05', content: 'd', tags: '', priority: '', createdAt: '2026-09-05T01:00:00Z', author: '' }
];
const daily = ST.dailyCounts(annos, '2026-08-31', '2026-09-06');
eq(daily.find(d => d.date === '2026-08-31').count, 2, '按日计数 8-31');
eq(daily.find(d => d.date === '2026-09-02').count, 0, '零日补 0');
const weekly = ST.periodTotals(annos, '2026-08-31', '2026-09-06', 'week');
eq(weekly.length, 1, '周分组数（区间同属一周）');
eq(weekly.find(w => w.key === '2026-08-31').count, 4, '该周计数');
const monthly = ST.periodTotals(annos, '2026-08-01', '2026-09-30', 'month');
eq(monthly.find(m => m.key === '2026-08').count, 2, '8月计数');
eq(ST.byTag(annos), [{ tag: '会议', count: 2 }, { tag: '重要', count: 1 }, { tag: '跟进', count: 1 }], '标签分布排序');
eq(ST.byPriority(annos), [
  { priority: 'P0', count: 1 }, { priority: 'P1', count: 1 }, { priority: 'P2', count: 1 }, { priority: '未设置', count: 1 }
], '优先级分布');
eq(ST.annotationsOf(annos, '2026-08-31')[0].content, 'b', '同日倒序');
const csv = ST.exportCSV(annos, '2026-08-31', '2026-09-06');
assert(csv.includes('2026-08-31,2'), 'CSV 含按日计数');
assert(csv.includes('会议, 重要'), 'CSV 含批注明细');

console.log('== store ==');
const store = STORE.createStore();
store.clearAll();
const ev = store.addEvent({ date: '2026-08-31', title: '测试事件', allDay: true });
eq(store.state.events.length, 1, 'addEvent');
store.updateEvent(ev.id, { title: '改后' });
eq(store.state.events[0].title, '改后', 'updateEvent');
const an = store.addAnnotation({ date: '2026-08-31', content: '批注', tags: 'x', priority: 'P1' });
eq(store.state.annotations.length, 1, 'addAnnotation');
store.deleteAnnotation(an.id);
eq(store.state.annotations.length, 0, 'deleteAnnotation');
store.deleteEvent(ev.id);
eq(store.state.events.length, 0, 'deleteEvent');
const json = JSON.parse(store.exportJSON());
eq(Array.isArray(json.events), true, 'exportJSON 结构');

console.log('== stats: 区间口径与删除一致性 ==');
const s2 = STORE.createStore();
s2.clearAll();
for (let i = 0; i < 4; i++) {
  s2.addAnnotation({ date: '2026-08-30', content: '八月批注' + (i + 1), tags: '', priority: 'P1' });
}
const augTotal = ST.periodTotals(s2.state.annotations, '2026-08-01', '2026-08-31', 'month');
eq(augTotal.find(m => m.key === '2026-08').count, 4, '8月区间统计 4 条');
const sepTotal = ST.periodTotals(s2.state.annotations, '2026-09-01', '2026-09-30', 'month');
eq(sepTotal.find(m => m.key === '2026-09').count, 0, '9月区间统计 0 条（不串月）');
s2.state.annotations.slice().forEach(a => s2.deleteAnnotation(a.id));
eq(s2.state.annotations.length, 0, '删除后批注归零');
eq(ST.periodTotals(s2.state.annotations, '2026-08-01', '2026-08-31', 'month').find(m => m.key === '2026-08').count, 0, '删除后 8 月统计归零');
eq(ST.countByDate(s2.state.annotations).size, 0, '删除后计数映射为空');

console.log('\n结果: ' + passed + ' 通过, ' + failed + ' 失败');
process.exit(failed ? 1 : 0);
