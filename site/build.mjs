#!/usr/bin/env node
// ai-devkit portal generator. Reads each asset's markdown (frontmatter + body), applies the
// themed templates, and emits a static site to dist/. Content is generated from source,
// so the site can't drift from the assets.
//
//   node site/build.mjs            # internal build (shows all assets, private ones badged)
//   node site/build.mjs --public   # public build: excludes publish:private assets entirely
import { readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = process.argv.includes('--public');

const TYPES = [
  { dir: 'skills', type: 'skill', out: 'skills', label: 'Skills' },
  { dir: 'tools', type: 'tool', out: 'tools', label: 'Tools' },
  { dir: 'tutorials', type: 'tutorial', out: 'tutorials', label: 'Tutorials' },
  { dir: 'cases', type: 'case', out: 'cases', label: 'Cases' },
  { dir: 'best-practices', type: 'best-practice', out: 'best-practices', label: 'Best practices' },
];

// ---------- parsing ----------
function parseFrontmatter(raw) {
  const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta = {};
  for (const line of m[1].split('\n')) {
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!kv) continue;
    let v = kv[2].trim();
    if (v.startsWith('[') || v === '') continue; // skip arrays / empty (not needed by portal)
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    meta[kv[1]] = v;
  }
  return { meta, body: m[2] };
}

// ---------- demo validation (trust boundary) ----------
// A skill may ship a sibling `demo.html`: a small, self-contained animated visualization that is
// injected RAW into its detail page (see detailPage). This is the ONLY first-party HTML that bypasses
// the markdown escaper, so it is trusted on three conditions: it is committed, code-reviewed, AND
// mechanically validated here. Demos are HTML + CSS only — no scripts, no inline event handlers, no
// network, no CSS url()/@import. All behavior (replay/step) lives in the shared site/assets/demo.js.
// NEVER widen this raw path to any value derived from frontmatter or markdown.
const DEMO_FORBIDDEN = [
  [/<script[\s>]/i, '<script>'],
  [/\son[a-z]+\s*=/i, 'inline event handler (on…=)'],
  [/<(iframe|object|embed|form|link|meta|base|img|audio|video|source|use|image)[\s>]/i, 'embedded/external/media element'],
  [/\b(src|srcset|href|data|formaction|xlink:href)\s*=/i, 'resource-loading attribute'],
  [/javascript:/i, 'javascript: URL'],
  [/@import/i, 'CSS @import'],
  [/url\s*\(/i, 'CSS url()'],
  [/https?:\/\//i, 'external http(s) URL'],
];
function validateDemo(html, demoPath) {
  for (const [re, label] of DEMO_FORBIDDEN) {
    if (re.test(html)) {
      throw new Error(
        `Invalid demo ${demoPath}: contains forbidden ${label}. ` +
        `Demos must be self-contained HTML + CSS only — no scripts, inline handlers, network, media, or url()/@import. ` +
        `Put any behavior in site/assets/demo.js.`);
    }
  }
}

function collectAssets() {
  const assets = [];
  for (const t of TYPES) {
    const base = join(ROOT, t.dir);
    if (!existsSync(base)) continue;
    for (const entry of readdirSync(base)) {
      const p = join(base, entry);
      let mdPath = null;
      const isDir = statSync(p).isDirectory();
      if (isDir) {
        const skill = join(p, 'SKILL.md');
        if (existsSync(skill)) mdPath = skill;
        else { const md = readdirSync(p).find((f) => f.endsWith('.md')); if (md) mdPath = join(p, md); }
      } else if (entry.endsWith('.md')) mdPath = p;
      if (!mdPath) continue;
      const { meta, body } = parseFrontmatter(readFileSync(mdPath, 'utf8'));
      if (!meta.name) continue;
      // name is used as slug, link target, and output filename — enforce a safe shape so bad
      // frontmatter can't produce invalid paths or write outside the output directory.
      if (!/^[a-z0-9-]+$/.test(meta.name)) {
        throw new Error(`Invalid asset name "${meta.name}" in ${mdPath}: must be kebab-case (^[a-z0-9-]+$).`);
      }
      const type = meta.type || t.type;
      // Optional animated demo — only for skill directories. Validated before it can ship.
      let demoHtml = null;
      if (isDir && type === 'skill') {
        const demoPath = join(p, 'demo.html');
        if (existsSync(demoPath)) { demoHtml = readFileSync(demoPath, 'utf8'); validateDemo(demoHtml, demoPath); }
      }
      assets.push({
        ...meta,
        type,
        outDir: t.out,
        slug: meta.name,
        body,
        demoHtml,
        isPrivate: (meta.publish || 'private') !== 'public',
      });
    }
  }
  return assets;
}

// ---------- minimal markdown -> html ----------
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
// Attribute context: a raw value also needs its quotes neutralized so it can't break out.
const escAttr = (s) => esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// For a value that is ALREADY html-escaped (e.g. inside inline()), only quotes remain.
const quoteEsc = (s) => s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
// Only these become real links in the portal. Anything else — including relative links to
// support files we don't publish — renders as plain text (kills both XSS vectors and dead links).
const SAFE_LINK = /^(https?:|mailto:|#)/i;
function inline(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\*([^*\n<]+)\*/g, '<em>$1</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text, url) => {
      const u = url.trim();
      return SAFE_LINK.test(u) ? `<a href="${quoteEsc(u)}">${text}</a>` : text;
    });
}
function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', i = 0;
  const flushList = (items, ordered) => `<${ordered ? 'ol' : 'ul'}>${items.map((x) => `<li>${inline(x)}</li>`).join('')}</${ordered ? 'ol' : 'ul'}>`;
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) { // fenced code
      let code = ''; i++;
      while (i < lines.length && !lines[i].startsWith('```')) { code += lines[i] + '\n'; i++; }
      i++; html += `<pre><code>${esc(code.replace(/\n$/, ''))}</code></pre>`; continue;
    }
    if (/^\|.*\|/.test(line) && i + 1 < lines.length && /^\|[\s:|-]+\|/.test(lines[i + 1])) { // gfm table
      const rows = []; while (i < lines.length && /^\|.*\|/.test(lines[i])) { rows.push(lines[i]); i++; }
      const cells = (r) => r.replace(/^\||\|$/g, '').split('|').map((c) => c.trim());
      const head = cells(rows[0]); const bodyRows = rows.slice(2).map(cells);
      html += `<table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) { html += `<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`; i++; continue; }
    if (line.startsWith('> ')) { let q = ''; while (i < lines.length && lines[i].startsWith('> ')) { q += lines[i].slice(2) + ' '; i++; } html += `<blockquote>${inline(q.trim())}</blockquote>`; continue; }
    if (/^[-*]\s+/.test(line)) { const items = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; } html += flushList(items, false); continue; }
    if (/^\d+\.\s+/.test(line)) { const items = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; } html += flushList(items, true); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { html += '<hr>'; i++; continue; }
    if (line.trim() === '') { i++; continue; }
    let para = ''; while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|[-*]\s|\d+\.\s|>\s|\|)/.test(lines[i])) { para += lines[i] + ' '; i++; }
    html += `<p>${inline(para.trim())}</p>`;
  }
  return html;
}

// ---------- adaptation prompt ----------
function adaptationPrompt(a) {
  if (a.portability === 'platform-specific') {
    return `This skill (\"${a.name}\", ${a.platform}) is platform-specific — study it as a reference pattern rather than porting it directly.\nWhat it does: ${a.summary || a.description || ''}\n\n--- ${a.type === 'skill' ? 'SKILL.md' : 'asset'} ---\n${a.body.trim()}`;
  }
  const notes = a.adaptation_notes || 'Keep the structure; replace platform-specific tooling, repo names, and conventions with your own.';
  return [
    `Port an agent skill (Claude Code / Codex SKILL.md format) to my project.`,
    ``,
    `Below is "${a.name}" from ai-devkit (origin platform: ${a.platform || 'unknown'}, portability: ${a.portability || 'adaptable'}).`,
    `What it does: ${a.summary || a.description || ''}`,
    ``,
    `Read it, then produce an equivalent SKILL.md (plus any scripts) for MY project:`,
    `<describe your stack, conventions, and repo here>`,
    ``,
    `Keep the workflow's structure and intent. Replace platform-specific tooling and references per these notes:`,
    notes,
    ``,
    `List what you changed and why.`,
    ``,
    `--- ${a.type === 'skill' ? 'SKILL.md' : 'asset'} ---`,
    a.body.trim(),
  ].join('\n');
}

