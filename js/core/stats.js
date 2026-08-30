/**
 * 批注统计（纯函数）：按日 / 周 / 月汇总，按标签、优先级分布，CSV 导出。
 */
(function (global) {
  'use strict';

  const D = global.WS ? global.WS.dateutil : require('../util/dateutil.js');

  /** 切分标签文本：支持逗号、顿号、分号、空格、# 前缀 */
  function splitTags(tagsText) {
    if (!tagsText) return [];
    return String(tagsText)
      .split(/[,，、;；\s#]+/)
      .map(t => t.trim().replace(/^#/, ''))
      .filter(t => t !== '');
  }

  /** 按日计数：date -> count */
  function countByDate(annotations) {
    const map = new Map();
    for (const a of annotations) {
      map.set(a.date, (map.get(a.date) || 0) + 1);
    }
    return map;
  }

  /** 区间内逐日计数（含零日） */
  function dailyCounts(annotations, startISO, endISO) {
    const map = countByDate(annotations);
    return D.dateRange(startISO, endISO).map(date => ({
      date,
      label: D.formatDisplay(date),
      count: map.get(date) || 0
    }));
  }

  /** 周期汇总：period='week'|'month' */
  function periodTotals(annotations, startISO, endISO, period) {
    const days = dailyCounts(annotations, startISO, endISO);
    const groups = new Map();
    for (const item of days) {
      let key, label;
      if (period === 'week') {
        key = D.getWeekStart(item.date);
        const we = D.getWeekRange(key);
        label = D.formatDisplay(key) + '当周(' + key.slice(5).replace('-', '/') + '~' + we.end.slice(5).replace('-', '/') + ')';
      } else {
        key = item.date.slice(0, 7);
        const parts = key.split('-');
        label = parts[0] + '年' + Number(parts[1]) + '月';
      }
      if (!groups.has(key)) groups.set(key, { key, label, count: 0 });
      groups.get(key).count += item.count;
    }
    return Array.from(groups.values());
  }

  /** 标签分布 */
  function byTag(annotations) {
    const map = new Map();
    for (const a of annotations) {
      for (const t of splitTags(a.tags)) {
        map.set(t, (map.get(t) || 0) + 1);
      }
    }
    return Array.from(map.entries())
      .map(([tag, count]) => ({ tag, count }))
      .sort((x, y) => y.count - x.count);
  }

  /** 优先级分布 */
  function byPriority(annotations) {
    const map = { P0: 0, P1: 0, P2: 0, 未设置: 0 };
    for (const a of annotations) {
      const k = a.priority || '未设置';
      map[k] = (map[k] || 0) + 1;
    }
    return Object.keys(map).map(p => ({ priority: p, count: map[p] }));
  }

  /** 某日批注明细（倒序） */
  function annotationsOf(annotations, date) {
    return annotations
      .filter(a => a.date === date)
      .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
  }

  /** 导出 CSV（按日计数 + 明细） */
  function exportCSV(annotations, startISO, endISO) {
    const lines = [];
    lines.push('日期,批注数');
    for (const d of dailyCounts(annotations, startISO, endISO)) {
      lines.push(d.date + ',' + d.count);
    }
    lines.push('');
    lines.push('日期,内容,标签,优先级,作者,创建时间');
    const list = annotations
      .filter(a => a.date >= startISO && a.date <= endISO)
      .sort((x, y) => (x.date === y.date ? (x.createdAt < y.createdAt ? 1 : -1) : x.date < y.date ? -1 : 1));
    for (const a of list) {
      lines.push([
        a.date,
        '"' + String(a.content).replace(/"/g, '""') + '"',
        '"' + (a.tags || '') + '"',
        a.priority || '',
        a.author || '',
        a.createdAt || ''
      ].join(','));
    }
    return '\uFEFF' + lines.join('\r\n');
  }

  const stats = { splitTags, countByDate, dailyCounts, periodTotals, byTag, byPriority, annotationsOf, exportCSV };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = stats;
  } else {
    global.WS = global.WS || {};
    global.WS.stats = stats;
  }
})(typeof window !== 'undefined' ? window : globalThis);
