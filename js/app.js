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
      selected: D.todayISO(),
      tab: 'calendar'
    },

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
      if (this.state.selected === date && !force) {
        this.state.selected = null;
      } else {
        this.state.selected = date;
        this.state.anchor = date;
      }
      renderCalendarArea();
    },

    jumpToDate(date) {
      this.state.tab = 'calendar';
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
    document.getElementById('btnTheme').textContent = theme === 'dark' ? '☀' : '◐';
  }
  applyTheme(storeApi.state.settings.theme || 'light');
  document.getElementById('btnTheme').addEventListener('click', () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    storeApi.updateSettings({ theme: next });
    applyTheme(next);
  });

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
    return app.state.selected || app.state.anchor || D.todayISO();
  }

  const fabEventBtn = document.getElementById('btnFabEvent');
  const fabAnnoBtn = document.getElementById('btnFabAnno');
  if (fabEventBtn) fabEventBtn.addEventListener('click', () => {
    global.WS.eventform.openEventForm({
      date: fabDate(),
      onSave: data => {
        storeApi.addEvent(data);
        global.WS.toast.showToast('事件已添加', 'success');
        if (data.date !== app.state.selected) {
          app.state.selected = data.date;
          app.state.anchor = data.date;
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
  renderCalendarArea();
})(window);
