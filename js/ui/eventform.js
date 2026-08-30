/**
 * 事件新增 / 编辑弹窗。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;

  function openEventForm(opts) {
    const { date, event, onSave } = opts;
    const isEdit = !!event;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal event-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${isEdit ? '编辑事件' : '新增事件'}</h3>
        <form class="event-form">
          <label class="field">
            <span>日期 *</span>
            <input type="date" name="date" required value="${isEdit ? event.date : date}">
          </label>
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
      onSave(data);
      close();
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
