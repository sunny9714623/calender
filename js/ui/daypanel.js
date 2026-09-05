/**
 * 当日面板：事件列表 + 批注 CRUD。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const { showToast, confirmDialog } = global.WS.toast;
  const { openEventForm, escAttr, escHtml } = global.WS.eventform;
  const ST = global.WS.stats;

  /** 左滑删除：滑动露出删除按钮，点击后走既有确认删除流程 */
  function initSwipe(listEl) {
    if (!listEl) return;
    let startX = null;
    let startY = null;
    let wrap = null;
    const contentOf = w => w.querySelector('.event-item, .anno-item');
    const closeAll = () => {
      listEl.querySelectorAll('.swipe-wrap.swiped').forEach(w => {
        w.classList.remove('swiped');
        contentOf(w).style.transform = '';
      });
    };
    listEl.addEventListener('pointerdown', e => {
      closeAll();
      const w = e.target.closest('.swipe-wrap');
      if (!w || e.target.closest('.swipe-del')) return;
      startX = e.clientX;
      startY = e.clientY;
      wrap = w;
      try { w.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
    });
    listEl.addEventListener('pointermove', e => {
      if (!wrap || startX === null) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 8 && Math.abs(dx) > Math.abs(dy)) {
        e.preventDefault();
        contentOf(wrap).style.transform = 'translateX(' + Math.max(-88, Math.min(0, dx)) + 'px)';
      }
    });
    const end = e => {
      if (!wrap || startX === null) return;
      const dx = e.clientX - startX;
      const content = contentOf(wrap);
      if (dx < -45) {
        wrap.classList.add('swiped');
        content.style.transform = 'translateX(-88px)';
      } else {
        wrap.classList.remove('swiped');
        content.style.transform = '';
      }
      wrap = null;
      startX = startY = null;
    };
    listEl.addEventListener('pointerup', end);
    listEl.addEventListener('pointercancel', end);
  }

  function renderDayPanel(container, opts) {
    const { date, store, conflictDates, onClose } = opts;
    const events = store.state.events.filter(e => e.date === date || (e.crossDay && e.endDate === date));
    const annotations = ST.sortByPriority(store.state.annotations.filter(a => a.date === date));
    const hasConflict = conflictDates.has(date);

    container.innerHTML = `
      <div class="day-panel">
        <div class="day-head">
          <div>
            <h2>当日详情</h2>
            <p class="day-date">${escHtml(D.formatTitle(date))}</p>
          </div>
          <button type="button" class="icon-btn day-close" data-act="close-day" title="关闭">✕</button>
        </div>
        <section class="panel-sec">
          <div class="sec-head">
            <h3>今日事件 <span class="count-pill">${events.length}</span></h3>
            ${hasConflict ? '<span class="conflict-tag" title="存在时间重叠的事件">⚠ 时段冲突</span>' : ''}
            <button type="button" class="btn btn-ghost btn-sm" data-act="add-event">+ 添加</button>
          </div>
          <div class="event-list">
            ${events.length ? events.map(e => eventItemHtml(e, date)).join('') : '<p class="empty-hint">该日暂无事件</p>'}
          </div>
        </section>
        <section class="panel-sec">
          <div class="sec-head">
            <h3>批注 <span class="count-pill">${annotations.length}</span></h3>
          </div>
          <form class="anno-form" data-act="anno-add">
            <textarea name="content" rows="2" required maxlength="500" placeholder="记录今天的情况 / 临时补充…（必填）"></textarea>
            <div class="anno-form-row">
              <input type="text" name="tags" placeholder="标签，逗号分隔（可选）" maxlength="60">
              <select name="priority">
                <option value="">优先级</option>
                <option value="P0">P0</option>
                <option value="P1">P1</option>
                <option value="P2">P2</option>
              </select>
              <button type="submit" class="btn btn-primary btn-sm">添加</button>
            </div>
          </form>
          <div class="anno-list">
            ${annotations.length ? annotations.map(a => annoItemHtml(a)).join('') : '<p class="empty-hint">暂无批注，添加一条吧</p>'}
          </div>
        </section>
      </div>
    `;

    // 关闭：右上角按钮 / 点击周边（弹层背景）
    const closeBtn = container.querySelector('[data-act="close-day"]');
    if (closeBtn && onClose) closeBtn.addEventListener('click', onClose);
    if (onClose) container.addEventListener('click', e => {
      if (e.target === container) onClose();
    });

    container.querySelector('[data-act="add-event"]').addEventListener('click', () => {
      openEventForm({
        date,
        onSave: data => {
          const saved = store.addEvent(data);
          if (Array.isArray(saved)) {
            showToast('已添加 ' + saved.length + ' 条事件', 'success');
            jumpToEventDate(saved[0].date);
          } else {
            showToast('事件已添加', 'success');
            jumpToEventDate(saved.date);
          }
        }
      });
    });

    container.querySelector('.event-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      const ev = store.state.events.find(x => x.id === id);
      if (!ev) return;
      if (btn.dataset.act === 'edit-event') {
        openEventForm({
          date,
          event: ev,
          onSave: data => {
            store.updateEvent(id, data);
            showToast('事件已更新', 'success');
            jumpToEventDate(data.date);
          }
        });
      } else if (btn.dataset.act === 'del-event') {
        confirmDialog({
          title: '删除事件',
          message: '确定删除「' + ev.title + '」吗？此操作不可撤销。',
          confirmText: '删除',
          danger: true
        }).then(ok => {
          if (ok) {
            store.deleteEvent(id);
            showToast('事件已删除', 'success');
            global.WS.app.refresh();
          }
        });
      }
    });

    container.querySelector('[data-act="anno-add"]').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget;
      const content = String(f.content.value || '').trim();
      if (!content) {
        showToast('批注内容不能为空', 'error');
        return;
      }
      store.addAnnotation({
        date,
        content,
        tags: String(f.tags.value || '').trim(),
        priority: f.priority.value
      });
      showToast('批注已添加', 'success');
      global.WS.app.refresh();
    });

    container.querySelector('.anno-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-act]');
      if (!btn) return;
      const id = btn.dataset.id;
      const an = store.state.annotations.find(x => x.id === id);
      if (!an) return;
      if (btn.dataset.act === 'edit-anno') {
        startEditAnnotation(container, an);
      } else if (btn.dataset.act === 'del-anno') {
        confirmDialog({
          title: '删除批注',
          message: '确定删除这条批注吗？',
          confirmText: '删除',
          danger: true
        }).then(ok => {
          if (ok) {
            store.deleteAnnotation(id);
            showToast('批注已删除', 'success');
            global.WS.app.refresh();
          }
        });
      }
    });

    initSwipe(container.querySelector('.event-list'));
    initSwipe(container.querySelector('.anno-list'));
  }

  function eventItemHtml(ev, selectedDate) {
    const time = ev.allDay
      ? '<span class="all-day-tag">全天</span>'
      : (escHtml(ev.startTime + '–' + ev.endTime) + (ev.crossDay && ev.endDate === selectedDate ? ' <span class="cross-tag">跨天续</span>' : ''));
    const cont = ev.crossDay && ev.date === selectedDate ? ' <span class="cross-tag">跨天</span>' : '';
    return `
      <div class="swipe-wrap">
        <button type="button" class="swipe-del" data-act="del-event" data-id="${ev.id}">删除</button>
        <div class="event-item${ev.allDay ? ' is-allday' : ''}">
          <div class="event-main">
            <div class="event-time">${time}${cont}</div>
            <div class="event-title">${escHtml(ev.title)}</div>
            <div class="event-meta">
              ${ev.location ? '<span>📍 ' + escHtml(ev.location) + '</span>' : ''}
              ${ev.owner ? '<span>👤 ' + escHtml(ev.owner) + '</span>' : ''}
            </div>
          </div>
          <div class="event-actions">
            <button type="button" class="icon-btn" data-act="edit-event" data-id="${ev.id}" title="编辑">✎</button>
            <button type="button" class="icon-btn danger" data-act="del-event" data-id="${ev.id}" title="删除">🗑</button>
          </div>
        </div>
      </div>`;
  }

  /** 保存事件后，若事件日期与当前选中日期不同，自动跳到事件日期，保证修改结果可见 */
  function jumpToEventDate(eventDate) {
    const app = global.WS.app;
    if (eventDate && eventDate !== app.state.selected) {
      app.state.selected = eventDate;
      app.state.anchor = eventDate;
    }
    app.refresh();
  }

  function annoItemHtml(an) {
    const tags = String(an.tags || '').split(/[,，、;；\s#]+/).filter(Boolean);
    const prio = an.priority ? '<span class="prio-tag prio-' + an.priority.toLowerCase() + '">' + an.priority + '</span>' : '';
    return `
      <div class="swipe-wrap">
        <button type="button" class="swipe-del" data-act="del-anno" data-id="${an.id}">删除</button>
        <div class="anno-item">
          <div class="anno-content">${escHtml(an.content)}</div>
          <div class="anno-meta">
            ${tags.map(t => '<span class="tag">#' + escHtml(t) + '</span>').join('')}
            ${prio}
            <span class="anno-time">${escHtml((an.createdAt || '').replace('T', ' ').slice(0, 16))}</span>
          </div>
          <div class="anno-actions">
            <button type="button" class="icon-btn" data-act="edit-anno" data-id="${an.id}" title="编辑">✎</button>
            <button type="button" class="icon-btn danger" data-act="del-anno" data-id="${an.id}" title="删除">🗑</button>
          </div>
        </div>
      </div>`;
  }

  function startEditAnnotation(container, an) {
    const item = container.querySelector(`.anno-item [data-id="${an.id}"]`).closest('.anno-item');
    const form = document.createElement('form');
    form.className = 'anno-form anno-edit';
    form.innerHTML = `
      <textarea name="content" rows="2" required maxlength="500">${escHtml(an.content)}</textarea>
      <div class="anno-form-row">
        <input type="text" name="tags" value="${escAttr(an.tags || '')}" placeholder="标签，逗号分隔">
        <select name="priority">
          <option value="">优先级</option>
          <option value="P0" ${an.priority === 'P0' ? 'selected' : ''}>P0</option>
          <option value="P1" ${an.priority === 'P1' ? 'selected' : ''}>P1</option>
          <option value="P2" ${an.priority === 'P2' ? 'selected' : ''}>P2</option>
        </select>
        <button type="submit" class="btn btn-primary btn-sm">保存</button>
        <button type="button" class="btn btn-ghost btn-sm" data-act="cancel-edit">取消</button>
      </div>`;
    item.replaceWith(form);
    form.querySelector('[data-act="cancel-edit"]').addEventListener('click', () => {
      global.WS.app.refresh();
    });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const content = String(form.content.value || '').trim();
      if (!content) {
        showToast('批注内容不能为空', 'error');
        return;
      }
      global.WS.app.store.updateAnnotation(an.id, {
        content,
        tags: String(form.tags.value || '').trim(),
        priority: form.priority.value
      });
      showToast('批注已更新', 'success');
      global.WS.app.refresh();
    });
    form.content.focus();
    form.content.setSelectionRange(form.content.value.length, form.content.value.length);
  }

  global.WS = global.WS || {};
  global.WS.daypanel = { renderDayPanel };
})(window);