// ---------- animated terminal sessions ----------
// Trusted template data — authored here, never derived from frontmatter or markdown. 'out'/'txt'/
// 'ok' line text may carry inline HTML (e.g. <span class="t-gold">…</span>); typed 'sh'/'cmd'
// lines are plain text. Rendered by terminalHtml(), animated by assets/terminal.js;
// sessionToText() is the plain-text fallback embedded in "Copy as Markdown".
const SESSIONS = {
  home: {
    title: 'your-repo — claude',
    about: 'the create-issue skill turning one sentence into a GitHub issue',
    lines: [
      ['sh', 'claude'],
      ['cmd', '/create-issue rows snap back when you reorder favorites'],
      ['blank'],
      ['out', 'Searching existing issues… no duplicate found'],
      ['out', 'Inferred type: bug · labels: ios, ux'],
      ['out', 'Drafted repro steps + acceptance criteria'],
      ['blank'],
      ['ok', 'Created issue <span class="t-gold">#482</span> — “Favorites: drag-to-reorder snaps back”'],
    ],
  },
  onboarding: {
    title: 'your-repo — claude',
    about: 'a first session with an AI coding agent',
    lines: [
      ['sh', 'cd your-repo'],
      ['sh', 'claude'],
      ['cmd', 'explain what src/sync/ does'],
      ['out', 'Reading src/sync/ (6 files)…'],
      ['txt', 'It syncs local edits with the backend: SyncQueue batches changes, retries on failure…'],
      ['cmd', 'rename the SyncManager class to SyncCoordinator everywhere'],
      ['out', 'Found 23 references across 9 files'],
      ['ok', 'Renamed — review the diff with <span class="t-gold">git diff</span>'],
    ],
  },
  'create-issue': {
    title: 'your-repo — claude',
    about: 'the create-issue skill turning one sentence into a GitHub issue',
    lines: [
      ['cmd', '/create-issue the favorites list flashes when you filter by date'],
      ['blank'],
      ['out', 'Searching existing issues… no duplicate found'],
      ['out', 'Inferred type: bug · labels: ios, ux'],
      ['out', 'Drafted repro steps + acceptance criteria'],
      ['blank'],
      ['ok', 'Created issue <span class="t-gold">#482</span> — “Favorites: list flashes when filtering by date”'],
    ],
  },
  'issue-to-branch': {
    title: 'your-repo — claude',
    about: 'the issue-to-branch skill turning an issue into a planned branch',
    lines: [
      ['cmd', '/issue-to-branch #482'],
      ['blank'],
      ['out', 'Read issue <span class="t-gold">#482</span> — “Favorites: list flashes when filtering by date”'],
      ['out', 'Inferred scope from the repo: FavoritesView, FilterBar'],
      ['out', 'Created branch <span class="t-gold">fix/482-favorites-filter-flash</span>'],
      ['blank'],
      ['ok', 'Branch plan written — Docs/branches/fix-482-favorites-filter-flash.md'],
    ],
  },
  'smart-commit': {
    title: 'your-repo — claude',
    about: 'the smart-commit skill grouping changes into atomic commits',
    lines: [
      ['cmd', '/smart-commit'],
      ['blank'],
      ['out', '14 changed files — grouping by module…'],
      ['out', 'Plan: <span class="t-gold">3 commits</span> — Fix: filter debounce · Test: favorites filter · Docs: changelog'],
      ['out', 'Plan approved'],
      ['blank'],
      ['ok', '3 atomic commits created — nothing pushed'],
    ],
  },
  'ensure-tests': {
    title: 'your-repo — claude',
    about: 'the ensure-tests skill running and fixing the test suite',
    lines: [
      ['cmd', '/ensure-tests'],
      ['blank'],
      ['out', 'Branch adds filter debouncing — new tests needed: yes'],
      ['out', 'Wrote FavoritesFilterTests (4 cases) · running the suite…'],
      ['out', '128 tests — 1 failure → fixed a stale date mock, re-running…'],
      ['blank'],
      ['ok', 'Suite green (<span class="t-gold">128/128</span>) — Test Plan annotated in the branch plan'],
    ],
  },
  'finish-branch': {
    title: 'your-repo — claude',
    about: 'the finish-branch skill validating a branch and opening the PR',
    lines: [
      ['cmd', '/finish-branch'],
      ['blank'],
      ['out', 'Plan 100% · tests green · no debug code left'],
      ['out', 'Branch plan finalized and archived'],
      ['blank'],
      ['ok', 'Opened PR <span class="t-gold">#91</span> — “Fix: favorites list flash when filtering”'],
    ],
  },
  cleanup: {
    title: 'your-repo — claude',
    about: 'the cleanup skill finding code noise on a branch',
    lines: [
      ['cmd', '/cleanup --branch'],
      ['blank'],
      ['out', 'Scanning the branch diff for code noise…'],
      ['out', 'Found: 2 debug prints · 1 commented-out block · 3 obvious comments'],
      ['blank'],
      ['ok', 'Report ready — re-run with <span class="t-gold">--fix</span> to remove them'],
    ],
  },
  'update-branch-plan': {
    title: 'your-repo — claude',
    about: 'the update-branch-plan skill syncing a plan with recent commits',
    lines: [
      ['cmd', '/update-branch-plan'],
      ['blank'],
      ['out', 'Comparing recent commits against the branch plan…'],
      ['out', '2 tasks matched at ≥80% confidence → checked · 1 stays open'],
      ['blank'],
      ['ok', 'Plan updated — phase <span class="t-gold">2 of 3</span> complete'],
    ],
  },
  deepthink: {
    title: 'your-repo — claude',
    about: 'the deepthink skill producing an implementation strategy',
    lines: [
      ['cmd', '/deepthink how should we cache images app-wide without unbounded memory growth?'],
      ['blank'],
      ['out', 'Decomposing: constraints, current usage, eviction options…'],
      ['out', 'Comparing 3 designs — LRU vs cost-based vs hybrid'],
      ['blank'],
      ['ok', 'Strategy ready — recommendation, trade-offs, and a phased rollout plan'],
    ],
  },
  'create-branch': {
    title: 'your-repo — claude',
    about: 'the create-branch skill turning changes into a named branch',
    lines: [
      ['cmd', '/create-branch add rate limiting to the api client'],
      ['blank'],
      ['out', 'Read working tree — 3 changed files in src/api/'],
      ['out', 'Inferred branch: <span class="t-gold">feat/api-client-rate-limiting</span>'],
      ['out', 'Plan approved'],
      ['blank'],
      ['ok', 'Switched to a new branch — nothing committed yet'],
    ],
  },
  'update-from-branch': {
    title: 'your-repo — claude',
    about: 'the update-from-branch skill syncing a branch from main',
    lines: [
      ['cmd', '/update-from-branch main'],
      ['blank'],
      ['out', 'Dirty tree — auto-stashed 2 files'],
      ['out', 'Fetched origin/main (12 new commits) — rebasing…'],
      ['out', 'Replayed 4 commits · restored your stash'],
      ['blank'],
      ['ok', 'Branch up to date with <span class="t-gold">main</span> — no conflicts'],
    ],
  },
  'pr-partner': {
    title: 'your-repo — claude',
    about: 'the pr-partner skill reviewing a pull request',
    lines: [
      ['cmd', '/pr-partner 482'],
      ['blank'],
      ['out', 'PR #482 — 9 files, +214/−37 · CI green · linked to issue #471'],
      ['out', 'Scanned the diff: 1 risk (unbounded retry), 2 nits'],
      ['out', 'Triaged 3 open review threads — 1 still unresolved'],
      ['blank'],
      ['ok', 'Verdict: <span class="t-gold">Needs work</span> — bound the retry, then ready'],
    ],
  },
  ultrafix: {
    title: 'your-repo — claude',
    about: 'the ultrafix skill isolating a flaky bug across worktrees',
    lines: [
      ['cmd', '/ultrafix tests flake on ci but pass locally'],
      ['blank'],
      ['out', 'Reproduced under load — 3 hypotheses'],
      ['out', 'Spun up 3 worktrees · added structured debug logging'],
      ['out', 'Root cause: a shared clock not reset between tests'],
      ['blank'],
      ['ok', 'Fix verified across 50 runs — worktrees cleaned up'],
    ],
  },
};

