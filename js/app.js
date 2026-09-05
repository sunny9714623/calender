/**
 * 应用入口：状态管理、导航、导入/备份/恢复/清空/设置、视图联动。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const storeApi = global.WS.store.createStore();
  let statsPanel = null;

  const app = {
    store: storeApi,
    state: {
      view: 'month',
      anchor: D.todayISO(),
      selected: null,
      tab: 'calendar',
      lastClicked: null
    },
    lastTap: { date: null, time: 0 },

    refresh() {
      if (this.state.tab === 'calendar') {
        renderCalendarArea();
      } else if (this.state.tab === 'data') {
        renderDataPage();
      } else {
        if (statsPanel) statsPanel.render();
      }
    },

    selectDate(date, force) {
      const now = Date.now();
      // 明确动作（如“+N 更多”、统计跳转）：直接打开详情
      if (force) {
        this.lastTap = { date: null, time: 0 };
        this.state.lastClicked = date;
        this.state.selected = date;
        this.state.anchor = date;
        renderCalendarArea();
        return;
      }
      // 普通点击：2 秒内再次点击同一日期才弹出详情
      if (this.lastTap.date === date && now - this.lastTap.time <= 2000) {
        this.lastTap = { date: null, time: 0 };
        this.state.lastClicked = date;
        this.state.selected = date;
        this.state.anchor = date;
        renderCalendarArea();
        return;
      }
      this.state.lastClicked = date;
      this.lastTap = { date: date, time: now };
    },

    jumpToDate(date) {
      this.state.tab = 'calendar';
      this.state.lastClicked = date;
      this.state.selected = date;
      this.state.anchor = date;
      switchTab('calendar');
      renderCalendarArea();
    }
  };
  global.WS.app = app;

  // ---------- DOM ----------
  const calGrid = document.getElementById('calendarGrid');
  const dayPanel = document.getElementById('dayPanel');
  const calTitle = document.getElementById('calTitle');
  const statsArea = document.getElementById('statsArea');
  const dataArea = document.getElementById('dataArea');
  const fabGroup = document.getElementById('fabGroup');
  const restoreInput = document.getElementById('restoreInput');

  // ---------- 主题 ----------
  function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;
    document.getElementById('btnTheme').textContent = theme === 'dark' ? '☀ 白天' : '◐ 黑夜';
  }
  applyTheme(storeApi.state.settings.theme || 'light');
  document.getElementById('btnTheme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    storeApi.updateSettings({ theme: next });
    applyTheme(next);
  });

  // ---------- 名称 / 头像 / 日历背景 ----------
  function escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function applyBrand() {
    const s = storeApi.state.settings;
    const avatarEl = document.getElementById('brandAvatar');
    const titleEl = document.getElementById('brandTitle');
    if (avatarEl) avatarEl.innerHTML = s.avatar ? `<img src="${escAttr(s.avatar)}" alt="头像">` : '周';
    if (titleEl) titleEl.textContent = s.appName || '周行事例批注台';
  }

  function applyCalendarBg() {
    const s = storeApi.state.settings;
    const grid = document.querySelector('.calendar-grid');
    if (!grid) return;
    grid.style.backgroundImage = s.calBgImage ? `url(${s.calBgImage})` : '';
    grid.style.backgroundColor = s.calBgColor || '';
    grid.classList.toggle('bg-image', !!s.calBgImage);
  }

  const BG_COLORS = [
    '#FFFFFF', '#FDF6E3', '#E8F4FD', '#EAF7E6', '#FFF7E0', '#F3E8FF', '#FFE8E6', '#E8F0FE',
    '#1C2126', '#14202B', '#1B2A1E', '#2B1E2A'
  ];

  function readImageFile(file, maxSize, mime, cb) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width;
        let h = img.height;
        if (w > maxSize || h > maxSize) {
          const ratio = Math.min(maxSize / w, maxSize / h);
          w = Math.round(w * ratio);
          h = Math.round(h * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        cb(canvas.toDataURL(mime || 'image/jpeg', 0.85));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  function openSettingsModal() {
    const s = storeApi.state.settings;
    let avatarData = s.avatar || '';
    let bgColor = s.calBgColor || '';
    let bgImage = s.calBgImage || '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal settings-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">外观与名称设置</h3>
        <section class="settings-sec">
          <h4>名称与头像</h4>
          <div class="avatar-edit">
            <span class="brand-mark" id="setAvatarPreview">${avatarData ? `<img src="${escAttr(avatarData)}" alt="头像">` : '周'}</span>
            <div class="avatar-fields">
              <label class="field"><span>应用名称</span><input type="text" id="setAppName" maxlength="20" value="${escAttr(s.appName || '周行事例批注台')}"></label>
              <div class="settings-row">
                <label class="btn btn-ghost btn-sm" for="setAvatarFile">选择头像图片</label>
                <input type="file" id="setAvatarFile" accept="image/*" hidden>
                <button type="button" class="btn btn-ghost btn-sm" id="setAvatarClear">移除头像</button>
              </div>
            </div>
          </div>
        </section>
        <section class="settings-sec">
          <h4>日历背景</h4>
          <p class="settings-hint">选择素色或上传图片作为日历背景（图片本地保存）。</p>
          <div class="bg-swatches" id="setBgSwatches">
            <button type="button" class="bg-swatch none${!bgColor && !bgImage ? ' active' : ''}" data-bgcolor="" title="默认">默认</button>
            ${BG_COLORS.map(c => `<button type="button" class="bg-swatch${bgColor === c && !bgImage ? ' active' : ''}" data-bgcolor="${c}" style="background:${c}" title="${c}"></button>`).join('')}
          </div>
          <div class="settings-row">
            <label class="btn btn-ghost btn-sm" for="setBgFile">上传背景图片</label>
            <input type="file" id="setBgFile" accept="image/*" hidden>
            <button type="button" class="btn btn-ghost btn-sm" id="setBgClear">恢复默认背景</button>
          </div>
          <p class="settings-hint" id="setBgStatus">${bgImage ? '已设置自定义图片背景' : (bgColor ? '已设置素色背景' : '当前为默认背景')}</p>
        </section>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-act="cancel">取消</button>
          <button type="button" class="btn btn-primary" data-act="save">保存</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="cancel"]').addEventListener('click', close);

    const preview = overlay.querySelector('#setAvatarPreview');
    const swatches = overlay.querySelectorAll('#setBgSwatches .bg-swatch');
    const setSwatchActive = () => {
      swatches.forEach(b => b.classList.toggle('active', b.dataset.bgcolor === bgColor && !bgImage));
    };
    overlay.querySelector('#setAvatarFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      readImageFile(f, 160, 'image/png', data => {
        avatarData = data;
        preview.innerHTML = `<img src="${escAttr(data)}" alt="头像">`;
      });
    });
    overlay.querySelector('#setAvatarClear').addEventListener('click', () => {
      avatarData = '';
      preview.textContent = '周';
    });
    overlay.querySelector('#setBgFile').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      readImageFile(f, 1600, 'image/jpeg', data => {
        bgImage = data;
        bgColor = '';
        setSwatchActive();
        overlay.querySelector('#setBgStatus').textContent = '已设置自定义图片背景';
      });
    });
    overlay.querySelector('#setBgClear').addEventListener('click', () => {
      bgImage = '';
      bgColor = '';
      setSwatchActive();
      overlay.querySelector('#setBgStatus').textContent = '当前为默认背景';
    });
    swatches.forEach(b => {
      b.addEventListener('click', () => {
        bgColor = b.dataset.bgcolor;
        bgImage = '';
        setSwatchActive();
        overlay.querySelector('#setBgStatus').textContent = bgColor ? '已设置素色背景' : '当前为默认背景';
      });
    });
    overlay.querySelector('[data-act="save"]').addEventListener('click', () => {
      const name = String(overlay.querySelector('#setAppName').value || '').trim() || '周行事例批注台';
      storeApi.updateSettings({ appName: name, avatar: avatarData, calBgColor: bgColor, calBgImage: bgImage });
      applyBrand();
      applyCalendarBg();
      global.WS.toast.showToast('设置已保存', 'success');
      close();
    });
  }

  document.getElementById('btnBrandSettings').addEventListener('click', openSettingsModal);

  // ---------- 导航 ----------
  document.getElementById('btnPrev').addEventListener('click', () => {
    app.state.anchor = shiftAnchor(-1);
    renderCalendarArea();
  });
  document.getElementById('btnNext').addEventListener('click', () => {
    app.state.anchor = shiftAnchor(1);
    renderCalendarArea();
  });
  document.getElementById('btnToday').addEventListener('click', () => {
    app.state.anchor = D.todayISO();
    app.state.selected = D.todayISO();
    renderCalendarArea();
  });

  function shiftAnchor(dir) {
    const a = app.state.anchor;
    if (app.state.view === 'month') {
      const [y, m] = a.split('-').map(Number);
      const d = new Date(y, m - 1 + dir, 1);
      return D.toISODate(d);
    }
    return D.addDays(a, dir * (app.state.view === 'week' ? 7 : 1));
  }

  // ---------- 视图切换 ----------
  document.querySelectorAll('#viewSwitch [data-view]').forEach(btn => {
    btn.addEventListener('click', () => {
      app.state.view = btn.dataset.view;
      document.querySelectorAll('#viewSwitch [data-view]').forEach(b => b.classList.toggle('active', b === btn));
      renderCalendarArea();
    });
  });

  // ---------- 页签 ----------
  document.querySelectorAll('#tabSwitch [data-tab]').forEach(btn => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });

  function switchTab(tab) {
    app.state.tab = tab;
    document.querySelectorAll('#tabSwitch [data-tab]').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
    document.getElementById('calendarArea').hidden = tab !== 'calendar';
    statsArea.hidden = tab !== 'stats';
    dataArea.hidden = tab !== 'data';
    if (fabGroup) fabGroup.hidden = tab !== 'calendar';
    if (tab !== 'calendar') dayPanel.hidden = true;
    if (tab === 'stats' && !statsPanel) {
      statsPanel = global.WS.statspanel.createStatsPanel(statsArea, storeApi, {
        onJumpDate: date => app.jumpToDate(date),
        defaultAnchor: app.state.selected || app.state.anchor || D.todayISO()
      });
    }
    if (tab === 'data') renderDataPage();
    app.refresh();
  }

  function escHtml(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function renderDataPage() {
    document.getElementById('dataEventCount').textContent = storeApi.state.events.length;
    document.getElementById('dataAnnoCount').textContent = storeApi.state.annotations.length;
    const listEl = document.getElementById('dataImportHistory');
    const files = storeApi.state.files.slice(0, 8);
    listEl.innerHTML = files.length
      ? files.map(f =>
          `<div class="history-item"><span class="hist-name">${escHtml(f.fileName)}</span>` +
          `<span class="hist-meta">${escHtml((f.importTime || '').replace('T', ' ').slice(0, 16))} · 成功 ${f.successRows}/${f.totalRows}</span></div>`
        ).join('')
      : '<p class="empty-hint">暂无导入记录</p>';
  }

  // ---------- 渲染 ----------
  function renderCalendarArea() {
    // 图例中的批注数：统计当前视图范围内的批注（月=当月、周=当周、日=当日）
    const legendCount = document.getElementById('legendAnnoCount');
    if (legendCount) legendCount.textContent = visibleAnnoCount();
    const legendEvt = document.getElementById('legendEventCount');
    if (legendEvt) legendEvt.textContent = visibleEventCount();

    // 标题
    const a = app.state.anchor;
    if (app.state.view === 'month') {
      const [y, m] = a.split('-').map(Number);
      calTitle.textContent = D.monthLabel(y, m);
    } else if (app.state.view === 'week') {
      const w = D.getWeekRange(a);
      calTitle.textContent = D.formatDisplay(w.start) + ' – ' + D.formatDisplay(w.end) + '（周）';
    } else {
      calTitle.textContent = D.formatTitle(a);
    }

    global.WS.calendar.renderCalendar(calGrid, storeApi, app.state, (date, force) => app.selectDate(date, force));

    if (app.state.selected) {
      dayPanel.hidden = false;
      global.WS.daypanel.renderDayPanel(dayPanel, {
        date: app.state.selected,
        store: storeApi,
        conflictDates: storeApi.conflictDates(),
        onClose: () => {
          app.state.selected = null;
          renderCalendarArea();
        }
      });
    } else {
      dayPanel.hidden = true;
      dayPanel.innerHTML = '';
    }
  }

  function visibleAnnoCount() {
    const annos = storeApi.state.annotations;
    const anchor = app.state.anchor;
    if (app.state.view === 'day') {
      return annos.filter(a => a.date === anchor).length;
    }
    if (app.state.view === 'week') {
      const w = D.getWeekRange(anchor);
      return annos.filter(a => a.date && a.date >= w.start && a.date <= w.end).length;
    }
    const prefix = anchor.slice(0, 7);
    return annos.filter(a => a.date && a.date.startsWith(prefix)).length;
  }

  function visibleEventCount() {
    const evs = storeApi.state.events;
    const anchor = app.state.anchor;
    if (app.state.view === 'day') {
      return evs.filter(e => e.date === anchor || (e.crossDay && e.endDate === anchor)).length;
    }
    if (app.state.view === 'week') {
      const w = D.getWeekRange(anchor);
      return evs.filter(e => e.date && e.date >= w.start && e.date <= w.end).length;
    }
    const prefix = anchor.slice(0, 7);
    return evs.filter(e => e.date && e.date.startsWith(prefix)).length;
  }

  // ---------- 导入 ----------
  document.getElementById('btnImport').addEventListener('click', () => {
    global.WS.importmodal.openImportModal({
      store: storeApi,
      onImported(events) {
        if (events.length) {
          const first = events.reduce((min, e) => (e.date < min ? e.date : min), events[0].date);
          app.state.anchor = first;
          app.state.selected = first;
        }
        app.refresh();
      }
    });
  });

  // ---------- 悬浮快捷按钮：添加事件 / 添加批注 ----------
  function fabDate() {
    return app.state.selected || app.state.lastClicked || app.state.anchor || D.todayISO();
  }

  const fabEventBtn = document.getElementById('btnFabEvent');
  const fabAnnoBtn = document.getElementById('btnFabAnno');
  if (fabEventBtn) fabEventBtn.addEventListener('click', () => {
    global.WS.eventform.openEventForm({
      date: fabDate(),
      onSave: data => {
        const saved = storeApi.addEvent(data);
        if (Array.isArray(saved)) {
          global.WS.toast.showToast('已添加 ' + saved.length + ' 条事件', 'success');
          const firstDate = saved[0].date;
          if (firstDate !== app.state.selected) {
            app.state.selected = firstDate;
            app.state.anchor = firstDate;
          }
        } else {
          global.WS.toast.showToast('事件已添加', 'success');
          if (saved.date !== app.state.selected) {
            app.state.selected = saved.date;
            app.state.anchor = saved.date;
          }
        }
        app.refresh();
      }
    });
  });

  if (fabAnnoBtn) fabAnnoBtn.addEventListener('click', () => {
    global.WS.annoform.openAnnoForm({
      date: fabDate(),
      onSave: data => {
        storeApi.addAnnotation(data);
        global.WS.toast.showToast('批注已添加', 'success');
        if (data.date !== app.state.selected) {
          app.state.selected = data.date;
          app.state.anchor = data.date;
        }
        app.refresh();
      }
    });
  });

  // ---------- 备份 / 恢复 / 清空 ----------
  document.getElementById('btnBackup').addEventListener('click', () => {
    const blob = new Blob([storeApi.exportJSON()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = '周行事例批注台备份_' + D.todayISO() + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    global.WS.toast.showToast('备份已导出（JSON）', 'success');
  });

  document.getElementById('btnRestore').addEventListener('click', () => restoreInput.click());
  restoreInput.addEventListener('change', async () => {
    const file = restoreInput.files[0];
    restoreInput.value = '';
    if (!file) return;
    try {
      const data = JSON.parse(await file.text());
      if (!data || !Array.isArray(data.events) || !Array.isArray(data.annotations)) {
        throw new Error('不是有效的备份文件');
      }
      const ok = await global.WS.toast.confirmDialog({
        title: '恢复备份',
        message: `将用备份中的 ${data.events.length} 条事件、${data.annotations.length} 条批注替换当前数据。是否继续？`,
        confirmText: '恢复',
        danger: true
      });
      if (ok) {
        storeApi.replace(data, { merge: false });
        global.WS.toast.showToast('备份恢复成功', 'success');
        app.refresh();
      }
    } catch (err) {
      global.WS.toast.showToast('恢复失败：' + err.message, 'error', 4000);
    }
  });

  document.getElementById('btnClear').addEventListener('click', () => {
    global.WS.toast.confirmDialog({
      title: '清空全部数据',
      message: `将删除全部 ${storeApi.state.events.length} 条事件和 ${storeApi.state.annotations.length} 条批注，且不可恢复。建议先导出备份。`,
      confirmText: '清空',
      danger: true
    }).then(ok => {
      if (ok) {
        storeApi.clearAll();
        global.WS.toast.showToast('数据已清空', 'success');
        app.refresh();
      }
    });
  });

  // ---------- 初始化 ----------
  let storageUsable = true;
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('__wsd_probe__', '1');
      localStorage.removeItem('__wsd_probe__');
    } else {
      storageUsable = false;
    }
  } catch (e) {
    storageUsable = false;
  }
  if (!storageUsable) {
    global.WS.toast.showToast('当前环境无法本地持久化保存，数据仅存于内存，请及时使用「备份」导出 JSON', 'error', 5200);
  }
  applyBrand();
  applyCalendarBg();
  renderCalendarArea();
  if (fabGroup) fabGroup.hidden = app.state.tab !== 'calendar';
})(window);
