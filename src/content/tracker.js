/**
 * UX Pulse — Content Script (Tracker)
 * Tracks clicks, scrolls, hesitation, forms, network requests, and visibility.
 * Only active when a recording session is in progress.
 */

(function () {
  'use strict';

  // ── Constants (inlined from shared/constants.js) ──────────

  const EventType = {
    CLICK: 'CLICK', DOUBLE_CLICK: 'DOUBLE_CLICK', RIGHT_CLICK: 'RIGHT_CLICK',
    DEAD_CLICK: 'DEAD_CLICK', RAGE_CLICK: 'RAGE_CLICK',
    SCROLL: 'SCROLL', SCROLL_REVERSAL: 'SCROLL_REVERSAL',
    HOVER_DWELL: 'HOVER_DWELL', IDLE_PAUSE: 'IDLE_PAUSE',
    FORM_FOCUS: 'FORM_FOCUS', FORM_SUBMIT: 'FORM_SUBMIT', FORM_ERROR: 'FORM_ERROR',
    API_REQUEST_START: 'API_REQUEST_START', API_REQUEST_END: 'API_REQUEST_END', API_REQUEST_ERROR: 'API_REQUEST_ERROR',
    PAGE_VISIBLE: 'PAGE_VISIBLE', PAGE_HIDDEN: 'PAGE_HIDDEN',
    WINDOW_RESIZE: 'WINDOW_RESIZE', COPY: 'COPY', PASTE: 'PASTE',
    MODAL_OPEN: 'MODAL_OPEN', IFRAME_INTERACT: 'IFRAME_INTERACT',
  };

  const MessageType = {
    LOG_EVENT: 'LOG_EVENT', LOG_BATCH: 'LOG_BATCH',
    RECORDING_STARTED: 'RECORDING_STARTED', RECORDING_STOPPED: 'RECORDING_STOPPED',
    GET_STATUS: 'GET_STATUS', PING: 'PING',
    SHOW_RED_BORDER: 'SHOW_RED_BORDER', HIDE_RED_BORDER: 'HIDE_RED_BORDER',
  };

  const INTERACTIVE = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex], label, summary, [onclick]';
  const RAGE_CLICK_COUNT = 3;
  const RAGE_CLICK_WINDOW_MS = 2000;
  const RAGE_CLICK_RADIUS_PX = 40;
  const HOVER_DWELL_MS = 2000;
  const IDLE_PAUSE_MS = 3000;
  const IDLE_CHECK_INTERVAL = 500;
  const SCROLL_THROTTLE_MS = 200;
  const SCROLL_REVERSAL_PX = 150;
  const RESIZE_THROTTLE_MS = 500;
  const KEEPALIVE_INTERVAL_MS = 20000;
  const BATCH_INTERVAL_MS = 2000;

  // ── State ─────────────────────────────────────────────────

  let isRecording = false;
  let eventBuffer = [];
  let listeners = [];
  let intervals = [];

  // Click tracking
  let clickHistory = [];

  // Scroll tracking
  let lastScrollY = window.scrollY;
  let lastScrollDirection = null;

  // Hesitation
  let lastActivityTime = Date.now();
  let pauseActive = false;

  // Hover dwell
  const hoverTimers = new WeakMap();

  // Red border overlay
  let redBorderElement = null;

  function showRedBorder() {
    if (redBorderElement) return;
    redBorderElement = document.createElement('div');
    redBorderElement.id = '__ux-pulse-recording-border__';
    redBorderElement.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;border:4px solid #EF4444;pointer-events:none;z-index:2147483647;box-sizing:border-box;';
    (document.body || document.documentElement).appendChild(redBorderElement);
  }

  function hideRedBorder() {
    if (redBorderElement) {
      redBorderElement.remove();
      redBorderElement = null;
    }
  }

  // ── Utilities ─────────────────────────────────────────────

  function throttle(fn, ms) {
    let last = 0;
    return function (...args) {
      const now = Date.now();
      if (now - last >= ms) {
        last = now;
        fn.apply(this, args);
      }
    };
  }

  function describeElement(el) {
    if (!el) return { elementTag: '', elementText: '', elementId: '', elementClasses: '', isInteractive: false };
    try {
      const isInteractive = (el.matches && el.matches(INTERACTIVE)) || !!(el.closest && el.closest(INTERACTIVE));
      return {
        elementTag: el.tagName || '',
        elementText: (el.textContent || '').trim().substring(0, 80),
        elementId: el.id || '',
        elementClasses: el.className && typeof el.className === 'string' ? el.className.substring(0, 120) : '',
        isInteractive,
      };
    } catch (e) {
      return { elementTag: el.tagName || '', elementText: '', elementId: '', elementClasses: '', isInteractive: false };
    }
  }

  function logEvent(eventType, data = {}) {
    if (!isRecording) return;
    eventBuffer.push({
      eventType,
      timestamp: Date.now(),
      url: window.location.href,
      data,
    });
  }

  function flushBuffer() {
    if (eventBuffer.length === 0) return;
    const batch = eventBuffer.splice(0);
    try {
      chrome.runtime.sendMessage({ type: MessageType.LOG_BATCH, events: batch }, () => {
        if (chrome.runtime.lastError) {
          // Service worker may be restarting — re-queue
          eventBuffer.unshift(...batch);
        }
      });
    } catch (e) {
      eventBuffer.unshift(...batch);
    }
  }

  function updateActivity() {
    lastActivityTime = Date.now();
  }

  // ── Listener Registration ─────────────────────────────────

  function addListener(target, event, handler, options) {
    target.addEventListener(event, handler, options);
    listeners.push({ target, event, handler, options });
  }

  function addInterval(fn, ms) {
    const id = setInterval(fn, ms);
    intervals.push(id);
    return id;
  }

  function removeAllListeners() {
    for (const l of listeners) {
      l.target.removeEventListener(l.event, l.handler, l.options);
    }
    listeners = [];
    for (const id of intervals) {
      clearInterval(id);
    }
    intervals = [];
  }

  // ── Click Tracking ────────────────────────────────────────

  function onClickCapture(e) {
    updateActivity();

    const desc = describeElement(e.target);
    const now = Date.now();

    // Basic click event
    logEvent(EventType.CLICK, {
      x: e.clientX,
      y: e.clientY,
      ...desc,
    });

    // Dead click: not interactive
    if (!desc.isInteractive) {
      logEvent(EventType.DEAD_CLICK, {
        x: e.clientX,
        y: e.clientY,
        ...desc,
      });
    }

    // Rage click detection
    clickHistory.push({ x: e.clientX, y: e.clientY, t: now });
    // Prune old
    clickHistory = clickHistory.filter(c => now - c.t < RAGE_CLICK_WINDOW_MS);

    const nearby = clickHistory.filter(c =>
      Math.hypot(c.x - e.clientX, c.y - e.clientY) < RAGE_CLICK_RADIUS_PX
    );

    if (nearby.length >= RAGE_CLICK_COUNT) {
      logEvent(EventType.RAGE_CLICK, {
        x: e.clientX,
        y: e.clientY,
        clickCount: nearby.length,
        ...desc,
      });
      // Reset to avoid duplicate rage events
      clickHistory = [];
    }
  }

  function onDblClick(e) {
    updateActivity();
    logEvent(EventType.DOUBLE_CLICK, {
      x: e.clientX,
      y: e.clientY,
      ...describeElement(e.target),
    });
  }

  function onContextMenu(e) {
    updateActivity();
    logEvent(EventType.RIGHT_CLICK, {
      x: e.clientX,
      y: e.clientY,
      ...describeElement(e.target),
    });
  }

  // ── Scroll Tracking ───────────────────────────────────────

  const onScroll = throttle(() => {
    updateActivity();

    const currentY = window.scrollY;
    const delta = currentY - lastScrollY;
    const direction = delta > 0 ? 'down' : 'up';
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    const depthPercent = maxScroll > 0 ? Math.round((currentY / maxScroll) * 100) : 0;

    logEvent(EventType.SCROLL, {
      direction,
      scrollY: currentY,
      scrollDepthPercent: depthPercent,
    });

    // Scroll reversal
    if (lastScrollDirection && direction !== lastScrollDirection && Math.abs(delta) > SCROLL_REVERSAL_PX) {
      logEvent(EventType.SCROLL_REVERSAL, {
        fromDirection: lastScrollDirection,
        toDirection: direction,
        scrollY: currentY,
      });
    }

    lastScrollDirection = direction;
    lastScrollY = currentY;
  }, SCROLL_THROTTLE_MS);

  // ── Hover Dwell (Hesitation) ──────────────────────────────

  function onMouseOver(e) {
    const el = e.target.closest(INTERACTIVE);
    if (!el) return;

    if (hoverTimers.has(el)) return; // already tracking

    const timer = setTimeout(() => {
      logEvent(EventType.HOVER_DWELL, {
        dwellMs: HOVER_DWELL_MS,
        ...describeElement(el),
      });
      hoverTimers.delete(el);
    }, HOVER_DWELL_MS);

    hoverTimers.set(el, timer);
  }

  function onMouseOut(e) {
    const el = e.target.closest(INTERACTIVE);
    if (!el) return;

    const timer = hoverTimers.get(el);
    if (timer) {
      clearTimeout(timer);
      hoverTimers.delete(el);
    }
  }

  // ── Idle Pause Detection ──────────────────────────────────

  function checkIdlePause() {
    if (!isRecording) return;

    const gap = Date.now() - lastActivityTime;

    if (gap >= IDLE_PAUSE_MS && !pauseActive) {
      pauseActive = true;
      logEvent(EventType.IDLE_PAUSE, { durationMs: gap, startedAt: lastActivityTime });
    } else if (gap < IDLE_PAUSE_MS && pauseActive) {
      pauseActive = false;
    }
  }

  // ── Form Tracking ────────────────────────────────────────

  function onFocusIn(e) {
    const el = e.target;
    if (el.matches('input, textarea, select')) {
      updateActivity();
      logEvent(EventType.FORM_FOCUS, {
        fieldType: el.type || el.tagName.toLowerCase(),
        fieldName: el.name || el.id || '',
        ...describeElement(el),
      });
    }
  }

  function onFormSubmit(e) {
    updateActivity();
    const form = e.target;
    logEvent(EventType.FORM_SUBMIT, {
      action: form.action || '',
      method: form.method || 'GET',
      fieldCount: form.elements ? form.elements.length : 0,
    });
  }

  // ── Form Error Detection (MutationObserver) ───────────────

  let formErrorObserver = null;

  function startFormErrorObserver() {
    formErrorObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;

          // Check for common error patterns
          const el = node;
          const text = (el.textContent || '').trim();
          const isError =
            el.matches('[class*="error"], [class*="Error"], [class*="alert"], [class*="danger"], [role="alert"]') ||
            el.querySelector('[class*="error"], [class*="Error"], [role="alert"]');

          if (isError && text.length > 0 && text.length < 500) {
            logEvent(EventType.FORM_ERROR, {
              errorText: text.substring(0, 200),
              ...describeElement(el),
            });
          }
        }
      }
    });

    formErrorObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── Modal / Overlay Detection ─────────────────────────────

  let modalObserver = null;

  const MODAL_SELECTORS = [
    '[role="dialog"]', '[role="alertdialog"]', '[aria-modal="true"]',
    '[class*="modal"]', '[class*="Modal"]', '[class*="dialog"]', '[class*="Dialog"]',
    '[class*="popup"]', '[class*="Popup"]', '[class*="overlay"]', '[class*="Overlay"]',
    '[class*="drawer"]', '[class*="Drawer"]', '[class*="chat"]', '[class*="Chat"]',
    '[class*="widget"]', '[class*="Widget"]', '[class*="intercom"]', '[class*="crisp"]',
    '[class*="zendesk"]', '[class*="tawk"]', '[class*="livechat"]',
  ].join(', ');

  function isModalLike(el) {
    try {
      if (el.matches(MODAL_SELECTORS)) return true;

      const style = window.getComputedStyle(el);
      const zIndex = parseInt(style.zIndex, 10);
      const position = style.position;

      if ((position === 'fixed' || position === 'absolute') && zIndex > 900) return true;
    } catch (e) {
      // Some elements (SVG, MathML) may not support matches() or getComputedStyle()
    }
    return false;
  }

  function startModalObserver() {
    modalObserver = new MutationObserver((mutations) => {
      try {
        for (const mutation of mutations) {
          for (const node of mutation.addedNodes) {
            if (node.nodeType !== Node.ELEMENT_NODE) continue;
            if (!node.tagName) continue; // skip non-HTML elements

            const el = node;

            if (isModalLike(el)) {
              logEvent(EventType.MODAL_OPEN, {
                ...describeElement(el),
                tagName: el.tagName,
                role: el.getAttribute('role') || '',
                ariaLabel: el.getAttribute('aria-label') || '',
              });
            }

            // Check if it contains an iframe (chat widget pattern)
            const iframes = el.tagName === 'IFRAME' ? [el] : (el.querySelectorAll ? el.querySelectorAll('iframe') : []);
            for (const iframe of iframes) {
              logEvent(EventType.MODAL_OPEN, {
                elementTag: 'IFRAME',
                iframeSrc: (iframe.src || '').substring(0, 200),
                iframeTitle: iframe.title || '',
                iframeName: iframe.name || '',
                parentClasses: (el.className && typeof el.className === 'string') ? el.className.substring(0, 120) : '',
                isInteractive: true,
              });
            }
          }
        }
      } catch (e) {
        console.warn('[UX Pulse] Modal observer error:', e.message);
      }
    });

    modalObserver.observe(document.body || document.documentElement, {
      childList: true,
      subtree: true,
    });
  }

  // ── Iframe Blur Detection (tracks when user clicks into an iframe) ──

  function onWindowBlur() {
    if (!isRecording) return;
    // When the window blurs and an iframe is focused, the user clicked into an iframe
    setTimeout(() => {
      const active = document.activeElement;
      if (active && active.tagName === 'IFRAME') {
        logEvent(EventType.IFRAME_INTERACT, {
          iframeSrc: (active.src || '').substring(0, 200),
          iframeTitle: active.title || '',
          iframeName: active.name || '',
          iframeId: active.id || '',
          parentClasses: active.parentElement ? (active.parentElement.className || '').substring(0, 120) : '',
        });
      }
    }, 0);
  }

  // ── Network Interception ──────────────────────────────────

  function injectNetworkInterceptor() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('src/content/network-interceptor.js');
    script.onload = () => script.remove();
    (document.head || document.documentElement).appendChild(script);
  }

  function onNetworkMessage(e) {
    if (e.source !== window) return;
    if (!e.data || e.data.type !== '__ux_pulse_net__') return;
    if (!isRecording) return;

    const d = e.data;
    switch (d.action) {
      case 'req_start':
        logEvent(EventType.API_REQUEST_START, {
          reqId: d.reqId, method: d.method, requestUrl: d.url,
        });
        break;
      case 'req_end':
        logEvent(EventType.API_REQUEST_END, {
          reqId: d.reqId, method: d.method, requestUrl: d.url,
          statusCode: d.statusCode, durationMs: d.durationMs,
        });
        break;
      case 'req_error':
        logEvent(EventType.API_REQUEST_ERROR, {
          reqId: d.reqId, method: d.method, requestUrl: d.url,
          error: d.error, durationMs: d.durationMs,
        });
        break;
    }
  }

  // ── Visibility ────────────────────────────────────────────

  function onVisibilityChange() {
    if (document.visibilityState === 'hidden') {
      logEvent(EventType.PAGE_HIDDEN, {});
      flushBuffer(); // flush before tab goes away
    } else {
      logEvent(EventType.PAGE_VISIBLE, {});
    }
  }

  // ── Copy / Paste ──────────────────────────────────────────

  function onCopy() { updateActivity(); logEvent(EventType.COPY, {}); }
  function onPaste() { updateActivity(); logEvent(EventType.PASTE, {}); }

  // ── Resize ────────────────────────────────────────────────

  const onResize = throttle(() => {
    logEvent(EventType.WINDOW_RESIZE, {
      width: window.innerWidth,
      height: window.innerHeight,
    });
  }, RESIZE_THROTTLE_MS);

  // ── Start / Stop Recording ────────────────────────────────

  function startTracking() {
    if (isRecording) return;
    isRecording = true;
    eventBuffer = [];
    clickHistory = [];
    lastScrollY = window.scrollY;
    lastScrollDirection = null;
    lastActivityTime = Date.now();
    pauseActive = false;

    // Click
    addListener(document, 'click', onClickCapture, true);
    addListener(document, 'dblclick', onDblClick, true);
    addListener(document, 'contextmenu', onContextMenu, true);

    // Scroll
    addListener(document, 'scroll', onScroll, { passive: true });

    // Hover
    addListener(document, 'mouseover', onMouseOver, true);
    addListener(document, 'mouseout', onMouseOut, true);

    // Activity tracking (for idle detection)
    addListener(document, 'mousemove', updateActivity, { passive: true });
    addListener(document, 'keydown', updateActivity, true);

    // Forms
    addListener(document, 'focusin', onFocusIn, true);
    addListener(document, 'submit', onFormSubmit, true);

    // Visibility
    addListener(document, 'visibilitychange', onVisibilityChange);

    // Copy/Paste
    addListener(document, 'copy', onCopy, true);
    addListener(document, 'paste', onPaste, true);

    // Resize
    addListener(window, 'resize', onResize);

    // Network
    addListener(window, 'message', onNetworkMessage);
    injectNetworkInterceptor();

    // Iframe blur (detects clicks into iframes like chat widgets)
    addListener(window, 'blur', onWindowBlur);

    // Form error observer + Modal observer
    if (document.body) {
      startFormErrorObserver();
      startModalObserver();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        startFormErrorObserver();
        startModalObserver();
      }, { once: true });
    }

    // Intervals
    addInterval(checkIdlePause, IDLE_CHECK_INTERVAL);
    addInterval(flushBuffer, BATCH_INTERVAL_MS);
    addInterval(() => {
      try { chrome.runtime.sendMessage({ type: MessageType.PING }); } catch (e) {}
    }, KEEPALIVE_INTERVAL_MS);

    console.log('[UX Pulse] Tracking started');
  }

  function stopTracking() {
    if (!isRecording) return;
    flushBuffer();
    isRecording = false;
    removeAllListeners();
    if (formErrorObserver) {
      formErrorObserver.disconnect();
      formErrorObserver = null;
    }
    if (modalObserver) {
      modalObserver.disconnect();
      modalObserver = null;
    }
    clickHistory = [];
    console.log('[UX Pulse] Tracking stopped');
    hideRedBorder();
  }

  // ── Message Listener ──────────────────────────────────────

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    console.log('[UX Pulse] Content script received message:', message.type);

    if (message.type === MessageType.RECORDING_STARTED) {
      startTracking();
      sendResponse({ success: true });
    } else if (message.type === MessageType.RECORDING_STOPPED) {
      stopTracking();
      hideRedBorder();
      sendResponse({ success: true });
    } else if (message.type === MessageType.SHOW_RED_BORDER) {
      showRedBorder();
      sendResponse({ success: true });
    } else if (message.type === MessageType.HIDE_RED_BORDER) {
      hideRedBorder();
      sendResponse({ success: true });
    } else {
      sendResponse({ success: true });
    }
    return false;
  });

  // ── Check if already recording (retry up to 3 times) ──────

  function checkRecordingStatus(attempt) {
    try {
      chrome.runtime.sendMessage({ type: MessageType.GET_STATUS }, (response) => {
        if (chrome.runtime.lastError) {
          console.log('[UX Pulse] Status check attempt', attempt, 'failed:', chrome.runtime.lastError.message);
          if (attempt < 3) {
            setTimeout(() => checkRecordingStatus(attempt + 1), 1000);
          }
          return;
        }
        console.log('[UX Pulse] Status check response:', response);
        if (response && response.isRecording && !isRecording) {
          startTracking();
        }
      });
    } catch (e) {
      if (attempt < 3) {
        setTimeout(() => checkRecordingStatus(attempt + 1), 1000);
      }
    }
  }

  // Check immediately, and also after DOM is ready
  checkRecordingStatus(1);
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => checkRecordingStatus(1), { once: true });
  }

  console.log('[UX Pulse] Content script loaded on', window.location.href);

})();
