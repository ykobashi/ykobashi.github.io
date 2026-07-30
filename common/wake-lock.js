(function () {
  'use strict';
  window.WakeLockHelper = (function () {
    let sentinel = null;
    let enabled = false;
    let acquiring = false;
    let generation = 0;
    async function acquire() {
      if (!enabled || sentinel || acquiring || !('wakeLock' in navigator)) return;
      acquiring = true;
      const requestedGeneration = generation;
      try {
        const acquired = await navigator.wakeLock.request('screen');
        if (enabled && requestedGeneration === generation) {
          sentinel = acquired;
          acquired.addEventListener('release', () => {
            if (sentinel === acquired) sentinel = null;
          });
          return;
        }
        // request中にdisableされた場合は、取得できたロックを即座に解放する。
        if (!enabled || requestedGeneration !== generation) {
          acquired.release().catch(() => {});
          return;
        }
        sentinel = acquired;
        acquired.addEventListener('release', () => {
          if (sentinel === acquired) sentinel = null;
        });
      } catch (err) {
        sentinel = null;
      } finally {
        acquiring = false;
      }
    }
    function onVisibilityChange() {
      if (sentinel === null && document.visibilityState === 'visible' && enabled) acquire();
    }
    return {
      enable() {
        if (enabled) return;
        enabled = true;
        acquire();
        document.addEventListener('visibilitychange', onVisibilityChange);
      },
      disable() {
        enabled = false;
        generation += 1;
        document.removeEventListener('visibilitychange', onVisibilityChange);
        if (sentinel) {
          sentinel.release().catch(() => {});
          sentinel = null;
        }
      },
    };
  })();
})();