function terminalHtml(s) {
  const typedLine = (prefixHtml, text) =>
    `<span class="t-line">${prefixHtml} <span class="t-cmd t-cmd-wrap"><span class="t-ghost">${esc(text)}</span><span class="t-typed" data-text="${escAttr(text)}"></span></span></span>`;
  const rows = s.lines.map((l) => {
    if (l[0] === 'sh') return typedLine('<span class="t-prompt">$</span>', l[1]);
    if (l[0] === 'cmd') return typedLine('<span class="t-dim">&gt;</span>', l[1]);
    if (l[0] === 'blank') return `<span class="t-line" data-delay="140">&nbsp;</span>`;
    if (l[0] === 'ok') return `<span class="t-line" data-delay="560"><span class="t-ok">&#10003;</span> ${l[1]}</span>`;
    if (l[0] === 'txt') return `<span class="t-line" data-delay="480"><span class="t-dim">&nbsp;&nbsp;${l[1]}</span></span>`;
    return `<span class="t-line" data-delay="500"><span class="t-dim">&#9210; ${l[1]}</span></span>`;
  }).join('');
  return `<div class="terminal" data-terminal role="img" aria-label="Example terminal session: ${escAttr(s.about)}">
<div class="t-bar"><span class="t-dot r"></span><span class="t-dot y"></span><span class="t-dot g"></span><span class="t-title">${esc(s.title)}</span><button class="t-replay" type="button" aria-label="Replay the session">&#8635; replay</button></div>
<pre class="t-body" aria-hidden="true">${rows}</pre></div>`;
}

