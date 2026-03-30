/**
 * UX Pulse — Dashboard Controller
 * Full-page session viewer with event logs, CSV export, and data management.
 */

(function () {
  'use strict';

  const MSG = {
    GET_SESSIONS: 'GET_SESSIONS',
    GET_SESSION_EVENTS: 'GET_SESSION_EVENTS',
    GET_SESSION_SCREENSHOTS: 'GET_SESSION_SCREENSHOTS',
    EXPORT_SESSION: 'EXPORT_SESSION',
    EXPORT_ALL: 'EXPORT_ALL',
    DELETE_SESSION: 'DELETE_SESSION',
    CLEAR_ALL: 'CLEAR_ALL',
    IMPORT_SESSION: 'IMPORT_SESSION',
    IMPORT_EVENTS: 'IMPORT_EVENTS',
  };

  // ── State ─────────────────────────────────────────────
  let sessions = [];
  let currentFilter = 'all';
  let searchQuery = '';
  let selectedSessionId = null;
  let currentScreenshots = [];
  let lightboxIndex = 0;

  // ── DOM refs ──────────────────────────────────────────
  const tbody = document.getElementById('sessions-tbody');
  const emptyState = document.getElementById('empty-state');
  const eventPanel = document.getElementById('event-panel');
  const eventLogTbody = document.getElementById('event-log-tbody');
  const panelTitle = document.getElementById('panel-title');
  const searchInput = document.getElementById('search-input');
  const modalOverlay = document.getElementById('modal-overlay');
  const modalTitle = document.getElementById('modal-title');
  const modalMessage = document.getElementById('modal-message');
  const modalCancel = document.getElementById('modal-cancel');
  const modalConfirm = document.getElementById('modal-confirm');

  // ── Messaging ─────────────────────────────────────────

  function sendMessage(type, payload = {}) {
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({ type, ...payload }, (response) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(response);
      });
    });
  }

  // ── Load Sessions ─────────────────────────────────────

  async function loadSessions() {
    try {
      const resp = await sendMessage(MSG.GET_SESSIONS);
      if (resp && resp.success) {
        sessions = resp.sessions || [];
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
      sessions = [];
    }
    renderSessions();
  }

  // ── Render Sessions Table ─────────────────────────────

  function renderSessions() {
    const filtered = sessions.filter(s => {
      if (currentFilter !== 'all' && s.status !== currentFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (s.userEmail || '').toLowerCase().includes(q) ||
               (s.taskName || '').toLowerCase().includes(q);
      }
      return true;
    });

    tbody.innerHTML = '';

    if (filtered.length === 0) {
      document.querySelector('.sessions-table').style.display = 'none';
      emptyState.style.display = 'flex';
      return;
    }

    document.querySelector('.sessions-table').style.display = 'table';
    emptyState.style.display = 'none';

    for (const session of filtered) {
      const tr = document.createElement('tr');
      tr.dataset.sessionId = session.id;

      const duration = session.durationMs
        ? formatDuration(Math.floor(session.durationMs / 1000))
        : '--';

      const date = new Date(session.startTime);
      const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

      tr.innerHTML = `
        <td class="email">${escapeHtml(session.userName || session.userEmail)}</td>
        <td class="mono" style="text-align:center;">${session.taskNumber || '--'}</td>
        <td class="task">${escapeHtml(session.taskName)}</td>
        <td><span class="status-pill ${session.status}">${session.status}</span></td>
        <td class="mono">${duration}</td>
        <td class="mono">${session.eventCount || 0}</td>
        <td class="date-cell">${dateStr}<br>${timeStr}</td>
        <td>
          <div class="action-cell">
            <button class="btn-icon btn-view" title="View events" data-id="${session.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                <circle cx="12" cy="12" r="3"/>
              </svg>
            </button>
            <button class="btn-icon btn-delete" title="Delete session" data-id="${session.id}">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="3 6 5 6 21 6"/>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
              </svg>
            </button>
          </div>
        </td>
      `;

      tr.addEventListener('click', (e) => {
        if (e.target.closest('.btn-delete')) return;
        viewSession(session.id, session.taskName);
      });

      tbody.appendChild(tr);
    }

    // Bind delete buttons
    for (const btn of tbody.querySelectorAll('.btn-delete')) {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteSession(btn.dataset.id);
      });
    }
  }

  // ── View Session Events ───────────────────────────────

  async function viewSession(sessionId, taskName) {
    selectedSessionId = sessionId;
    panelTitle.textContent = 'Event Log \u2014 ' + (taskName || 'Session');

    try {
      const resp = await sendMessage(MSG.GET_SESSION_EVENTS, { sessionId });

      if (resp && resp.success) {
        const events = resp.events || [];
        eventLogTbody.innerHTML = '';

        const sessionStart = events.length > 0 ? events[0].timestamp : 0;

        for (let i = 0; i < events.length; i++) {
          const ev = events[i];
          const tr = document.createElement('tr');

          const relTime = sessionStart ? ((ev.timestamp - sessionStart) / 1000).toFixed(1) : '0.0';
          const typeClass = getTypeClass(ev.type);
          const details = formatDetails(ev);

          let urlDisplay = '';
          if (ev.url) {
            try {
              const u = new URL(ev.url);
              urlDisplay = u.pathname + u.search;
            } catch (e) {
              urlDisplay = ev.url;
            }
          }

          tr.innerHTML = `
            <td class="mono" style="color: var(--text-muted);">${i + 1}</td>
            <td class="type-cell ${typeClass}">${ev.type}</td>
            <td class="time-cell">+${relTime}s</td>
            <td class="url-cell" title="${escapeHtml(ev.url || '')}">${escapeHtml(urlDisplay)}</td>
            <td class="details-cell" title="${escapeHtml(JSON.stringify(ev.data || {}))}">${escapeHtml(details)}</td>
          `;

          eventLogTbody.appendChild(tr);
        }

        eventPanel.style.display = 'block';
        eventPanel.scrollIntoView({ behavior: 'smooth' });

        // Also load screenshots
        loadScreenshots(sessionId, sessionStart);

        // Reset to events tab
        document.querySelector('.panel-tab.active').classList.remove('active');
        document.querySelector('.panel-tab[data-tab="events"]').classList.add('active');
        document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
        document.getElementById('tab-events').classList.add('active');
      }
    } catch (e) {
      console.error('Failed to load events:', e);
    }
  }

  // ── Screenshot Gallery ─────────────────────────────────

  async function loadScreenshots(sessionId, sessionStartTime) {
    const grid = document.getElementById('screenshot-grid');
    const emptyEl = document.getElementById('screenshots-empty');
    const countEl = document.getElementById('screenshot-count');

    grid.innerHTML = '';
    currentScreenshots = [];

    try {
      const resp = await sendMessage(MSG.GET_SESSION_SCREENSHOTS, { sessionId });

      if (resp && resp.success && resp.screenshots && resp.screenshots.length > 0) {
        currentScreenshots = resp.screenshots;
        countEl.textContent = resp.screenshots.length;
        emptyEl.style.display = 'none';

        for (let i = 0; i < resp.screenshots.length; i++) {
          const shot = resp.screenshots[i];
          const relTime = sessionStartTime
            ? '+' + ((shot.timestamp - sessionStartTime) / 1000).toFixed(1) + 's'
            : new Date(shot.timestamp).toLocaleTimeString();

          const triggerClass = getTriggerClass(shot.trigger);

          const card = document.createElement('div');
          card.className = 'screenshot-card';
          card.innerHTML = `
            <img src="${shot.dataUrl}" alt="Screenshot at ${relTime}" loading="lazy">
            <div class="screenshot-card-info">
              <span class="screenshot-trigger-badge ${triggerClass}">${escapeHtml(shot.trigger || 'capture')}</span>
              <span class="screenshot-time-label">${relTime}</span>
            </div>
          `;

          card.addEventListener('click', () => openLightbox(i));
          grid.appendChild(card);
        }
      } else {
        countEl.textContent = '0';
        emptyEl.style.display = 'flex';
      }
    } catch (e) {
      console.error('Failed to load screenshots:', e);
      countEl.textContent = '0';
      emptyEl.style.display = 'flex';
    }
  }

  function getTriggerClass(trigger) {
    if (!trigger) return 'manual';
    const t = trigger.toLowerCase();
    if (t.includes('click') || t === 'CLICK') return 'click';
    if (t.includes('page_load') || t.includes('load')) return 'page_load';
    if (t.includes('navigate') || t.includes('PAGE_NAVIGATE')) return 'navigate';
    return 'manual';
  }

  // ── Lightbox ──────────────────────────────────────────

  const lightbox = document.getElementById('lightbox');
  const lightboxImg = document.getElementById('lightbox-img');
  const lightboxTrigger = document.getElementById('lightbox-trigger');
  const lightboxTime = document.getElementById('lightbox-time');
  const lightboxCounter = document.getElementById('lightbox-counter');

  function openLightbox(index) {
    if (currentScreenshots.length === 0) return;
    lightboxIndex = index;
    updateLightbox();
    lightbox.style.display = 'flex';
  }

  function closeLightbox() {
    lightbox.style.display = 'none';
  }

  function updateLightbox() {
    const shot = currentScreenshots[lightboxIndex];
    if (!shot) return;

    lightboxImg.src = shot.dataUrl;
    lightboxTrigger.textContent = shot.trigger || 'capture';
    lightboxTime.textContent = new Date(shot.timestamp).toLocaleTimeString();
    lightboxCounter.textContent = (lightboxIndex + 1) + ' / ' + currentScreenshots.length;
  }

  function lightboxPrev() {
    if (lightboxIndex > 0) {
      lightboxIndex--;
      updateLightbox();
    }
  }

  function lightboxNext() {
    if (lightboxIndex < currentScreenshots.length - 1) {
      lightboxIndex++;
      updateLightbox();
    }
  }

  document.getElementById('lightbox-close').addEventListener('click', closeLightbox);
  document.getElementById('lightbox-prev').addEventListener('click', lightboxPrev);
  document.getElementById('lightbox-next').addEventListener('click', lightboxNext);
  document.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);

  document.addEventListener('keydown', (e) => {
    if (lightbox.style.display === 'none') return;
    if (e.key === 'Escape') closeLightbox();
    if (e.key === 'ArrowLeft') lightboxPrev();
    if (e.key === 'ArrowRight') lightboxNext();
  });

  // ── Panel Tabs ────────────────────────────────────────

  for (const tab of document.querySelectorAll('.panel-tab')) {
    tab.addEventListener('click', () => {
      document.querySelector('.panel-tab.active').classList.remove('active');
      tab.classList.add('active');

      const tabName = tab.dataset.tab;
      document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
      document.getElementById('tab-' + tabName).classList.add('active');
    });
  }

  function getTypeClass(type) {
    if (['CLICK', 'DOUBLE_CLICK', 'RIGHT_CLICK', 'DEAD_CLICK', 'RAGE_CLICK'].includes(type)) return 'click';
    if (['SCROLL', 'SCROLL_REVERSAL'].includes(type)) return 'scroll';
    if (['PAGE_LOAD', 'PAGE_NAVIGATE', 'PAGE_BACK', 'PAGE_FORWARD', 'HASH_CHANGE', 'TAB_SWITCH'].includes(type)) return 'nav';
    if (['HOVER_DWELL', 'IDLE_PAUSE'].includes(type)) return 'hesitation';
    if (['FORM_FOCUS', 'FORM_SUBMIT', 'FORM_ERROR'].includes(type)) return 'form';
    if (['API_REQUEST_START', 'API_REQUEST_END', 'API_REQUEST_ERROR'].includes(type)) return 'network';
    return 'other';
  }

  function formatDetails(ev) {
    const d = ev.data || {};
    switch (ev.type) {
      case 'CLICK':
      case 'DEAD_CLICK':
      case 'RAGE_CLICK':
        return (d.elementTag || '') + ' "' + (d.elementText || '').substring(0, 30) + '" (' + d.x + ', ' + d.y + ')';
      case 'SCROLL':
        return d.direction + ' \u2014 ' + (d.scrollDepthPercent || 0) + '% depth';
      case 'SCROLL_REVERSAL':
        return (d.fromDirection || '') + ' \u2192 ' + (d.toDirection || '');
      case 'HOVER_DWELL':
        return d.dwellMs + 'ms on ' + (d.elementTag || 'element');
      case 'IDLE_PAUSE':
        return (d.durationMs || 0) + 'ms pause';
      case 'API_REQUEST_START':
        return (d.method || '') + ' ' + (d.requestUrl || '');
      case 'API_REQUEST_END':
        return (d.statusCode || '') + ' ' + (d.method || '') + ' (' + (d.durationMs || 0) + 'ms)';
      case 'API_REQUEST_ERROR':
        return (d.method || '') + ' ' + (d.error || 'failed');
      case 'FORM_SUBMIT':
        return (d.method || 'GET') + ' \u2014 ' + (d.fieldCount || 0) + ' fields';
      case 'FORM_ERROR':
        return d.errorText || 'Error detected';
      case 'PAGE_NAVIGATE':
        return d.transitionType || '';
      case 'TAB_SWITCH':
        return d.title || '';
      case 'WINDOW_RESIZE':
        return (d.width || 0) + 'x' + (d.height || 0);
      default:
        return JSON.stringify(d).substring(0, 60);
    }
  }

  // ── CSV Export ────────────────────────────────────────

  async function exportSessionCSV() {
    if (!selectedSessionId) return;
    try {
      const resp = await sendMessage(MSG.EXPORT_SESSION, { sessionId: selectedSessionId });
      if (resp && resp.csv) downloadCSV(resp.csv, 'ux-pulse-session.csv');
    } catch (e) {
      console.error('Export failed:', e);
    }
  }

  async function exportAllCSV() {
    try {
      const resp = await sendMessage(MSG.EXPORT_ALL);
      if (resp && resp.csv) downloadCSV(resp.csv, 'ux-pulse-all-sessions.csv');
    } catch (e) {
      console.error('Export all failed:', e);
    }
  }

  function downloadCSV(csvContent, filename) {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  // ── Delete / Clear ────────────────────────────────────

  let pendingAction = null;

  function confirmDeleteSession(sessionId) {
    pendingAction = async () => {
      await sendMessage(MSG.DELETE_SESSION, { sessionId });
      if (selectedSessionId === sessionId) {
        eventPanel.style.display = 'none';
        selectedSessionId = null;
      }
      await loadSessions();
    };
    showModal('Delete Session', 'This will permanently delete this session and all its events. Continue?');
  }

  function confirmClearAll() {
    pendingAction = async () => {
      await sendMessage(MSG.CLEAR_ALL);
      eventPanel.style.display = 'none';
      selectedSessionId = null;
      await loadSessions();
    };
    showModal('Clear All Data', 'This will permanently delete ALL sessions and events. This cannot be undone.');
  }

  function showModal(title, message) {
    modalTitle.textContent = title;
    modalMessage.textContent = message;
    modalOverlay.style.display = 'flex';
  }

  function hideModal() {
    modalOverlay.style.display = 'none';
    pendingAction = null;
  }

  // ── Utilities ─────────────────────────────────────────

  function formatDuration(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    if (hrs > 0) return hrs + 'h ' + mins + 'm ' + secs + 's';
    if (mins > 0) return mins + 'm ' + secs + 's';
    return secs + 's';
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── CSV Import ─────────────────────────────────────────

  const csvFileInput = document.getElementById('csv-file-input');

  function onImportCSV() {
    csvFileInput.click();
  }

  async function handleCSVImport(file) {
    const text = await file.text();
    const lines = parseCSVLines(text);
    if (lines.length < 2) { alert('CSV file is empty or invalid.'); return; }

    const headers = lines[0];
    const colIdx = {};
    headers.forEach((h, i) => { colIdx[h.trim()] = i; });

    // Required columns check
    const required = ['session_id', 'task_name', 'task_status', 'event_type', 'event_timestamp'];
    for (const r of required) {
      if (!(r in colIdx)) { alert('Missing column: ' + r); return; }
    }

    // Group rows by session
    const sessionMap = {};
    const eventRows = [];

    for (let i = 1; i < lines.length; i++) {
      const row = lines[i];
      if (row.length < headers.length) continue;

      const sid = row[colIdx['session_id']];
      if (!sid) continue;

      if (!sessionMap[sid]) {
        sessionMap[sid] = {
          id: sid,
          studyId: row[colIdx['study_id']] || '',
          userName: row[colIdx['user_name']] || '',
          userEmail: row[colIdx['user_email']] || '',
          taskName: row[colIdx['task_name']] || '',
          taskNumber: parseInt(row[colIdx['task_number']]) || 0,
          status: row[colIdx['task_status']] || 'completed',
          durationMs: parseInt(row[colIdx['session_duration_ms']]) || 0,
          startTime: null,
          endTime: null,
          eventCount: 0,
          startUrl: '',
          taskDescription: '',
        };
      }
      sessionMap[sid].eventCount++;

      const ts = parseInt(row[colIdx['event_timestamp']]) || Date.now();
      if (!sessionMap[sid].startTime || ts < sessionMap[sid].startTime) {
        sessionMap[sid].startTime = ts;
      }
      if (!sessionMap[sid].endTime || ts > sessionMap[sid].endTime) {
        sessionMap[sid].endTime = ts;
      }

      // Parse event_data JSON
      let eventData = {};
      try {
        const raw = row[colIdx['event_data']] || '{}';
        eventData = JSON.parse(raw);
      } catch (e) {}

      eventRows.push({
        sessionId: sid,
        type: row[colIdx['event_type']] || '',
        timestamp: ts,
        url: row[colIdx['event_url']] || '',
        tabId: 0,
        data: eventData,
      });
    }

    // Import sessions then events via service worker
    const sessionList = Object.values(sessionMap);
    let importedSessions = 0;
    let importedEvents = 0;

    // Import sessions in batches
    for (const s of sessionList) {
      try {
        const resp = await sendMessage(MSG.IMPORT_SESSION, { session: s });
        if (resp && resp.success) importedSessions++;
      } catch (e) {
        console.error('Failed to import session:', s.id, e);
      }
    }

    // Import events in batches of 100
    for (let i = 0; i < eventRows.length; i += 100) {
      const batch = eventRows.slice(i, i + 100);
      try {
        const resp = await sendMessage(MSG.IMPORT_EVENTS, { events: batch });
        if (resp && resp.success) importedEvents += batch.length;
      } catch (e) {
        console.error('Failed to import events batch:', e);
      }
    }

    alert('Imported ' + importedSessions + ' sessions and ' + importedEvents + ' events.');
    await loadSessions();
  }

  // Simple CSV parser that handles quoted fields with commas and escaped quotes
  function parseCSVLines(text) {
    const lines = [];
    let current = [];
    let field = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const ch = text[i];

      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < text.length && text[i + 1] === '"') {
            field += '"';
            i++; // skip escaped quote
          } else {
            inQuotes = false;
          }
        } else {
          field += ch;
        }
      } else {
        if (ch === '"') {
          inQuotes = true;
        } else if (ch === ',') {
          current.push(field);
          field = '';
        } else if (ch === '\n') {
          current.push(field);
          field = '';
          if (current.length > 1 || current[0] !== '') lines.push(current);
          current = [];
        } else if (ch === '\r') {
          // skip
        } else {
          field += ch;
        }
      }
    }
    // Last field/line
    if (field || current.length > 0) {
      current.push(field);
      if (current.length > 1 || current[0] !== '') lines.push(current);
    }

    return lines;
  }

  // ── Event Bindings ────────────────────────────────────

  document.getElementById('btn-import-csv').addEventListener('click', onImportCSV);
  csvFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) {
      handleCSVImport(file);
      csvFileInput.value = ''; // reset for re-import
    }
  });
  document.getElementById('btn-export-all').addEventListener('click', exportAllCSV);
  document.getElementById('btn-analytics').addEventListener('click', () => {
    window.location.href = '../analytics/analytics.html';
  });
  document.getElementById('btn-clear-all').addEventListener('click', confirmClearAll);
  document.getElementById('btn-export-session').addEventListener('click', exportSessionCSV);
  document.getElementById('btn-close-panel').addEventListener('click', () => {
    eventPanel.style.display = 'none';
    selectedSessionId = null;
  });

  modalCancel.addEventListener('click', hideModal);
  modalConfirm.addEventListener('click', async () => {
    if (pendingAction) {
      await pendingAction();
    }
    hideModal();
  });

  // Search
  searchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value;
    renderSessions();
  });

  // Filter chips
  for (const chip of document.querySelectorAll('.chip')) {
    chip.addEventListener('click', () => {
      document.querySelector('.chip.active').classList.remove('active');
      chip.classList.add('active');
      currentFilter = chip.dataset.filter;
      renderSessions();
    });
  }

  // ── Init ──────────────────────────────────────────────
  loadSessions();

})();
