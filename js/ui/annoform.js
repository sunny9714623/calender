/**
 * 批注添加 / 编辑弹窗。
 * - 新增支持「按月重复」（星期几 + 多月 → 逐日生成）；
 * - 编辑重复组时可整组修改内容 / 标签 / 优先级 / 星期 / 月份，或只改当天并解除重复。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const { showToast } = global.WS.toast;

  function openAnnoForm(opts) {
    const { date, annotation, onSave, group } = opts;
    const initial = opts.initial || {};
    const isEdit = !!annotation;
    const isGroupEdit = isEdit && !!group;
    const targetDate = isEdit ? annotation.date : date;
    const contentSeed = isEdit ? annotation.content || '' : String(initial.content || '');
    const tagsSeed = isEdit ? annotation.tags || '' : String(initial.tags || '');
    const prioritySeed = isEdit ? annotation.priority || '' : String(initial.priority || '');

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal anno-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">${isGroupEdit ? '编辑重复批注' : isEdit ? '编辑批注' : '添加批注'} · ${D.formatTitle(targetDate)}</h3>
        <form class="anno-form">
          <textarea name="content" rows="3" required maxlength="500" placeholder="记录今天的情况 / 临时补充…（必填）">${escHtml(contentSeed)}</textarea>
          <div class="anno-form-row">
            <input type="text" name="tags" value="${escAttr(tagsSeed)}" placeholder="标签，逗号分隔（可选）" maxlength="60">
            <select name="priority">
              <option value="">优先级</option>
              <option value="P0"${prioritySeed === 'P0' ? ' selected' : ''}>P0</option>
              <option value="P1"${prioritySeed === 'P1' ? ' selected' : ''}>P1</option>
              <option value="P2"${prioritySeed === 'P2' ? ' selected' : ''}>P2</option>
            </select>
          </div>
          ${isGroupEdit ? `
          <label class="field">
            <span>修改范围（重复组共 ${group.count} 条）</span>
            <select data-role="edit-scope">
              <option value="group">修改全部：内容 + 星期 + 月份</option>
              <option value="one">仅修改这一条（解除重复）</option>
            </select>
          </label>` : ''}
          <div data-role="repeat-root"></div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
            <button type="submit" class="btn btn-primary">${isEdit ? '保存修改' : '添加'}</button>
          </div>
        </form>
      </div>`;

    const close = () => overlay.remove();
    overlay.addEventListener('click', e => {
      if (e.target === overlay) close();
    });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);

    const q = sel => overlay.querySelector(sel);
    let rule = null;
    const baseDate = targetDate || D.todayISO();
    const seedRaw = D.weekdayFromDate(baseDate);
    rule = global.WS.repeatrule.createRepeatRule(q('[data-role="repeat-root"]'), {
      baseDate: baseDate,
      weekday: isGroupEdit ? group.weekday : (seedRaw === null ? 0 : seedRaw),
      months: isGroupEdit ? (group.months || []) : [],
      checked: isGroupEdit || (!isEdit && opts.repeatChecked)
    });

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
      const content = String(f.content.value || '').trim();
      if (!content) {
        showToast('批注内容不能为空', 'error');
        return;
      }
      const data = {
        date: targetDate,
        content: content,
        tags: String(f.tags.value || '').trim(),
        priority: f.priority.value
      };
      const scope = scopeSel ? scopeSel.value : (isGroupEdit ? 'group' : null);
      if (rule && rule.checked() && (!isGroupEdit || scope === 'group')) {
        const dates = rule.dates();
        if (!dates.length) {
          showToast('请至少选择一个月份', 'error');
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
        const fromText = isGroupEdit ? `将重复组更新为 ${count} 条` : `将同时添加 ${count} 条批注`;
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
    overlay.querySelector('textarea').focus();
  }

  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  global.WS = global.WS || {};
  global.WS.annoform = { openAnnoForm, escAttr, escHtml };
})(window);
