/**
 * UX Pulse — Event Type Enumeration
 * Every tracked user action maps to one of these values.
 */
const EventType = Object.freeze({
  // Session lifecycle
  SESSION_START:       'SESSION_START',
  SESSION_COMPLETE:    'SESSION_COMPLETE',
  SESSION_ABANDON:     'SESSION_ABANDON',

  // Mouse / Click
  CLICK:               'CLICK',
  DOUBLE_CLICK:        'DOUBLE_CLICK',
  RIGHT_CLICK:         'RIGHT_CLICK',
  DEAD_CLICK:          'DEAD_CLICK',
  RAGE_CLICK:          'RAGE_CLICK',

  // Scroll
  SCROLL:              'SCROLL',
  SCROLL_REVERSAL:     'SCROLL_REVERSAL',

  // Navigation
  PAGE_LOAD:           'PAGE_LOAD',
  PAGE_NAVIGATE:       'PAGE_NAVIGATE',
  PAGE_BACK:           'PAGE_BACK',
  PAGE_FORWARD:        'PAGE_FORWARD',
  HASH_CHANGE:         'HASH_CHANGE',
  TAB_SWITCH:          'TAB_SWITCH',
  TAB_FOCUS:           'TAB_FOCUS',
  TAB_BLUR:            'TAB_BLUR',

  // Hesitation
  HOVER_DWELL:         'HOVER_DWELL',
  IDLE_PAUSE:          'IDLE_PAUSE',

  // Forms
  FORM_FOCUS:          'FORM_FOCUS',
  FORM_SUBMIT:         'FORM_SUBMIT',
  FORM_ERROR:          'FORM_ERROR',

  // Network
  API_REQUEST_START:   'API_REQUEST_START',
  API_REQUEST_END:     'API_REQUEST_END',
  API_REQUEST_ERROR:   'API_REQUEST_ERROR',

  // Screenshots
  SCREENSHOT:          'SCREENSHOT',

  // Visibility
  PAGE_VISIBLE:        'PAGE_VISIBLE',
  PAGE_HIDDEN:         'PAGE_HIDDEN',

  // Window / Misc
  WINDOW_RESIZE:       'WINDOW_RESIZE',
  COPY:                'COPY',
  PASTE:               'PASTE',

  // Study tasks
  TASK_START:          'TASK_START',
  TASK_COMPLETE:       'TASK_COMPLETE',
  TASK_SKIP:           'TASK_SKIP',
  STUDY_START:         'STUDY_START',
  STUDY_END:           'STUDY_END',
});

/**
 * Message types for chrome.runtime messaging between
 * popup, content script, and service worker.
 */
const MessageType = Object.freeze({
  // Session control (popup → background)
  START_SESSION:       'START_SESSION',
  END_SESSION:         'END_SESSION',
  GET_STATUS:          'GET_STATUS',

  // Event logging (content → background)
  LOG_EVENT:           'LOG_EVENT',
  LOG_BATCH:           'LOG_BATCH',

  // Screenshot (content/background internal)
  CAPTURE_SCREENSHOT:  'CAPTURE_SCREENSHOT',

  // Data export (popup/dashboard → background)
  EXPORT_SESSION:      'EXPORT_SESSION',
  EXPORT_ALL:          'EXPORT_ALL',
  GET_SESSIONS:        'GET_SESSIONS',
  GET_SESSION_EVENTS:  'GET_SESSION_EVENTS',
  GET_EVENT_SUMMARY:   'GET_EVENT_SUMMARY',
  CLEAR_ALL:           'CLEAR_ALL',
  DELETE_SESSION:       'DELETE_SESSION',

  // Recording state (background → content)
  RECORDING_STARTED:   'RECORDING_STARTED',
  RECORDING_STOPPED:   'RECORDING_STOPPED',

  // Keepalive
  PING:                'PING',

  // Study control
  START_STUDY:         'START_STUDY',
  START_TASK:          'START_TASK',
  COMPLETE_TASK:       'COMPLETE_TASK',
  SKIP_TASK:           'SKIP_TASK',
  GET_STUDY_STATE:     'GET_STUDY_STATE',

  // Screen recording
  START_SCREEN_RECORDING:   'START_SCREEN_RECORDING',
  STOP_SCREEN_RECORDING:    'STOP_SCREEN_RECORDING',
  SCREEN_RECORDING_ACTIVE:  'SCREEN_RECORDING_ACTIVE',
  SCREEN_RECORDING_STOPPED: 'SCREEN_RECORDING_STOPPED',
  CLOSE_RECORDER:           'CLOSE_RECORDER',

  // Visual indicators
  SHOW_RED_BORDER:     'SHOW_RED_BORDER',
  HIDE_RED_BORDER:     'HIDE_RED_BORDER',
});

/**
 * Tunable thresholds for detection algorithms.
 */
const Config = Object.freeze({
  // Rage click: N+ clicks within WINDOW_MS in RADIUS_PX
  RAGE_CLICK_COUNT:      3,
  RAGE_CLICK_WINDOW_MS:  2000,
  RAGE_CLICK_RADIUS_PX:  40,

  // Hover dwell: hover on interactive element > this = hesitation
  HOVER_DWELL_MS:        2000,

  // Idle pause: no activity > this = pause event
  IDLE_PAUSE_MS:         3000,
  IDLE_CHECK_INTERVAL:   500,

  // Scroll: reversal detection threshold
  SCROLL_REVERSAL_PX:    150,
  SCROLL_THROTTLE_MS:    200,

  // Event batching: flush buffer every N ms
  EVENT_BATCH_INTERVAL:  2000,

  // Keepalive ping interval
  KEEPALIVE_INTERVAL_MS: 20000,

  // Resize throttle
  RESIZE_THROTTLE_MS:    500,

  // Interactive element selectors
  INTERACTIVE_SELECTORS: 'a, button, input, select, textarea, [role="button"], [role="link"], [role="tab"], [tabindex], label, summary, details, [onclick]',

  // Screenshot quality (0-100)
  SCREENSHOT_QUALITY:    60,
  SCREENSHOT_FORMAT:     'jpeg',
});

/**
 * Hardcoded study tasks for the Crumble usability study.
 */
const StudyTasks = Object.freeze([
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
]);
