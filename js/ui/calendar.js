/**
 * 日历视图：月（默认）/ 周 / 日。
 * 格子展示事件、备注角标、冲突提示；点击日期回调选中。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const { escAttr, escHtml } = global.WS.eventform;

  // 批注序号配色（按序号循环取色，保证相邻序号颜色不同）
  const ANNO_COLORS = [
    '#0F766E', '#B45309', '#B0312A', '#2563EB', '#7C3AED',
    '#D97706', '#DB2777', '#059669', '#64748B', '#C026D3'
  ];

  // 批注优先级排序：P0 -> P1 -> P2 -> 未设置
  const PRIORITY_ORDER = { P0: 0, P1: 1, P2: 2 };

  const EVENT_MAX_VISIBLE = 3;
  const ANN_MAX_VISIBLE = 3;

  function sortEvents(events) {
    return events.slice().sort((a, b) => {
      if (a.allDay !== b.allDay) return a.allDay ? -1 : 1;
      return (a.startTime || '99:99') < (b.startTime || '99:99') ? -1 : 1;
    });
  }

  function eventChipHtml(ev, selectedDate) {
    const time = ev.allDay
      ? '全天'
      : ev.startTime + '–' + ev.endTime;
    const cross = ev.crossDay
      ? (ev.date === selectedDate ? '<i class="cross-mark" title="跨天事件">⟶</i>' : '<i class="cross-mark" title="跨天续">↩</i>')
      : '';
    return `<span class="cal-event${ev.allDay ? ' allday' : ''}" title="${escAttr(ev.title + (ev.location ? ' @' + ev.location : ''))}">${cross}${escHtml(time)} ${escHtml(ev.title)}</span>`;
  }

  function annotationBadge(count) {
    return count > 0 ? `<span class="anno-badge" title="${count} 条批注">${count}</span>` : '';
  }

  /** 日历格内的批注行：彩色序号 + 内容（单行省略） */
  function annoLineHtml(an, num) {
    const color = ANNO_COLORS[(num - 1) % ANNO_COLORS.length];
    const content = String(an.content || '');
    const prio = an.priority || '无';
    const prioCls = an.priority ? 'p-' + an.priority.toLowerCase() : 'p-none';
    return `<span class="cal-anno" title="${escAttr('#' + num + ' [' + prio + '] ' + content)}">` +
      `<i class="anno-num" style="color:${color}">${num}</i>` +
      `<i class="anno-prio ${prioCls}">${escHtml(prio)}</i>` +
      `${escHtml(content)}</span>`;
  }

  /** 某日批注：按优先级升序，同级按创建时间倒序 */
  function annotationsOf(store, date) {
    return store.state.annotations
      .filter(a => a.date === date)
      .sort((x, y) => {
        const px = x.priority in PRIORITY_ORDER ? PRIORITY_ORDER[x.priority] : 3;
        const py = y.priority in PRIORITY_ORDER ? PRIORITY_ORDER[y.priority] : 3;
        if (px !== py) return px - py;
        return x.createdAt < y.createdAt ? 1 : -1;
      });
  }

  function renderMonth(container, store, state, conflictDates, annoMap) {
    const [year, month] = state.anchor.split('-').map(Number);
    const weeks = D.monthGrid(year, month);
    const html = [];
    html.push('<div class="cal-weekday-row">' + D.WEEKDAY_TEXT.map(w => '<div class="cal-weekday">周' + w + '</div>').join('') + '</div>');
    html.push('<div class="cal-month-grid">');
    for (const week of weeks) {
      for (const date of week) {
        const inMonth = date.startsWith(year + '-' + String(month).padStart(2, '0'));
        const evs = store.state.events.filter(e => e.date === date || (e.crossDay && e.endDate === date));
        const sorted = sortEvents(evs);
        const annos = annotationsOf(store, date);
        const visibleEvents = sorted.slice(0, EVENT_MAX_VISIBLE);
        const moreEvents = sorted.length - visibleEvents.length;
        const visibleAnnos = annos.slice(0, ANN_MAX_VISIBLE);
        const moreAnnos = annos.length - visibleAnnos.length;
        const moreTotal = moreEvents + moreAnnos;
        const cls = [
          'cal-cell',
          inMonth ? '' : 'other-month',
          date === D.todayISO() ? 'today' : '',
          date === state.selected ? 'selected' : ''
        ].filter(Boolean).join(' ');
        const wd = D.weekdayFromDate(date);
        html.push(`
          <div class="${cls}" data-date="${date}">
            <div class="cal-cell-top">
              <span class="cal-daynum${wd === 0 || wd === 6 ? ' weekend' : ''}">${Number(date.slice(8))}</span>
              ${annotationBadge(annoMap.get(date) || 0)}
              ${conflictDates.has(date) ? '<span class="conflict-dot" title="时段冲突">⚠</span>' : ''}
            </div>
            <div class="cal-events">
              ${visibleEvents.map(e => eventChipHtml(e, date)).join('')}
              ${visibleAnnos.map((a, idx) => annoLineHtml(a, idx + 1)).join('')}
              ${moreTotal > 0 ? `<button type="button" class="cal-more" data-date="${date}">+${moreTotal} 更多</button>` : ''}
            </div>
          </div>`);
      }
    }
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function renderWeek(container, store, state, conflictDates, annoMap) {
    const weekStart = D.getWeekStart(state.anchor);
    const days = [];
    for (let i = 0; i < 7; i++) days.push(D.addDays(weekStart, i));
    const html = ['<div class="cal-week-grid">'];
    for (const date of days) {
      const evs = store.state.events.filter(e => e.date === date || (e.crossDay && e.endDate === date));
      const sorted = sortEvents(evs);
      const allDays = sorted.filter(e => e.allDay);
      const timed = sorted.filter(e => !e.allDay);
      const annos = annotationsOf(store, date);
      const cls = [
        'cal-week-col',
        date === D.todayISO() ? 'today' : '',
        date === state.selected ? 'selected' : ''
      ].join(' ');
      html.push(`
        <div class="${cls}" data-date="${date}">
          <div class="cal-week-col-head">
            <span class="cal-weekday-label">${D.weekdayLabel(date)}</span>
            <span class="cal-daynum${D.weekdayFromDate(date) === 0 || D.weekdayFromDate(date) === 6 ? ' weekend' : ''}">${Number(date.slice(8))}</span>
            ${annotationBadge(annoMap.get(date) || 0)}
            ${conflictDates.has(date) ? '<span class="conflict-dot">⚠</span>' : ''}
          </div>
          <div class="cal-week-all">
            ${allDays.map(e => `<span class="cal-event allday">全天 ${escHtml(e.title)}</span>`).join('') || ''}
          </div>
          <div class="cal-week-events">
            ${timed.map(e => eventChipHtml(e, date)).join('') || '<span class="empty-hint">—</span>'}
          </div>
          ${annos.length ? `<div class="cal-week-annos">${annos.map((a, idx) => annoLineHtml(a, idx + 1)).join('')}</div>` : ''}
        </div>`);
    }
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function renderDay(container, store, state, conflictDates, annoMap) {
    const date = state.anchor;
    const evs = store.state.events.filter(e => e.date === date || (e.crossDay && e.endDate === date));
    const allDays = sortEvents(evs).filter(e => e.allDay);
    const timed = sortEvents(evs).filter(e => !e.allDay);
    const annos = annotationsOf(store, date);
    const PX = 48; // 每小时高度
    const HOURS = 24;
    const html = [];
    html.push('<div class="cal-day-view" data-date="' + date + '">');
    html.push(`<div class="cal-day-all">
      ${allDays.map(e => `<span class="cal-event allday">全天 ${escHtml(e.title)}</span>`).join('') || '<span class="empty-hint">无全天事件</span>'}
    </div>`);
    if (annos.length) {
      html.push(`<div class="cal-day-annos">${annos.map((a, idx) => annoLineHtml(a, idx + 1)).join('')}</div>`);
    }
    html.push('<div class="cal-day-timeline">');
    for (let h = 0; h <= HOURS; h++) {
      html.push(`<div class="cal-hour-row" style="top:${h * PX}px"><span class="cal-hour-label">${String(h).padStart(2, '0')}:00</span></div>`);
    }
    for (const e of timed) {
      const start = toMin(e.startTime);
      let end = toMin(e.endTime);
      const isContinuation = e.crossDay && e.endDate === date;
      const isStart = e.date === date;
      if (isContinuation) {
        // 跨天续：从 00:00 到结束
        html.push(`
          <div class="cal-timeline-event continuation" style="top:0;height:${Math.max(26, end / 60 * PX - 0)}px" title="${escAttr(e.title)}">
            <span>↩ 续 ${escHtml(e.endTime)} ${escHtml(e.title)}</span>
          </div>`);
        continue;
      }
      if (!isStart) continue;
      if (e.crossDay) end = HOURS * 60;
      const top = start / 60 * PX;
      const height = Math.max(26, (end - start) / 60 * PX - 2);
      html.push(`
        <div class="cal-timeline-event" style="top:${top}px;height:${height}px" title="${escAttr(e.title + (e.location ? ' @' + e.location : ''))}">
          <span>${escHtml(e.startTime)}–${escHtml(e.endTime)}${e.crossDay ? ' ⟶' : ''} ${escHtml(e.title)}</span>
        </div>`);
    }
    html.push('</div>');
    html.push('</div>');
    container.innerHTML = html.join('');
  }

  function toMin(hhmm) {
    const [h, m] = String(hhmm || '').split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  function renderCalendar(container, store, state, onSelect) {
    const conflictDates = store.conflictDates();
    const annoMap = new Map();
    for (const a of store.state.annotations) {
      annoMap.set(a.date, (annoMap.get(a.date) || 0) + 1);
    }
    if (state.view === 'week') renderWeek(container, store, state, conflictDates, annoMap);
    else if (state.view === 'day') renderDay(container, store, state, conflictDates, annoMap);
    else renderMonth(container, store, state, conflictDates, annoMap);

    container.querySelectorAll('[data-date]').forEach(el => {
      el.addEventListener('click', e => {
        const date = el.dataset.date;
        if (e.target.closest('.cal-more')) {
          onSelect(date, true);
          return;
        }
        onSelect(date, false);
      });
    });
  }

  global.WS = global.WS || {};
  global.WS.calendar = { renderCalendar };
})(window);
