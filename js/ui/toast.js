/**
 * Toast 提示与确认对话框。
 */
(function (global) {
  'use strict';

  function ensureRoot() {
    let root = document.getElementById('toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'toast-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function showToast(message, type, duration) {
    const root = ensureRoot();
    const el = document.createElement('div');
    el.className = 'toast toast-' + (type || 'info');
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.remove(), 300);
    }, duration || 2600);
  }

  /**
   * 通用确认对话框
   * @returns Promise<boolean>
   */
  function confirmDialog(opts) {
    return new Promise(resolve => {
      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay confirm-overlay';
      overlay.innerHTML = `
        <div class="modal confirm-modal" role="dialog" aria-modal="true">
          <h3 class="confirm-title">${opts.title || '请确认'}</h3>
          <p class="confirm-message">${opts.message || ''}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
            <button type="button" class="btn ${opts.danger ? 'btn-danger' : 'btn-primary'}" data-act="ok">${opts.confirmText || '确定'}</button>
          </div>
        </div>`;
      const close = val => {
        overlay.remove();
        resolve(val);
      };
      overlay.addEventListener('click', e => {
        if (e.target === overlay) close(false);
      });
      overlay.querySelector('[data-act="cancel"]').addEventListener('click', () => close(false));
      overlay.querySelector('[data-act="ok"]').addEventListener('click', () => close(true));
      document.body.appendChild(overlay);
      const okBtn = overlay.querySelector('[data-act="ok"]');
      okBtn.focus();
    });
  }

  global.WS = global.WS || {};
  global.WS.toast = { showToast, confirmDialog };
})(window);
