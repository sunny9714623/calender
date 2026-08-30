/**
 * 生成示例文件：标准表格 CSV / XLSX、自由文本 TXT、含错误行 CSV。
 * 运行：node scripts/generate-samples.cjs
 */
'use strict';

const fs = require('fs');
const path = require('path');
const XLSX = require('../vendor/xlsx.full.min.js');

const samplesDir = path.join(__dirname, '..', 'samples');
fs.mkdirSync(samplesDir, { recursive: true });

const HEADER = ['日期', '星期', '开始时间', '结束时间', '事项', '地点', '负责人', '备注'];
const ROWS = [
  ['2026-08-31', '周一', '09:00', '10:30', '部门周例会', '3F会议室', '张三', '带电脑'],
  ['2026-08-31', '周一', '14:00', '15:30', '客户拜访', '客户公司', '李四', ''],
  ['2026-09-01', '周二', '', '', '全天培训', '大教室', '王五', ''],
  ['2026-09-02', '周三', '10:00', '11:00', '产品评审', '线上会议', '张三、李四', ''],
  ['2026-09-03', '周四', '', '', '项目周报提交', '', '全员', '下班前'],
  ['2026-09-04', '周五', '09:00', '12:00', '季度目标对齐', '1F报告厅', '管理层', ''],
  ['2026-09-05', '周六', '22:00', '02:00', '系统发布窗口', '运维室', '赵六', '跨天事件'],
  ['2026-09-06', '周日', '', '', '休息', '', '', '']
];

// ---------- CSV ----------
const csvLines = [HEADER.join(',')].concat(ROWS.map(r => r.join(',')));
fs.writeFileSync(path.join(samplesDir, 'sample-weekly.csv'), '\uFEFF' + csvLines.join('\r\n'), 'utf8');

// ---------- XLSX ----------
const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet([HEADER].concat(ROWS));
ws['!cols'] = [{ wch: 12 }, { wch: 6 }, { wch: 9 }, { wch: 9 }, { wch: 18 }, { wch: 12 }, { wch: 14 }, { wch: 10 }];
XLSX.utils.book_append_sheet(wb, ws, '周行事例');
const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
fs.writeFileSync(path.join(samplesDir, 'sample-weekly.xlsx'), buf);

// ---------- 自由文本 TXT ----------
const txt = [
  '2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三',
  '2026-08-31 周一 14:00-15:30 客户拜访 @客户公司 负责人:李四',
  '09-01 周二 全天培训 @大教室 负责人:王五',
  '2026-09-02 周三 10:00-11:00 产品评审 @线上会议',
  '2026-09-04 周五 09:00-12:00 季度目标对齐 @1F报告厅 负责人:管理层',
  '2026-09-05 周六 22:00-02:00 系统发布窗口 @运维室 负责人:赵六'
].join('\r\n');
fs.writeFileSync(path.join(samplesDir, 'sample-text-weekly.txt'), txt, 'utf8');

// ---------- 含错误行 CSV（演示解析失败与修正） ----------
const badCsv = [
  HEADER.join(','),
  ['2026-08-31', '周一', '09:00', '10:30', '正常事件', '会议室', '张三', ''].join(','),
  ['2026-13-40', '周一', '', '', '非法日期', '', '', ''].join(','),
  ['2026-09-01', '周二', '25:00', '', '非法时间', '', '', ''].join(','),
  ['2026-09-02', '周三', '', '', '', '', '', ''].join(',')  // 缺事项
].join('\r\n');
fs.writeFileSync(path.join(samplesDir, 'sample-with-errors.csv'), '\uFEFF' + badCsv, 'utf8');

// ---------- 周历网格模板 CSV ----------
const gridCsv = [
  ['周次', '周一', '周二', '周三', '周四', '周五', '周六', '周日'].join(','),
  ['第1周', '8.31报到', '9.1开课', '2', '3', '4', '5休', '6 休'].join(','),
  ['第2周', '7', '8', '9', '10', '11', '12休', '13 休'].join(','),
  ['第3周', '14', '15', '16', '17', '18', '19休', '20 班'].join(','),
  ['第4周', '21', '22', '23', '24', '25中秋假', '26休', '27 休'].join(',')
].join('\r\n');
fs.writeFileSync(path.join(samplesDir, 'sample-week-grid.csv'), '\uFEFF' + gridCsv, 'utf8');

console.log('示例文件已生成到 samples/');
