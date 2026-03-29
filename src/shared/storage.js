/**
 * UX Pulse — IndexedDB Storage Layer
 * Manages sessions, events, and screenshots.
 */

const DB_NAME = 'ux-pulse';
const DB_VERSION = 1;

class EventStore {
  constructor() {
    this._db = null;
  }

  async getDB() {
    if (this._db) return this._db;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;

        if (!db.objectStoreNames.contains('sessions')) {
          const sessions = db.createObjectStore('sessions', { keyPath: 'id' });
          sessions.createIndex('byEmail', 'userEmail', { unique: false });
          sessions.createIndex('byStatus', 'status', { unique: false });
          sessions.createIndex('byStartTime', 'startTime', { unique: false });
        }

        if (!db.objectStoreNames.contains('events')) {
          const events = db.createObjectStore('events', { keyPath: 'id', autoIncrement: true });
          events.createIndex('bySession', 'sessionId', { unique: false });
          events.createIndex('byType', 'type', { unique: false });
          events.createIndex('byTimestamp', 'timestamp', { unique: false });
        }

        if (!db.objectStoreNames.contains('screenshots')) {
          const screenshots = db.createObjectStore('screenshots', { keyPath: 'id', autoIncrement: true });
          screenshots.createIndex('bySession', 'sessionId', { unique: false });
        }
      };

      request.onsuccess = (e) => {
        this._db = e.target.result;
        resolve(this._db);
      };

      request.onerror = (e) => {
        reject(new Error('IndexedDB open failed: ' + e.target.error));
      };
    });
  }

  // ── Sessions ──────────────────────────────────────────────

  async createSession(userEmail, taskName, taskDescription = '') {
    const db = await this.getDB();
    const session = {
      id: crypto.randomUUID(),
      userEmail,
      taskName,
      taskDescription,
      status: 'active',
      startTime: Date.now(),
      endTime: null,
      durationMs: null,
      startUrl: '',
      eventCount: 0,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = () => resolve(session);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async endSession(sessionId, status) {
    const db = await this.getDB();
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found: ' + sessionId);

    session.status = status;
    session.endTime = Date.now();
    session.durationMs = session.endTime - session.startTime;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = () => resolve(session);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async updateSessionEventCount(sessionId, count) {
    const db = await this.getDB();
    const session = await this.getSession(sessionId);
    if (!session) return;

    session.eventCount = count;

    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readwrite');
      tx.objectStore('sessions').put(session);
      tx.oncomplete = () => resolve(session);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getSession(sessionId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').get(sessionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllSessions() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('sessions', 'readonly');
      const request = tx.objectStore('sessions').index('byStartTime').getAll();
      request.onsuccess = () => {
        const sessions = request.result || [];
        sessions.reverse(); // newest first
        resolve(sessions);
      };
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async deleteSession(sessionId) {
    const db = await this.getDB();

    // Delete events for this session
    const events = await this.getEventsBySession(sessionId);
    const screenshots = await this.getScreenshotsBySession(sessionId);

    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sessions', 'events', 'screenshots'], 'readwrite');

      tx.objectStore('sessions').delete(sessionId);

      for (const event of events) {
        tx.objectStore('events').delete(event.id);
      }

      for (const screenshot of screenshots) {
        tx.objectStore('screenshots').delete(screenshot.id);
      }

      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  // ── Events ────────────────────────────────────────────────

  async addEvent(sessionId, type, url, tabId, data = {}) {
    const db = await this.getDB();
    const event = {
      sessionId,
      type,
      timestamp: Date.now(),
      url: url || '',
      tabId: tabId || 0,
      data,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const request = tx.objectStore('events').add(event);
      request.onsuccess = () => {
        event.id = request.result;
        resolve(event);
      };
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async addEventBatch(events) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readwrite');
      const store = tx.objectStore('events');
      for (const event of events) {
        store.add(event);
      }
      tx.oncomplete = () => resolve(events.length);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getEventsBySession(sessionId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('events', 'readonly');
      const index = tx.objectStore('events').index('bySession');
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async getEventSummary(sessionId) {
    const events = await this.getEventsBySession(sessionId);
    const summary = {};
    for (const event of events) {
      summary[event.type] = (summary[event.type] || 0) + 1;
    }
    return summary;
  }

  // ── Screenshots ───────────────────────────────────────────

  async addScreenshot(sessionId, dataUrl, timestamp, trigger = '') {
    const db = await this.getDB();
    const screenshot = {
      sessionId,
      dataUrl,
      timestamp: timestamp || Date.now(),
      trigger,
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction('screenshots', 'readwrite');
      tx.objectStore('screenshots').add(screenshot);
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getScreenshotsBySession(sessionId) {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('screenshots', 'readonly');
      const index = tx.objectStore('screenshots').index('bySession');
      const request = index.getAll(sessionId);
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  // ── CSV Export ────────────────────────────────────────────

  async exportSessionCSV(sessionId) {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('Session not found');

    const events = await this.getEventsBySession(sessionId);
    return this._buildCSV(session, events);
  }

  async exportAllCSV() {
    const sessions = await this.getAllSessions();
    let allRows = [];

    for (const session of sessions) {
      const events = await this.getEventsBySession(session.id);
      const rows = this._buildRows(session, events);
      allRows = allRows.concat(rows);
    }

    const header = 'session_id,user_email,task_name,task_status,session_duration_ms,event_id,event_type,event_timestamp,event_timestamp_readable,event_url,event_data';
    return header + '\n' + allRows.join('\n');
  }

  _buildCSV(session, events) {
    const header = 'session_id,user_email,task_name,task_status,session_duration_ms,event_id,event_type,event_timestamp,event_timestamp_readable,event_url,event_data';
    const rows = this._buildRows(session, events);
    return header + '\n' + rows.join('\n');
  }

  _buildRows(session, events) {
    return events.map(event => {
      const dataJson = JSON.stringify(event.data || {}).replace(/"/g, '""');
      const readable = new Date(event.timestamp).toISOString();
      return [
        session.id,
        this._csvEscape(session.userEmail),
        this._csvEscape(session.taskName),
        session.status,
        session.durationMs || '',
        event.id,
        event.type,
        event.timestamp,
        readable,
        this._csvEscape(event.url),
        '"' + dataJson + '"',
      ].join(',');
    });
  }

  _csvEscape(str) {
    if (!str) return '';
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }

  // ── Cleanup ───────────────────────────────────────────────

  async clearAll() {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['sessions', 'events', 'screenshots'], 'readwrite');
      tx.objectStore('sessions').clear();
      tx.objectStore('events').clear();
      tx.objectStore('screenshots').clear();
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

// Singleton
const eventStore = new EventStore();
