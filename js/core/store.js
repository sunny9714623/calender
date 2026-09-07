/**
 * 数据存储：事件 / 批注 / 导入记录 CRUD，localStorage 持久化。
 * 抽象为 Store 层，便于后续替换为 IndexedDB 或后端接口。
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'weekly-annotation-desk:v1';
  let storageOk = true;

  function defaultStore() {
    return {
      version: 1,
      events: [],
      annotations: [],
      files: [],
      settings: {
        defaultDuration: 60,
        theme: 'light',
        appName: '周行事例批注台',
        avatar: '',
        calBgColor: '',
        calBgImage: ''
      }
    };
  }

  function load() {
    const base = defaultStore();
    try {
      if (typeof localStorage !== 'undefined') {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          return {
            ...base,
            ...data,
            events: Array.isArray(data.events) ? data.events : [],
            annotations: Array.isArray(data.annotations) ? data.annotations : [],
            files: Array.isArray(data.files) ? data.files : [],
            settings: { ...base.settings, ...(data.settings || {}) }
          };
        }
      }
    } catch (e) {
      console.warn('读取本地数据失败，使用空数据', e);
    }
    return base;
  }

  function save(store) {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
      } else {
        storageOk = false;
      }
    } catch (e) {
      // 环境不允许 localStorage（如部分手机 file:// 打开）：降级为内存数据，不阻断使用
      storageOk = false;
      console.warn('本地存储不可用，数据仅保存在内存中', e);
    }
  }

  function storageAvailable() {
    return storageOk && typeof localStorage !== 'undefined';
  }

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  /** ISO 日期加天数（本地时区，避免 UTC 时区漂移） */
  function addDaysISO(iso, n) {
    if (typeof iso !== 'string') return null;
    const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + n);
    const y = d.getFullYear();
    const mon = d.getMonth() + 1;
    const day = d.getDate();
    return y + '-' + String(mon).padStart(2, '0') + '-' + String(day).padStart(2, '0');
  }

  /** ISO 日期 -> 星期（周一=0） */
  function weekdayOfISO(iso) {
    if (typeof iso !== 'string') return -1;
    const m = iso.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!m) return -1;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    return (d.getDay() + 6) % 7;
  }

  /**
   * 旧数据迁移：此前按月重复展开的事件/批注没有组标记。
   * 手动新增（无 sourceRow）且内容完全一致、日期都在同一星期的条目，按重复组补上组标记。
   */
  function assignLegacyRepeatGroups(store) {
    const eventKey = ev => JSON.stringify([
      ev.title || '', ev.allDay ? 1 : 0, ev.startTime || '', ev.endTime || '',
      ev.location || '', ev.owner || '', ev.description || ''
    ]);
    const annoKey = an => JSON.stringify([an.content || '', an.tags || '', an.priority || '']);
    let changed = false;

    const migrate = (list, keyFn, uidPrefix) => {
      const clusters = new Map();
      for (const item of list) {
        if (item.repeatGroupId || item.sourceRow) continue;
        const wd = weekdayOfISO(item.date);
        if (wd < 0) continue;
        const key = keyFn(item) + '|' + wd;
        if (!clusters.has(key)) clusters.set(key, []);
        clusters.get(key).push(item);
      }
      clusters.forEach(items => {
        if (items.length < 2) return;
        const dates = Array.from(new Set(items.map(x => x.date))).sort();
        if (dates.length < 2) return;
        const months = Array.from(new Set(dates.map(d => d.slice(0, 7)))).sort();
        const groupId = uid(uidPrefix);
        const wd = weekdayOfISO(dates[0]);
        items.forEach(item => {
          item.repeatGroupId = groupId;
          item.repeatWeekday = wd;
          item.repeatMonths = months.slice();
        });
        changed = true;
      });
    };

    migrate(store.events, eventKey, 'rg');
    migrate(store.annotations, annoKey, 'rg');
    return changed;
  }

  function createStore() {
    const store = load();
    if (assignLegacyRepeatGroups(store)) save(store);
    return {
      get state() { return store; },
      save() { save(store); },
      /** 整体替换（恢复 / 覆盖导入） */
      replace(next, opts) {
        const merged = opts && opts.merge;
        if (!merged) {
          store.events = next.events || [];
          store.annotations = next.annotations || [];
        } else {
          store.events = store.events.concat(next.events || []);
          store.annotations = store.annotations.concat(next.annotations || []);
        }
        store.files = (next.files || []).concat(store.files || []);
        save(store);
        return store;
      },
      importEvents(events, fileMeta, merge) {
        if (!merge) store.events = [];
        const stamped = events.map(e => ({
          ...e,
          id: uid('ev'),
          createdAt: new Date().toISOString()
        }));
        store.events = store.events.concat(stamped);
        if (fileMeta) store.files.unshift(fileMeta);
        save(store);
        return { events: stamped, store: store };
      },
      /** 批量新增（重复展开等一次性写入多条时使用，只保存一次） */
      addEvents(events) {
        const now = new Date().toISOString();
        const stamped = events.map(ev => ({
          id: uid('ev'),
          createdAt: now,
          ...ev
        }));
        store.events.push(...stamped);
        save(store);
        return stamped;
      },
      /** 批量新增批注（按月重复展开等一次性写入多条时使用） */
      addAnnotations(annotations) {
        const now = new Date().toISOString();
        const stamped = annotations.map(an => ({
          id: uid('an'),
          createdAt: now,
          author: '',
          priority: '',
          tags: '',
          ...an
        }));
        store.annotations.push(...stamped);
        save(store);
        return stamped;
      },
      addEvent(ev) {
        // 按月重复：repeatDates 为展开后的日期列表；同组事件带 repeatGroupId 便于整组修改
        if (Array.isArray(ev.repeatDates) && ev.repeatDates.length) {
          const base = { ...ev };
          delete base.repeatDates;
          const groupId = base.repeatGroupId || uid('rg');
          const instances = ev.repeatDates.map(d => {
            const item = { ...base, date: d, repeatGroupId: groupId };
            if (base.repeatWeekday !== undefined) item.repeatWeekday = base.repeatWeekday;
            if (Array.isArray(base.repeatMonths)) item.repeatMonths = base.repeatMonths.slice();
            if (!item.allDay && item.startTime && item.endTime && item.endTime < item.startTime) {
              item.crossDay = true;
              item.endDate = addDaysISO(d, 1);
            }
            return item;
          });
          return this.addEvents(instances);
        }
        const item = { id: uid('ev'), createdAt: new Date().toISOString(), ...ev };
        delete item.repeatDates;
        store.events.push(item);
        save(store);
        return item;
      },
      /** 整组重算：按目标日期保留/更新/新增事件，移除不再属于该组的日期 */
      syncEventGroup(groupId, patch, targetDates) {
        const now = new Date().toISOString();
        const target = Array.from(targetDates || []).sort();
        const old = store.events.filter(e => e.repeatGroupId === groupId);
        const exemplar = old[0] || null;
        const byDate = new Map(old.map(e => [e.date, e]));
        store.events = store.events.filter(e => e.repeatGroupId !== groupId);
        const added = [];
        const updated = [];
        const items = target.map(date => {
          const prev = byDate.get(date);
          const next = prev
            ? { ...prev, ...patch, updatedAt: now }
            : { ...(exemplar || patch), ...patch, id: uid('ev'), createdAt: now };
          delete next.repeatDates;
          next.date = date;
          next.repeatGroupId = groupId;
          if (patch.repeatWeekday !== undefined) next.repeatWeekday = patch.repeatWeekday;
          if (Array.isArray(patch.repeatMonths)) next.repeatMonths = patch.repeatMonths.slice();
          if (next.allDay) {
            next.startTime = '';
            next.endTime = '';
            next.crossDay = false;
            next.endDate = undefined;
          } else if (!next.allDay && next.startTime && next.endTime && next.endTime < next.startTime) {
            next.crossDay = true;
            next.endDate = addDaysISO(date, 1);
          } else {
            next.crossDay = false;
            next.endDate = undefined;
          }
          if (prev) {
            updated.push(next);
          } else {
            delete next.updatedAt;
            added.push(next);
          }
          return next;
        });
        store.events = store.events.concat(items);
        save(store);
        return {
          total: items.length,
          added: added.length,
          updated: updated.length,
          removed: Math.max(0, old.length - updated.length)
        };
      },
      /** 解除事件的重复组关联（改为普通单条事件） */
      unlinkEvent(id) {
        const idx = store.events.findIndex(e => e.id === id);
        if (idx === -1) return null;
        delete store.events[idx].repeatGroupId;
        delete store.events[idx].repeatWeekday;
        delete store.events[idx].repeatMonths;
        save(store);
        return store.events[idx];
      },
      updateEvent(id, patch) {
        const idx = store.events.findIndex(e => e.id === id);
        if (idx === -1) return null;
        store.events[idx] = { ...store.events[idx], ...patch, updatedAt: new Date().toISOString() };
        save(store);
        return store.events[idx];
      },
      deleteEvent(id) {
        store.events = store.events.filter(e => e.id !== id);
        save(store);
      },
      eventsOf(date) {
        return store.events.filter(e => e.date === date || (e.crossDay && e.endDate === date));
      },
      addAnnotation(an) {
        // 按月重复：repeatDates 为展开后的日期列表；同组批注带 repeatGroupId 便于整组修改
        if (Array.isArray(an.repeatDates) && an.repeatDates.length) {
          const base = { ...an };
          delete base.repeatDates;
          const groupId = base.repeatGroupId || uid('rg');
          const instances = an.repeatDates.map(date => {
            const item = { ...base, date, repeatGroupId: groupId };
            if (base.repeatWeekday !== undefined) item.repeatWeekday = base.repeatWeekday;
            if (Array.isArray(base.repeatMonths)) item.repeatMonths = base.repeatMonths.slice();
            return item;
          });
          return this.addAnnotations(instances);
        }
        const item = {
          id: uid('an'),
          createdAt: new Date().toISOString(),
          author: '',
          priority: '',
          tags: '',
          ...an
        };
        delete item.repeatDates;
        store.annotations.push(item);
        save(store);
        return item;
      },
      /** 整组重算：按目标日期保留/更新/新增批注，移除不再属于该组的日期 */
      syncAnnotationGroup(groupId, patch, targetDates) {
        const now = new Date().toISOString();
        const target = Array.from(targetDates || []).sort();
        const old = store.annotations.filter(a => a.repeatGroupId === groupId);
        const exemplar = old[0] || null;
        const byDate = new Map(old.map(a => [a.date, a]));
        store.annotations = store.annotations.filter(a => a.repeatGroupId !== groupId);
        const added = [];
        const updated = [];
        const items = target.map(date => {
          const prev = byDate.get(date);
          const next = prev
            ? { ...prev, ...patch, updatedAt: now }
            : { ...(exemplar || patch), ...patch, id: uid('an'), createdAt: now };
          delete next.repeatDates;
          next.date = date;
          next.repeatGroupId = groupId;
          if (patch.repeatWeekday !== undefined) next.repeatWeekday = patch.repeatWeekday;
          if (Array.isArray(patch.repeatMonths)) next.repeatMonths = patch.repeatMonths.slice();
          if (prev) {
            updated.push(next);
          } else {
            delete next.updatedAt;
            added.push(next);
          }
          return next;
        });
        store.annotations = store.annotations.concat(items);
        save(store);
        return {
          total: items.length,
          added: added.length,
          updated: updated.length,
          removed: Math.max(0, old.length - updated.length)
        };
      },
      /** 解除批注的重复组关联（改为普通单条批注） */
      unlinkAnnotation(id) {
        const idx = store.annotations.findIndex(a => a.id === id);
        if (idx === -1) return null;
        delete store.annotations[idx].repeatGroupId;
        delete store.annotations[idx].repeatWeekday;
        delete store.annotations[idx].repeatMonths;
        save(store);
        return store.annotations[idx];
      },
      updateAnnotation(id, patch) {
        const idx = store.annotations.findIndex(a => a.id === id);
        if (idx === -1) return null;
        store.annotations[idx] = { ...store.annotations[idx], ...patch, updatedAt: new Date().toISOString() };
        save(store);
        return store.annotations[idx];
      },
      deleteAnnotation(id) {
        store.annotations = store.annotations.filter(a => a.id !== id);
        save(store);
      },
      annotationsOf(date) {
        return store.annotations
          .filter(a => a.date === date)
          .sort((x, y) => (x.createdAt < y.createdAt ? 1 : -1));
      },
      updateSettings(patch) {
        store.settings = { ...store.settings, ...patch };
        save(store);
        return store.settings;
      },
      clearAll() {
        store.events = [];
        store.annotations = [];
        store.files = [];
        save(store);
      },
      exportJSON() {
        return JSON.stringify(store, null, 2);
      },
      /** 冲突检测：同日定时事件时间重叠的日期列表 */
      conflictDates() {
        const map = new Map();
        for (const e of store.events) {
          if (e.allDay || !e.startTime) continue;
          if (!map.has(e.date)) map.set(e.date, []);
          map.get(e.date).push(e);
        }
        const result = new Set();
        for (const [date, list] of map) {
          const sorted = list.slice().sort((a, b) => (a.startTime < b.startTime ? -1 : 1));
          for (let i = 1; i < sorted.length; i++) {
            const prev = sorted[i - 1];
            const cur = sorted[i];
            if (cur.startTime < prev.endTime) {
              result.add(date);
              break;
            }
          }
        }
        return result;
      }
    };
  }

  const store = { createStore, defaultStore, STORAGE_KEY, uid, storageAvailable };
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = store;
  } else {
    global.WS = global.WS || {};
    global.WS.store = store;
  }
})(typeof window !== 'undefined' ? window : globalThis);
