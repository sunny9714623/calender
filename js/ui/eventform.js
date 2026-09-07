/**
 * 事件新增 / 编辑弹窗。
 * - 新增支持「按月重复」（星期几 + 多月 → 逐日生成）；
 * - 编辑重复组时可整组修改内容 / 星期 / 月份，或只改当天并解除重复。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;

  function openEventForm(opts) {
    const { date, event, onSave, group } = opts;
    const isEdit = !!event;
    const isGroupEdit = isEdit && !!group;
    const baseDate = (event && event.date) || date || D.todayISO();
    const defaultWeekdayRaw = D.weekdayFromDate(baseDate);
    const defaultWeekday = defaultWeekdayRaw === null ? 0 : defaultWeekdayRaw;

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal event-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${isGroupEdit ? '编辑重复事件' : isEdit ? '编辑事件' : '新增事件'}</h3>
        <form class="event-form">
          <label class="field" data-role="single-date">
            <span>日期 * <em class="field-tip">勾选按月重复时按下方规则生成</em></span>
            <input type="date" name="date" required value="${isEdit ? event.date : date}">
          </label>
          ${isGroupEdit ? `
          <label class="field">
            <span>修改范围（重复组共 ${group.count} 条）</span>
            <select data-role="edit-scope">
              <option value="group">修改全部：内容 + 星期 + 月份</option>
              <option value="one">仅修改这一条（解除重复）</option>
            </select>
          </label>` : ''}
          <div data-role="repeat-root"></div>
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

    const q = sel => overlay.querySelector(sel);
    const singleDate = q('[data-role="single-date"]');
    const dateInput = q('input[name="date"]');
    let rule = null;

    rule = global.WS.repeatrule.createRepeatRule(q('[data-role="repeat-root"]'), {
      baseDate: baseDate,
      weekday: isGroupEdit ? group.weekday : defaultWeekday,
      months: isGroupEdit ? (group.months || []) : [],
      checked: isGroupEdit,
      onToggle: on => {
        singleDate.hidden = on;
        dateInput.disabled = on;
      }
    });
    if (rule.checked()) {
      singleDate.hidden = true;
      dateInput.disabled = true;
    }

    let scopeSel = null;
    if (isGroupEdit) {
      scopeSel = q('[data-role="edit-scope"]');
      scopeSel.addEventListener('change', () => {
        rule.setEnabled(scopeSel.value !== 'one');
      });
    }

    overlay.querySelector('form').addEventListener('submit', e => {
      e.preventDefault();
      const f = e.currentTarget;
      const allDay = f.allDay.checked;
      const title = String(f.title.value || '').trim();
      if (!title) {
        global.WS.toast.showToast('事项标题不能为空', 'error');
        return;
      }
      const data = {
        date: dateInput ? dateInput.value : (isEdit ? event.date : date),
        allDay: allDay,
        title: title,
        location: String(f.location.value || '').trim(),
        owner: String(f.owner.value || '').trim(),
        description: String(f.description.value || '').trim()
      };
      if (allDay) {
        data.startTime = '';
        data.endTime = '';
        data.crossDay = false;
        data.endDate = undefined;
      } else {
        data.startTime = String(f.startTime.value || '').trim();
        data.endTime = String(f.endTime.value || '').trim();
        if (!data.startTime) {
          global.WS.toast.showToast('请填写开始时间，或勾选「全天事件」', 'error');
          return;
        }
        if (!data.endTime) {
          data.endTime = D.formatMinutes(D.parseTime(data.startTime) + (global.WS.app.store.state.settings.defaultDuration || 60));
        }
        data.crossDay = data.endTime < data.startTime;
        data.endDate = data.crossDay ? D.addDays(data.date || baseDate, 1) : undefined;
      }

      const scope = scopeSel ? scopeSel.value : (isGroupEdit ? 'group' : null);
      if (rule && rule.checked() && (!isGroupEdit || scope === 'group')) {
        const dates = rule.dates();
        if (!dates.length) {
          global.WS.toast.showToast('请至少选择一个月份', 'error');
          return;
        }
        data.date = dates[0];
        data.repeatDates = dates;
        data.repeatWeekday = rule.weekday();
        data.repeatMonths = rule.months();
        if (isGroupEdit) data.repeatGroupId = group.id;
      } else if (isGroupEdit && scope === 'one') {
        data.repeatScope = 'one';
      }

      const doSave = () => {
        onSave(data);
        close();
      };
      const count = Array.isArray(data.repeatDates) ? data.repeatDates.length : 0;
      if (count > 8) {
        const fromText = isGroupEdit ? `将重复组更新为 ${count} 条` : `将同时添加 ${count} 条事件`;
        global.WS.toast.confirmDialog({
          title: isGroupEdit ? '确认整组更新' : '确认批量添加',
          message: `${fromText}，从 ${D.formatTitle(data.repeatDates[0])} 开始逐日生成。是否继续？`,
          confirmText: '确认',
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
