/**
 * UX Pulse — Background Service Worker
 * Manages session state, routes messages, tracks tabs/navigation.
 */

// ── Inline constants (shared/constants.js values) ───────────

const EventType = {
  SESSION_START: 'SESSION_START', SESSION_COMPLETE: 'SESSION_COMPLETE', SESSION_ABANDON: 'SESSION_ABANDON',
  CLICK: 'CLICK', DOUBLE_CLICK: 'DOUBLE_CLICK', RIGHT_CLICK: 'RIGHT_CLICK', DEAD_CLICK: 'DEAD_CLICK', RAGE_CLICK: 'RAGE_CLICK',
  SCROLL: 'SCROLL', SCROLL_REVERSAL: 'SCROLL_REVERSAL',
  PAGE_LOAD: 'PAGE_LOAD', PAGE_NAVIGATE: 'PAGE_NAVIGATE', PAGE_BACK: 'PAGE_BACK', PAGE_FORWARD: 'PAGE_FORWARD',
  HASH_CHANGE: 'HASH_CHANGE', TAB_SWITCH: 'TAB_SWITCH', TAB_FOCUS: 'TAB_FOCUS', TAB_BLUR: 'TAB_BLUR',
  HOVER_DWELL: 'HOVER_DWELL', IDLE_PAUSE: 'IDLE_PAUSE',
  FORM_FOCUS: 'FORM_FOCUS', FORM_SUBMIT: 'FORM_SUBMIT', FORM_ERROR: 'FORM_ERROR',
  API_REQUEST_START: 'API_REQUEST_START', API_REQUEST_END: 'API_REQUEST_END', API_REQUEST_ERROR: 'API_REQUEST_ERROR',
  SCREENSHOT: 'SCREENSHOT',
  PAGE_VISIBLE: 'PAGE_VISIBLE', PAGE_HIDDEN: 'PAGE_HIDDEN',
  WINDOW_RESIZE: 'WINDOW_RESIZE', COPY: 'COPY', PASTE: 'PASTE',
};

const MessageType = {
  START_SESSION: 'START_SESSION', END_SESSION: 'END_SESSION', GET_STATUS: 'GET_STATUS',
  LOG_EVENT: 'LOG_EVENT', LOG_BATCH: 'LOG_BATCH',
  CAPTURE_SCREENSHOT: 'CAPTURE_SCREENSHOT',
  EXPORT_SESSION: 'EXPORT_SESSION', EXPORT_ALL: 'EXPORT_ALL',
  GET_SESSIONS: 'GET_SESSIONS', GET_SESSION_EVENTS: 'GET_SESSION_EVENTS', GET_EVENT_SUMMARY: 'GET_EVENT_SUMMARY',
  CLEAR_ALL: 'CLEAR_ALL', DELETE_SESSION: 'DELETE_SESSION', GET_SESSION_SCREENSHOTS: 'GET_SESSION_SCREENSHOTS',
  RECORDING_STARTED: 'RECORDING_STARTED', RECORDING_STOPPED: 'RECORDING_STOPPED',
  PING: 'PING',
};

// ── IndexedDB (lightweight inline version) ──────────────────

const DB_NAME = 'ux-pulse';
const DB_VERSION = 1;
let _db = null;

function getDB() {
  if (_db) return Promise.resolve(_db);
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('sessions')) {
        const s = db.createObjectStore('sessions', { keyPath: 'id' });
        s.createIndex('byEmail', 'userEmail', { unique: false });
        s.createIndex('byStatus', 'status', { unique: false });
        s.createIndex('byStartTime', 'startTime', { unique: false });
      }
      if (!db.objectStoreNames.contains('events')) {
        const e2 = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
        e2.createIndex('bySession', 'sessionId', { unique: false });
        e2.createIndex('byType', 'type', { unique: false });
        e2.createIndex('byTimestamp', 'timestamp', { unique: false });
      }
      if (!db.objectStoreNames.contains('screenshots')) {
        const sc = db.createObjectStore('screenshots', { keyPath: 'id', autoIncrement: true });
        sc.createIndex('bySession', 'sessionId', { unique: false });
      }
    };
    req.onsuccess = (e) => { _db = e.target.result; resolve(_db); };
    req.onerror = (e) => reject(e.target.error);
  });
}

