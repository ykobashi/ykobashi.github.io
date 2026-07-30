(function () {
  'use strict';
  window.AckSend = {
    attempt(options) {
      let resolved = false;
      options.onPending();
      try {
        options.send();
      } catch (err) {
        resolved = true;
        options.onFailed();
        return { confirm() {}, cancel() {} };
      }
      const timer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        options.onFailed();
      }, options.timeoutMs || 10000);
      return {
        confirm() {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
          options.onConfirmed();
        },
        cancel() {
          if (resolved) return;
          resolved = true;
          clearTimeout(timer);
        },
      };
    },
  };
})();
