/**
 * 按月重复选择组件（事件 / 批注共用）：
 * 勾选后选择星期几与多个月份，实时预览生成日期列表。
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

  function createRepeatRule(el, opts) {
    opts = opts || {};
    const baseDate = opts.baseDate || D.todayISO();
    const seedWeekday = opts.weekday === null || opts.weekday === undefined
      ? D.weekdayFromDate(baseDate)
      : opts.weekday;
    const weekdaySeed = seedWeekday === null ? 0 : seedWeekday;
    const selectedMonths = new Set((opts.months || []).map(String));
    let year = Number(baseDate.slice(0, 4)) || new Date().getFullYear();
    const checkedSeed = !!opts.checked;

    el.classList.add('repeat-rule');
    el.innerHTML = `
      <label class="field field-check repeat-toggle">
        <input type="checkbox" data-role="repeat-check"${checkedSeed ? ' checked' : ''}>
        <span>按月重复：所选月份内每个指定星期都记录</span>
      </label>
      <div class="repeat-box" data-role="repeat-box"${checkedSeed ? '' : ' hidden'}>
        <label class="field">
          <span>每周星期几</span>
          <select data-role="repeat-weekday">
            <option value="0"${weekdaySeed === 0 ? ' selected' : ''}>周一</option>
            <option value="1"${weekdaySeed === 1 ? ' selected' : ''}>周二</option>
            <option value="2"${weekdaySeed === 2 ? ' selected' : ''}>周三</option>
            <option value="3"${weekdaySeed === 3 ? ' selected' : ''}>周四</option>
            <option value="4"${weekdaySeed === 4 ? ' selected' : ''}>周五</option>
            <option value="5"${weekdaySeed === 5 ? ' selected' : ''}>周六</option>
            <option value="6"${weekdaySeed === 6 ? ' selected' : ''}>周日</option>
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
      </div>`;

    const checkbox = el.querySelector('[data-role="repeat-check"]');
    const box = el.querySelector('[data-role="repeat-box"]');
    const weekdaySel = el.querySelector('[data-role="repeat-weekday"]');
    const yearLabel = el.querySelector('[data-role="year-label"]');
    const monthGrid = el.querySelector('[data-role="month-grid"]');
    const previewEl = el.querySelector('[data-role="repeat-preview"]');

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

    function renderPreview() {
      if (!checkbox.checked) return;
      const ds = dates();
      if (!ds.length) {
        previewEl.innerHTML = '<div class="repeat-empty">请先选择月份</div>';
        return;
      }
      const wdText = '周' + D.WEEKDAY_TEXT[Number(weekdaySel.value)];
      const byMonth = new Map();
      ds.forEach(iso => {
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
      lines.push('<div class="repeat-sum">合计 ' + ds.length + ' 条，保存后逐日生成</div>');
      previewEl.innerHTML = lines.join('');
    }

    function dates() {
      if (!checkbox.checked) return [];
      const wd = Number(weekdaySel.value);
      const out = [];
      Array.from(selectedMonths).sort().forEach(key => {
        const y = Number(key.slice(0, 4));
        const m = Number(key.slice(5, 7));
        out.push(...D.weekdayDatesInMonth(y, m, wd));
      });
      return out;
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
    el.querySelector('[data-role="year-prev"]').addEventListener('click', () => {
      year--;
      renderMonthGrid();
    });
    el.querySelector('[data-role="year-next"]').addEventListener('click', () => {
      year++;
      renderMonthGrid();
    });
    weekdaySel.addEventListener('change', renderPreview);
    checkbox.addEventListener('change', () => {
      box.hidden = !checkbox.checked;
      if (checkbox.checked) renderPreview();
      if (opts.onToggle) opts.onToggle(checkbox.checked);
    });

    renderMonthGrid();
    if (checkedSeed) renderPreview();

    return {
      element: el,
      checked() { return checkbox.checked; },
      weekday() { return Number(weekdaySel.value); },
      months() { return Array.from(selectedMonths).sort(); },
      dates,
      setEnabled(on) {
        checkbox.checked = !!on;
        box.hidden = !checkbox.checked;
        if (checkbox.checked) renderPreview();
        if (opts.onToggle) opts.onToggle(checkbox.checked);
      }
    };
  }

  global.WS = global.WS || {};
  global.WS.repeatrule = { createRepeatRule };
})(window);
