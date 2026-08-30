/**
 * 解析编排：将原始记录数组（表格）或文本行数组（段落）转换为解析预览。
 * 依赖 WS.aliases / WS.rowparser。
 */
(function (global) {
  'use strict';

  const AL = global.WS ? global.WS.aliases : require('../util/aliases.js');
  const RP = global.WS ? global.WS.rowparser : require('./rowparser.js');
  const D = global.WS ? global.WS.dateutil : require('../util/dateutil.js');

  // ---------- 周历网格模板（周次 × 周一~周日） ----------
  const GRID_YMD_RE = /(\d{4})\s*[.年/-]\s*(\d{1,2})\s*[.月/-]\s*(\d{1,2})/;
  const GRID_MD_RE = /(^|\D)(\d{1,2})\s*[.月/]\s*(\d{1,2})(?=\D|$)/;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function isoDate(y, m, d) {
    const s = y + '-' + pad2(m) + '-' + pad2(d);
    return D.parseISODate(s) ? s : null;
  }

  /** 识别周历网格表头：首列周次，其后 7 列依次为周一~周日 */
  function isWeekGridHeader(row) {
    if (!Array.isArray(row) || row.length < 8) return false;
    const first = String(row[0] == null ? '' : row[0]).replace(/\s+/g, '');
    if (!/^(周次|周数|周|週次|週数|週)$/.test(first)) return false;
    const cols = row.slice(1, 8);
    return cols.every((c, i) => D.parseWeekday(c) === i);
  }

  /**
   * 解析单个周历网格格（如 "8.31报到" / "5休" / "2027.1.1元旦假" / "2"）。
   * colIdx: 0=周一 … 6=周日
   */
  function parseGridCell(cell, colIdx, ctx) {
    const errors = [];
    let date = null;
    let text = String(cell || '').trim();
    if (!text) return { ok: true, skip: true, event: null };

    const mY = text.match(GRID_YMD_RE);
    if (mY) {
      date = isoDate(Number(mY[1]), Number(mY[2]), Number(mY[3]));
      if (!date) errors.push('日期无法解析: "' + mY[0] + '"');
      text = text.replace(mY[0], ' ').trim();
    } else {
      const mM = text.match(GRID_MD_RE);
      if (mM) {
        const mon = Number(mM[2]);
        const day = Number(mM[3]);
        let year = [ctx.semesterYear, ctx.semesterYear + 1].find(y => {
          const d = isoDate(y, mon, day);
          return d && D.weekdayFromDate(d) === colIdx;
        });
        if (year === undefined) year = ctx.semesterYear;
        date = isoDate(year, mon, day);
        if (!date) errors.push('日期无法解析: "' + mM[0] + '"');
        text = text.replace(mM[0], ' ').trim();
      }
    }

    if (!date && ctx.weekStart) date = D.addDays(ctx.weekStart, colIdx);
    if (!date) errors.push('无法推算该格日期');

    // 去除行首的纯日期数字（如 "5休" -> "休"、"10班" -> "班"）
    text = text.replace(/^\s*\d{1,2}\s*/, '').replace(/[，,。.;；\s]+$/, '').trim();

    if (errors.length) {
      return { ok: false, skip: false, errors, event: null };
    }
    if (!text) {
      // 只有日期标记（如 "2"、"12.1"），非事件，跳过
      return { ok: true, skip: true, event: null };
    }
    return {
      ok: true,
      skip: false,
      event: {
        date,
        allDay: true,
        title: text,
        location: '',
        owner: '',
        description: ctx.weekLabel || ''
      }
    };
  }

  /** 周历网格 -> 解析预览（每个非空事件格生成一行） */
  function buildWeekGridPreview(cleanRows, opts) {
    const o = opts || {};
    const dataRows = cleanRows.slice(1);
    const rowWeek = new Map(); // data idx -> 该周周一
    let semesterStart = null;
    let anchorIdx = null;

    // 第一遍：YYYY.M.D 绝对日期锚点
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      for (let c = 1; c <= 7; c++) {
        const m = String(row[c] == null ? '' : row[c]).match(GRID_YMD_RE);
        if (!m) continue;
        const d = isoDate(Number(m[1]), Number(m[2]), Number(m[3]));
        if (d && D.weekdayFromDate(d) === c - 1) {
          rowWeek.set(i, D.getWeekStart(d));
          break;
        }
      }
      if (rowWeek.has(i) && anchorIdx === null) anchorIdx = i;
    }
    if (anchorIdx !== null) {
      semesterStart = D.addDays(rowWeek.get(anchorIdx), -7 * anchorIdx);
    }

    const baseYear = semesterStart
      ? Number(semesterStart.slice(0, 4))
      : inferGridYear(dataRows, o.gridBaseYear || (new Date().getMonth() >= 7 ? new Date().getFullYear() : new Date().getFullYear() - 1));

    // 第二遍：M.D 日期按列星期匹配推算
    for (let i = 0; i < dataRows.length; i++) {
      if (rowWeek.has(i)) continue;
      const row = dataRows[i];
      for (let c = 1; c <= 7; c++) {
        const mM = String(row[c] == null ? '' : row[c]).match(GRID_MD_RE);
        if (!mM) continue;
        const mon = Number(mM[2]);
        const day = Number(mM[3]);
        const hit = [baseYear, baseYear + 1].find(y => {
          const d = isoDate(y, mon, day);
          return d && D.weekdayFromDate(d) === c - 1;
        });
        const d = isoDate(hit !== undefined ? hit : baseYear, mon, day);
        if (d) {
          rowWeek.set(i, D.getWeekStart(d));
          break;
        }
      }
    }

    // 第三遍：缺失周按最近的已知周顺延补齐（支持行不连续）
    const knownIdx = [];
    for (let i = 0; i < dataRows.length; i++) {
      if (rowWeek.has(i)) knownIdx.push(i);
    }
    if (knownIdx.length) {
      for (let i = 0; i < dataRows.length; i++) {
        if (rowWeek.has(i)) continue;
        let best = knownIdx[0];
        let bestDist = Math.abs(best - i);
        for (const k of knownIdx) {
          const dist = Math.abs(k - i);
          if (dist < bestDist) {
            bestDist = dist;
            best = k;
          }
        }
        rowWeek.set(i, D.addDays(rowWeek.get(best), 7 * (i - best)));
      }
    }

    const rows = [];
    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNo = i + 2;
      const weekLabel = String(row[0] == null ? '' : row[0]).trim() || ('第' + (i + 1) + '周');
      const weekStart = rowWeek.get(i) || null;
      const ctx = {
        weekStart,
        weekLabel,
        semesterYear: semesterStart ? Number(semesterStart.slice(0, 4)) : baseYear
      };
      for (let c = 1; c <= 7; c++) {
        const cell = String(row[c] == null ? '' : row[c]).trim();
        if (!cell) continue;
        const res = parseGridCell(cell, c - 1, ctx);
        if (res.skip) continue;
        rows.push({
          rowNo,
          col: c,
          raw: [weekLabel, cell],
          status: res.ok ? 'ok' : 'error',
          errors: res.errors || [],
          warnings: res.warnings || [],
          event: res.event || null
        });
      }
    }

    return {
      kind: 'weekgrid',
      columns: ['周次', '日期', '事项'],
      headerIndex: 0,
      mapping: null,
      semesterStart,
      gridRowCount: dataRows.length,
      rows
    };
  }

  /**
   * 无绝对日期锚点时，用 M.D 日期与所在列的星期匹配做多数投票推断年份。
   * 例如 8.31 在「周一」列 → 只有 2026 年匹配（2027-08-31 是周二）。
   */
  function inferGridYear(dataRows, fallbackYear) {
    const votes = new Map();
    for (const row of dataRows) {
      for (let c = 1; c <= 7; c++) {
        const mM = String(row[c] == null ? '' : row[c]).match(GRID_MD_RE);
        if (!mM) continue;
        const mon = Number(mM[2]);
        const day = Number(mM[3]);
        for (let y = fallbackYear - 1; y <= fallbackYear + 1; y++) {
          const d = isoDate(y, mon, day);
          if (d && D.weekdayFromDate(d) === c - 1) {
            votes.set(y, (votes.get(y) || 0) + 1);
          }
        }
      }
    }
    let best = fallbackYear;
    let bestN = -1;
    for (const [y, n] of votes) {
      if (n > bestN) {
        bestN = n;
        best = y;
      }
    }
    return best;
  }

  /** 清理空行 */
  function cleanRecords(records) {
    return records
      .filter(row => Array.isArray(row))
      .map(row => row.map(c => (c === null || c === undefined ? '' : String(c).trim())))
      .filter(row => row.some(c => c !== ''));
  }

  /**
   * 表格数据 -> 解析预览
   * @param records string[][]
   * @param opts {refWeekStart, defaultDuration}
   * @returns {kind:'table', columns, headerIndex, mapping, rows}
   *   rows: [{rowNo, raw, status, errors?, warnings?, event?}]
   */
  function buildTablePreview(records, opts) {
    const o = opts || {};
    const clean = cleanRecords(records);
    if (!clean.length) {
      return { kind: 'table', columns: [], headerIndex: -1, mapping: null, rows: [], empty: true };
    }
    // 周历网格模板（周次 × 周一~周日）
    if (isWeekGridHeader(clean[0])) {
      return buildWeekGridPreview(clean, o);
    }

    // 找表头：第一个命中 >=2 个别名的行
    let headerIndex = clean.findIndex(r => AL.isHeaderRow(r, 2));
    let columns, dataRows;
    if (headerIndex === -1) {
      headerIndex = 0;
      columns = AL.genericColumns(clean[0].length);
      dataRows = clean;
    } else {
      columns = clean[headerIndex].map((c, i) => (c === '' ? '列' + (i + 1) : c));
      dataRows = clean.slice(headerIndex + 1);
    }

    const { mapping } = AL.detectColumns(columns);
    const rows = dataRows.map((record, i) => {
      const res = RP.parseRow(record, mapping, o);
      return {
        rowNo: headerIndex + i + 2, // 人类可读行号（1-based，含表头）
        raw: record,
        status: res.ok ? 'ok' : 'error',
        errors: res.errors || [],
        warnings: res.warnings || [],
        event: res.event || null
      };
    });
    return { kind: 'table', columns, headerIndex, mapping, rows, empty: false };
  }

  /** 文本行 -> 解析预览 */
  function buildParagraphPreview(lines, opts) {
    const o = opts || {};
    const clean = lines.map(l => String(l || '').replace(/\s+$/, '')).filter(l => l.trim() !== '');
    const rows = clean.map((line, i) => {
      const res = RP.parseFreeTextLine(line, o);
      return {
        rowNo: i + 1,
        raw: [line],
        status: res.ok ? 'ok' : 'error',
        errors: res.errors || [],
        warnings: res.warnings || [],
        event: res.event || null
      };
    });
    return { kind: 'paragraphs', columns: null, headerIndex: -1, mapping: null, rows, empty: rows.length === 0 };
  }

  /** 确定参考周：优先取第一个可解析日期所在周的周一，否则本周 */
  function resolveRefWeek(records, today) {
    const dateutil = global.WS ? global.WS.dateutil : require('../util/dateutil.js');
    for (const r of records) {
      for (const cell of r) {
        const d = dateutil.parseDate(cell);
        if (d) return dateutil.getWeekStart(d);
      }
    }
    return dateutil.getWeekStart(today || dateutil.todayISO());
  }

  const parser = {
    cleanRecords,
    buildTablePreview,
    buildParagraphPreview,
    resolveRefWeek,
    isWeekGridHeader,
    buildWeekGridPreview,
    parseGridCell,
    inferGridYear
  };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = parser;
  } else {
    global.WS = global.WS || {};
    global.WS.parser = parser;
  }
})(typeof window !== 'undefined' ? window : globalThis);
