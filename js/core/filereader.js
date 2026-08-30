/**
 * 文件读取：xlsx/xls/csv/txt/docx 统一转为记录数组或文本行。
 * .doc 旧版二进制浏览器无法解析，给出引导提示。
 * 依赖全局 XLSX / Papa / mammoth。
 */
(function (global) {
  'use strict';

  const AL = global.WS ? global.WS.aliases : null;

  function extOf(name) {
    const m = String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/);
    return m ? m[1] : '';
  }

  function readAsArrayBuffer(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsArrayBuffer(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(new Error('文件读取失败'));
      fr.readAsText(file, 'utf-8');
    });
  }

  function parseXlsx(buffer) {
    const wb = XLSX.read(buffer, { type: 'array' });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    if (!sheet) return [];
    return XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
  }

  function parseCsv(text) {
    const res = Papa.parse(text, { skipEmptyLines: 'greedy' });
    return res.data;
  }

  /** txt：先按行检测是否为表格（存在表头别名），否则按文本段落解析 */
  function parseTxt(text) {
    const lines = String(text).split(/\r?\n/);
    const nonEmpty = lines.map(l => l.trim()).filter(l => l !== '');
    if (nonEmpty.length === 0) return { kind: 'paragraphs', lines: [] };
    const first = nonEmpty[0];
    const delim = first.includes('\t') ? '\t' : (first.includes(',') ? ',' : /\s+/);
    const cells = first.split(delim);
    if (AL && AL.isHeaderRow(cells, 2)) {
      const records = lines
        .map(l => l.trim())
        .filter(l => l !== '')
        .map(l => l.split(delim));
      return { kind: 'table', records };
    }
    return { kind: 'paragraphs', lines };
  }

  /** docx：优先取表格；无表格取段落文本 */
  async function parseDocx(buffer) {
    const html = await mammoth.convertToHtml({ arrayBuffer: buffer });
    const doc = new DOMParser().parseFromString(html.value, 'text/html');
    const tables = doc.querySelectorAll('table');
    if (tables.length) {
      const records = [];
      tables[0].querySelectorAll('tr').forEach(tr => {
        const row = Array.from(tr.children).map(td => (td.textContent || '').trim());
        if (row.some(c => c !== '')) records.push(row);
      });
      if (records.length) return { kind: 'table', records };
    }
    const paras = Array.from(doc.querySelectorAll('p'))
      .map(p => (p.textContent || '').trim())
      .filter(t => t !== '');
    if (paras.length) return { kind: 'paragraphs', lines: paras };
    // 兜底：mammoth 原始文本
    const raw = await mammoth.extractRawText({ arrayBuffer: buffer });
    const rawLines = (raw.value || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    return { kind: 'paragraphs', lines: rawLines };
  }

  const SUPPORTED = {
    xlsx: 'xlsx', xls: 'xls', csv: 'csv', txt: 'txt', docx: 'docx', doc: 'doc'
  };

  /**
   * 读取文件为解析原料。
   * 返回 {kind:'table', records} | {kind:'paragraphs', lines} | {kind:'unsupported', message}
   */
  async function readFile(file) {
    const ext = extOf(file.name);
    const fileType = SUPPORTED[ext];
    if (!fileType) {
      return {
        kind: 'unsupported',
        message: '不支持的文件格式 .' + ext + '，请使用 .docx / .xlsx / .xls / .csv / .txt'
      };
    }
    if (fileType === 'doc') {
      return {
        kind: 'unsupported',
        message: '.doc 为旧版二进制格式，浏览器无法直接解析。请在 Word 中「另存为 .docx」后再导入。'
      };
    }
    if (fileType === 'xlsx' || fileType === 'xls') {
      const buf = await readAsArrayBuffer(file);
      return { kind: 'table', records: parseXlsx(buf) };
    }
    if (fileType === 'csv') {
      const text = await readAsText(file);
      return { kind: 'table', records: parseCsv(text) };
    }
    if (fileType === 'txt') {
      const text = await readAsText(file);
      return parseTxt(text);
    }
    if (fileType === 'docx') {
      const buf = await readAsArrayBuffer(file);
      return parseDocx(buf);
    }
    return { kind: 'unsupported', message: '未知错误' };
  }

  const filereader = { readFile, extOf };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = filereader;
  } else {
    global.WS = global.WS || {};
    global.WS.filereader = filereader;
  }
})(typeof window !== 'undefined' ? window : globalThis);
