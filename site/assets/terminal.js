// ai-devkit portal — animated terminal controller. Terminal mocks are rendered by the build
// (terminalHtml in site/build.mjs) as a sequence of `.t-line` rows; this script plays them like a
// real session: shell/skill commands are "typed" character by character, output lines appear one
// after another. Playback starts when the terminal scrolls into view and can be restarted with the
// ↻ replay button in the title bar.
//
// Layout stability: each typed command also renders an invisible `.t-ghost` with the full text, so
// the terminal occupies its final size from the first paint — typing never reflows the page.
//
// Accessibility: with `prefers-reduced-motion`, the finished session is shown immediately (no
// typing, no reveals). Without JavaScript, the CSS shows the finished session too (the `data-js`
// attribute, set by the inline theme script, is what hides lines for animation).
(function () {
  'use strict';
  var REDUCED = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TYPE_MS = 22;            // per character
  var TYPE_PAUSE_MS = 450;     // after a command is fully typed

  function fillTyped(typed) { typed.textContent = typed.getAttribute('data-text') || ''; }

  function showInstantly(term) {
    var lines = term.querySelectorAll('.t-line');
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.add('shown');
      var typed = lines[i].querySelector('.t-typed');
      if (typed) { typed.classList.remove('typing'); fillTyped(typed); }
    }
  }

  function reset(term) {
    var lines = term.querySelectorAll('.t-line');
    for (var i = 0; i < lines.length; i++) {
      lines[i].classList.remove('shown');
      var typed = lines[i].querySelector('.t-typed');
      if (typed) { typed.classList.remove('typing'); typed.textContent = ''; }
    }
  }

  function playLine(line, done) {
    line.classList.add('shown');
    var typed = line.querySelector('.t-typed');
    if (!typed) { setTimeout(done, parseInt(line.getAttribute('data-delay') || '420', 10)); return; }
    var text = typed.getAttribute('data-text') || '';
    var i = 0;
    typed.classList.add('typing');
    (function tick() {
      typed.textContent = text.slice(0, ++i);
      if (i < text.length) { setTimeout(tick, TYPE_MS); return; }
      typed.classList.remove('typing');
      setTimeout(done, TYPE_PAUSE_MS);
    })();
  }

  function controller(term) {
    var playing = false, run = 0;
    function play() {
      if (REDUCED) { showInstantly(term); return; }
      if (playing) return;
      playing = true;
      var token = ++run;
      var lines = term.querySelectorAll('.t-line');
      var i = 0;
      (function next() {
        if (token !== run) return;                 // a replay reset superseded this run
        if (i >= lines.length) { playing = false; return; }
        playLine(lines[i++], next);
      })();
    }
    function replay() { run++; playing = false; reset(term); play(); }
    var btn = term.querySelector('.t-replay');
    if (btn) btn.addEventListener('click', replay);

    if (REDUCED || !('IntersectionObserver' in window)) { play(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); play(); return; }
      }
    }, { threshold: 0.35 });
    io.observe(term);
  }

  var terms = document.querySelectorAll('[data-terminal]');
  for (var i = 0; i < terms.length; i++) controller(terms[i]);
})();