async function dbPut(store, obj) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(obj);
    tx.oncomplete = () => resolve(obj);
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbAdd(store, obj) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    const r = tx.objectStore(store).add(obj);
    r.onsuccess = () => { obj.id = r.result; resolve(obj); };
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbGet(store, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).get(key);
    r.onsuccess = () => resolve(r.result || null);
    r.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAllByIndex(store, indexName, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).index(indexName).getAll(key);
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = (e) => reject(e.target.error);
  });
}

async function dbGetAll(store) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readonly');
    const r = tx.objectStore(store).getAll();
    r.onsuccess = () => resolve(r.result || []);
    r.onerror = (e) => reject(e.target.error);
  });
}

async function dbClear(stores) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, 'readwrite');
    for (const s of stores) tx.objectStore(s).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

async function dbDelete(store, key) {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
}

// ── Session State ───────────────────────────────────────────

let currentSession = null; // { id, userEmail, taskName, startTime, eventCount }

async function restoreState() {
  const data = await chrome.storage.session.get('currentSession');
  if (data.currentSession) {
    currentSession = data.currentSession;
  }
}

async function persistState() {
  await chrome.storage.session.set({ currentSession });
}

// Restore on service worker startup
restoreState();

// ── Message Handler ─────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  handleMessage(message, sender).then(sendResponse).catch((err) => {
    console.error('[UX Pulse] Message error:', err);
    sendResponse({ success: false, error: err.message });
  });
  return true; // keep channel open for async response
});

