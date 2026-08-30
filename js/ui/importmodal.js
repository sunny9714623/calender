/**
 * 导入弹窗：文件选择/拖拽 → 解析预览（表头映射、行校验、错误行编辑）→ 覆盖/合并导入。
 */
(function (global) {
  'use strict';

  const AL = global.WS.aliases;
  const RP = global.WS.rowparser;
  const D = global.WS.dateutil;
  const { showToast, confirmDialog } = global.WS.toast;
  const { escAttr, escHtml } = global.WS.eventform;

  const FIELD_OPTIONS = ['date', 'weekday', 'start', 'end', 'title', 'location', 'owner', 'description', 'ignore'];

  function openImportModal(opts) {
    const { store, onImported } = opts;
    const state = {
      file: null,
      preview: null,
      records: null,
      lines: null,
      strategy: 'overwrite',
      mapping: null,
      columns: null,
      rowEdits: new Map(), // rowNo -> 编辑后的单元格数组
      paraEdits: new Map(), // rowNo -> 编辑后的文本
      loading: false
    };

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal import-modal" role="dialog" aria-modal="true">
        <h3 class="modal-title">导入周行事例</h3>
        <div class="import-body">
          <div class="drop-zone" tabindex="0">
            <div class="drop-icon">⇪</div>
            <p><strong>点击选择</strong> 或将文件拖拽到此处</p>
            <p class="drop-hint">支持 .docx / .xlsx / .xls / .csv / .txt</p>
            <input type="file" accept=".docx,.xlsx,.xls,.csv,.txt,.doc" hidden>
          </div>
          <div class="import-history">
            <h4>导入记录</h4>
            <div class="history-list">${historyHtml(store)}</div>
          </div>
          <div class="preview-area" hidden>
            <div class="preview-toolbar">
              <div class="file-chip">📄 <span data-role="file-name"></span></div>
              <label class="strategy">
                <span>导入策略</span>
                <select data-role="strategy">
                  <option value="overwrite">覆盖（清空原事件）</option>
                  <option value="merge">合并（追加）</option>
                </select>
              </label>
              <button type="button" class="btn btn-primary" data-role="confirm">确认导入</button>
            </div>
            <div class="preview-summary" data-role="summary"></div>
            <div data-role="mapping-area"></div>
            <div class="preview-table-wrap" data-role="table-wrap"></div>
          </div>
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-ghost" data-role="close">关闭</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const $ = sel => overlay.querySelector(sel);
    const close = () => overlay.remove();
    $('[data-role="close"]').addEventListener('click', close);
    overlay.addEventListener('click', e => { if (e.target === overlay) close(); });

    // ---------- 文件选择 / 拖拽 ----------
    const dropZone = overlay.querySelector('.drop-zone');
    const fileInput = dropZone.querySelector('input[type=file]');
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInput.click(); }
    });
    fileInput.addEventListener('change', () => {
      if (fileInput.files.length) handleFile(fileInput.files[0]);
    });
    ['dragover', 'dragenter'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.add('dragover');
    }));
    ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, e => {
      e.preventDefault();
      dropZone.classList.remove('dragover');
    }));
    dropZone.addEventListener('drop', e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if (file) handleFile(file);
    });

    $('[data-role="strategy"]').addEventListener('change', e => {
      state.strategy = e.target.value;
    });
    // 未解析文件前禁止确认
    $('[data-role="confirm"]').disabled = true;

    async function handleFile(file) {
      if (state.loading) return;
      state.loading = true;
      dropZone.classList.add('loading');
      dropZone.querySelector('.drop-icon').textContent = '…';
      try {
        const result = await global.WS.filereader.readFile(file);
        if (result.kind === 'unsupported') {
          showToast(result.message, 'error', 4200);
          dropZone.querySelector('.drop-icon').textContent = '⇪';
          return;
        }
        state.file = file;
        $('.preview-area').hidden = false;
        dropZone.hidden = true;
        $('[data-role="file-name"]').textContent = file.name;
        buildPreview(result);
      } catch (err) {
        console.error(err);
        showToast('文件解析失败：' + err.message, 'error', 4200);
      } finally {
        state.loading = false;
        dropZone.classList.remove('loading');
      }
    }

    function buildPreview(result) {
      state.records = result.kind === 'table' ? result.records : null;
      state.lines = result.kind === 'paragraphs' ? result.lines : null;
      state.rowEdits = new Map();
      state.paraEdits = new Map();
      if (result.kind === 'table') {
        const refWeek = global.WS.parser.resolveRefWeek(result.records, D.todayISO());
        state.preview = global.WS.parser.buildTablePreview(result.records, {
          refWeekStart: refWeek,
          defaultDuration: store.state.settings.defaultDuration
        });
        if (state.preview.kind === 'weekgrid') {
          state.gridRecords = global.WS.parser.cleanRecords(result.records);
          renderWeekGrid(state.preview.rows);
        } else {
          state.columns = state.preview.columns;
          state.mapping = { ...state.preview.mapping };
          reparseTable();
        }
      } else {
        const refWeek = global.WS.parser.resolveRefWeek([], D.todayISO());
        state.preview = global.WS.parser.buildParagraphPreview(result.lines, {
          refWeekStart: refWeek,
          defaultDuration: store.state.settings.defaultDuration
        });
        renderParagraphs();
      }
    }

    function effectiveMapping() {
      const m = {};
      const used = new Set();
      // 基于 select 值构建
      state.columns.forEach((_, i) => {
        const sel = overlay.querySelector(`[data-map-col="${i}"]`);
        const val = sel ? sel.value : null;
        if (val && val !== 'ignore' && !used.has(val)) {
          m[val] = i;
          used.add(val);
        }
      });
      FIELD_OPTIONS.filter(f => f !== 'ignore').forEach(f => { if (m[f] === undefined) m[f] = -1; });
      return m;
    }

    function reparseTable() {
      const sel0 = overlay.querySelector('[data-map-col="0"]');
      const mapping = sel0 ? effectiveMapping() : { ...state.mapping };
      state.mapping = mapping;
      const refWeek = global.WS.parser.resolveRefWeek(state.records, D.todayISO());
      const rows = state.preview.rows.map(r => {
        const rowNo = r.rowNo;
        const edited = state.rowEdits.get(rowNo);
        const rec = edited || r.raw;
        const res = RP.parseRow(rec, mapping, { refWeekStart: refWeek, defaultDuration: store.state.settings.defaultDuration });
        return {
          rowNo, record: rec, status: res.ok ? 'ok' : 'error',
          errors: res.errors || [], warnings: res.warnings || [], event: res.event || null
        };
      });
      state.preview = { kind: 'table', columns: state.columns, rows };
      renderTable(rows);
    }

    function renderTable(rows) {
      const ok = rows.filter(r => r.status === 'ok').length;
      const bad = rows.length - ok;
      $('[data-role="summary"]').innerHTML =
        `<span class="sum-ok">✓ 可导入 ${ok} 行</span>` +
        (bad ? `<span class="sum-bad">✗ 错误 ${bad} 行</span>` : '') +
        (rows.length ? '' : '<span>未解析到数据行</span>');

      // 列映射
      const mapArea = $('[data-role="mapping-area"]');
      mapArea.innerHTML = `<div class="map-row">
        <span class="map-label">列映射：</span>
        ${state.columns.map((col, i) => {
          const cur = Object.keys(state.mapping || {}).find(k => state.mapping[k] === i);
          const opts = FIELD_OPTIONS.map(f =>
            `<option value="${f}" ${f === cur ? 'selected' : ''}>${f === 'ignore' ? '忽略' : AL.FIELD_LABELS[f]}</option>`).join('');
          return `<span class="map-cell"><em>${escHtml(col)}</em><select data-map-col="${i}">${opts}</select></span>`;
        }).join('')}
      </div>`;
      mapArea.querySelectorAll('select').forEach(sel => {
        sel.addEventListener('change', reparseTable);
      });

      // 数据表
      const wrap = $('[data-role="table-wrap"]');
      wrap.innerHTML = `
        <table class="parse-table">
          <thead><tr>
            <th>行号</th>
            ${state.columns.map(c => '<th>' + escHtml(c) + '</th>').join('')}
            <th>状态</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const cls = r.status === 'ok' ? 'row-ok' : 'row-error';
              const statusHtml = r.status === 'ok'
                ? '<span class="row-status ok">✓</span>'
                : '<span class="row-status bad" title="' + escAttr(r.errors.join('；')) + '">✗</span>';
              return `<tr class="${cls}" data-row="${r.rowNo}">
                <td class="row-no">${r.rowNo}</td>
                ${state.columns.map((_, i) => {
                  const val = r.record[i] == null ? '' : r.record[i];
                  if (r.status === 'error') {
                    return `<td><input type="text" class="cell-edit" data-row="${r.rowNo}" data-col="${i}" value="${escAttr(val)}"></td>`;
                  }
                  return `<td title="${escAttr(val)}">${escHtml(String(val))}</td>`;
                }).join('')}
                <td>
                  <div class="row-msg">${r.status === 'ok'
                    ? (r.warnings.length ? '<span class="row-warn">' + escHtml(r.warnings.join('；')) + '</span>' : '<span class="row-ok-text">可导入</span>')
                    : '<span class="row-err-text">' + escHtml(r.errors.join('；')) + '</span>'}
                  </div>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;

      wrap.querySelectorAll('.cell-edit').forEach(input => {
        input.addEventListener('change', () => {
          const rowNo = Number(input.dataset.row);
          const col = Number(input.dataset.col);
          if (!state.rowEdits.has(rowNo)) state.rowEdits.set(rowNo, state.preview.rows.find(r => r.rowNo === rowNo).record.slice());
          state.rowEdits.get(rowNo)[col] = input.value;
          reparseTable();
        });
      });
      $('[data-role="confirm"]').disabled = rows.length === 0 || ok === 0;
    }

    function reparseWeekGrid() {
      state.preview = global.WS.parser.buildTablePreview(state.gridRecords, {
        defaultDuration: store.state.settings.defaultDuration
      });
      renderWeekGrid(state.preview.rows);
    }

    function renderWeekGrid(rows) {
      const ok = rows.filter(r => r.status === 'ok').length;
      const bad = rows.length - ok;
      $('[data-role="summary"]').innerHTML =
        `<span class="sum-ok">✓ 可导入 ${ok} 条事件</span>` +
        (bad ? `<span class="sum-bad">✗ 错误 ${bad} 格</span>` : '') +
        '<span class="map-label" style="margin-left:8px">已识别「周历网格」模板：周次 × 周一~周日，自动按格推算日期</span>';

      $('[data-role="mapping-area"]').innerHTML = '';
      const wrap = $('[data-role="table-wrap"]');
      wrap.innerHTML = `
        <table class="parse-table">
          <thead><tr>
            <th>周次</th><th>原始内容</th><th>日期</th><th>事项</th><th>状态</th>
          </tr></thead>
          <tbody>
            ${rows.map(r => {
              const cls = r.status === 'ok' ? 'row-ok' : 'row-error';
              const dateHtml = r.event ? escHtml(r.event.date + (r.event.allDay ? '（全天）' : '')) : '<span class="row-err-text">—</span>';
              const titleHtml = r.status === 'ok'
                ? escHtml(r.event.title)
                : `<input type="text" class="cell-edit" data-grid-row="${r.rowNo}" data-grid-col="${r.col}" value="${escAttr(r.raw[1])}">`;
              const msgHtml = r.status === 'ok'
                ? (r.warnings.length ? '<span class="row-warn">' + escHtml(r.warnings.join('；')) + '</span>' : '<span class="row-ok-text">✓</span>')
                : '<span class="row-err-text">✗ ' + escHtml(r.errors.join('；')) + '</span>';
              return `<tr class="${cls}" data-row="${r.rowNo}">
                <td class="row-no">${escHtml(r.raw[0])}</td>
                <td title="${escAttr(r.raw[1])}">${escHtml(r.raw[1])}</td>
                <td>${dateHtml}</td>
                <td>${titleHtml}</td>
                <td><div class="row-msg">${msgHtml}</div></td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>`;
      wrap.querySelectorAll('[data-grid-row]').forEach(input => {
        input.addEventListener('change', () => {
          const rowNo = Number(input.dataset.gridRow);
          const col = Number(input.dataset.gridCol);
          if (state.gridRecords[rowNo - 1]) state.gridRecords[rowNo - 1][col] = input.value;
          reparseWeekGrid();
        });
      });
      $('[data-role="confirm"]').disabled = rows.length === 0 || ok === 0;
    }

    function renderParagraphs() {
      const rows = state.preview.rows;
      const ok = rows.filter(r => r.status === 'ok').length;
      const bad = rows.length - ok;
      $('[data-role="summary"]').innerHTML =
        `<span class="sum-ok">✓ 可导入 ${ok} 行</span>` +
        (bad ? `<span class="sum-bad">✗ 错误 ${bad} 行</span>` : '');
      $('[data-role="mapping-area"]').innerHTML = '';
      const wrap = $('[data-role="table-wrap"]');
      wrap.innerHTML = `
        <div class="para-list">
          ${rows.map(r => {
            const cls = r.status === 'ok' ? 'row-ok' : 'row-error';
            const msg = r.status === 'ok'
              ? (r.warnings.length ? '<span class="row-warn">' + escHtml(r.warnings.join('；')) + '</span>' : '<span class="row-ok-text">✓ 可导入</span>')
              : '<span class="row-err-text">✗ ' + escHtml(r.errors.join('；')) + '</span>';
            const editable = r.status === 'error'
              ? `<input type="text" class="para-edit" data-row="${r.rowNo}" value="${escAttr(r.record[0])}">`
              : `<span class="para-text">${escHtml(r.record[0])}</span>`;
            return `<div class="para-row ${cls}" data-row="${r.rowNo}">
              <span class="para-no">${r.rowNo}</span>
              <div class="para-main">${editable}</div>
              <div class="row-msg">${msg}</div>
            </div>`;
          }).join('')}
        </div>`;
      wrap.querySelectorAll('.para-edit').forEach(input => {
        input.addEventListener('change', () => {
          state.paraEdits.set(Number(input.dataset.row), input.value);
          reparseParagraphs();
        });
      });
      $('[data-role="confirm"]').disabled = rows.length === 0 || ok === 0;
    }

    function reparseParagraphs() {
      const refWeek = global.WS.parser.resolveRefWeek([], D.todayISO());
      const rows = state.preview.rows.map(r => {
        const text = state.paraEdits.has(r.rowNo) ? state.paraEdits.get(r.rowNo) : r.record[0];
        const res = RP.parseFreeTextLine(text, { refWeekStart: refWeek, defaultDuration: store.state.settings.defaultDuration });
        return {
          rowNo: r.rowNo, record: [text], status: res.ok ? 'ok' : 'error',
          errors: res.errors || [], warnings: res.warnings || [], event: res.event || null
        };
      });
      state.preview.rows = rows;
      renderParagraphs();
    }

    // ---------- 确认导入 ----------
    $('[data-role="confirm"]').addEventListener('click', async () => {
      if (!state.preview || !state.preview.rows) {
        showToast('请先选择并解析文件', 'error');
        return;
      }
      const rows = state.preview.rows;
      const okRows = rows.filter(r => r.status === 'ok');
      const badRows = rows.filter(r => r.status === 'error');
      if (!okRows.length) {
        showToast('没有可导入的行，请先修正错误', 'error');
        return;
      }
      if (badRows.length) {
        const go = await confirmDialog({
          title: '存在错误行',
          message: `${badRows.length} 行解析失败将被跳过，仅导入 ${okRows.length} 行。是否继续？`,
          confirmText: '跳过并导入',
          danger: true
        });
        if (!go) return;
      } else if (store.state.events.length && state.strategy === 'overwrite') {
        const go = await confirmDialog({
          title: '覆盖导入',
          message: `将清空现有 ${store.state.events.length} 条事件，导入 ${okRows.length} 条。批注数据不受影响。是否继续？`,
          confirmText: '覆盖并导入',
          danger: true
        });
        if (!go) return;
      }
      const events = okRows.map(r => {
        const ev = { ...r.event };
        ev.sourceRow = r.rowNo;
        return ev;
      });
      const fileMeta = {
        fileId: global.WS.store.uid('f'),
        fileName: state.file ? state.file.name : '',
        fileType: state.file ? global.WS.filereader.extOf(state.file.name) : '',
        importTime: new Date().toISOString(),
        totalRows: rows.length,
        successRows: events.length,
        failedRows: badRows.length
      };
      store.importEvents(events, fileMeta, state.strategy === 'merge');
      showToast(`导入完成：${events.length} 条事件` + (badRows.length ? `，跳过 ${badRows.length} 行` : ''), 'success', 3600);
      close();
      if (onImported) onImported(events);
    });
  }

  function historyHtml(store) {
    const files = store.state.files.slice(0, 5);
    if (!files.length) return '<p class="empty-hint">暂无导入记录</p>';
    return files.map(f => `
      <div class="history-item">
        <span class="hist-name">${escHtml(f.fileName)}</span>
        <span class="hist-meta">${escHtml((f.importTime || '').replace('T', ' ').slice(0, 16))} · 成功 ${f.successRows} / ${f.totalRows}</span>
      </div>`).join('');
  }

  global.WS = global.WS || {};
  global.WS.importmodal = { openImportModal };
})(window);
