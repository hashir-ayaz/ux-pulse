(function() {
  const MARKER = '__ux_pulse_net__';

  // ── Fetch interception ──
  const originalFetch = window.fetch;
  window.fetch = function(...args) {
    const url = typeof args[0] === 'string' ? args[0] : (args[0]?.url || '');
    const init = args[1] || {};
    const method = (init.method || 'GET').toUpperCase();
    const startTime = Date.now();
    const reqId = Math.random().toString(36).substring(2, 10);

    window.postMessage({ type: MARKER, action: 'req_start', reqId, method, url: url.substring(0, 500), startTime }, '*');

    return originalFetch.apply(this, args).then(response => {
      window.postMessage({
        type: MARKER, action: 'req_end', reqId, method,
        url: url.substring(0, 500), statusCode: response.status,
        durationMs: Date.now() - startTime,
      }, '*');
      return response;
    }).catch(err => {
      window.postMessage({
        type: MARKER, action: 'req_error', reqId, method,
        url: url.substring(0, 500), error: err.message,
        durationMs: Date.now() - startTime,
      }, '*');
      throw err;
    });
  };

  // ── XHR interception ──
  const XHROpen = XMLHttpRequest.prototype.open;
  const XHRSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function(method, url, ...rest) {
    this._uxp = { method: method.toUpperCase(), url: (url || '').substring(0, 500), startTime: 0, reqId: Math.random().toString(36).substring(2, 10) };
    return XHROpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function(...args) {
    if (this._uxp) {
      this._uxp.startTime = Date.now();
      window.postMessage({ type: MARKER, action: 'req_start', ...this._uxp }, '*');

      this.addEventListener('load', () => {
        window.postMessage({
          type: MARKER, action: 'req_end',
          reqId: this._uxp.reqId, method: this._uxp.method,
          url: this._uxp.url, statusCode: this.status,
          durationMs: Date.now() - this._uxp.startTime,
        }, '*');
      });

      this.addEventListener('error', () => {
        window.postMessage({
          type: MARKER, action: 'req_error',
          reqId: this._uxp.reqId, method: this._uxp.method,
          url: this._uxp.url, error: 'Network error',
          durationMs: Date.now() - this._uxp.startTime,
        }, '*');
      });
    }
    return XHRSend.apply(this, args);
  };
})();
