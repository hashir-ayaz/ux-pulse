/**
 * UX Pulse — Popup Controller
 * Manages the 5-screen study UI with hardcoded 3-task sequential flow.
 */

(function () {
  'use strict';

  // ── Message Types ─────────────────────────────────────
  const MSG = {
    START_STUDY: 'START_STUDY',
    START_TASK: 'START_TASK',
    COMPLETE_TASK: 'COMPLETE_TASK',
    SKIP_TASK: 'SKIP_TASK',
    GET_STUDY_STATE: 'GET_STUDY_STATE',
    GET_STATUS: 'GET_STATUS',
    EXPORT_SESSION: 'EXPORT_SESSION',
    RESET_STUDY: 'RESET_STUDY',
  };

  // ── Hardcoded Study Tasks ─────────────────────────────
  const STUDY_TASKS = [
    {
      taskNumber: 1,
      title: 'Register / Sign In',
      goal: 'Create a new account using a phone number',
      description: 'Starting from the Crumble homepage, register for a new account using your phone number. Complete the registration process successfully.',
    },
    {
      taskNumber: 2,
      title: 'Add to Cart & Checkout',
      goal: 'Find the Cookies & Cream Shake, add it to your cart, and navigate to the checkout page',
      description: 'Browse the menu to find the Cookies & Cream Shake. Add it to your cart and proceed all the way to the checkout page.',
    },
    {
      taskNumber: 3,
      title: 'Contact Customer Support',
      goal: 'Send a message to customer support via the chat feature',
      description: 'Locate the customer support chat feature on the website and send a message to the support team.',
    },
  ];

  // ── State ─────────────────────────────────────────────
  let timerInterval = null;
  let pollInterval = null;
  let studyState = null;
  let sessionStartTime = null;

  // ── DOM refs ──────────────────────────────────────────
  const screens = {
    welcome: document.getElementById('screen-welcome'),
    briefing: document.getElementById('screen-briefing'),
    recording: document.getElementById('screen-recording'),
    transition: document.getElementById('screen-transition'),
    final: document.getElementById('screen-final'),
  };

  const els = {
    // Welcome
    nameInput: document.getElementById('name-input'),
    emailInput: document.getElementById('email-input'),
    btnBegin: document.getElementById('btn-begin'),
    linkDashboard: document.getElementById('link-dashboard'),

    // Briefing
    briefingBadge: document.getElementById('briefing-badge'),
    briefingTitle: document.getElementById('briefing-title'),
    briefingGoal: document.getElementById('briefing-goal'),
    briefingDesc: document.getElementById('briefing-desc'),
    btnStartTask: document.getElementById('btn-start-task'),
    dot1: document.getElementById('dot-1'),
    dot2: document.getElementById('dot-2'),
    dot3: document.getElementById('dot-3'),

    // Recording
    recTask: document.getElementById('rec-task'),
    recTaskNumber: document.getElementById('rec-task-number'),
    recTimer: document.getElementById('rec-timer'),
    recEvents: document.getElementById('rec-events'),
    btnComplete: document.getElementById('btn-complete'),
    btnSkip: document.getElementById('btn-skip'),

    // Transition
    transitionBadge: document.getElementById('transition-badge'),
    transitionTitle: document.getElementById('transition-title'),
    transitionNext: document.getElementById('transition-next'),
    btnNextTask: document.getElementById('btn-next-task'),

    // Final
    finalParticipant: document.getElementById('final-participant'),
    taskResults: document.getElementById('task-results'),
    btnDownloadAll: document.getElementById('btn-download-all'),
    linkNewStudy: document.getElementById('link-new-study'),
    linkDashboard2: document.getElementById('link-dashboard-2'),
  };

  // ── Screen Management ─────────────────────────────────

  function showScreen(name) {
    for (const [key, el] of Object.entries(screens)) {
      el.classList.toggle('active', key === name);
    }
  }

  // ── Timer ─────────────────────────────────────────────

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
    if (hrs > 0) return pad(hrs) + ':' + pad(mins) + ':' + pad(secs);
    return pad(mins) + ':' + pad(secs);
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
    const name = els.nameInput.value.trim();
    const email = els.emailInput.value.trim();
    els.btnBegin.disabled = !(name && email);
  }

  // ── Briefing Screen ───────────────────────────────────

  function showBriefing(taskIndex) {
    const task = STUDY_TASKS[taskIndex];
    if (!task) return;

    els.briefingBadge.textContent = 'Task ' + task.taskNumber + '/3';
    els.briefingTitle.textContent = task.title;
    els.briefingGoal.textContent = task.goal;
    els.briefingDesc.textContent = task.description;

    // Update progress dots
    const dots = [els.dot1, els.dot2, els.dot3];
    dots.forEach((dot, i) => {
      dot.className = 'task-dot';
      if (i < taskIndex) dot.classList.add('completed');
      else if (i === taskIndex) dot.classList.add('active');
    });

    showScreen('briefing');
  }

  // ── Event Handlers ────────────────────────────────────

  async function onBeginStudy() {
    const name = els.nameInput.value.trim();
    const email = els.emailInput.value.trim();
    if (!name || !email) return;

    // Persist for next session
    chrome.storage.local.set({ lastName: name, lastEmail: email });

    els.btnBegin.disabled = true;

    try {
      const resp = await sendMessage(MSG.START_STUDY, {
        participantName: name,
        participantEmail: email,
      });

      if (resp && resp.success) {
        studyState = resp.studyState;
        showBriefing(0);
      }
    } catch (err) {
      console.error('Start study failed:', err);
      els.btnBegin.disabled = false;
    }
  }

  async function onStartTask() {
    if (!studyState) return;

    els.btnStartTask.disabled = true;

    try {
      const resp = await sendMessage(MSG.START_TASK, {
        taskIndex: studyState.currentTaskIndex,
      });

      if (resp && resp.success) {
        const task = STUDY_TASKS[studyState.currentTaskIndex];
        els.recTask.textContent = task.title;
        els.recTaskNumber.textContent = 'Task ' + task.taskNumber + ' of 3';
        els.recEvents.textContent = '0';

        showScreen('recording');
        startTimer(resp.startTime);
        startPolling();
      }
    } catch (err) {
      console.error('Start task failed:', err);
    }
    els.btnStartTask.disabled = false;
  }

  async function onCompleteTask() {
    stopTimer();
    stopPolling();

    els.btnComplete.disabled = true;

    try {
      const resp = await sendMessage(MSG.COMPLETE_TASK);

      if (resp && resp.success) {
        studyState = resp.studyState;

        if (resp.isLastTask) {
          showFinalSummary(resp.taskSessions);
        } else {
          showTransition(studyState.currentTaskIndex, 'completed');
        }
      }
    } catch (err) {
      console.error('Complete task failed:', err);
    }

    els.btnComplete.disabled = false;
  }

  async function onSkipTask() {
    stopTimer();
    stopPolling();

    els.btnSkip.disabled = true;

    try {
      const resp = await sendMessage(MSG.SKIP_TASK);

      if (resp && resp.success) {
        studyState = resp.studyState;

        if (resp.isLastTask) {
          showFinalSummary(resp.taskSessions);
        } else {
          showTransition(studyState.currentTaskIndex, 'skipped');
        }
      }
    } catch (err) {
      console.error('Skip task failed:', err);
    }

    els.btnSkip.disabled = false;
  }

  function showTransition(completedTaskIndex, status) {
    const completedTask = STUDY_TASKS[completedTaskIndex];
    const nextTask = STUDY_TASKS[completedTaskIndex + 1];

    els.transitionBadge.textContent = status === 'completed' ? 'Completed' : 'Skipped';
    els.transitionBadge.className = 'badge ' + (status === 'completed' ? 'completed' : 'abandoned');
    els.transitionTitle.textContent = 'Task ' + completedTask.taskNumber + ' ' + (status === 'completed' ? 'Complete!' : 'Skipped');

    if (nextTask) {
      els.transitionNext.textContent = 'Next: ' + nextTask.title;
      els.transitionNext.style.display = 'block';
    } else {
      els.transitionNext.style.display = 'none';
    }

    // Advance study state for next task
    studyState.currentTaskIndex = completedTaskIndex + 1;

    showScreen('transition');
  }

  function onNextTask() {
    if (!studyState) return;
    showBriefing(studyState.currentTaskIndex);
  }

  function showFinalSummary(taskSessions) {
    els.finalParticipant.textContent = studyState ? (studyState.participantName + ' (' + studyState.participantEmail + ')') : '';

    els.taskResults.innerHTML = '';

    for (const ts of taskSessions) {
      const duration = ts.durationMs ? formatDuration(Math.floor(ts.durationMs / 1000)) : '--';
      const statusClass = ts.status === 'completed' ? 'completed' : 'skipped';

      const card = document.createElement('div');
      card.className = 'task-result-card';
      card.innerHTML =
        '<div class="task-result-left">' +
          '<span class="task-result-number">Task ' + ts.taskNumber + '</span>' +
          '<span class="task-result-name">' + escapeHtml(ts.taskName) + '</span>' +
        '</div>' +
        '<div class="task-result-right">' +
          '<span class="status-pill ' + statusClass + '">' + ts.status + '</span>' +
          '<span class="task-result-stat mono">' + duration + '</span>' +
          '<span class="task-result-stat mono">' + (ts.eventCount || 0) + ' events</span>' +
        '</div>';
      els.taskResults.appendChild(card);
    }

    showScreen('final');
  }

  async function onDownloadAll() {
    if (!studyState || !studyState.taskSessions) return;

    for (const ts of studyState.taskSessions) {
      try {
        const resp = await sendMessage(MSG.EXPORT_SESSION, { sessionId: ts.sessionId });
        if (resp && resp.success && resp.csv) {
          const blob = new Blob([resp.csv], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'ux-pulse-task-' + ts.taskNumber + '-' + (studyState.participantName || 'participant').replace(/\s+/g, '-') + '-' + new Date().toISOString().slice(0, 10) + '.csv';
          a.click();
          URL.revokeObjectURL(url);
        }
      } catch (e) {
        console.error('CSV export failed for task ' + ts.taskNumber + ':', e);
      }
    }
  }

  async function onNewStudy() {
    // Reset study state
    try {
      await sendMessage(MSG.RESET_STUDY);
    } catch (e) {}

    studyState = null;
    sessionStartTime = null;

    // Keep name/email
    els.btnBegin.disabled = false;
    validateForm();
    showScreen('welcome');
  }

  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  // ── Init ──────────────────────────────────────────────

  async function init() {
    // Restore saved fields
    const data = await chrome.storage.local.get(['lastName', 'lastEmail']);
    if (data.lastName) els.nameInput.value = data.lastName;
    if (data.lastEmail) els.emailInput.value = data.lastEmail;

    // Check if a study is in progress
    try {
      const resp = await sendMessage(MSG.GET_STUDY_STATE);

      if (resp && resp.success && resp.studyState) {
        studyState = resp.studyState;

        // Check if a task is actively recording
        const statusResp = await sendMessage(MSG.GET_STATUS);
        if (statusResp && statusResp.isRecording && statusResp.session) {
          // We're mid-task, show recording screen
          const taskIndex = studyState.currentTaskIndex;
          const task = STUDY_TASKS[taskIndex];

          els.recTask.textContent = task ? task.title : statusResp.session.taskName;
          els.recTaskNumber.textContent = 'Task ' + (taskIndex + 1) + ' of 3';
          els.recEvents.textContent = statusResp.session.eventCount || 0;

          showScreen('recording');
          startTimer(statusResp.session.startTime);
          startPolling();
          return;
        }

        // Study exists but no active task
        const completedCount = studyState.taskSessions ? studyState.taskSessions.length : 0;

        if (completedCount >= STUDY_TASKS.length) {
          // All tasks done, show final summary
          showFinalSummary(studyState.taskSessions);
          return;
        }

        if (completedCount > 0 && completedCount < STUDY_TASKS.length) {
          // Between tasks, show briefing for next
          studyState.currentTaskIndex = completedCount;
          showBriefing(completedCount);
          return;
        }

        if (completedCount === 0 && studyState.studyId) {
          // Study started but no tasks done yet, show first briefing
          showBriefing(0);
          return;
        }
      }
    } catch (e) {
      console.log('Study state check failed:', e);
    }

    // Default: show welcome
    validateForm();
    showScreen('welcome');
  }

  // ── Bind Events ───────────────────────────────────────

  els.nameInput.addEventListener('input', validateForm);
  els.emailInput.addEventListener('input', validateForm);

  els.btnBegin.addEventListener('click', onBeginStudy);
  els.btnStartTask.addEventListener('click', onStartTask);
  els.btnComplete.addEventListener('click', onCompleteTask);
  els.btnSkip.addEventListener('click', onSkipTask);
  els.btnNextTask.addEventListener('click', onNextTask);
  els.btnDownloadAll.addEventListener('click', onDownloadAll);

  els.linkNewStudy.addEventListener('click', (e) => { e.preventDefault(); onNewStudy(); });
  els.linkDashboard.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });
  els.linkDashboard2.addEventListener('click', (e) => { e.preventDefault(); openDashboard(); });

  // ── Start ─────────────────────────────────────────────
  init();

})();
