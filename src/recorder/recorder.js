/**
 * UX Pulse — Screen Recorder
 * Runs in a persistent extension window to capture screen recordings via getDisplayMedia.
 * Communicates with the service worker via chrome.runtime messaging.
 */

(function () {
  'use strict';

  const MSG = {
    START_SCREEN_RECORDING: 'START_SCREEN_RECORDING',
    STOP_SCREEN_RECORDING: 'STOP_SCREEN_RECORDING',
    SCREEN_RECORDING_ACTIVE: 'SCREEN_RECORDING_ACTIVE',
    SCREEN_RECORDING_STOPPED: 'SCREEN_RECORDING_STOPPED',
    CLOSE_RECORDER: 'CLOSE_RECORDER',
  };

  // ── State ─────────────────────────────────────────────
  let mediaStream = null;
  let mediaRecorder = null;
  let recordedChunks = [];
  let currentTaskNumber = 1;
  let participantName = 'participant';

  // ── DOM refs ──────────────────────────────────────────
  const stateIdle = document.getElementById('state-idle');
  const statePrompt = document.getElementById('state-prompt');
  const stateRecording = document.getElementById('state-recording');
  const stateSaving = document.getElementById('state-saving');
  const btnShare = document.getElementById('btn-share');
  const recTaskNum = document.getElementById('rec-task-num');

  // ── UI State Management ───────────────────────────────

  function showState(id) {
    stateIdle.style.display = 'none';
    statePrompt.style.display = 'none';
    stateRecording.style.display = 'none';
    stateSaving.style.display = 'none';
    document.getElementById(id).style.display = 'flex';
  }

  // ── Screen Capture ────────────────────────────────────

  async function requestScreenShare() {
    try {
      mediaStream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });

      // Listen for user stopping the share via Chrome's UI
      mediaStream.getVideoTracks()[0].addEventListener('ended', () => {
        handleStreamLost();
      });

      startMediaRecorder();
    } catch (err) {
      console.error('[UX Pulse Recorder] getDisplayMedia failed:', err);
      // User cancelled — go back to prompt
      showState('state-prompt');
    }
  }

  function startMediaRecorder() {
    if (!mediaStream) return;

    recordedChunks = [];

    const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';

    mediaRecorder = new MediaRecorder(mediaStream, { mimeType });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      downloadRecording();
    };

    mediaRecorder.start(1000); // 1-second timeslices

    recTaskNum.textContent = currentTaskNumber;
    showState('state-recording');

    // Notify service worker
    chrome.runtime.sendMessage({ type: MSG.SCREEN_RECORDING_ACTIVE }).catch(() => {});
  }

  function stopRecording() {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      showState('state-saving');
      mediaRecorder.stop();
    }
  }

  function downloadRecording() {
    if (recordedChunks.length === 0) {
      showState('state-idle');
      return;
    }

    const blob = new Blob(recordedChunks, { type: 'video/webm' });
    recordedChunks = [];

    const date = new Date().toISOString().slice(0, 10);
    const safeName = participantName.replace(/\s+/g, '-').replace(/[^a-zA-Z0-9-]/g, '');
    const filename = 'ux-pulse-task-' + currentTaskNumber + '-' + safeName + '-' + date + '.webm';

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();

    setTimeout(() => URL.revokeObjectURL(url), 5000);

    // Notify service worker
    chrome.runtime.sendMessage({ type: MSG.SCREEN_RECORDING_STOPPED }).catch(() => {});

    showState('state-idle');
  }

  function handleStreamLost() {
    console.log('[UX Pulse Recorder] Stream ended by user');
    mediaStream = null;
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    mediaRecorder = null;
    chrome.runtime.sendMessage({ type: MSG.SCREEN_RECORDING_STOPPED }).catch(() => {});
    showState('state-idle');
  }

  function closeRecorder() {
    // Stop all tracks
    if (mediaStream) {
      mediaStream.getTracks().forEach(t => t.stop());
      mediaStream = null;
    }
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
    }
    window.close();
  }

  // ── Message Listener ──────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[UX Pulse Recorder] Received:', message.type);

    switch (message.type) {
      case MSG.START_SCREEN_RECORDING:
        currentTaskNumber = message.taskNumber || 1;
        participantName = message.participantName || 'participant';

        // Ignore if already recording this task
        if (mediaRecorder && mediaRecorder.state === 'recording') {
          sendResponse({ success: true });
          break;
        }

        if (mediaStream && mediaStream.active) {
          // Reuse existing stream for subsequent tasks
          startMediaRecorder();
        } else {
          // Need user gesture — show the share button
          showState('state-prompt');
        }
        sendResponse({ success: true });
        break;

      case MSG.STOP_SCREEN_RECORDING:
        stopRecording();
        sendResponse({ success: true });
        break;

      case MSG.CLOSE_RECORDER:
        sendResponse({ success: true });
        setTimeout(closeRecorder, 500); // small delay for the download to trigger
        break;

      default:
        sendResponse({ success: true });
    }

    return false;
  });

  // ── Button Binding ────────────────────────────────────

  btnShare.addEventListener('click', requestScreenShare);

  // ── Init ──────────────────────────────────────────────

  // Tell the service worker we're ready — it will tell us if we should start recording
  chrome.runtime.sendMessage({ type: 'RECORDER_READY' }, (resp) => {
    if (chrome.runtime.lastError) {
      console.log('[UX Pulse Recorder] Ready check failed:', chrome.runtime.lastError.message);
      return;
    }
    if (resp && resp.shouldRecord) {
      currentTaskNumber = resp.taskNumber || 1;
      participantName = resp.participantName || 'participant';
      if (mediaStream && mediaStream.active) {
        startMediaRecorder();
      } else {
        showState('state-prompt');
      }
    } else {
      showState('state-idle');
    }
  });

  console.log('[UX Pulse Recorder] Loaded');
})();
