/**
 * 批注快速添加弹窗（悬浮按钮使用）。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const { showToast } = global.WS.toast;

  function openAnnoForm(opts) {
    const { date, onSave } = opts;
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal anno-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">添加批注 · ${D.formatTitle(date)}</h3>
        <form class="anno-form">
          <textarea name="content" rows="3" required maxlength="500" placeholder="记录今天的情况 / 临时补充…（必填）"></textarea>
          <div class="anno-form-row">
            <input type="text" name="tags" placeholder="标签，逗号分隔（可选）" maxlength="60">
            <select name="priority">
              <option value="">优先级</option>
              <option value="P0">P0</option>
              <option value="P1">P1</option>
              <option value="P2">P2</option>
            </select>
          </div>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
            <button type="submit" class="btn btn-primary">添加</button>
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
      const content = String(e.currentTarget.content.value || '').trim();
      if (!content) {
        showToast('批注内容不能为空', 'error');
        return;
      }
      const data = {
        date,
        content,
        tags: String(e.currentTarget.tags.value || '').trim(),
        priority: e.currentTarget.priority.value
      };
      onSave(data);
      close();
    });
    document.body.appendChild(overlay);
    overlay.querySelector('textarea').focus();
  }

  global.WS = global.WS || {};
  global.WS.annoform = { openAnnoForm };
})(window);
