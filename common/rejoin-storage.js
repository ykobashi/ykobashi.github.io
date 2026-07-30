(function () {
  'use strict';
  window.RejoinStorage = {
    save(gameKey, session) {
      try { sessionStorage.setItem('rejoin:' + gameKey, JSON.stringify(session)); } catch (err) { /* noop */ }
    },
    load(gameKey) {
      try { return JSON.parse(sessionStorage.getItem('rejoin:' + gameKey)); } catch (err) { return null; }
    },
    clear(gameKey) {
      try { sessionStorage.removeItem('rejoin:' + gameKey); } catch (err) { /* noop */ }
    },
    newToken() {
      return (window.crypto && window.crypto.randomUUID)
        ? window.crypto.randomUUID()
        : Date.now().toString(36) + Math.random().toString(36).slice(2);
    },
  };
})();
