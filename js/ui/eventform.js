/**
 * 事件新增 / 编辑弹窗；新增时支持「按月重复」：选择星期几与多个月份后，
 * 一次生成该月内每周对应星期的事件。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  function monthKey(year, month) {
    return year + '-' + pad2(month);
  }

  function openEventForm(opts) {
    const { date, event, onSave } = opts;
    const isEdit = !!event;
    const baseDate = (event && event.date) || date || D.todayISO();
    const baseYear = Number(baseDate.slice(0, 4)) || new Date().getFullYear();
    let year = baseYear;
    const selectedMonths = new Set();
    const defaultWeekday = D.weekdayFromDate(baseDate);
    const defaultWeekdaySafe = defaultWeekday === null ? 0 : defaultWeekday;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal event-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${isEdit ? '编辑事件' : '新增事件'}</h3>
        <form class="event-form">
          ${isEdit ? `
          <label class="field">
            <span>日期 *</span>
            <input type="date" name="date" required value="${event.date}">
          </label>` : `
          <label class="field" data-role="single-date">
            <span>日期 * <em class="field-tip">选「按月重复」后将按下方规则生成</em></span>
            <input type="date" name="date" required value="${date}">
          </label>
          <label class="field field-check repeat-toggle">
            <input type="checkbox" data-role="repeat-check">
            <span>按月重复：所选月份内每个指定星期都记录</span>
          </label>
          <div class="repeat-box" data-role="repeat-box" hidden>
            <label class="field">
              <span>每周星期几</span>
              <select data-role="repeat-weekday">
                <option value="0"${defaultWeekdaySafe === 0 ? ' selected' : ''}>周一</option>
                <option value="1"${defaultWeekdaySafe === 1 ? ' selected' : ''}>周二</option>
                <option value="2"${defaultWeekdaySafe === 2 ? ' selected' : ''}>周三</option>
                <option value="3"${defaultWeekdaySafe === 3 ? ' selected' : ''}>周四</option>
                <option value="4"${defaultWeekdaySafe === 4 ? ' selected' : ''}>周五</option>
                <option value="5"${defaultWeekdaySafe === 5 ? ' selected' : ''}>周六</option>
                <option value="6"${defaultWeekdaySafe === 6 ? ' selected' : ''}>周日</option>
              </select>
            </label>
            <div class="field">
              <span>选择月份（可多选，支持切换年份）</span>
              <div class="repeat-year-nav">
                <button type="button" class="btn btn-ghost btn-sm" data-role="year-prev" title="上一年">‹</button>
                <b data-role="year-label"></b>
                <button type="button" class="btn btn-ghost btn-sm" data-role="year-next" title="下一年">›</button>
              </div>
              <div class="month-pick" data-role="month-grid"></div>
              <div class="repeat-preview" data-role="repeat-preview">勾选后请选择月份</div>
            </div>
          </div>`}
          <label class="field field-check">
            <input type="checkbox" name="allDay" ${isEdit && event.allDay ? 'checked' : ''}>
            <span>全天事件</span>
          </label>
          <div class="field-row">
            <label class="field">
              <span>开始时间</span>
              <input type="time" name="startTime" value="${isEdit ? (event.startTime || '') : ''}">
            </label>
            <label class="field">
              <span>结束时间</span>
              <input type="time" name="endTime" value="${isEdit ? (event.endTime || '') : ''}">
            </label>
          </div>
          <label class="field">
            <span>事项 *</span>
            <input type="text" name="title" required maxlength="120" value="${isEdit ? escAttr(event.title) : ''}" placeholder="事件标题">
          </label>
          <div class="field-row">
            <label class="field">
              <span>地点</span>
              <input type="text" name="location" value="${isEdit ? escAttr(event.location || '') : ''}" placeholder="如 3F 会议室">
            </label>
            <label class="field">
              <span>负责人</span>
              <input type="text" name="owner" value="${isEdit ? escAttr(event.owner || '') : ''}" placeholder="多人用顿号分隔">
            </label>
          </div>
          <label class="field">
            <span>描述</span>
            <textarea name="description" rows="2" placeholder="补充说明，不进入批注统计">${isEdit ? escHtml(event.description || '') : ''}</textarea>
          </label>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
            <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '添加事件'}</button>
          </div>
        </form>
      </div>`;

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);

    // 按月重复（仅新增时提供；编辑仍按单条日期处理）
    let repeatApi = null;
    if (!isEdit) {
      const repeatCheck = overlay.querySelector('[data-role="repeat-check"]');
      const repeatBox = overlay.querySelector('[data-role="repeat-box"]');
      const singleDate = overlay.querySelector('[data-role="single-date"]');
      const dateInput = overlay.querySelector('input[name="date"]');
      const weekdaySel = overlay.querySelector('[data-role="repeat-weekday"]');
      const yearLabel = overlay.querySelector('[data-role="year-label"]');
      const monthGrid = overlay.querySelector('[data-role="month-grid"]');
      const previewEl = overlay.querySelector('[data-role="repeat-preview"]');
      const submitBtn = overlay.querySelector('.event-modal button[type="submit"]');

      function renderMonthGrid() {
        yearLabel.textContent = year + '年';
        monthGrid.innerHTML = '';
        for (let m = 1; m <= 12; m++) {
          const key = monthKey(year, m);
          const chip = document.createElement('button');
          chip.type = 'button';
          chip.className = 'month-chip' + (selectedMonths.has(key) ? ' active' : '');
          chip.dataset.month = String(m);
          chip.textContent = m + '月';
          monthGrid.appendChild(chip);
        }
      }

      function collectDates() {
        if (!repeatCheck.checked) return [];
        const wd = Number(weekdaySel.value);
        const out = [];
        Array.from(selectedMonths).sort().forEach(key => {
          const y = Number(key.slice(0, 4));
          const m = Number(key.slice(5, 7));
          out.push(...D.weekdayDatesInMonth(y, m, wd));
        });
        return out;
      }

      function renderPreview() {
        if (!repeatCheck.checked) return;
        const dates = collectDates();
        if (!dates.length) {
          previewEl.innerHTML = '<div class="repeat-empty">请先选择月份</div>';
          submitBtn.textContent = '添加事件';
          return;
        }
        const wdText = '周' + D.WEEKDAY_TEXT[Number(weekdaySel.value)];
        const byMonth = new Map();
        dates.forEach(iso => {
          const key = iso.slice(0, 7);
          if (!byMonth.has(key)) byMonth.set(key, []);
          byMonth.get(key).push(Number(iso.slice(8, 10)) + '日');
        });
        const lines = [];
        byMonth.forEach((days, key) => {
          const y = Number(key.slice(0, 4));
          const m = Number(key.slice(5, 7));
          lines.push('<div>' + D.monthLabel(y, m) + ' 每周' + wdText + '：' + days.join('、') + '（' + days.length + '天）</div>');
        });
        lines.push('<div class="repeat-sum">合计 ' + dates.length + ' 条事件，保存后逐日生成</div>');
        previewEl.innerHTML = lines.join('');
        submitBtn.textContent = '添加事件（共 ' + dates.length + ' 条）';
      }

      monthGrid.addEventListener('click', e => {
        const chip = e.target.closest('.month-chip');
        if (!chip) return;
        const key = monthKey(year, Number(chip.dataset.month));
        if (selectedMonths.has(key)) {
          selectedMonths.delete(key);
        } else {
          selectedMonths.add(key);
        }
        chip.classList.toggle('active');
        renderPreview();
      });
      overlay.querySelector('[data-role="year-prev"]').addEventListener('click', () => {
        year--;
        renderMonthGrid();
      });
      overlay.querySelector('[data-role="year-next"]').addEventListener('click', () => {
        year++;
        renderMonthGrid();
      });
      weekdaySel.addEventListener('change', renderPreview);
      repeatCheck.addEventListener('change', () => {
        const on = repeatCheck.checked;
        repeatBox.hidden = !on;
        singleDate.hidden = on;
        dateInput.disabled = on;
        if (on) renderPreview();
      });
      renderMonthGrid();
      repeatApi = { repeatCheck, collectDates };
    }

    overlay.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget;
      const formData = new FormData(f);
      const allDay = formData.get('allDay') === 'on';
      const title = String(formData.get('title') || '').trim();
      if (!title) {
        global.WS.toast.showToast('事项标题不能为空', 'error');
        return;
      }
      const data = {
        date: formData.get('date'),
        allDay: allDay,
        title: title,
        location: String(formData.get('location') || '').trim(),
        owner: String(formData.get('owner') || '').trim(),
        description: String(formData.get('description') || '').trim()
      };
      if (allDay) {
        data.startTime = '';
        data.endTime = '';
        data.crossDay = false;
        data.endDate = undefined;
      } else {
        data.startTime = String(formData.get('startTime') || '').trim();
        data.endTime = String(formData.get('endTime') || '').trim();
        if (!data.startTime) {
          global.WS.toast.showToast('请填写开始时间，或勾选「全天事件」', 'error');
          return;
        }
        if (!data.endTime) {
          data.endTime = D.formatMinutes(D.parseTime(data.startTime) + (global.WS.app.store.state.settings.defaultDuration || 60));
        }
        if (data.endTime < data.startTime) {
          data.crossDay = true;
          data.endDate = D.addDays(data.date, 1);
        } else {
          data.crossDay = false;
          data.endDate = undefined;
        }
      }

      if (repeatApi && repeatApi.repeatCheck.checked) {
        const dates = repeatApi.collectDates();
        if (!dates.length) {
          global.WS.toast.showToast('请至少选择一个月份', 'error');
          return;
        }
        data.date = dates[0];
        data.repeatDates = dates;
      }

      const doSave = () => {
        onSave(data);
        close();
      };
      const count = Array.isArray(data.repeatDates) ? data.repeatDates.length : 0;
      if (count > 8) {
        global.WS.toast.confirmDialog({
          title: '确认批量添加',
          message: `将同时添加 ${count} 条事件，从 ${D.formatTitle(data.repeatDates[0])} 开始逐日生成。是否继续？`,
          confirmText: '添加',
          danger: false
        }).then(ok => {
          if (ok) doSave();
        });
      } else {
        doSave();
      }
    });
    document.body.appendChild(overlay);
    overlay.querySelector('input[name="title"]').focus();
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  global.WS = global.WS || {};
  global.WS.eventform = { openEventForm, escAttr, escHtml };
})(window);