async function handleMessage(msg, sender) {
  switch (msg.type) {

    case MessageType.START_SESSION: {
      const session = {
        id: crypto.randomUUID(),
        userEmail: msg.userEmail,
        taskName: msg.taskName,
        taskDescription: msg.taskDescription || '',
        status: 'active',
        startTime: Date.now(),
        endTime: null,
        durationMs: null,
        startUrl: msg.startUrl || '',
        eventCount: 0,
      };
      await dbPut('sessions', session);

      currentSession = {
        id: session.id,
        userEmail: session.userEmail,
        taskName: session.taskName,
        startTime: session.startTime,
        eventCount: 0,
      };
      await persistState();

      // Log session start event
      await dbAdd('events', {
        sessionId: session.id,
        type: EventType.SESSION_START,
        timestamp: Date.now(),
        url: msg.startUrl || '',
        tabId: 0,
        data: { userEmail: session.userEmail, taskName: session.taskName },
      });
      currentSession.eventCount = 1;
      await persistState();

      // Broadcast to all content scripts
      broadcastToTabs(MessageType.RECORDING_STARTED, { sessionId: session.id });

      return { success: true, session };
    }

    case MessageType.END_SESSION: {
      if (!currentSession) return { success: false, error: 'No active session' };

      const session = await dbGet('sessions', currentSession.id);
      if (session) {
        session.status = msg.status; // 'completed' or 'abandoned'
        session.endTime = Date.now();
        session.durationMs = session.endTime - session.startTime;
        session.eventCount = currentSession.eventCount;
        await dbPut('sessions', session);

        // Log session end event
        const endType = msg.status === 'completed' ? EventType.SESSION_COMPLETE : EventType.SESSION_ABANDON;
        await dbAdd('events', {
          sessionId: session.id,
          type: endType,
          timestamp: Date.now(),
          url: '',
          tabId: 0,
          data: { durationMs: session.durationMs },
        });
      }

      const endedSession = currentSession;
      currentSession = null;
      await persistState();

      broadcastToTabs(MessageType.RECORDING_STOPPED, {});

      return { success: true, sessionId: endedSession.id };
    }

    case MessageType.GET_STATUS: {
      return {
        success: true,
        isRecording: !!currentSession,
        session: currentSession,
      };
    }

    case MessageType.LOG_EVENT: {
      if (!currentSession) return { success: false, error: 'No active session' };

      const event = {
        sessionId: currentSession.id,
        type: msg.eventType,
        timestamp: msg.timestamp || Date.now(),
        url: msg.url || (sender.tab ? sender.tab.url : ''),
        tabId: sender.tab ? sender.tab.id : 0,
        data: msg.data || {},
      };
      await dbAdd('events', event);

      currentSession.eventCount++;
      await persistState();

      // Capture screenshot on click or navigate events
      if (msg.eventType === EventType.CLICK || msg.eventType === EventType.PAGE_NAVIGATE) {
        captureScreenshot(currentSession.id, msg.eventType);
      }

      return { success: true, eventCount: currentSession.eventCount };
    }

    case MessageType.LOG_BATCH: {
      if (!currentSession) return { success: false, error: 'No active session' };

      const events = (msg.events || []).map(e => ({
        sessionId: currentSession.id,
        type: e.eventType,
        timestamp: e.timestamp || Date.now(),
        url: e.url || '',
        tabId: sender.tab ? sender.tab.id : 0,
        data: e.data || {},
      }));

      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction('events', 'readwrite');
        const store = tx.objectStore('events');
        for (const event of events) store.add(event);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });

      currentSession.eventCount += events.length;
      await persistState();

      // Screenshot on first CLICK in the batch
      const hasClick = events.some(e => e.type === 'CLICK');
      if (hasClick) {
        captureScreenshot(currentSession.id, 'CLICK');
      }

      return { success: true, eventCount: currentSession.eventCount };
    }

    case MessageType.CAPTURE_SCREENSHOT: {
      if (!currentSession) return { success: false };
      await captureScreenshot(currentSession.id, msg.trigger || 'manual');
      return { success: true };
    }

    case MessageType.GET_SESSIONS: {
      const sessions = await dbGetAll('sessions');
      sessions.sort((a, b) => b.startTime - a.startTime);
      return { success: true, sessions };
    }

    case MessageType.GET_SESSION_EVENTS: {
      const events = await dbGetAllByIndex('events', 'bySession', msg.sessionId);
      events.sort((a, b) => a.timestamp - b.timestamp);
      return { success: true, events };
    }

    case MessageType.GET_EVENT_SUMMARY: {
      const events = await dbGetAllByIndex('events', 'bySession', msg.sessionId);
      const summary = {};
      for (const e of events) {
        summary[e.type] = (summary[e.type] || 0) + 1;
      }
      return { success: true, summary };
    }

    case MessageType.EXPORT_SESSION: {
      const session = await dbGet('sessions', msg.sessionId);
      if (!session) return { success: false, error: 'Session not found' };
      const events = await dbGetAllByIndex('events', 'bySession', msg.sessionId);
      events.sort((a, b) => a.timestamp - b.timestamp);
      const csv = buildCSV(session, events);
      return { success: true, csv };
    }

    case MessageType.EXPORT_ALL: {
      const sessions = await dbGetAll('sessions');
      sessions.sort((a, b) => b.startTime - a.startTime);
      let allRows = [];
      for (const session of sessions) {
        const events = await dbGetAllByIndex('events', 'bySession', session.id);
        events.sort((a, b) => a.timestamp - b.timestamp);
        allRows = allRows.concat(buildRows(session, events));
      }
      const header = 'session_id,user_email,task_name,task_status,session_duration_ms,event_id,event_type,event_timestamp,event_timestamp_readable,event_url,event_data';
      return { success: true, csv: header + '\n' + allRows.join('\n') };
    }

    case MessageType.GET_SESSION_SCREENSHOTS: {
      const screenshots = await dbGetAllByIndex('screenshots', 'bySession', msg.sessionId);
      screenshots.sort((a, b) => a.timestamp - b.timestamp);
      return { success: true, screenshots };
    }

    case MessageType.DELETE_SESSION: {
      const events = await dbGetAllByIndex('events', 'bySession', msg.sessionId);
      const screenshots = await dbGetAllByIndex('screenshots', 'bySession', msg.sessionId);
      const db = await getDB();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(['sessions', 'events', 'screenshots'], 'readwrite');
        tx.objectStore('sessions').delete(msg.sessionId);
        for (const e of events) tx.objectStore('events').delete(e.id);
        for (const s of screenshots) tx.objectStore('screenshots').delete(s.id);
        tx.oncomplete = () => resolve();
        tx.onerror = (e) => reject(e.target.error);
      });
      return { success: true };
    }

    case MessageType.CLEAR_ALL: {
      await dbClear(['sessions', 'events', 'screenshots']);
      return { success: true };
    }

    case MessageType.PING: {
      return { success: true, alive: true };
    }

    default:
      return { success: false, error: 'Unknown message type: ' + msg.type };
  }
}

// ── Screenshot Capture ──────────────────────────────────────

async function captureScreenshot(sessionId, trigger) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;

    const dataUrl = await chrome.tabs.captureVisibleTab(null, {
      format: 'jpeg',
      quality: 60,
    });

    await dbAdd('screenshots', {
      sessionId,
      dataUrl,
      timestamp: Date.now(),
      trigger,
    });

    // Also log a SCREENSHOT event
    await dbAdd('events', {
      sessionId,
      type: EventType.SCREENSHOT,
      timestamp: Date.now(),
      url: tab.url || '',
      tabId: tab.id || 0,
      data: { trigger },
    });

    if (currentSession) {
      currentSession.eventCount++;
      await persistState();
    }
  } catch (err) {
    // Tab might not be active or capturable — ignore silently
    console.warn('[UX Pulse] Screenshot failed:', err.message);
  }
}

