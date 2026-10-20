/* Life Planner — service worker registration + instant self-update.

   v20.1: merging a release is not enough if the phone keeps running the
   previous JavaScript out of its cache. This file now:

   1. registers the worker with updateViaCache:'none' (always ask the server);
   2. looks for a new build on load, when the tab regains focus and every
      15 minutes — cheap, one HEAD-ish request each time;
   3. when a new worker takes control, reloads the page exactly once so the
      fresh HTML/CSS/JS is what the user actually sees.

   Load order: after core.js.
*/
if ('serviceWorker' in navigator) {
  var LP_SW_RELOADED = false;

  function lpReloadOnce(reason) {
    if (LP_SW_RELOADED) return;
    LP_SW_RELOADED = true;
    if (typeof console !== 'undefined') console.info('[Life Planner] updated:', reason);
    location.reload();
  }

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' })
      .then(function (reg) {
        reg.update().catch(function () {});

        // A new worker finished installing and called skipWaiting().
        reg.addEventListener('updatefound', function () {
          var incoming = reg.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', function () {
            if (incoming.state === 'activated' && navigator.serviceWorker.controller) {
              // controllerchange fires next; the listener below does the reload.
            }
          });
        });

        setInterval(function () { reg.update().catch(function () {}); }, 15 * 60 * 1000);
        document.addEventListener('visibilitychange', function () {
          if (document.visibilityState === 'visible') reg.update().catch(function () {});
        });
      })
      .catch(function () {});

    // Only reload when a *previous* worker was already in control, i.e. a real
    // update — never on the very first visit.
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (navigator.serviceWorker.controller) lpReloadOnce('new service worker took control');
    });
  });

  // Exposed so the in-app «به‌روزرسانی» button can do the same thing.
  window.lpForceUpdate = function () {
    var tasks = [];
    if (navigator.serviceWorker.getRegistration) {
      tasks.push(navigator.serviceWorker.getRegistration().then(function (reg) {
        return reg && reg.update();
      }).catch(function () {}));
    }
    return Promise.all(tasks).then(function () {
      setTimeout(function () { location.reload(); }, 350);
    });
  };
}
