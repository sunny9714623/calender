/**
 * 表头别名识别：将常见列名归一化为标准字段。
 * 标准字段：date / weekday / start / end / title / location / owner / description
 */
(function (global) {
  'use strict';

  const FIELD_ALIASES = {
    date: ['日期', 'date', '日 期', '日期时间', '时间日期', 'eventdate', 'day'],
    weekday: ['星期', '周几', '星期几', 'weekday', 'week', 'dayofweek'],
    start: ['开始时间', '开始', 'starttime', 'start time', '开始时刻', 'start', '起始时间'],
    end: ['结束时间', '结束', 'endtime', 'end time', '结束时刻', 'end', '截止时间'],
    title: ['事项', '事项名称', '安排', '标题', 'title', '事项内容', '工作事项', '内容', 'name', 'subject'],
    location: ['地点', 'location', '场所', '地址', '位置', 'place', 'where'],
    owner: ['负责人', 'owner', '责任人', '主办人', '经办人', '联系人', 'assignee', 'person'],
    description: ['备注', '说明', '描述', 'description', 'note', '备注说明', '补充', 'remark']
  };

  const FIELD_LABELS = {
    date: '日期', weekday: '星期', start: '开始时间', end: '结束时间',
    title: '事项', location: '地点', owner: '负责人', description: '备注'
  };

  /** 归一化表头文本 */
  function normalizeHeader(text) {
    return String(text == null ? '' : text).trim().toLowerCase().replace(/\s+/g, '');
  }

  /** 识别单个表头对应的标准字段，未识别返回 null */
  function detectField(text) {
    const key = normalizeHeader(text);
    if (!key) return null;
    for (const field of Object.keys(FIELD_ALIASES)) {
      if (FIELD_ALIASES[field].some(a => key === normalizeHeader(a))) return field;
    }
    return null;
  }

  /** 判断一行是否可作为表头（命中 >= minHits 个标准字段） */
  function isHeaderRow(row, minHits) {
    const threshold = minHits || 2;
    let hits = 0;
    for (const cell of row) {
      if (detectField(cell)) hits++;
    }
    return hits >= threshold;
  }

  /**
   * 自动检测列映射：扫描表头数组，返回
   * { date: colIdx|-1, weekday: ..., start, end, title, location, owner, description, columns: [原始列名] }
   */
  function detectColumns(headers) {
    const mapping = { date: -1, weekday: -1, start: -1, end: -1, title: -1, location: -1, owner: -1, description: -1 };
    const columns = headers.map((h, i) => (h == null || String(h).trim() === '' ? '列' + (i + 1) : String(h).trim()));
    columns.forEach((h, i) => {
      const f = detectField(h);
      if (f && mapping[f] === -1) mapping[f] = i;
    });
    return { mapping, columns };
  }

  /** 生成通用列名 */
  function genericColumns(n) {
    const out = [];
    for (let i = 0; i < n; i++) out.push('列' + (i + 1));
    return out;
  }

  const aliases = { FIELD_ALIASES, FIELD_LABELS, normalizeHeader, detectField, isHeaderRow, detectColumns, genericColumns };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = aliases;
  } else {
    global.WS = global.WS || {};
    global.WS.aliases = aliases;
  }
})(typeof window !== 'undefined' ? window : globalThis);