// Plain-text version of a session — embedded in "Copy as Markdown" so the copied page carries the
// same example a sighted visitor sees animated.
function sessionToText(s) {
  const strip = (h) => h.replace(/<[^>]+>/g, '');
  return s.lines.map((l) => {
    if (l[0] === 'sh') return `$ ${l[1]}`;
    if (l[0] === 'cmd') return `> ${l[1]}`;
    if (l[0] === 'blank') return '';
    if (l[0] === 'ok') return `✓ ${strip(l[1])}`;
    if (l[0] === 'txt') return `  ${strip(l[1])}`;
    return `⏺ ${strip(l[1])}`;
  }).join('\n');
}

// ---------- content markers ----------
// Markdown pages (site/content/*.md and asset bodies) can embed two markers, each on its own line:
//   {{TERMINAL:key}}                          -> the animated terminal for SESSIONS[key]
//   {{DETAILS:Title|optional sub}} … {{/DETAILS}} -> a collapsed <details class="fold"> section
// resolveMarkers() rewrites the rendered HTML (mdToHtml turns each marker line into a <p>, already
// escaped, so the match is exact); resolveMarkersMd() rewrites the raw markdown used by the
// "Copy as Markdown" button — terminals become plain fenced sessions, folds become headings.
function resolveMarkers(html) {
  return html
    .replace(/<p>\{\{TERMINAL:([a-z0-9-]+)\}\}<\/p>/g, (_m, k) => (SESSIONS[k] ? terminalHtml(SESSIONS[k]) : ''))
    .replace(/<p>\{\{DETAILS:([^|}]+?)(?:\|([^}]+))?\}\}<\/p>/g, (_m, t, sub) =>
      `<details class="fold"><summary>${t.trim()}${sub ? ` <span class="fold-sub">${sub.trim()}</span>` : ''}</summary><div class="fold-body">`)
    .replace(/<p>\{\{\/DETAILS\}\}<\/p>/g, '</div></details>');
}
function resolveMarkersMd(md) {
  return md
    .replace(/\{\{TERMINAL:([a-z0-9-]+)\}\}/g, (_m, k) => (SESSIONS[k] ? '```\n' + sessionToText(SESSIONS[k]) + '\n```' : ''))
    .replace(/\{\{DETAILS:([^|}]+?)(?:\|[^}]+)?\}\}/g, (_m, t) => `### ${t.trim()}`)
    .replace(/\{\{\/DETAILS\}\}/g, '');
}

