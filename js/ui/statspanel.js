/**
 * 统计视图：按日/周/月计数、标签与优先级分布、下钻明细、CSV/图片导出。
 */
(function (global) {
  'use strict';

  const D = global.WS.dateutil;
  const ST = global.WS.stats;
  const { showToast } = global.WS.toast;
  const { escHtml } = global.WS.eventform;

  function createStatsPanel(container, store, opts) {
    const o = opts || {};
    const defaultAnchor = o.defaultAnchor || D.todayISO();
    const monthRange = (iso) => {
      const d = D.parseISODate(iso) || new Date();
      const y = d.getFullYear();
      const m = d.getMonth() + 1;
      const dim = new Date(y, m, 0).getDate();
      return [y + '-' + D.pad2(m) + '-01', y + '-' + D.pad2(m) + '-' + D.pad2(dim)];
    };
    const initRange = monthRange(defaultAnchor);
    const state = {
      period: 'day',
      start: initRange[0],
      end: initRange[1],
      chartType: 'bar'
    };
    const charts = {};
    const onJumpDate = o.onJumpDate || function () {};

    container.innerHTML = `
      <div class="stats-head">
        <div>
          <h2>批注统计</h2>
          <p class="stats-total">区间批注：<b data-c="total">0</b> 条<span class="stats-hint">统计口径为所选日期区间，下方列出区间内批注，点击柱子可查看明细</span></p>
        </div>
        <div class="stats-controls">
          <span class="seg" role="group" aria-label="区间快捷切换">
            <button type="button" data-c="preset-week">本周</button>
            <button type="button" data-c="preset-month">本月</button>
            <button type="button" data-c="preset-all">全部</button>
          </span>
          <label>周期
            <select data-c="period">
              <option value="day">按日</option>
              <option value="week">按周</option>
              <option value="month">按月</option>
            </select>
          </label>
          <label>从
            <input type="date" data-c="start" value="${state.start}">
          </label>
          <label>到
            <input type="date" data-c="end" value="${state.end}">
          </label>
          <label>样式
            <select data-c="chartType">
              <option value="bar">柱状图</option>
              <option value="line">折线图</option>
            </select>
          </label>
          <button type="button" class="btn btn-ghost btn-sm" data-c="export-csv">导出 CSV</button>
          <button type="button" class="btn btn-ghost btn-sm" data-c="export-img">导出图片</button>
        </div>
      </div>
      <div class="stats-grid">
        <div class="chart-card card-main">
          <h3 data-c="main-title">按日批注数</h3>
          <div class="chart" data-c="main-chart"></div>
          <p class="chart-tip">点击柱子可查看该日批注明细</p>
        </div>
        <div class="chart-card">
          <h3>按标签分布</h3>
          <div class="chart chart-sm" data-c="tag-chart"></div>
        </div>
        <div class="chart-card">
          <h3>按优先级分布</h3>
          <div class="chart chart-sm" data-c="prio-chart"></div>
        </div>
      </div>
      <p class="stats-empty" data-c="empty" hidden></p>
      <div class="stats-detail-card" data-c="detail-wrap" hidden>
        <h3>区间批注明细</h3>
        <div class="stats-detail-list" data-c="detail"></div>
      </div>`;

    const setRange = (start, end) => {
      state.start = start;
      state.end = end;
      container.querySelector('[data-c="start"]').value = start;
      container.querySelector('[data-c="end"]').value = end;
      render();
    };

    container.querySelector('[data-c="preset-week"]').addEventListener('click', () => {
      const w = D.getWeekRange(D.todayISO());
      setRange(w.start, w.end);
    });
    container.querySelector('[data-c="preset-month"]').addEventListener('click', () => {
      setRange(monthRange(defaultAnchor)[0], monthRange(defaultAnchor)[1]);
    });
    container.querySelector('[data-c="preset-all"]').addEventListener('click', () => {
      const dates = store.state.annotations.map(a => a.date).filter(Boolean).sort();
      if (dates.length) setRange(dates[0], dates[dates.length - 1]);
      else setRange(monthRange(defaultAnchor)[0], monthRange(defaultAnchor)[1]);
    });

    container.querySelector('[data-c="period"]').addEventListener('change', e => {
      state.period = e.target.value;
      updateMainTitle();
      render();
    });
    container.querySelector('[data-c="chartType"]').addEventListener('change', e => {
      state.chartType = e.target.value;
      render();
    });
    container.querySelector('[data-c="start"]').addEventListener('change', e => {
      state.start = e.target.value;
      render();
    });
    container.querySelector('[data-c="end"]').addEventListener('change', e => {
      state.end = e.target.value;
      render();
    });
    container.querySelector('[data-c="export-csv"]').addEventListener('click', () => {
      const csv = ST.exportCSV(store.state.annotations, state.start, state.end);
      downloadBlob(csv, 'application/csv', '批注统计_' + state.start + '_' + state.end + '.csv');
      showToast('CSV 已导出', 'success');
    });
    container.querySelector('[data-c="export-img"]').addEventListener('click', () => {
      if (!charts.main) return;
      const url = charts.main.getDataURL({ pixelRatio: 2, backgroundColor: themeBg() });
      const a = document.createElement('a');
      a.href = url;
      a.download = '批注统计图_' + state.start + '_' + state.end + '.png';
      a.click();
      showToast('统计图已导出', 'success');
    });

    charts.main = echarts.init(container.querySelector('[data-c="main-chart"]'), null, { renderer: 'canvas' });
    charts.tag = echarts.init(container.querySelector('[data-c="tag-chart"]'), null, { renderer: 'canvas' });
    charts.prio = echarts.init(container.querySelector('[data-c="prio-chart"]'), null, { renderer: 'canvas' });
    charts.main.on('click', params => drillDown(params));
    container.querySelector('[data-c="detail"]').addEventListener('click', e => {
      const item = e.target.closest('[data-jump]');
      if (item) onJumpDate(item.dataset.jump);
    });

    window.addEventListener('resize', () => {
      Object.values(charts).forEach(c => c && c.resize());
    });

    function updateMainTitle() {
      const titleMap = { day: '按日批注数', week: '按周批注汇总', month: '按月批注汇总' };
      container.querySelector('[data-c="main-title"]').textContent = titleMap[state.period];
    }

    function render() {
      const annotations = store.state.annotations;
      const inRange = annotations.filter(a => a.date && a.date >= state.start && a.date <= state.end);
      container.querySelector('[data-c="total"]').textContent = inRange.length;
      let mainData;
      if (state.period === 'day') {
        mainData = ST.dailyCounts(annotations, state.start, state.end);
      } else {
        mainData = ST.periodTotals(annotations, state.start, state.end, state.period);
      }
      updateMainTitle();
      charts.main.setOption(buildMainOption(mainData), true);
      charts.tag.setOption(buildTagOption(ST.byTag(annotations)), true);
      charts.prio.setOption(buildPrioOption(ST.byPriority(annotations)), true);

      // 空态提示：区分“真无数据”与“区间外有数据”
      const emptyEl = container.querySelector('[data-c="empty"]');
      const sum = mainData.reduce((s, d) => s + d.count, 0);
      if (sum === 0) {
        emptyEl.hidden = false;
        if (!annotations.length) {
          emptyEl.textContent = '暂无批注：先在日历中点击日期添加批注';
        } else {
          const dates = annotations.map(a => a.date).filter(Boolean).sort();
          emptyEl.textContent = '所选区间暂无批注；全部 ' + annotations.length + ' 条批注分布在 ' +
            D.formatDisplay(dates[0]) + ' ~ ' + D.formatDisplay(dates[dates.length - 1]) + '，可点「全部」查看';
        }
      } else {
        emptyEl.hidden = true;
      }

      // 区间批注明细
      const detailWrap = container.querySelector('[data-c="detail-wrap"]');
      const detailEl = container.querySelector('[data-c="detail"]');
      if (inRange.length) {
        detailWrap.hidden = false;
        detailEl.innerHTML = inRange
          .slice()
          .sort((x, y) => (x.date === y.date ? (x.createdAt < y.createdAt ? 1 : -1) : x.date < y.date ? -1 : 1))
          .map(a => detailRowHtml(a))
          .join('');
      } else {
        detailWrap.hidden = true;
      }
    }

    function buildMainOption(data) {
      const isBar = state.chartType === 'bar';
      const max = Math.max(1, ...data.map(d => d.count));
      return {
        tooltip: {
          trigger: 'axis',
          formatter: params => {
            const p = params[0];
            return escHtml(p.name + '<br/>批注数：' + p.value);
          }
        },
        grid: { left: 40, right: 16, top: 24, bottom: 40 },
        xAxis: {
          type: 'category',
          data: data.map(d => d.label),
          axisLabel: { rotate: state.period === 'day' && data.length > 10 ? 40 : 0, fontSize: 11 }
        },
        yAxis: { type: 'value', minInterval: 1, max: max },
        series: [{
          type: isBar ? 'bar' : 'line',
          data: data.map(d => d.count),
          smooth: !isBar,
          barMaxWidth: 28,
          itemStyle: {
            color: isBar ? '#0F766E' : '#0F766E',
            borderRadius: isBar ? [3, 3, 0, 0] : 0
          },
          lineStyle: { width: 3 },
          symbolSize: 6
        }]
      };
    }

    function buildTagOption(data) {
      return {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: 8, right: 30, top: 10, bottom: 8, containLabel: true },
        xAxis: { type: 'value', minInterval: 1 },
        yAxis: {
          type: 'category',
          data: data.map(d => d.tag),
          axisLabel: { fontSize: 11 }
        },
        series: [{
          type: 'bar',
          data: data.map(d => d.count),
          barMaxWidth: 16,
          itemStyle: { color: '#B45309', borderRadius: [0, 3, 3, 0] },
          label: { show: true, position: 'right', fontSize: 11 }
        }]
      };
    }

    function buildPrioOption(data) {
      const colors = { P0: '#B0312A', P1: '#B45309', P2: '#0F766E', 未设置: '#9AA1A8' };
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { bottom: 0, itemWidth: 12, itemHeight: 12, textStyle: { fontSize: 11 } },
        series: [{
          type: 'pie',
          radius: ['38%', '66%'],
          center: ['50%', '42%'],
          data: data.map(d => ({
            name: d.priority,
            value: d.count,
            itemStyle: { color: colors[d.priority] || '#9AA1A8' }
          })),
          label: { fontSize: 11 },
          labelLine: { length: 8, length2: 6 }
        }]
      };
    }

    function drillDown(params) {
      const data = state.period === 'day'
        ? ST.dailyCounts(store.state.annotations, state.start, state.end)
        : ST.periodTotals(store.state.annotations, state.start, state.end, state.period);
      const item = data[params.dataIndex];
      if (!item) return;
      let dates;
      if (state.period === 'day') {
        dates = [item.date];
      } else if (state.period === 'week') {
        dates = D.dateRange(item.key, D.addDays(item.key, 6)).filter(d => d >= state.start && d <= state.end);
      } else {
        const [y, m] = item.key.split('-').map(Number);
        const daysInMonth = new Date(y, m, 0).getDate();
        dates = D.dateRange(item.key + '-01', item.key + '-' + String(daysInMonth).padStart(2, '0'))
          .filter(d => d >= state.start && d <= state.end);
      }
      const list = store.state.annotations
        .filter(a => dates.includes(a.date))
        .sort((a, b) => (a.date === b.date ? (a.createdAt < b.createdAt ? 1 : -1) : a.date < b.date ? -1 : 1));
      openDrillModal(item.label, list, onJumpDate);
    }

    function themeBg() {
      return document.documentElement.dataset.theme === 'dark' ? '#1C2126' : '#FFFFFF';
    }

    return { render };
  }

  function openDrillModal(title, list, onJumpDate) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal drill-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">批注明细 · ${escHtml(title)}</h3>
        <div class="drill-list">
          ${list.length ? list.map(a => `
            <div class="drill-item">
              <div class="drill-date">${escHtml(D.formatDisplay(a.date))}</div>
              <div class="drill-content">${escHtml(a.content)}
                ${a.priority ? `<span class="prio-tag prio-${a.priority.toLowerCase()}">${a.priority}</span>` : ''}
              </div>
              <div class="drill-tags">${ST.splitTags(a.tags).map(t => '<span class="tag">#' + escHtml(t) + '</span>').join('')}</div>
            </div>`).join('') : '<p class="empty-hint">该区间暂无批注</p>'}
        </div>
        <div class="modal-actions">
          ${list.length ? '<button type="button" class="btn btn-ghost" data-act="jump">在日历中查看</button>' : ''}
          <button type="button" class="btn btn-primary" data-act="close">关闭</button>
        </div>
      </div>`;
    const close = () => overlay.remove();
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
    overlay.querySelector('[data-act="close"]').addEventListener('click', close);
    const jump = overlay.querySelector('[data-act="jump"]');
    if (jump) {
      jump.addEventListener('click', () => {
        close();
        onJumpDate(list[0].date);
      });
    }
    document.body.appendChild(overlay);
  }

  function detailRowHtml(a) {
    const prio = a.priority || '无';
    const prioCls = a.priority ? 'prio-' + a.priority.toLowerCase() : 'prio-none';
    return `<div class="stats-detail-item" data-jump="${a.date}" title="点击去日历查看 ${a.date}">
      <span class="dd-date">${escHtml(D.formatDisplay(a.date))}</span>
      <span class="prio-tag ${prioCls}">${prio}</span>
      <span class="dd-content">${escHtml(a.content)}</span>
      <button type="button" class="btn btn-ghost btn-sm">去日历</button>
    </div>`;
  }

  function downloadBlob(content, mime, name) {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  global.WS = global.WS || {};
  global.WS.statspanel = { createStatsPanel };
})(window);
