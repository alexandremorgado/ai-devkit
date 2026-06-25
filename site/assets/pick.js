// ai-devkit portal — "pick your pain" interactive home controller. Reads the scenario data emitted
// by pickHomeHtml() in build.mjs (a JSON <script id="pyp-data">), then drives a self-paced walkthrough:
// pick a task -> the agent works it step by step (auto-advancing, pausable) -> a payoff panel shows the
// manual steps skipped, an estimated time saved, and an animated mini-flow of the follow-up commands.
// Markup/colours live in pick.css. With prefers-reduced-motion, auto-advance is off (manual stepping).

// Copy buttons (install block, command snippets) — page-agnostic IIFE, runs on EVERY page. The pick
// controller below early-returns on pages without a .pyp hero (e.g. Start here), so the copy handler
// must live outside it or those pages' copy buttons go dead.
(function () {
  'use strict';
  var copyBtns = document.querySelectorAll('.gs-copy');
  for (var ci = 0; ci < copyBtns.length; ci++) {
    copyBtns[ci].addEventListener('click', function (e) {
      var b = e.currentTarget, pre = b.previousElementSibling;
      if (!pre || !navigator.clipboard) return;
      navigator.clipboard.writeText(pre.textContent).then(function () {
        var t = b.textContent; b.textContent = 'copied';
        setTimeout(function () { b.textContent = t; }, 1400);
      });
    });
  }
})();

