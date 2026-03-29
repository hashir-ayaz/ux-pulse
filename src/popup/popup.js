/**
 * UX Pulse — Popup Controller
 * Manages the 3-screen popup UI and communicates with the service worker.
 */

(function () {
  'use strict';

  // ── Message Types ─────────────────────────────────────
  const MSG = {
    START_SESSION: 'START_SESSION',
    END_SESSION: 'END_SESSION',
    GET_STATUS: 'GET_STATUS',
    EXPORT_SESSION: 'EXPORT_SESSION',
    GET_EVENT_SUMMARY: 'GET_EVENT_SUMMARY',
  };

  // ── State ─────────────────────────────────────────────
  let timerInterval = null;
  let pollInterval = null;
  let lastSessionId = null;

  // ── DOM refs ──────────────────────────────────────────
  const screens = {
    setup: document.getElementById('screen-setup'),
    recording: document.getElementById('screen-recording'),
    summary: document.getElementById('screen-summary'),
  };

  const els = {
    // Setup
    emailInput: document.getElementById('email-input'),
    taskInput: document.getElementById('task-input'),
    taskDesc: document.getElementById('task-desc'),
    btnStart: document.getElementById('btn-start'),
    linkDashboard: document.getElementById('link-dashboard'),

    // Recording
    recEmail: document.getElementById('rec-email'),
    recTask: document.getElementById('rec-task'),
    recTimer: document.getElementById('rec-timer'),
    recEvents: document.getElementById('rec-events'),
    btnComplete: document.getElementById('btn-complete'),
    btnAbandon: document.getElementById('btn-abandon'),

    // Summary
    summaryBadge: document.getElementById('summary-badge'),
    summaryTask: document.getElementById('summary-task'),
    summaryDuration: document.getElementById('summary-duration'),
    summaryEventCount: document.getElementById('summary-event-count'),
    eventBreakdown: document.getElementById('event-breakdown'),
    btnDownload: document.getElementById('btn-download'),
    linkNewSession: document.getElementById('link-new-session'),
    linkDashboard2: document.getElementById('link-dashboard-2'),
  };

  // ── Screen Management ─────────────────────────────────

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('active', key === name);
    }
  }

  // ── Timer ─────────────────────────────────────────────

  let sessionStartTime = null;

  function startTimer(startTime) {
    sessionStartTime = startTime;
    updateTimerDisplay();
    timerInterval = setInterval(updateTimerDisplay, 1000);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  function updateTimerDisplay() {
    if (!sessionStartTime) return;
    const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
    els.recTimer.textContent = formatDuration(elapsed);
  }

  function formatDuration(totalSeconds) {
    const hrs = Math.floor(totalSeconds / 3600);
    const mins = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;

    if (hrs > 0) {
      return `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
    }
    return `${pad(mins)}:${pad(secs)}`;
  }

  function pad(n) {
    return n.toString().padStart(2, '0');
  }

  // ── Event Counter Polling ─────────────────────────────

  function startPolling() {
    pollInterval = setInterval(async () => {
      try {
        const resp = await sendMessage(MSG.GET_STATUS);
        if (resp && resp.session) {
          els.recEvents.textContent = resp.session.eventCount || 0;
        }
      } catch (e) {}
    }, 1500);
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

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

  // ── Form Validation ───────────────────────────────────

  function validateForm() {
    const email = els.emailInput.value.trim();
    const task = els.taskInput.value.trim();
    els.btnStart.disabled = !(email && task);
  }

  // ── Event Handlers ────────────────────────────────────

  async function onStart() {
    const email = els.emailInput.value.trim();
    const task = els.taskInput.value.trim();
    const desc = els.taskDesc.value.trim();

    if (!email || !task) return;

    // Persist email for next session
    chrome.storage.local.set({ lastEmail: email });

    els.btnStart.disabled = true;

    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      const startUrl = tab ? tab.url : '';

      const resp = await sendMessage(MSG.START_SESSION, {
        userEmail: email,
        taskName: task,
        taskDescription: desc,
        startUrl,
      });

      if (resp && resp.success) {
        lastSessionId = resp.session.id;

        els.recEmail.textContent = email;
        els.recTask.textContent = task;
        els.recEvents.textContent = '0';

        // Directly tell the active tab's content script to start tracking
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            type: 'RECORDING_STARTED',
            sessionId: resp.session.id,
          }).catch(() => {});
        }

        showScreen('recording');
        startTimer(resp.session.startTime);
        startPolling();
      }
    } catch (err) {
      console.error('Start failed:', err);
      els.btnStart.disabled = false;
    }
  }

  async function onEndSession(status) {
    stopTimer();
    stopPolling();

    // Tell active tab to stop tracking immediately
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id) {
        chrome.tabs.sendMessage(tab.id, { type: 'RECORDING_STOPPED' }).catch(() => {});
      }
    } catch (e) {}

    try {
      const resp = await sendMessage(MSG.END_SESSION, { status });

      if (resp && resp.success) {
        lastSessionId = resp.sessionId;
        await showSummary(resp.sessionId, status);
      }
    } catch (err) {
      console.error('End session failed:', err);
      showScreen('setup');
    }
  }

  async function showSummary(sessionId, status) {
    // Badge
    els.summaryBadge.textContent = status === 'completed' ? 'Completed' : 'Abandoned';
    els.summaryBadge.className = 'badge ' + (status === 'completed' ? 'completed' : 'abandoned');

    // Task name
    els.summaryTask.textContent = els.taskInput.value.trim() || 'Session';

    // Duration
    if (sessionStartTime) {
      const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
      els.summaryDuration.textContent = formatDuration(elapsed);
    }

    // Get event summary
    try {
      const resp = await sendMessage(MSG.GET_EVENT_SUMMARY, { sessionId });

      if (resp && resp.success && resp.summary) {
        const summary = resp.summary;
        const total = Object.values(summary).reduce((a, b) => a + b, 0);
        els.summaryEventCount.textContent = total + ' events';

        // Build breakdown
        els.eventBreakdown.innerHTML = '';

        // Sort by count descending, exclude SESSION_START/END
        const entries = Object.entries(summary)
          .filter(([k]) => !k.startsWith('SESSION_') && k !== 'SCREENSHOT')
          .sort((a, b) => b[1] - a[1]);

        for (const [type, count] of entries) {
          const label = type.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
          const item = document.createElement('div');
          item.className = 'event-item';
          item.innerHTML = `<span class="event-item-label">${label}</span><span class="event-item-count">${count}</span>`;
          els.eventBreakdown.appendChild(item);
        }

        if (entries.length === 0) {
          els.eventBreakdown.innerHTML = '<div class="event-item"><span class="event-item-label" style="grid-column: span 2; text-align: center;">No events recorded</span></div>';
        }
      }
    } catch (e) {
      console.error('Summary fetch failed:', e);
    }

    showScreen('summary');
  }

  async function onDownloadCSV() {
    if (!lastSessionId) return;

    try {
      const resp = await sendMessage(MSG.EXPORT_SESSION, { sessionId: lastSessionId });

      if (resp && resp.success && resp.csv) {
        const blob = new Blob([resp.csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ux-pulse-session-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (e) {
      console.error('CSV export failed:', e);
    }
  }

  function onNewSession() {
    // Clear task fields but keep email
    els.taskInput.value = '';
    els.taskDesc.value = '';
    sessionStartTime = null;
    lastSessionId = null;
    validateForm();
    showScreen('setup');
  }

  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  }

  // ── Init ──────────────────────────────────────────────

  async function init() {
    // Restore last email
    const data = await chrome.storage.local.get('lastEmail');
    if (data.lastEmail) {
      els.emailInput.value = data.lastEmail;
    }

    // Check if already recording
    try {
      const resp = await sendMessage(MSG.GET_STATUS);
      if (resp && resp.isRecording && resp.session) {
        lastSessionId = resp.session.id;
        els.recEmail.textContent = resp.session.userEmail;
        els.recTask.textContent = resp.session.taskName;
        els.recEvents.textContent = resp.session.eventCount || 0;

        showScreen('recording');
        startTimer(resp.session.startTime);
        startPolling();
        return;
      }
    } catch (e) {}

    validateForm();
    showScreen('setup');
  }

  // ── Bind Events ───────────────────────────────────────

  els.emailInput.addEventListener('input', validateForm);
  els.taskInput.addEventListener('input', validateForm);

  els.btnStart.addEventListener('click', onStart);
  els.btnComplete.addEventListener('click', () => onEndSession('completed'));
  els.btnAbandon.addEventListener('click', () => onEndSession('abandoned'));

  els.btnDownload.addEventListener('click', onDownloadCSV);
  els.linkNewSession.addEventListener('click', (e) => { e.preventDefault(); onNewSession(); });

  els.linkDashboard.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });
  els.linkDashboard2.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });

  // ── Start ─────────────────────────────────────────────
  init();

})();
