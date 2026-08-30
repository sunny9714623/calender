/**
 * 行解析：将一行原始记录（数组或自由文本）转换为日历事件。
 * 依赖 WS.dateutil / WS.aliases；纯函数，可在 Node 中测试。
 */
(function (global) {
  'use strict';

  const D = global.WS ? global.WS.dateutil : require('../util/dateutil.js');

  function cell(record, idx) {
    if (idx < 0 || idx >= record.length) return '';
    const v = record[idx];
    if (v === null || v === undefined) return '';
    return String(v).trim();
  }

  /**
   * 解析表格行。
   * @param record string[] 原始单元格
   * @param mapping {date,weekday,start,end,title,location,owner,description: colIdx|-1}
   * @param opts {refWeekStart: ISO 日期, defaultDuration: 分钟}
   * @returns {ok:boolean, event?:object, errors?:string[], warnings?:string[]}
   */
  function parseRow(record, mapping, opts) {
    const errors = [];
    const warnings = [];
    const o = opts || {};
    const duration = o.defaultDuration || 60;

    const title = cell(record, mapping.title);
    if (!title) errors.push('「事项」不能为空');

    // ---------- 日期 ----------
    const dateText = cell(record, mapping.date);
    const weekdayText = cell(record, mapping.weekday);
    let date = null;
    if (dateText) {
      date = D.parseDate(dateText);
      if (!date) errors.push('日期无法解析: "' + dateText + '"');
    } else if (weekdayText) {
      const wd = D.parseWeekday(weekdayText);
      if (wd === null) {
        errors.push('缺少日期，且星期无法解析: "' + weekdayText + '"');
      } else {
        if (o.refWeekStart) {
          date = D.addDays(o.refWeekStart, wd);
        } else {
          errors.push('缺少日期，且无法确定参考周');
        }
      }
    } else {
      errors.push('缺少日期');
    }

    // 星期校验（有日期也有星期时）
    if (date && weekdayText) {
      const wd = D.parseWeekday(weekdayText);
      if (wd !== null && D.weekdayFromDate(date) !== wd) {
        warnings.push('星期「' + weekdayText + '」与日期 ' + date + ' 不一致，已按日期为准');
      }
    }

    // ---------- 时间 ----------
    const startText = cell(record, mapping.start);
    const endText = cell(record, mapping.end);
    let startMin = startText ? D.parseTime(startText) : null;
    let endMin = endText ? D.parseTime(endText) : null;
    if (startText && startMin === null) errors.push('开始时间无法解析: "' + startText + '"');
    if (endText && endMin === null) errors.push('结束时间无法解析: "' + endText + '"');
    if (startText && !endText) endMin = startMin !== null ? startMin + duration : null;
    if (!startText && endText) {
      if (endMin !== null) {
        startMin = endMin - duration;
        warnings.push('缺少开始时间，已按结束时间 - ' + duration + ' 分钟推算');
      } else {
        errors.push('缺少开始时间');
      }
    }
    if (startMin !== null && endMin !== null && endMin < startMin) {
      warnings.push('结束时间早于开始时间，判定为跨天事件');
    } else if (startMin !== null && endMin !== null && endMin === startMin) {
      endMin += duration;
      warnings.push('结束时间等于开始时间，已按 ' + duration + ' 分钟时长处理');
    }
    if (startMin !== null && (startMin < 0 || startMin >= 1440)) errors.push('开始时间超出范围');
    if (endMin !== null && (endMin < 0 || endMin > 2880)) errors.push('结束时间超出范围');

    const allDay = startMin === null && endMin === null;
    const crossDay = !allDay && startMin !== null && endMin !== null && endMin < startMin;

    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, raw: record.slice() };
    }

    const event = {
      date: date,
      startTime: allDay ? '' : D.formatMinutes(startMin),
      endTime: allDay ? '' : D.formatMinutes(endMin),
      allDay: allDay,
      title: title,
      location: cell(record, mapping.location),
      owner: cell(record, mapping.owner),
      description: cell(record, mapping.description)
    };
    if (crossDay) {
      event.crossDay = true;
      event.endDate = D.addDays(date, 1);
    }
    return { ok: true, event: event, warnings: warnings, raw: record.slice() };
  }

  /**
   * 解析自由文本行（docx 纯段落 / txt 无表头）。
   * 形如：2026-08-31 周一 09:00-10:30 部门周例会 @3F会议室 负责人:张三
   */
  function parseFreeTextLine(line, opts) {
    const o = opts || {};
    const errors = [];
    const warnings = [];
    let text = String(line || '').trim();
    if (!text) return { ok: false, errors: ['空行'], raw: [] };

    // 提取负责人
    let owner = '';
    const ownerMatch = text.match(/负责人\s*[:：]\s*([^\s，,;；]+)/);
    if (ownerMatch) {
      owner = ownerMatch[1];
      text = text.replace(/负责人\s*[:：]\s*[^\s，,;；]+/, ' ').trim();
    }

    // 提取地点 @xxx
    let location = '';
    const locMatch = text.match(/@\s*([^\s，,;；]+)/);
    if (locMatch) {
      location = locMatch[1];
      text = text.replace(/@\s*[^\s，,;；]+/, ' ').trim();
    }

    // 提取日期与星期
    const dateMatch = text.match(
      /(?:^|\s)((?:\d{4}\s*[年./-]\s*\d{1,2}\s*[月./-]\s*\d{1,2}\s*日?)|(?:\d{1,2}\s*月\s*\d{1,2}\s*日?)|(?:\d{1,2}\s*[./-]\s*\d{1,2}))(?=\s|$)/
    );
    let date = null;
    let dateText = '';
    if (dateMatch) {
      dateText = dateMatch[1];
      date = D.parseDate(dateText);
      if (!date) errors.push('日期无法解析: "' + dateText + '"');
      text = text.replace(dateMatch[0], ' ').trim();
    }
    const wdMatch = text.match(/(?:周|星期|礼拜)\s*[一二三四五六日天]/);
    let weekdayText = '';
    if (wdMatch) {
      weekdayText = wdMatch[0];
      text = text.replace(wdMatch[0], ' ').trim();
    }
    if (!date) {
      const wd = D.parseWeekday(weekdayText);
      if (wd === null) {
        errors.push('缺少日期');
      } else if (o.refWeekStart) {
        date = D.addDays(o.refWeekStart, wd);
      } else {
        errors.push('缺少日期，且无法确定参考周');
      }
    } else if (weekdayText && D.weekdayFromDate(date) !== D.parseWeekday(weekdayText)) {
      warnings.push('星期与日期不一致，已按日期为准');
    }

    // 提取时间区间
    const timeMatch = text.match(/(\d{1,2}[:：.点]\d{0,2})\s*[-~至—]\s*(\d{1,2}[:：.点]\d{0,2})/);
    let startMin = null;
    let endMin = null;
    let timeText = '';
    if (timeMatch) {
      timeText = timeMatch[0];
      startMin = D.parseTime(timeMatch[1]);
      endMin = D.parseTime(timeMatch[2]);
      if (startMin === null) errors.push('开始时间无法解析: "' + timeMatch[1] + '"');
      if (endMin === null) errors.push('结束时间无法解析: "' + timeMatch[2] + '"');
      text = text.replace(timeMatch[0], ' ').trim();
    } else {
      const single = text.match(/(\d{1,2}[:：.点]\d{0,2})\s*[-~至—]\s*(\d{1,2})[:：.点]?\d{0,2}/);
      if (single) {
        startMin = D.parseTime(single[1]);
        endMin = D.parseTime(single[2]);
        text = text.replace(single[0], ' ').trim();
      }
    }
    const duration = o.defaultDuration || 60;
    if (startMin !== null && endMin === null) endMin = startMin + duration;
    if (startMin !== null && endMin !== null && endMin < startMin) {
      warnings.push('结束时间早于开始时间，判定为跨天事件');
    } else if (startMin !== null && endMin !== null && endMin === startMin) {
      endMin += duration;
      warnings.push('结束时间等于开始时间，已按 ' + duration + ' 分钟时长处理');
    }
    const allDay = startMin === null && endMin === null;
    const crossDay = !allDay && startMin !== null && endMin !== null && endMin < startMin;

    const title = text.replace(/[，,。.;；\s]+$/, '').trim();
    if (!title) errors.push('「事项」不能为空');

    if (errors.length) {
      return { ok: false, errors: errors, warnings: warnings, raw: [String(line)] };
    }
    const event = {
      date: date,
      startTime: allDay ? '' : D.formatMinutes(startMin),
      endTime: allDay ? '' : D.formatMinutes(endMin),
      allDay: allDay,
      title: title,
      location: location,
      owner: owner,
      description: ''
    };
    if (crossDay) {
      event.crossDay = true;
      event.endDate = D.addDays(date, 1);
    }
    return { ok: true, event: event, warnings: warnings, raw: [String(line)] };
  }

  const rowparser = { parseRow, parseFreeTextLine, cell };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = rowparser;
  } else {
    global.WS = global.WS || {};
    global.WS.rowparser = rowparser;
  }
})(typeof window !== 'undefined' ? window : globalThis);
