// ai-devkit portal — shared demo controller. Every skill's animated demo is driven as a small step
// machine: this script advances a `data-step` attribute on the demo's `.demo-seq[data-steps="N"]`,
// and the demo's own CSS renders each step (via transitions). This is the ONLY JavaScript demos use —
// every demo.html is pure HTML + CSS (enforced by the build-time validator in site/build.mjs), so all
// behavior lives here, once, and is shared by every demo.
//
// Controls (rendered once in the page chrome, wired by event delegation):
//   .demo-replay  -> restart auto-play from step 0
//   .demo-step    -> stop auto-play and advance one step (wraps around)
//
// Accessibility: users with `prefers-reduced-motion` get the final, meaningful frame immediately and
// no auto-advancing — the demo still communicates its end state, just without motion.
(function () {
  'use strict';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

  function controller(demo) {
    var seq = demo.querySelector('.demo-seq');
    if (!seq) return null;
    var steps = parseInt(seq.getAttribute('data-steps') || '0', 10) || 0;
    var interval = parseInt(seq.getAttribute('data-interval') || '1600', 10);
    var cur = 0, timer = null, manual = false;

    function render() { seq.setAttribute('data-step', String(cur)); }
    function stop() { if (timer) { clearTimeout(timer); timer = null; } }
    function tick() {
      stop();
      var atEnd = cur >= steps;
      timer = setTimeout(function () {     // hold the final frame a little longer, then loop
        cur = atEnd ? 0 : cur + 1;
        render();
        tick();
      }, atEnd ? Math.round(interval * 1.9) : interval);
    }

    return {
      el: demo,
      play: function () { manual = false; stop(); cur = 0; render(); if (!REDUCED) tick(); },
      step: function () { manual = true; stop(); cur = cur >= steps ? 0 : cur + 1; render(); },
      pause: stop,
      resume: function () { if (!manual && !REDUCED) tick(); },
      start: function () { if (REDUCED) { cur = steps; render(); } else { cur = 0; render(); tick(); } }
    };
  }

  function init() {
    var demos = document.querySelectorAll('.demo');
    var ctrls = [];
    for (var i = 0; i < demos.length; i++) {
      var c = controller(demos[i]);
      if (c) { demos[i].__demoCtrl = c; c.start(); ctrls.push(c); }
    }
    if (!ctrls.length) return;

    document.addEventListener('click', function (e) {
      var t = e.target;
      var btn = t && t.closest ? t.closest('.demo-replay, .demo-step') : null;
      if (!btn) return;
      var demo = btn.closest('.demo');
      var c = demo && demo.__demoCtrl;
      if (!c) return;
      if (btn.classList.contains('demo-replay')) c.play(); else c.step();
    });

    // Pause auto-play while a demo is scrolled out of view (CPU / battery friendly).
    if ('IntersectionObserver' in window && !REDUCED) {
      var io = new IntersectionObserver(function (entries) {
        for (var i = 0; i < entries.length; i++) {
          var c = entries[i].target.__demoCtrl;
          if (!c) continue;
          if (entries[i].isIntersecting) c.resume(); else c.pause();
        }
      }, { threshold: 0.12 });
      for (var j = 0; j < ctrls.length; j++) io.observe(ctrls[j].el);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
