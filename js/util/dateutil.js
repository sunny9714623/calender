/**
 * 日期与时间工具（纯函数，无 DOM 依赖）
 * 全局命名空间 WS.dateutil；Node 环境通过 module.exports 导出便于测试。
 */
(function (global) {
  'use strict';

  const WEEKDAY_TEXT = ['一', '二', '三', '四', '五', '六', '日'];
  const WEEKDAY_EN = {
    monday: 0, mon: 0, tuesday: 1, tue: 1, wednesday: 2, wed: 2,
    thursday: 3, thu: 3, friday: 4, fri: 4, saturday: 5, sat: 5, sunday: 6, sun: 6
  };

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** Date -> YYYY-MM-DD（本地时区） */
  function toISODate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  /** 今天 */
  function todayISO() {
    return toISODate(new Date());
  }

  /** ISO 字符串加天数 */
  function addDays(iso, n) {
    const d = parseISODate(iso);
    if (!d) return null;
    d.setDate(d.getDate() + n);
    return toISODate(d);
  }

  /** 解析 YYYY-MM-DD -> Date（本地 00:00），失败返回 null */
  function parseISODate(iso) {
    if (typeof iso !== 'string') return null;
    const m = iso.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (d.getFullYear() !== Number(m[1]) || d.getMonth() !== Number(m[2]) - 1 || d.getDate() !== Number(m[3])) return null;
    return d;
  }

  /** 严格校验年月日组合（防止 JS Date 自动进位） */
  function makeDate(y, m, d) {
    const date = new Date(y, m - 1, d);
    if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
    return date;
  }

  /**
   * 宽松解析常见中文日期写法：
   * 2026-08-31 / 2026/8/31 / 2026.08.31 / 2026年8月31日 / 8月31日 / 08-31
   * 返回 YYYY-MM-DD，失败返回 null。
   */
  function parseDate(text) {
    if (typeof text !== 'string') return null;
    let s = text.trim().replace(/[（(].*?[)）]/g, '');
    if (!s) return null;
    let m = s.match(/(\d{4})\s*[年./-]\s*(\d{1,2})\s*[月./-]\s*(\d{1,2})\s*日?/);
    if (m) {
      const d = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
      return d ? toISODate(d) : null;
    }
    m = s.match(/^(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
    if (m) {
      const now = new Date();
      const d = makeDate(now.getFullYear(), Number(m[1]), Number(m[2]));
      return d ? toISODate(d) : null;
    }
    m = s.match(/^(\d{1,2})\s*[./-]\s*(\d{1,2})\s*$/);
    if (m) {
      // 形如 08-31：按 月-日 处理（首段 <= 12 才接受，避免混淆）
      const mon = Number(m[1]);
      if (mon >= 1 && mon <= 12) {
        const now = new Date();
        const d = makeDate(now.getFullYear(), mon, Number(m[2]));
        return d ? toISODate(d) : null;
      }
      return null;
    }
    return null;
  }

  /**
   * 宽松解析时间文本，返回当日分钟数（0-1439），失败返回 null。
   * 支持 09:00 / 9:00 / 9.30 / 0930 / 9点 / 9点30分 / 上午9点 / 下午3点 / 3pm。
   */
  function parseTime(text) {
    if (typeof text !== 'string') return null;
    let s = text.trim().toLowerCase();
    if (!s) return null;

    let shift = 0; // 12 小时制修正
    if (/下午|晚上|pm/.test(s)) shift = 12;
    else if (/上午|早上|凌晨|am/.test(s)) shift = 0;
    else if (/中午/.test(s)) shift = 0;

    s = s.replace(/[点時时]/g, ':')
         .replace(/分/g, '')
         .replace(/[。．.]/g, ':')
         .replace(/[^0-9:]/g, '');
    if (/^\d{4}$/.test(s)) {
      // 四位数字 0930
      const h = Number(s.slice(0, 2));
      const min = Number(s.slice(2, 4));
      if (h > 23 || min > 59) return null;
      if (shift === 12 && h < 12) return (h + 12) * 60 + min;
      return h * 60 + min;
    }
    let m = s.match(/(\d{1,2})(?::(\d{1,2}))?/);
    if (!m) return null;
    let h = Number(m[1]);
    let min = m[2] !== undefined ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    if (shift === 12 && h < 12) h += 12;
    return h * 60 + min;
  }

  /** 分钟数 -> HH:mm */
  function formatMinutes(minutes) {
    if (minutes === null || minutes === undefined) return '';
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return pad2(h) + ':' + pad2(m);
  }

  /** 解析星期文本，返回 0-6（周一=0，周日=6），失败返回 null */
  function parseWeekday(text) {
    if (typeof text !== 'string') return null;
    const s = text.trim().toLowerCase();
    if (!s) return null;
    for (let i = 0; i < 7; i++) {
      if (s.includes(WEEKDAY_TEXT[i])) return i;
    }
    if (s.includes('日') || s.includes('天') || s.includes('末')) return 6;
    const en = WEEKDAY_EN[s.replace(/[^a-z]/g, '')];
    if (en !== undefined) return en;
    return null;
  }

  /** ISO 日期 -> 星期序号（周一=0） */
  function weekdayFromDate(iso) {
    const d = parseISODate(iso);
    if (!d) return null;
    return (d.getDay() + 6) % 7;
  }

  /** ISO 日期 -> 中文星期 */
  function weekdayLabel(iso) {
    const w = weekdayFromDate(iso);
    return w === null ? '' : '周' + WEEKDAY_TEXT[w];
  }

  /** 所在周的周一（ISO） */
  function getWeekStart(iso) {
    const w = weekdayFromDate(iso);
    if (w === null) return null;
    return addDays(iso, -w);
  }

  /** 所在周范围 {start, end}（周一到周日） */
  function getWeekRange(iso) {
    const start = getWeekStart(iso);
    if (!start) return null;
    return { start: start, end: addDays(start, 6) };
  }

  /**
   * 月视图网格：以周一开头的周列表，每项为 7 个 ISO 日期（含前后月补齐格）。
   * month: 1-12
   */
  function monthGrid(year, month) {
    const first = new Date(year, month - 1, 1);
    const offset = (first.getDay() + 6) % 7; // 周一=0
    const daysInMonth = new Date(year, month, 0).getDate();
    const totalCells = Math.ceil((offset + daysInMonth) / 7) * 7;
    const gridStart = addDays(toISODate(first), -offset);
    const weeks = [];
    for (let i = 0; i < totalCells; i += 7) {
      const week = [];
      for (let j = 0; j < 7; j++) week.push(addDays(gridStart, i + j));
      weeks.push(week);
    }
    return weeks;
  }

  /** 起止日之间的所有日期（含两端） */
  function dateRange(startISO, endISO) {
    const out = [];
    let cur = startISO;
    let guard = 0;
    while (cur <= endISO && guard < 4000) {
      out.push(cur);
      cur = addDays(cur, 1);
      guard++;
    }
    return out;
  }

  /** 显示格式：同一年 "8月31日"，跨年 "2026年8月31日" */
  function formatDisplay(iso) {
    const d = parseISODate(iso);
    if (!d) return iso;
    const now = new Date();
    const base = d.getMonth() + 1 + '月' + d.getDate() + '日';
    return d.getFullYear() === now.getFullYear() ? base : d.getFullYear() + '年' + base;
  }

  /** "2026-08-31 周一" 标题格式 */
  function formatTitle(iso) {
    const d = parseISODate(iso);
    if (!d) return iso;
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日 ' + weekdayLabel(iso);
  }

  /** 月份标签，如 2026年8月 */
  function monthLabel(year, month) {
    return year + '年' + month + '月';
  }

  const dateutil = {
    pad2, toISODate, todayISO, addDays, parseISODate, parseDate, parseTime,
    formatMinutes, parseWeekday, weekdayFromDate, weekdayLabel, getWeekStart,
    getWeekRange, monthGrid, dateRange, formatDisplay, formatTitle, monthLabel,
    WEEKDAY_TEXT
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = dateutil;
  } else {
    global.WS = global.WS || {};
    global.WS.dateutil = dateutil;
  }
})(typeof window !== 'undefined' ? window : globalThis);