// ---------- templates ----------
function layout({ title, active, depth, body }) {
  const base = depth ? '../' : './';
  const nav = [['getting-started', 'Start here'], ['catalog', 'Catalog'], ['contribute', 'Contribute']]
    .map(([h, l]) => `<a class="link${active === h ? ' active' : ''}" href="${base}${h}.html">${l}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ai-devkit</title>
<link rel="stylesheet" href="${base}assets/theme.css">
<link rel="stylesheet" href="${base}assets/demo.css">
<script>(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=p||localStorage.getItem('aidevkit-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}document.documentElement.setAttribute('data-js','1');})();</script>
<script defer src="${base}assets/demo.js"></script>
<script defer src="${base}assets/terminal.js"></script></head>
<body><nav class="nav"><div class="container nav-inner">
<a class="brand" href="${base}index.html">ai<span class="dot">·</span>devkit</a>${nav}<span class="spacer"></span>
<button class="theme-toggle" onclick="(function(){var d=document.documentElement;var t=d.getAttribute('data-theme')==='light'?'dark':'light';d.setAttribute('data-theme',t);try{localStorage.setItem('aidevkit-theme',t)}catch(e){}})()" aria-label="Toggle light/dark theme" title="Toggle light/dark">&#9680;</button>
<a class="link" href="https://github.com/alexandremorgado/ai-devkit" style="font-size:13px">GitHub</a>
</div></nav>${body}
<footer><div class="container">ai-devkit · open AI-coding-agent workflows · generated from source${PUBLIC ? '' : ' · internal build'}</div></footer>
</body></html>`;
}

const badges = (a) => [
  `<span class="badge type">${esc(a.type)}</span>`,
  a.portability ? `<span class="badge ${escAttr(a.portability)}">${esc(a.portability)}</span>` : '',
  a.platform ? `<span class="badge">${esc(a.platform)}</span>` : '',
  a.category ? `<span class="badge">${esc(a.category)}</span>` : '',
  (!PUBLIC && a.isPrivate) ? `<span class="badge private">internal</span>` : '',
].filter(Boolean).join('');

function card(a) {
  const example = a.example ? `<span class="you-type">${esc(a.example)}</span>` : '';
  return `<a class="card" href="./${a.outDir}/${a.slug}.html" data-type="${escAttr(a.type)}" data-portability="${escAttr(a.portability || '')}" data-platform="${escAttr(a.platform || '')}">
<h3>${esc(a.name)}</h3><p>${esc(a.summary || a.description || '')}</p><div class="row">${badges(a)}</div>${example}</a>`;
}

// "How to use it" — generated from frontmatter so every skill/tool page opens with a concrete
// invocation a newcomer can copy, before the full SKILL.md body.
function usageBlock(a) {
  if (a.type !== 'skill' && a.type !== 'tool') return '';
  const invocation = a.example || `/${a.name}${a['argument-hint'] ? ` <${a['argument-hint']}>` : ''}`;
  const auto = a['disable-model-invocation'] === 'true'
    ? 'This skill only runs when you ask for it by name — the agent never starts it on its own.'
    : 'You can also just describe the task in plain words — the agent picks the skill up by itself.';
  const term = SESSIONS[a.slug] ? `<p class="hint" style="margin-top:14px">What a run looks like:</p>${terminalHtml(SESSIONS[a.slug])}` : '';
  return `<div class="usage"><h3>How to use it</h3>
<p>Comes with the <strong>ai-devkit</strong> plugin (<a href="../getting-started.html">install — two commands</a>). Once installed, type this in any repo:</p>
<span class="you-type">${esc(invocation)}</span>
<p class="hint">${auto} That&rsquo;s the Claude Code form — in Codex, type <code>$${esc(a.name)}</code> instead, or just name the skill in plain words.</p>
${term}
<p class="hint">That&rsquo;s all you do — the agent runs the whole workflow itself. Curious, or want to audit it? The playbook it follows is collapsed under <strong>Under the hood</strong> below.</p></div>`;
}

function detailPage(a) {
  const showPrompt = a.type === 'skill' || a.type === 'tool';
  const promptBlock = showPrompt ? `<div class="adapt"><h3>Adapt to your platform</h3>
<p class="hint">${a.portability === 'platform-specific' ? 'Reference pattern — study, don’t port.' : 'Copy this prompt into Claude or Codex, fill in your stack, and it will generate an adapted version for your project.'}</p>
<pre id="prompt">${esc(adaptationPrompt(a))}</pre>
<button class="btn" onclick="copyPrompt()">Copy prompt</button></div>
<script>function copyPrompt(){const t=document.getElementById('prompt').innerText;navigator.clipboard.writeText(t).then(()=>{const b=document.querySelector('.adapt .btn');b.textContent='Copied';b.classList.add('copied');setTimeout(()=>{b.textContent='Copy prompt';b.classList.remove('copied')},1500)})}</script>` : '';
  // Animated demo. a.demoHtml is the ONLY raw-injected value on the page (validated in collectAssets).
  // promptBlock and mdToHtml(a.body) keep their escaping; adaptationPrompt() reads only a.body, so demo
  // markup can never leak into the copy-paste prompt.
  const demoBlock = a.demoHtml ? `<section class="demo" aria-label="Animated demo of ${escAttr(a.name)}">
<div class="demo-head"><h2 class="demo-title">See it in action</h2>
<div class="demo-controls"><button class="demo-replay" type="button">&#8635; Replay</button><button class="demo-step" type="button">Step &rsaquo;</button></div></div>
<div class="demo-stage">${a.demoHtml}</div></section>` : '';
  // Use the body's leading H1 as the page title to avoid a duplicate <h1> (the header already has one).
  let bodyMd = a.body, title = a.name;
  const h1 = bodyMd.match(/^\s*#\s+(.+?)\s*$/m);
  if (h1 && bodyMd.slice(0, h1.index).trim() === '') { title = h1[1]; bodyMd = bodyMd.slice(h1.index + h1[0].length); }
  // Skills/tools open clean: just the head + How-to-use (+ demo). The full SKILL.md body and the
  // adaptation prompt are real content but intimidating to a newcomer — and the body's commands are
  // executed by the AGENT, not the reader — so both collapse into <details>. Other types (tutorials,
  // cases) are meant to be read and stay expanded.
  const isRunnable = a.type === 'skill' || a.type === 'tool';
  const bodyHtml = resolveMarkers(mdToHtml(bodyMd));
  const playbook = isRunnable
    ? `<details class="fold"><summary>Under the hood — the playbook the agent follows <span class="fold-sub">nothing in here is for you to run</span></summary><div class="fold-body"><p class="hint">Everything in this section is read and executed by the <em>agent</em> when you invoke the skill. It&rsquo;s published so you can audit it, learn from it, or adapt it — not because you need to follow it yourself.</p>${bodyHtml}</div></details>`
    : bodyHtml;
  const adapt = isRunnable && promptBlock
    ? `<details class="fold"><summary>Adapt it to another stack <span class="fold-sub">ready-made prompt for Claude / Codex</span></summary><div class="fold-body">${promptBlock}</div></details>`
    : promptBlock;
  const body = `<header class="detail-head"><div class="container">
<a class="muted" href="../catalog.html" style="font-size:13px">&larr; Catalog</a>
<h1>${esc(title)}</h1><p class="muted">${esc(a.summary || a.description || '')}</p>
<div class="meta-row">${badges(a)}</div></div></header>
<div class="container content">${markdownCopyBlock(resolveMarkersMd(a.body))}${usageBlock(a)}${demoBlock}${playbook}${adapt}</div>`;
  return layout({ title, active: 'catalog', depth: 1, body });
}

function homePage(assets) {
  const bySlug = new Map(assets.map((a) => [a.slug, a]));
  const counts = TYPES.map((t) => { const n = assets.filter((a) => a.type === t.type).length; return n ? `${n} ${(n === 1 ? t.label.replace(/s$/, '') : t.label).toLowerCase()}` : null; }).filter(Boolean).join(' · ');

  // The daily loop, in story order. Each node links to its page when the asset is in this build
  // (the public build excludes private assets) and degrades to plain text when it isn't.
  const loop = [
    ['create-issue', 'Describe a bug or idea in one sentence — get a well-formed GitHub issue with labels, repro steps, and duplicate detection.'],
    ['issue-to-branch', 'Turn an issue into a branch (or isolated worktree) with a development plan built from your repo.'],
    ['update-from-branch', 'Pull the latest main into your branch — auto-stashing dirty work and surfacing conflicts safely.'],
    ['smart-commit', 'Group a messy working tree into 2–5 clean, atomic commits. Shows you the plan first; never pushes.'],
    ['ensure-tests', 'Decide what needs tests, run the suite, and fix failures until everything passes.'],
    ['pr-partner', 'Review the PR end to end — metadata, CI, code-risk, and review-comment triage with a merge verdict.'],
    ['finish-branch', 'Check the branch is really done, finalize its plan, and open (or update) the PR.'],
  ];
  const anytime = [
    ['create-branch', 'Start work without an issue — turn your changes or a one-line description into a named branch.'],
    ['cleanup', 'Sweep out debug prints, leftover comments, and commented-out code before they ship.'],
    ['update-branch-plan', 'Keep the branch plan honest — sync its checkboxes with what you actually committed.'],
    ['deepthink', 'Structured extended reasoning for hard problems — decompose, weigh options, produce a strategy.'],
    ['ultrafix', 'Hunt a stubborn bug with isolated worktrees and structured debug logging — evidence before fix.'],
  ];
  const node = ([slug, blurb]) => {
    const a = bySlug.get(slug);
    const inner = `<h3><code>/${esc(slug)}</code></h3><p>${esc(blurb)}</p>`;
    return a ? `<a class="flow-node" href="./skills/${a.slug}.html">${inner}</a>` : `<div class="flow-node">${inner}</div>`;
  };
  const arrow = `<span class="flow-arrow" aria-hidden="true">&rarr;</span>`;

  const terminal = terminalHtml(SESSIONS.home);

  const body = `<header class="hero"><div class="container hero-grid">
<div>
<div class="kicker">open source</div>
<h1>Teach your AI coding agent proven dev workflows.</h1>
<p>ai-devkit is a toolbox you install into an AI coding agent — <strong>Claude Code</strong> or <strong>Codex</strong>. One install teaches the agent a battle-tested daily loop: turn a sentence into a GitHub issue, an issue into a planned branch, messy changes into clean commits, and a finished branch into a PR.</p>
<p class="muted">${counts} · install once, use in every repo</p>
<p style="margin-top:18px"><a class="btn" href="./getting-started.html" style="text-decoration:none">Start here — from zero</a> <a class="link" href="./catalog.html" style="margin-left:14px">Browse the catalog &rarr;</a></p>
</div>
${terminal}
</div></header>

<section class="container"><div class="callout"><p><strong>New to AI coding agents?</strong> An agent is a program that runs in your terminal: you type what you want in plain English, and it reads your code, edits files, and runs commands — showing its work and asking before anything risky. If you can use a terminal, you can use everything here. <a href="./getting-started.html">The Start-here guide assumes zero AI experience &rarr;</a></p></div></section>

<section class="container"><h2>Set up in three steps</h2>
<div class="steps">
<div class="step"><span class="n">1</span><h3>Get an agent</h3><p>Claude Code or Codex — both run in your terminal, and everything here works with both.</p><pre>npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex</pre><p><a href="./getting-started.html">Which one? Details in Start here &rarr;</a></p></div>
<div class="step"><span class="n">2</span><h3>Install ai-devkit</h3><p>Inside a Claude Code session, type:</p><pre>/plugin marketplace add alexandremorgado/ai-devkit
/plugin install ai-devkit@ai-devkit</pre><p>In Codex it&rsquo;s the same two commands, prefixed <code>codex plugin</code> in your shell.</p></div>
<div class="step"><span class="n">3</span><h3>Use it — in any repo</h3><p>The workflows now work everywhere you code. Try one:</p><pre>/create-issue the favorites list flashes when filtering</pre><p>In Codex the same skill is <code>$create-issue</code>. No agent at all? The tools are plain scripts you can <a href="./getting-started.html">clone and run directly</a>.</p></div>
</div></section>

<section class="container"><h2>What you get: the daily loop</h2>
<p class="muted" style="max-width:780px">These workflows chain into one loop — from &ldquo;someone found a bug&rdquo; to &ldquo;PR opened&rdquo;. Each is a <strong>skill</strong>: a written playbook the agent follows step by step, using your repo&rsquo;s own labels, branches, and test commands. Click one for what it does, a copy-paste example, and the full playbook.</p>
<div class="flow">${loop.map(node).join(arrow)}</div>
<h3 style="margin-top:30px">Plus, at any moment</h3>
<div class="flow">${anytime.map(node).join('')}</div></section>

<section class="container"><h2>Not on the stack a skill was written for? Adapt it.</h2>
<p class="muted" style="max-width:780px">A skill is a written playbook, not a compiled binary — so it doesn&rsquo;t have to be ported by hand. Every skill page ends with an <strong>Adapt to your platform</strong> prompt: paste it into your agent, tell it your stack, and the agent rewrites the skill for your project. Each skill is tagged with how well it travels:</p>
<div class="legend">
<div><span class="badge portable">portable</span> works on any stack as-is</div>
<div><span class="badge adaptable">adaptable</span> same workflow — your agent swaps the tooling</div>
<div><span class="badge platform-specific">platform-specific</span> read it for the pattern, don&rsquo;t port it</div>
</div></section>

<section class="container"><h2>Built something other teams could use?</h2>
<p class="muted" style="max-width:780px">A skill is just a markdown file — if your team has a workflow worth sharing, contributing it takes one PR. <a href="./contribute.html">How to contribute &rarr;</a></p></section>`;
  return layout({ title: 'Home', active: '', depth: 0, body });
}

function catalogPage(assets) {
  const cards = assets.map(card).join('');
  const filterRow = (label, key, vals) => `<div class="filters"><span class="label">${label}</span>
<button class="chip active" data-key="${key}" data-val="">all</button>
${vals.map((v) => `<button class="chip" data-key="${key}" data-val="${escAttr(v)}">${esc(v)}</button>`).join('')}</div>`;
  const uniq = (k) => [...new Set(assets.map((a) => a[k]).filter(Boolean))];
  const body = `<header class="hero" style="padding:56px 0 28px"><div class="container"><div class="kicker">Catalog</div><h1 style="font-size:36px">Everything shared, in one place</h1><p class="muted" style="max-width:780px"><strong>Skills</strong> are playbooks your agent follows (run one with <code>/the-name</code> in Claude Code, <code>$the-name</code> in Codex), <strong>tools</strong> are runnable scripts, and <strong>tutorials</strong> are guides. Click anything for what it does, how to use it, and a prompt to adapt it to your stack.</p>
<div class="legend">
<div><span class="badge portable">portable</span> works on any stack as-is</div>
<div><span class="badge adaptable">adaptable</span> same workflow — your agent swaps the tooling</div>
<div><span class="badge platform-specific">platform-specific</span> read it for the pattern</div>
</div></div></header>
<section class="container">
${filterRow('Type', 'type', uniq('type'))}
${filterRow('Portability', 'portability', uniq('portability'))}
${filterRow('Platform', 'platform', uniq('platform'))}
<div class="grid" id="grid">${cards}</div></section>
<script>
const f={type:'',portability:'',platform:''};
document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{const k=c.dataset.key;f[k]=c.dataset.val;document.querySelectorAll('.chip[data-key="'+k+'"]').forEach(x=>x.classList.toggle('active',x===c));apply()});
function apply(){document.querySelectorAll('#grid .card').forEach(card=>{const ok=(!f.type||card.dataset.type===f.type)&&(!f.portability||card.dataset.portability===f.portability)&&(!f.platform||card.dataset.platform===f.platform);card.style.display=ok?'':'none'})}
</script>`;
  return layout({ title: 'Catalog', active: 'catalog', depth: 0, body });
}

// "Copy as Markdown" — embeds the page's raw markdown in a hidden textarea so a developer can copy
// the whole page and paste it straight into Claude Code / Codex. This is the bridge for AI agents:
// an agent that can't fetch a page URL directly can still act on the pasted raw
// markdown. esc() keeps the markup inert; the textarea's .value returns the decoded raw markdown.
function markdownCopyBlock(rawMd) {
  if (!rawMd) return '';
  return `<div class="md-copy"><button class="btn ghost" type="button" onclick="copyMd(this)" title="Copy this page as Markdown to paste into your AI agent">Copy as Markdown</button>
<textarea id="md-src" hidden>${esc(rawMd)}</textarea>
<script>function copyMd(b){navigator.clipboard.writeText(document.getElementById('md-src').value).then(function(){var t=b.textContent;b.textContent='Copied';b.classList.add('copied');setTimeout(function(){b.textContent=t;b.classList.remove('copied')},1500)})}</script></div>`;
}

// The exact set the `ai-devkit` plugin installs into Claude Code and Codex = everything under skills/
// (each is a SKILL.md; the marketplaces serve the byte-identical plugins/ai-devkit mirror, enforced by
// scripts/validate-codex-plugin.mjs). Generated from source so it can't drift.
function installedListMd(allAssets) {
  return allAssets
    .filter((a) => a.outDir === 'skills')
    .sort((a, b) => (a.name < b.name ? -1 : 1))
    .map((a) => {
      const blurb = a.isPrivate
        ? 'internal tool — ships with the plugin (kept off the public catalog)'
        : (a.summary || a.description || '');
      const tryLine = !a.isPrivate && a.example ? ` Try: \`${a.example}\`` : '';
      return `- \`${a.name}\` — ${blurb}${tryLine}`;
    })
    .join('\n');
}

function staticPage(title, active, inner, rawMd) {
  return layout({ title, active, depth: 0, body: `<header class="hero" style="padding:56px 0 28px"><div class="container"><h1 style="font-size:36px">${esc(title)}</h1></div></header><section class="container content">${markdownCopyBlock(rawMd)}${inner}</section>` });
}

// ---------- build ----------
function build() {
  rmSync(DIST, { recursive: true, force: true });
  mkdirSync(join(DIST, 'assets'), { recursive: true });
  cpSync(join(HERE, 'assets'), join(DIST, 'assets'), { recursive: true });

  const allAssets = collectAssets();
  let assets = allAssets;
  if (PUBLIC) {
    // Defense-in-depth: publish:public is necessary but NOT sufficient. An asset reaches the
    // public portal only if it is ALSO on the reviewed allowlist. A stray publish:public alone
    // fails the build (fail-closed) so a one-line metadata mistake can't leak a private asset.
    const allow = loadPublicAllowlist();
    const publicAssets = assets.filter((a) => !a.isPrivate);
    const notListed = publicAssets.filter((a) => !allow.has(`${a.type}/${a.slug}`));
    if (notListed.length) {
      throw new Error(
        `Public build blocked — ${notListed.length} asset(s) are publish:public but NOT on site/public-allowlist.json:\n` +
        notListed.map((a) => `  - ${a.type}/${a.slug}`).join('\n') +
        `\nAfter review, add them to the allowlist, or set publish:private.`);
    }
    assets = publicAssets; // every survivor is both publish:public AND allowlisted
  }
  assets.sort((a, b) => (a.name < b.name ? -1 : 1));

  writeFileSync(join(DIST, 'index.html'), homePage(assets));
  writeFileSync(join(DIST, 'catalog.html'), catalogPage(assets));

  // Resolve {{INSTALLED_SKILLS}} from source so the "what installs" list can't drift. Done on the raw
  // markdown so both the rendered page AND the "Copy as Markdown" output carry the resolved list.
  // Terminal/fold markers (see resolveMarkers) become live components in HTML and plain markdown in
  // the copyable version.
  const gsMd = (readDoc('getting-started') || defaultGettingStarted()).replace('{{INSTALLED_SKILLS}}', installedListMd(allAssets));
  const coMd = readDoc('contribute') || defaultContribute();
  writeFileSync(join(DIST, 'getting-started.html'), staticPage('Start here', 'getting-started', resolveMarkers(mdToHtml(gsMd)), resolveMarkersMd(gsMd)));
  writeFileSync(join(DIST, 'contribute.html'), staticPage('Contribute', 'contribute', resolveMarkers(mdToHtml(coMd)), resolveMarkersMd(coMd)));

  for (const a of assets) {
    mkdirSync(join(DIST, a.outDir), { recursive: true });
    writeFileSync(join(DIST, a.outDir, `${a.slug}.html`), detailPage(a));
  }
  console.log(`Built ${assets.length} asset pages -> dist/ (${PUBLIC ? 'public' : 'internal'} build). Excluded private: ${PUBLIC}`);
}

// The explicit list of assets allowed on the PUBLIC portal, as a Set of "<type>/<slug>".
function loadPublicAllowlist() {
  const p = join(HERE, 'public-allowlist.json');
  if (!existsSync(p)) throw new Error('Public build requires site/public-allowlist.json (the reviewed list of assets allowed on the public portal).');
  const raw = JSON.parse(readFileSync(p, 'utf8'));
  const set = new Set();
  for (const [type, slugs] of Object.entries(raw)) {
    if (type.startsWith('_')) continue; // skip _comment and other metadata keys
    for (const slug of slugs) set.add(`${type}/${slug}`);
  }
  return set;
}

// Returns the RAW markdown body of an optional site/content/<name>.md (or null). Callers render it to
// HTML and also embed the raw markdown for the "Copy as Markdown" button.
function readDoc(name) {
  const p = join(ROOT, 'site', 'content', `${name}.md`);
  return existsSync(p) ? parseFrontmatter(readFileSync(p, 'utf8')).body : null;
}
function defaultGettingStarted() {
  return (`## Install & run

### Claude Code
Add this repo as a plugin marketplace, then \`/plugin install\`. Or install a single skill into \`~/.agents/skills/\`.

### Other agents / non-Claude-Code
Clone and run a tool directly — they are plain scripts, no Claude required:
\`\`\`
npm ci
node skills/<name>/scripts/<tool>.mjs --help
\`\`\`

### Adapt a skill to your platform
Open any skill, copy its **Adapt to your platform** prompt, fill in your stack, and paste it into Claude or Codex.

> Secrets are never committed — tools read tokens from environment variables. URLs are not secrets.`);
}
function defaultContribute() {
  return (`## Share an asset

1. Add a directory under \`skills/\`, \`tools/\`, \`tutorials/\`, \`cases/\`, or \`best-practices/\`.
2. Add the markdown (\`SKILL.md\` for skills) with frontmatter per the content model.
3. Set \`portability\` honestly and write \`adaptation_notes\` so other teams can adapt it.
4. Run \`npm run build\` to preview your page, then open a PR.

**Two rules:** never commit secrets, and \`publish: private\` is the default — an asset reaches the public portal only when it is \`publish: public\` **and** on the reviewed allowlist. Internal performance findings, endpoints, and flag names stay private.`);
}

build();
