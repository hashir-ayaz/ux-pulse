/**
 * UX Pulse — Analytics Page
 * Renders 5 data visualizations from session/event data.
 */

(function () {
  'use strict';

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

  // ── Data Loading ──────────────────────────────────────

  async function loadAllData() {
    const sessResp = await sendMessage('GET_SESSIONS');
    if (!sessResp || !sessResp.success) return null;

    const sessions = sessResp.sessions || [];
    const sessionEvents = {};

    // Fetch events for all sessions in parallel (batches of 10)
    for (let i = 0; i < sessions.length; i += 10) {
      const batch = sessions.slice(i, i + 10);
      const promises = batch.map(s =>
        sendMessage('GET_SESSION_EVENTS', { sessionId: s.id })
          .then(resp => ({ id: s.id, events: (resp && resp.events) || [] }))
          .catch(() => ({ id: s.id, events: [] }))
      );
      const results = await Promise.all(promises);
      for (const r of results) {
        sessionEvents[r.id] = r.events;
      }
    }

    return { sessions, sessionEvents };
  }

  // ── Aggregation Helpers ───────────────────────────────

  function groupByTask(sessions) {
    const groups = { 1: [], 2: [], 3: [] };
    for (const s of sessions) {
      const tn = s.taskNumber || parseInt(s.taskName?.match(/\d/)?.[0]) || 0;
      if (groups[tn]) groups[tn].push(s);
    }
    return groups;
  }

  function countEvents(events, type) {
    return events.filter(e => e.type === type).length;
  }

  function frustrationScore(events) {
    return countEvents(events, 'RAGE_CLICK') +
           countEvents(events, 'DEAD_CLICK') +
           countEvents(events, 'FORM_ERROR');
  }

  function quantile(arr, q) {
    const sorted = [...arr].sort((a, b) => a - b);
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    if (sorted[base + 1] !== undefined) {
      return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
    }
    return sorted[base];
  }

  // ── Chart Theme ───────────────────────────────────────

  const COLORS = {
    task1: '#F59E0B', // amber
    task2: '#3B82F6', // blue
    task3: '#22C55E', // green
    completed: '#22C55E',
    skipped: '#EF4444',
    gridLine: 'rgba(148, 163, 184, 0.1)',
    gridText: '#64748B',
  };

  function configureChartDefaults() {
    if (typeof Chart === 'undefined') return;
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.font.family = "'Fira Sans', sans-serif";
    Chart.defaults.font.size = 12;
    Chart.defaults.plugins.legend.labels.usePointStyle = true;
    Chart.defaults.plugins.legend.labels.padding = 16;
  }

  // ── Chart 1: Task Success Rate ────────────────────────

  function renderSuccessChart(taskGroups) {
    const ctx = document.getElementById('chart-success').getContext('2d');

    const data = [1, 2, 3].map(tn => {
      const tasks = taskGroups[tn] || [];
      const completed = tasks.filter(s => s.status === 'completed').length;
      const skipped = tasks.filter(s => s.status !== 'completed').length;
      return { completed, skipped, total: tasks.length };
    });

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['Task 1: Register', 'Task 2: Add to Cart', 'Task 3: Support Chat'],
        datasets: [
          {
            label: 'Completed',
            data: data.map(d => d.completed),
            backgroundColor: COLORS.completed,
            borderRadius: 4,
            borderSkipped: 'bottom',
          },
          {
            label: 'Skipped / Failed',
            data: data.map(d => d.skipped),
            backgroundColor: COLORS.skipped,
            borderRadius: 4,
            borderSkipped: 'bottom',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            stacked: true,
            grid: { display: false },
          },
          y: {
            stacked: true,
            beginAtZero: true,
            grid: { color: COLORS.gridLine },
            title: { display: true, text: 'Participants', color: COLORS.gridText },
          },
        },
        plugins: {
          tooltip: {
            callbacks: {
              afterBody: function (items) {
                const idx = items[0].dataIndex;
                const d = data[idx];
                const pct = d.total > 0 ? Math.round((d.completed / d.total) * 100) : 0;
                return 'Success rate: ' + pct + '%';
              },
            },
          },
        },
      },
    });
  }

  // ── Chart 2: Box Plot (Custom Canvas) ─────────────────

  function renderBoxPlot(taskGroups) {
    const canvas = document.getElementById('chart-boxplot');
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = 300 * dpr;
    ctx.scale(dpr, dpr);
    canvas.style.height = '300px';

    const W = rect.width;
    const H = 300;
    const pad = { top: 30, right: 40, bottom: 50, left: 60 };
    const plotW = W - pad.left - pad.right;
    const plotH = H - pad.top - pad.bottom;

    // Get durations per task
    const taskData = [1, 2, 3].map(tn => {
      const durations = (taskGroups[tn] || [])
        .filter(s => s.durationMs > 0)
        .map(s => s.durationMs / 1000);
      if (durations.length === 0) return null;
      durations.sort((a, b) => a - b);
      return {
        min: durations[0],
        q1: quantile(durations, 0.25),
        median: quantile(durations, 0.5),
        q3: quantile(durations, 0.75),
        max: durations[durations.length - 1],
        values: durations,
      };
    });

    // Y axis range
    const allVals = taskData.filter(Boolean).flatMap(d => [d.min, d.max]);
    const yMin = 0;
    const yMax = Math.ceil(Math.max(...allVals) / 10) * 10 + 10;

    function yScale(v) { return pad.top + plotH - (v - yMin) / (yMax - yMin) * plotH; }

    // Background
    ctx.fillStyle = 'transparent';
    ctx.fillRect(0, 0, W, H);

    // Grid lines
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.1)';
    ctx.lineWidth = 1;
    const yTicks = 6;
    for (let i = 0; i <= yTicks; i++) {
      const v = yMin + (yMax - yMin) * (i / yTicks);
      const y = yScale(v);
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(W - pad.right, y);
      ctx.stroke();

      ctx.fillStyle = '#64748B';
      ctx.font = '11px Fira Sans';
      ctx.textAlign = 'right';
      ctx.fillText(Math.round(v) + 's', pad.left - 8, y + 4);
    }

    // Draw box plots
    const colors = [COLORS.task1, COLORS.task2, COLORS.task3];
    const labels = ['Task 1:\nRegister', 'Task 2:\nAdd to Cart', 'Task 3:\nSupport'];
    const boxWidth = Math.min(80, plotW / 5);
    const spacing = plotW / 3;

    taskData.forEach((d, i) => {
      if (!d) return;
      const cx = pad.left + spacing * i + spacing / 2;

      // Whisker line (min to max)
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(cx, yScale(d.min));
      ctx.lineTo(cx, yScale(d.max));
      ctx.stroke();

      // Min cap
      ctx.beginPath();
      ctx.moveTo(cx - boxWidth / 4, yScale(d.min));
      ctx.lineTo(cx + boxWidth / 4, yScale(d.min));
      ctx.stroke();

      // Max cap
      ctx.beginPath();
      ctx.moveTo(cx - boxWidth / 4, yScale(d.max));
      ctx.lineTo(cx + boxWidth / 4, yScale(d.max));
      ctx.stroke();

      // Box (Q1 to Q3)
      const boxTop = yScale(d.q3);
      const boxBottom = yScale(d.q1);
      ctx.fillStyle = colors[i] + '30'; // 30 = ~19% alpha
      ctx.fillRect(cx - boxWidth / 2, boxTop, boxWidth, boxBottom - boxTop);
      ctx.strokeStyle = colors[i];
      ctx.lineWidth = 2;
      ctx.strokeRect(cx - boxWidth / 2, boxTop, boxWidth, boxBottom - boxTop);

      // Median line
      ctx.strokeStyle = '#F1F5F9';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(cx - boxWidth / 2, yScale(d.median));
      ctx.lineTo(cx + boxWidth / 2, yScale(d.median));
      ctx.stroke();

      // Individual data points (jittered)
      ctx.fillStyle = colors[i] + '80';
      d.values.forEach(v => {
        const jitter = (Math.random() - 0.5) * boxWidth * 0.6;
        ctx.beginPath();
        ctx.arc(cx + jitter, yScale(v), 3, 0, Math.PI * 2);
        ctx.fill();
      });

      // Labels
      ctx.fillStyle = '#94A3B8';
      ctx.font = '12px Fira Sans';
      ctx.textAlign = 'center';
      const labelLines = labels[i].split('\n');
      labelLines.forEach((line, li) => {
        ctx.fillText(line, cx, H - pad.bottom + 16 + li * 14);
      });

      // Stats annotation
      ctx.fillStyle = '#64748B';
      ctx.font = '10px Fira Code';
      ctx.textAlign = 'center';
      ctx.fillText('med: ' + d.median.toFixed(1) + 's', cx, yScale(d.max) - 8);
    });

    // Y-axis label
    ctx.save();
    ctx.translate(14, pad.top + plotH / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.fillStyle = '#64748B';
    ctx.font = '12px Fira Sans';
    ctx.textAlign = 'center';
    ctx.fillText('Duration (seconds)', 0, 0);
    ctx.restore();
  }

  // ── Chart 3: Frustration Heatmap ──────────────────────

  function renderHeatmap(sessions, sessionEvents) {
    const container = document.getElementById('heatmap-container');

    // Build per-participant, per-task frustration scores
    const participantMap = {};
    for (const s of sessions) {
      const tn = s.taskNumber || 0;
      if (!tn || tn < 1 || tn > 3) continue;
      const name = s.userName || s.userEmail || s.id;
      if (!participantMap[name]) participantMap[name] = { name, tasks: {} };
      const events = sessionEvents[s.id] || [];
      participantMap[name].tasks[tn] = frustrationScore(events);
    }

    const participants = Object.values(participantMap);
    // Sort by total frustration descending
    participants.sort((a, b) => {
      const totalA = (a.tasks[1] || 0) + (a.tasks[2] || 0) + (a.tasks[3] || 0);
      const totalB = (b.tasks[1] || 0) + (b.tasks[2] || 0) + (b.tasks[3] || 0);
      return totalB - totalA;
    });

    // Find max for color scaling
    const maxScore = Math.max(1, ...participants.flatMap(p => [p.tasks[1] || 0, p.tasks[2] || 0, p.tasks[3] || 0]));

    function heatColor(score) {
      if (score === 0) return '#1E293B';
      const intensity = score / maxScore;
      if (intensity < 0.33) {
        // dark → amber
        const t = intensity / 0.33;
        return interpolateColor('#2D3748', '#F59E0B', t);
      } else if (intensity < 0.66) {
        const t = (intensity - 0.33) / 0.33;
        return interpolateColor('#F59E0B', '#EF4444', t);
      } else {
        const t = (intensity - 0.66) / 0.34;
        return interpolateColor('#EF4444', '#DC2626', t);
      }
    }

    function interpolateColor(c1, c2, t) {
      const r1 = parseInt(c1.slice(1, 3), 16), g1 = parseInt(c1.slice(3, 5), 16), b1 = parseInt(c1.slice(5, 7), 16);
      const r2 = parseInt(c2.slice(1, 3), 16), g2 = parseInt(c2.slice(3, 5), 16), b2 = parseInt(c2.slice(5, 7), 16);
      const r = Math.round(r1 + (r2 - r1) * t), g = Math.round(g1 + (g2 - g1) * t), b = Math.round(b1 + (b2 - b1) * t);
      return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    // Build table
    let html = '<table class="heatmap-table"><thead><tr>';
    html += '<th>Participant</th><th>Task 1: Register</th><th>Task 2: Add to Cart</th><th>Task 3: Support</th>';
    html += '</tr></thead><tbody>';

    for (const p of participants) {
      html += '<tr>';
      html += '<td class="heatmap-name">' + escapeHtml(p.name) + '</td>';
      for (let t = 1; t <= 3; t++) {
        const score = p.tasks[t] || 0;
        const bg = heatColor(score);
        const textColor = score === 0 ? '#475569' : '#F1F5F9';
        html += '<td class="heatmap-cell" style="background:' + bg + ';color:' + textColor + ';" title="' + p.name + ' — Task ' + t + ': ' + score + ' frustration events">' + score + '</td>';
      }
      html += '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
  }

  // ── Chart 4: Event Distribution ───────────────────────

  function renderEventChart(taskGroups, sessionEvents) {
    const ctx = document.getElementById('chart-events').getContext('2d');

    const categories = [
      { label: 'Clicks', types: ['CLICK'] },
      { label: 'Dead Clicks', types: ['DEAD_CLICK'] },
      { label: 'Rage Clicks', types: ['RAGE_CLICK'] },
      { label: 'Scrolls', types: ['SCROLL', 'SCROLL_REVERSAL'] },
      { label: 'Form Errors', types: ['FORM_ERROR'] },
      { label: 'Hesitation', types: ['IDLE_PAUSE', 'HOVER_DWELL'] },
      { label: 'API Calls', types: ['API_REQUEST_START'] },
    ];

    function countForTask(taskNum, types) {
      const taskSessions = taskGroups[taskNum] || [];
      let total = 0;
      for (const s of taskSessions) {
        const events = sessionEvents[s.id] || [];
        for (const e of events) {
          if (types.includes(e.type)) total++;
        }
      }
      return total;
    }

    new Chart(ctx, {
      type: 'bar',
      data: {
        labels: categories.map(c => c.label),
        datasets: [
          {
            label: 'Task 1: Register',
            data: categories.map(c => countForTask(1, c.types)),
            backgroundColor: COLORS.task1,
            borderRadius: 3,
          },
          {
            label: 'Task 2: Add to Cart',
            data: categories.map(c => countForTask(2, c.types)),
            backgroundColor: COLORS.task2,
            borderRadius: 3,
          },
          {
            label: 'Task 3: Support',
            data: categories.map(c => countForTask(3, c.types)),
            backgroundColor: COLORS.task3,
            borderRadius: 3,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: {
            grid: { display: false },
          },
          y: {
            beginAtZero: true,
            grid: { color: COLORS.gridLine },
            title: { display: true, text: 'Event Count', color: COLORS.gridText },
          },
        },
        plugins: {
          legend: { position: 'top' },
        },
      },
    });
  }

  // ── Chart 5: Hypothesis Validation ────────────────────

  function renderHypotheses(taskGroups, sessionEvents) {
    const container = document.getElementById('hypothesis-cards');

    // H1: Location Requirement — Task 2 hesitation
    // Measure: % of Task 2 participants with IDLE_PAUSE or HOVER_DWELL early in session
    const task2Sessions = taskGroups[2] || [];
    let h1Count = 0;
    for (const s of task2Sessions) {
      const events = sessionEvents[s.id] || [];
      const scrollReversals = events.filter(e => e.type === 'SCROLL_REVERSAL').length;
      const hesitation = events.filter(e => e.type === 'IDLE_PAUSE' || e.type === 'HOVER_DWELL').length;
      if (scrollReversals >= 1 || hesitation >= 2) h1Count++;
    }
    const h1Pct = task2Sessions.length > 0 ? Math.round((h1Count / task2Sessions.length) * 100) : 0;
    const h1Pass = h1Pct >= 60;

    // H2: Registration Error — Task 1 form errors and failures
    const task1Sessions = taskGroups[1] || [];
    let h2ErrorCount = 0;
    let h2FailCount = 0;
    for (const s of task1Sessions) {
      const events = sessionEvents[s.id] || [];
      const formErrors = events.filter(e => e.type === 'FORM_ERROR').length;
      if (formErrors >= 2) h2ErrorCount++;
      if (s.status !== 'completed') h2FailCount++;
    }
    const h2ErrorPct = task1Sessions.length > 0 ? Math.round((h2ErrorCount / task1Sessions.length) * 100) : 0;
    const h2FailPct = task1Sessions.length > 0 ? Math.round((h2FailCount / task1Sessions.length) * 100) : 0;
    const h2Pass = h2ErrorPct >= 40 || h2FailPct >= 30;

    // H3: Chat Feedback — Task 3 hesitation/confusion
    const task3Sessions = taskGroups[3] || [];
    let h3Count = 0;
    for (const s of task3Sessions) {
      const events = sessionEvents[s.id] || [];
      const deadClicks = events.filter(e => e.type === 'DEAD_CLICK').length;
      const hesitation = events.filter(e => e.type === 'IDLE_PAUSE' || e.type === 'HOVER_DWELL').length;
      if (deadClicks >= 1 || hesitation >= 2) h3Count++;
    }
    const h3Pct = task3Sessions.length > 0 ? Math.round((h3Count / task3Sessions.length) * 100) : 0;
    const h3Pass = h3Pct >= 50;

    const hypotheses = [
      {
        id: 'H1',
        title: 'Location Requirement Causes Confusion',
        severity: 'high',
        text: 'If location selection is required before browsing, users will show confusion signals (scroll reversals, hesitation) before interacting with products.',
        threshold: '60%',
        measured: h1Pct + '%',
        pass: h1Pass,
        detail: h1Count + ' of ' + task2Sessions.length + ' participants showed confusion',
      },
      {
        id: 'H2',
        title: 'Registration Error Causes Failure',
        severity: 'high',
        text: 'If registration feedback is unclear or incorrect, a significant portion of users will encounter repeated errors or fail to complete registration.',
        threshold: '40% re-error OR 30% failure',
        measured: h2ErrorPct + '% re-error, ' + h2FailPct + '% failure',
        pass: h2Pass,
        detail: h2ErrorCount + ' re-errored, ' + h2FailCount + ' failed out of ' + task1Sessions.length,
      },
      {
        id: 'H3',
        title: 'Chat Lacks Discoverability & Feedback',
        severity: 'medium',
        text: 'If the chat feature lacks visibility and status feedback, users will struggle to find and use it, showing dead clicks and hesitation.',
        threshold: '50%',
        measured: h3Pct + '%',
        pass: h3Pass,
        detail: h3Count + ' of ' + task3Sessions.length + ' participants showed confusion',
      },
    ];

    let html = '';
    for (const h of hypotheses) {
      const badgeClass = h.pass ? 'confirmed' : 'not-confirmed';
      const badgeText = h.pass ? 'Confirmed' : 'Not Confirmed';
      const icon = h.pass ? '&#10003;' : '&#10007;';

      html += '<div class="hyp-card">';
      html += '  <div class="hyp-badge ' + badgeClass + '">';
      html += '    <span style="font-size:24px;">' + icon + '</span>';
      html += '    <span class="hyp-badge-label">' + badgeText + '</span>';
      html += '  </div>';
      html += '  <div class="hyp-content">';
      html += '    <div class="hyp-title">' + h.id + ': ' + h.title + ' <span class="hyp-tag ' + h.severity + '">' + h.severity + '</span></div>';
      html += '    <p class="hyp-text">' + h.text + '</p>';
      html += '    <div class="hyp-metrics">';
      html += '      <div class="hyp-metric"><span class="hyp-metric-value ' + (h.pass ? 'pass' : 'fail') + '">' + h.measured + '</span><span class="hyp-metric-label">Measured</span></div>';
      html += '      <div class="hyp-metric"><span class="hyp-metric-value" style="color:var(--text-secondary);">' + h.threshold + '</span><span class="hyp-metric-label">Threshold</span></div>';
      html += '    </div>';
      html += '    <p style="margin-top:8px;font-size:12px;color:var(--text-muted);">' + h.detail + '</p>';
      html += '  </div>';
      html += '</div>';
    }

    container.innerHTML = html;
  }

  // ── Summary Stats ─────────────────────────────────────

  function renderSummary(sessions, sessionEvents) {
    // Unique participants
    const participants = new Set(sessions.map(s => s.userName || s.userEmail || s.id));
    document.getElementById('stat-participants').textContent = participants.size;

    // Avg completion rate
    const completed = sessions.filter(s => s.status === 'completed').length;
    const rate = sessions.length > 0 ? Math.round((completed / sessions.length) * 100) : 0;
    document.getElementById('stat-completion').textContent = rate + '%';

    // Avg task time
    const durations = sessions.filter(s => s.durationMs > 0).map(s => s.durationMs / 1000);
    const avgTime = durations.length > 0 ? (durations.reduce((a, b) => a + b, 0) / durations.length).toFixed(1) : 0;
    document.getElementById('stat-avg-time').textContent = avgTime + 's';

    // Total events
    let totalEvents = 0;
    for (const evts of Object.values(sessionEvents)) {
      totalEvents += evts.length;
    }
    document.getElementById('stat-events').textContent = totalEvents.toLocaleString();
  }

  // ── Utilities ─────────────────────────────────────────

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ── Init ──────────────────────────────────────────────

  async function init() {
    configureChartDefaults();

    const data = await loadAllData();
    if (!data || data.sessions.length === 0) {
      document.getElementById('loading').innerHTML = '<p>No session data found. Import data from the dashboard first.</p>';
      return;
    }

    const { sessions, sessionEvents } = data;
    const taskGroups = groupByTask(sessions);

    // Show content
    document.getElementById('loading').style.display = 'none';
    document.getElementById('content').style.display = 'block';

    // Render all
    renderSummary(sessions, sessionEvents);
    renderSuccessChart(taskGroups);
    renderBoxPlot(taskGroups);
    renderHeatmap(sessions, sessionEvents);
    renderEventChart(taskGroups, sessionEvents);
    renderHypotheses(taskGroups, sessionEvents);
  }

  // ── Event Bindings ────────────────────────────────────

  document.getElementById('btn-back').addEventListener('click', () => {
    window.location.href = '../dashboard/dashboard.html';
  });

  init();
})();