(function () {
  'use strict';
  var root = document.querySelector('.pyp');
  if (!root) return;
  var dataEl = document.getElementById('pyp-data');
  if (!dataEl) return;
  var DATA;
  try { DATA = JSON.parse(dataEl.textContent); } catch (e) { return; }
  var SC = DATA.scenarios || {};
  function tic(name){ var p=(DATA.icons||{})[name]; return p ? '<i class="ti"><svg class="ti-g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+p+'</svg></i>' : ''; }
  var REDUCE = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var DELAY = 2600;
  var cur = null, k = 0, playing = false, timer = null;

  function el(id) { return root.querySelector(id); }
  function flowHtml(flow) {
    var n = flow.length;
    return flow.map(function (nd, i) {
      var cls = 'pyp-node' + (nd.on ? ' on' : '');
      var delay = 'transition-delay:' + (i * 0.16).toFixed(2) + 's';
      var node = nd.href
        ? '<a class="' + cls + '" href="' + nd.href + '" style="' + delay + '">' + nd.label + '</a>'
        : '<span class="' + cls + '" style="' + delay + '">' + nd.label + '</span>';
      var arrow = i < n - 1 ? '<span class="pyp-arrow" style="transition-delay:' + (i * 0.16 + 0.08).toFixed(2) + 's">&rarr;</span>' : '';
      return node + arrow;
    }).join('');
  }
  function progEl() { return el('#pyp-progfill'); }
  function resetProg() { var p = progEl(); if (p) { p.style.transition = 'none'; p.style.width = '0'; } }
  function startProg() {
    var p = progEl(); if (!p) return;
    p.style.transition = 'none'; p.style.width = '0';
    requestAnimationFrame(function () { requestAnimationFrame(function () {
      p.style.transition = 'width ' + DELAY + 'ms linear'; p.style.width = '100%';
    }); });
  }
  function tgl() {
    var b = el('#pyp-pp'); if (!b) return;
    b.innerHTML = playing
      ? tic('player-pause') + 'pause'
      : tic('player-play') + 'play';
  }
  function schedule() {
    clearTimeout(timer);
    var n = SC[cur].steps.length;
    resetProg();
    if (playing && k < n - 1 && !REDUCE) {
      startProg();
      timer = setTimeout(function () { show(k + 1, true); schedule(); }, DELAY);
    }
  }
  function open(id) {
    cur = id; k = 0; playing = !REDUCE; clearTimeout(timer);
    var sub = el('#pyp-sub'); if (sub) sub.style.display = 'none';
    var picks = root.querySelectorAll('.pyp-pick');
    for (var i = 0; i < picks.length; i++) picks[i].classList.toggle('on', picks[i].getAttribute('data-id') === id);
    var sc = SC[id];
    var bh = sc.byHand.map(function (s) { return '<li>' + tic('check') + '<span>' + s + '</span></li>'; }).join('');
    el('#pyp-stage').innerHTML =
      '<div class="pyp-term"><div class="pyp-tbar"><span class="pyp-dot" style="background:#dc5024"></span><span class="pyp-dot" style="background:#febc2e"></span><span class="pyp-dot" style="background:#86e70b"></span><span class="pyp-tt">' + sc.title + '</span></div><div class="pyp-tbody" id="pyp-tb"></div></div>'
      + '<div class="pyp-why" id="pyp-why"></div><div class="pyp-prog"><div class="pyp-progfill" id="pyp-progfill"></div></div>'
      + '<div class="pyp-ctrls"><button class="pyp-nb" id="pyp-prev" aria-label="Previous step">&#9664;</button><span class="pyp-cnt" id="pyp-cnt"></span><button class="pyp-nb g" id="pyp-next">Next &rarr;</button><button class="pyp-pp" id="pyp-pp"></button></div>'
      + '<div class="pyp-after" id="pyp-after"><p class="pyp-tail">' + sc.tail + '</p>'
      + '<div class="pyp-payoff"><div class="pyp-byhand"><div class="pyp-ph">By hand, you&rsquo;d have:</div><ul>' + bh + '</ul></div>'
      + '<div class="pyp-saved"><div class="pyp-sv">' + sc.saved + '</div><div class="pyp-svn">saved <span class="pyp-est">&middot; est.</span><br>' + sc.savedNote + '</div></div></div>'
      + '<div class="pyp-floww"><div class="pyp-ph">Where it leads</div><div class="pyp-flow" id="pyp-mflow">' + flowHtml(sc.flow) + '</div></div>'
      + '<div class="pyp-acts"><a class="pyp-ab g" href="' + sc.useNow.href + '">' + sc.useNow.label + ' &rarr;</a><button class="pyp-ab" id="pyp-next2">see another &rarr;</button><button class="pyp-ab" id="pyp-again">&#8635; replay</button></div></div>';
    el('#pyp-prev').onclick = function () { if (k > 0) { playing = false; clearTimeout(timer); tgl(); show(k - 1, false); } };
    el('#pyp-next').onclick = function () { clearTimeout(timer); if (k < sc.steps.length - 1) show(k + 1, true); schedule(); };
    el('#pyp-pp').onclick = function () { playing = !playing; tgl(); if (playing) { if (k < sc.steps.length - 1) show(k + 1, true); schedule(); } else { clearTimeout(timer); resetProg(); } };
    el('#pyp-again').onclick = function () { playing = !REDUCE; tgl(); show(0, true); schedule(); };
    el('#pyp-next2').onclick = function () { reset(); };
    tgl(); show(0, true); schedule();
  }
  function show(idx, animLast) {
    k = idx; var sc = SC[cur], n = sc.steps.length;
    var tb = el('#pyp-tb'); tb.innerHTML = '';
    for (var i = 0; i <= idx; i++) {
      var st = sc.steps[i];
      var div = document.createElement('div');
      div.className = 'pyp-ln ' + (st.cls === 'ok' ? 'ok' : st.cls === 'out' ? 'out' : '') + ((i === idx && animLast && !REDUCE) ? '' : ' show');
      div.innerHTML = st.html;
      tb.appendChild(div);
      if (i === idx && animLast && !REDUCE) { (function (d) { requestAnimationFrame(function () { d.classList.add('show'); }); })(div); }
    }
    el('#pyp-why').innerHTML = '<span class="wl">why</span>' + sc.steps[idx].why;
    el('#pyp-cnt').textContent = (idx + 1) + ' / ' + n;
    el('#pyp-prev').disabled = idx === 0;
    el('#pyp-next').disabled = idx === n - 1;
    var after = el('#pyp-after'), mflow = el('#pyp-mflow');
    if (idx === n - 1) { playing = false; tgl(); resetProg(); after.classList.add('show'); setTimeout(function () { mflow.classList.add('go'); }, REDUCE ? 0 : 240); }
    else { after.classList.remove('show'); mflow.classList.remove('go'); }
  }
  function reset() {
    cur = null; playing = false; clearTimeout(timer);
    var picks = root.querySelectorAll('.pyp-pick');
    for (var i = 0; i < picks.length; i++) picks[i].classList.remove('on');
    el('#pyp-stage').innerHTML = '';
    var sub = el('#pyp-sub'); if (sub) sub.style.display = '';
  }
  var picks = root.querySelectorAll('.pyp-pick');
  for (var i = 0; i < picks.length; i++) picks[i].onclick = (function (p) { return function () { open(p.getAttribute('data-id')); }; })(picks[i]);

  var rev = el('#pyp-reveal'), shown = '';
  function card(t) { return '<div class="pyp-tcard"><div class="th">' + tic(t[0].replace(/^ti-/, '')) + t[1] + '</div><p>' + t[2] + '</p></div>'; }
  function tg(kind, list) {
    if (shown === kind) { rev.innerHTML = ''; shown = ''; return; }
    shown = kind;
    rev.innerHTML = '<div class="pyp-rev">' + list.map(card).join('') + '</div>';
  }
  var tb = el('#pyp-trust-btn'); if (tb) tb.onclick = function () { tg('trust', DATA.trust || []); };

  // Skills deck — a 3D coverflow (sibling section, so query the document). An active index drives each
  // card's transform by its offset; arrows step it, clicking a side card centers it, and clicking the
  // centered card follows its link.
  var deck = document.getElementById('pyp-skills-deck');
  if (deck) {
    var cards = [].slice.call(deck.querySelectorAll('.pyp-deck-card'));
    var active = 0;
    var place = function () {
      var n = cards.length;
      for (var i = 0; i < n; i++) {
        var o = i - active;
        if (o > n / 2) o -= n; else if (o < -n / 2) o += n;
        var ao = Math.abs(o);
        var x = o * 190, rot = Math.max(-44, Math.min(44, -o * 27)), sc = Math.max(0.70, 1 - ao * 0.12), z = -ao * 80;
        var c = cards[i];
        c.style.transform = 'translateX(' + x + 'px) translateZ(' + z + 'px) rotateY(' + rot + 'deg) scale(' + sc.toFixed(3) + ')';
        c.style.opacity = ao > 3 ? '0' : '1';
        c.style.pointerEvents = ao > 3 ? 'none' : 'auto';
        c.style.zIndex = String(50 - ao);
        c.classList.toggle('active', o === 0);
      }
    };
    cards.forEach(function (c, i) {
      c.addEventListener('click', function (e) { if (i !== active) { e.preventDefault(); active = i; place(); } });
    });
    var cp = document.getElementById('pyp-caro-prev'); if (cp) cp.onclick = function () { active = (active - 1 + cards.length) % cards.length; place(); };
    var cn = document.getElementById('pyp-caro-next'); if (cn) cn.onclick = function () { active = (active + 1) % cards.length; place(); };
    place();
  }
})();