// ── Tab / Navigation Tracking ───────────────────────────────

chrome.tabs.onActivated.addListener(async (activeInfo) => {
  if (!currentSession) return;

  try {
    const tab = await chrome.tabs.get(activeInfo.tabId);
    await dbAdd('events', {
      sessionId: currentSession.id,
      type: EventType.TAB_SWITCH,
      timestamp: Date.now(),
      url: tab.url || '',
      tabId: activeInfo.tabId,
      data: { windowId: activeInfo.windowId, title: tab.title || '' },
    });
    currentSession.eventCount++;
    await persistState();
  } catch (err) {
    // Tab may have been closed
  }
});

chrome.webNavigation.onCommitted.addListener(async (details) => {
  if (!currentSession) return;
  if (details.frameId !== 0) return; // main frame only

  let eventType = EventType.PAGE_NAVIGATE;
  const qualifiers = details.transitionQualifiers || [];

  if (qualifiers.includes('forward_back')) {
    if (details.transitionType === 'typed' || details.transitionType === 'auto_bookmark') {
      eventType = EventType.PAGE_NAVIGATE;
    } else {
      // Determine back vs forward — Chrome doesn't distinguish, so we just use PAGE_BACK
      eventType = EventType.PAGE_BACK;
    }
  }

  await dbAdd('events', {
    sessionId: currentSession.id,
    type: eventType,
    timestamp: Date.now(),
    url: details.url,
    tabId: details.tabId,
    data: {
      transitionType: details.transitionType,
      transitionQualifiers: qualifiers,
    },
  });
  currentSession.eventCount++;
  await persistState();
});

chrome.webNavigation.onHistoryStateUpdated.addListener(async (details) => {
  if (!currentSession) return;
  if (details.frameId !== 0) return;

  await dbAdd('events', {
    sessionId: currentSession.id,
    type: EventType.HASH_CHANGE,
    timestamp: Date.now(),
    url: details.url,
    tabId: details.tabId,
    data: { transitionType: details.transitionType },
  });
  currentSession.eventCount++;
  await persistState();
});

chrome.webNavigation.onCompleted.addListener(async (details) => {
  if (!currentSession) return;
  if (details.frameId !== 0) return;

  await dbAdd('events', {
    sessionId: currentSession.id,
    type: EventType.PAGE_LOAD,
    timestamp: Date.now(),
    url: details.url,
    tabId: details.tabId,
    data: {},
  });
  currentSession.eventCount++;
  await persistState();

  // Screenshot on page load
  captureScreenshot(currentSession.id, 'page_load');
});

// ── Keepalive ───────────────────────────────────────────────

chrome.alarms.create('ux-pulse-keepalive', { periodInMinutes: 0.4 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'ux-pulse-keepalive') {
    // Just wakes the service worker — no action needed
  }
});

// ── Helpers ─────────────────────────────────────────────────

function broadcastToTabs(type, payload) {
  chrome.tabs.query({}, (tabs) => {
    for (const tab of tabs) {
      if (tab.id && tab.url && !tab.url.startsWith('chrome://')) {
        chrome.tabs.sendMessage(tab.id, { type, ...payload }).catch(() => {});
      }
    }
  });
}

function buildCSV(session, events) {
  const header = 'session_id,user_email,task_name,task_status,session_duration_ms,event_id,event_type,event_timestamp,event_timestamp_readable,event_url,event_data';
  return header + '\n' + buildRows(session, events).join('\n');
}

function buildRows(session, events) {
  return events.map(event => {
    const dataJson = JSON.stringify(event.data || {}).replace(/"/g, '""');
    const readable = new Date(event.timestamp).toISOString();
    return [
      session.id,
      csvEscape(session.userEmail),
      csvEscape(session.taskName),
      session.status,
      session.durationMs || '',
      event.id,
      event.type,
      event.timestamp,
      readable,
      csvEscape(event.url),
      '"' + dataJson + '"',
    ].join(',');
  });
}

function csvEscape(str) {
  if (!str) return '';
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

console.log('[UX Pulse] Service worker initialized');
