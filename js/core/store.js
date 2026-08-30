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

  function createStore() {
    const store = load();
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
      addEvent(ev) {
        const item = { id: uid('ev'), createdAt: new Date().toISOString(), ...ev };
        store.events.push(item);
        save(store);
        return item;
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
        const item = {
          id: uid('an'),
          createdAt: new Date().toISOString(),
          author: '',
          priority: '',
          tags: '',
          ...an
        };
        store.annotations.push(item);
        save(store);
        return item;
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
