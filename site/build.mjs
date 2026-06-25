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
import { createHash } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..');
const DIST = join(ROOT, 'dist');
const PUBLIC = process.argv.includes('--public');
const SITE = 'https://alexandremorgado.github.io/ai-devkit';

// Cache-busting: a short content hash per asset, appended as ?v=… so updated CSS/JS reaches returning
// visitors immediately (no hard refresh) while unchanged assets stay cached. Hashed once at startup.
const ASSET_DIR = join(HERE, 'assets');
const assetVer = (name) => { try { return createHash('sha256').update(readFileSync(join(ASSET_DIR, name))).digest('hex').slice(0, 8); } catch { return ''; } };
const asset = (base, name) => { const v = assetVer(name); return `${base}assets/${name}${v ? `?v=${v}` : ''}`; };

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
  [/<(animate|animatemotion|animatetransform|set)[\s>]/i, 'SVG animation element'],
  [/expression\s*\(/i, 'CSS expression()'],
];
function validateDemo(html, demoPath) {
  // Also test a backslash-stripped copy so CSS-escape obfuscation (e.g. `u\72l(` -> `url(`) can't slip a
  // forbidden token past the literal regexes. This only ADDS detection; plain markup is unaffected.
  const unescaped = html.replace(/\\/g, '');
  for (const [re, label] of DEMO_FORBIDDEN) {
    if (re.test(html) || re.test(unescaped)) {
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
// ---------- section permalinks ----------
// Stable anchor id from heading text (strip markdown/HTML, collapse to hyphens) + a hover "#" link,
// so any section/heading can be deep-linked (e.g. #why-skills). Used by the home page and mdToHtml.
const slugify = (s) => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, ' ')
  .replace(/[`*_]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'section';
const anchorLink = (id) => `<a class="anchor" href="#${id}" aria-label="Permalink to this section">#</a>`;

function mdToHtml(md) {
  const lines = md.split('\n');
  let html = '', i = 0;
  const seen = new Set();
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
      html += `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th>${inline(h)}</th>`).join('')}</tr></thead><tbody>${bodyRows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
      continue;
    }
    const h = line.match(/^(#{1,4})\s+(.*)$/);
    if (h) {
      const lvl = h[1].length;
      if (lvl === 1) { html += `<h1>${inline(h[2])}</h1>`; i++; continue; }
      const base = slugify(h[2]); let id = base, n = 2;
      while (seen.has(id)) id = `${base}-${n++}`;
      seen.add(id);
      html += `<h${lvl} id="${id}">${inline(h[2])}${anchorLink(id)}</h${lvl}>`;
      i++; continue;
    }
    if (line.startsWith('> ')) { let q = ''; while (i < lines.length && lines[i].startsWith('> ')) { q += lines[i].slice(2) + ' '; i++; } html += `<blockquote>${inline(q.trim())}</blockquote>`; continue; }
    if (/^[-*]\s+/.test(line)) { const items = []; while (i < lines.length && /^[-*]\s+/.test(lines[i])) { items.push(lines[i].replace(/^[-*]\s+/, '')); i++; } html += flushList(items, false); continue; }
    if (/^\d+\.\s+/.test(line)) { const items = []; while (i < lines.length && /^\d+\.\s+/.test(lines[i])) { items.push(lines[i].replace(/^\d+\.\s+/, '')); i++; } html += flushList(items, true); continue; }
    if (/^(-{3,}|\*{3,})$/.test(line.trim())) { html += '<hr>'; i++; continue; }
    if (line.trim() === '') { i++; continue; }
    // Consume the current line first so progress is guaranteed — a lone non-table line
    // starting with `|` matches no block branch above and the loop guard below also skips
    // `|` lines, so without this the index would never advance (infinite loop).
    let para = lines[i]; i++; while (i < lines.length && lines[i].trim() !== '' && !/^(#{1,4}\s|```|[-*]\s|\d+\.\s|>\s|\|)/.test(lines[i])) { para += ' ' + lines[i]; i++; }
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
// 'ok' line text may carry inline HTML (e.g. <span class="t-accent">…</span>); typed 'sh'/'cmd'
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
      ['ok', 'Created issue <span class="t-accent">#482</span> — “Favorites: drag-to-reorder snaps back”'],
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
      ['ok', 'Renamed — review the diff with <span class="t-accent">git diff</span>'],
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
      ['ok', 'Created issue <span class="t-accent">#482</span> — “Favorites: list flashes when filtering by date”'],
    ],
  },
  'issue-to-branch': {
    title: 'your-repo — claude',
    about: 'the issue-to-branch skill turning an issue into a planned branch',
    lines: [
      ['cmd', '/issue-to-branch #482'],
      ['blank'],
      ['out', 'Read issue <span class="t-accent">#482</span> — “Favorites: list flashes when filtering by date” (+ 3 comments)'],
      ['out', 'Analyzed the repo for scope: FavoritesView, FilterBar, FavoritesStore'],
      ['out', 'Created branch <span class="t-accent">fix/482-favorites-filter-flash</span> off origin/main'],
      ['out', 'Drafted a development plan — goals, phased steps, test plan'],
      ['out', 'Committed the plan + stored issue metadata for PR auto-linking'],
      ['out', 'Moved <span class="t-accent">#482</span> to “In Progress” on the project board'],
      ['blank'],
      ['ok', 'Branch + plan ready — review it, then start coding'],
    ],
  },
  'smart-commit': {
    title: 'your-repo — claude',
    about: 'the smart-commit skill grouping changes into atomic commits',
    lines: [
      ['cmd', '/smart-commit'],
      ['blank'],
      ['out', '14 changed files — grouping by module…'],
      ['out', 'Plan: <span class="t-accent">3 commits</span> — Fix: filter debounce · Test: favorites filter · Docs: changelog'],
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
      ['out', 'Wrote FavoritesFilterTests (4 cases) · running the full suite…'],
      ['out', '128 tests — 1 unrelated failure · re-ran it on main in a throwaway worktree'],
      ['out', 'Already red on main → a flaky date mock, not your change → fixed it'],
      ['blank'],
      ['ok', 'Suite green (<span class="t-accent">128/128</span>) — Test Plan annotated in the branch plan'],
    ],
  },
  'finish-branch': {
    title: 'your-repo — claude',
    about: 'the finish-branch skill validating a branch and opening the PR',
    lines: [
      ['cmd', '/finish-branch'],
      ['blank'],
      ['out', 'Readiness: plan 100% · tests green · build clean · no debug code left'],
      ['out', 'Finalized the branch plan and archived it'],
      ['out', 'Detected linked issue <span class="t-accent">#482</span> — the PR will close it on merge'],
      ['blank'],
      ['ok', 'Opened PR <span class="t-accent">#91</span> — “Fix: favorites list flash when filtering”'],
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
      ['ok', 'Report ready — re-run with <span class="t-accent">--fix</span> to remove them'],
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
      ['ok', 'Plan updated — phase <span class="t-accent">2 of 3</span> complete'],
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
      ['out', 'Inferred branch: <span class="t-accent">feat/api-client-rate-limiting</span>'],
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
      ['ok', 'Branch up to date with <span class="t-accent">main</span> — no conflicts'],
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
  'codex-buddy': {
    title: 'your-repo — claude',
    about: 'the codex-buddy skill getting an independent review from a second agent (Codex)',
    lines: [
      ['cmd', '/codex-buddy review my changes on this branch'],
      ['blank'],
      ['out', 'Gathered context — branch diff (9 files) + your test and lint conventions'],
      ['out', 'Ran <span class="t-accent">codex exec</span> read-only for an independent review…'],
      ['out', 'Codex returned 3 findings · cross-checking against the repo'],
      ['out', 'Filtered 1 false positive · 2 hold up (1 real bug, 1 nit)'],
      ['blank'],
      ['ok', 'Second opinion in — the retry loop is unbounded; fix, then ship'],
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
  // Surface the session's final result in the image label so screen-reader users get the outcome,
  // not just the setup. okLine strips any inline HTML (e.g. <span class="t-accent">) from the 'ok' line.
  const okLine = (s.lines.find((l) => l[0] === 'ok') || [null, ''])[1].replace(/<[^>]+>/g, '');
  return `<div class="terminal" data-terminal role="img" aria-label="Example terminal session: ${escAttr(s.about)}${okLine ? '. Result: ' + escAttr(okLine) : ''}">
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
function layout({ title, active, depth, body, description, path }) {
  const base = depth ? '../' : './';
  const desc = description || 'Open, battle-tested AI-coding-agent workflows for Claude Code and Codex — install once, use in every repo.';
  const canonical = path != null ? SITE + '/' + path : SITE + '/';
  const ogTitle = `${title} · ai-devkit`;
  const nav = [['getting-started', 'Start here'], ['catalog', 'Catalog'], ['contribute', 'Contribute']]
    .map(([h, l]) => `<a class="link${active === h ? ' active' : ''}" href="${base}${h}.html">${l}</a>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · ai-devkit</title>
<meta name="description" content="${escAttr(desc)}">
<link rel="canonical" href="${escAttr(canonical)}">
<link rel="icon" href="${asset(base, 'favicon.svg')}" type="image/svg+xml">
<meta name="theme-color" content="#121212" media="(prefers-color-scheme: dark)">
<meta name="theme-color" content="#faf8f2" media="(prefers-color-scheme: light)">
<meta property="og:type" content="website">
<meta property="og:site_name" content="ai-devkit">
<meta property="og:title" content="${escAttr(ogTitle)}">
<meta property="og:description" content="${escAttr(desc)}">
<meta property="og:url" content="${escAttr(canonical)}">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${escAttr(ogTitle)}">
<meta name="twitter:description" content="${escAttr(desc)}">
<link rel="stylesheet" href="${asset(base, 'theme.css')}">
<link rel="stylesheet" href="${asset(base, 'demo.css')}">
<link rel="stylesheet" href="${asset(base, 'pick.css')}">
<script>(function(){try{var p=new URLSearchParams(location.search).get('theme');var t=p||localStorage.getItem('aidevkit-theme')||'dark';document.documentElement.setAttribute('data-theme',t);}catch(e){}document.documentElement.setAttribute('data-js','1');document.addEventListener('DOMContentLoaded',function(){var b=document.querySelector('.theme-toggle');if(b)b.setAttribute('aria-pressed',String(document.documentElement.getAttribute('data-theme')==='light'));});})();</script>
<script defer src="${asset(base, 'demo.js')}"></script>
<script defer src="${asset(base, 'terminal.js')}"></script>
<script defer src="${asset(base, 'pick.js')}"></script></head>
<body><a class="skip" href="#main">Skip to content</a><nav class="nav"><div class="container nav-inner">
<a class="brand" href="${base}index.html">ai<span class="dot">·</span>devkit</a>${nav}<span class="spacer"></span>
<button class="theme-toggle" type="button" aria-pressed="false" onclick="(function(el){var d=document.documentElement;var t=d.getAttribute('data-theme')==='light'?'dark':'light';d.setAttribute('data-theme',t);try{localStorage.setItem('aidevkit-theme',t)}catch(e){}el.setAttribute('aria-pressed',String(t==='light'))})(this)" aria-label="Toggle light/dark theme" title="Toggle light/dark"><span aria-hidden="true">&#9680;</span></button>
<a class="link" href="https://github.com/alexandremorgado/ai-devkit" style="font-size:13px">GitHub</a>
</div></nav><main id="main">${body}</main>
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
  return `<div class="usage"><h2>How to use it</h2>
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
<button class="btn" type="button" onclick="copyPrompt()">Copy prompt</button></div>
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
  // Demote any surviving body H1 so the detail header keeps the page's only h1.
  const bodyHtml = linkifySkills(resolveMarkers(mdToHtml(bodyMd)).replace(/<(\/?)h1>/g, '<$1h2>'), '../', a.name);
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
  return layout({ title, active: 'catalog', depth: 1, body, description: a.summary || a.description, path: `${a.outDir}/${a.slug}.html` });
}

// ---------- v0.2.0 portal generators (ported + sanitized from the internal source) ----------
// skill auto-linking, inline Tabler icons, the release pipeline/journey diagrams, and the
// interactive "pick your pain" home hero + skills coverflow. All theme-token based.

let SKILL_SLUGS = new Set();
function linkifySkills(html, base, selfSlug = '') {
  if (!SKILL_SLUGS.size) return html;
  // Single pass: match EITHER a whole anchor span (returned untouched) OR a bare <code> slug. The
  // anchor alternative comes first, so a <code> inside an existing anchor is swallowed as part of
  // that span and never linkified -- no nested anchors, and no sentinels to restore.
  return html.replace(/(<a\b[^>]*>[\s\S]*?<\/a>)|(?<!<pre>)<code>(\/?[a-z0-9-]+)<\/code>/g, (m, anchor, slugRaw) => {
    if (anchor) return anchor;
    const slug = slugRaw.replace(/^\//, '');
    return slug !== selfSlug && SKILL_SLUGS.has(slug)
      ? `<a class="skill-ref" href="${base}skills/${slug}.html">${m}</a>`
      : m;
  });
}

const TABLER_ICONS = {"bug":"<path d=\"M9 9v-1a3 3 0 0 1 6 0v1\" /> <path d=\"M8 9h8a6 6 0 0 1 1 3v3a5 5 0 0 1 -10 0v-3a6 6 0 0 1 1 -3\" /> <path d=\"M3 13l4 0\" /> <path d=\"M17 13l4 0\" /> <path d=\"M12 20l0 -6\" /> <path d=\"M4 19l3.35 -2\" /> <path d=\"M20 19l-3.35 -2\" /> <path d=\"M4 7l3.75 2.4\" /> <path d=\"M20 7l-3.75 2.4\" />","bulb":"<path d=\"M3 12h1m8 -9v1m8 8h1m-15.4 -6.4l.7 .7m12.1 -.7l-.7 .7\" /> <path d=\"M9 16a5 5 0 1 1 6 0a3.5 3.5 0 0 0 -1 3a2 2 0 0 1 -4 0a3.5 3.5 0 0 0 -1 -3\" /> <path d=\"M9.7 17l4.6 0\" />","check":"<path d=\"M5 12l5 5l10 -10\" />","compass":"<path d=\"M8 16l2 -6l6 -2l-2 6l-6 2\" /> <path d=\"M3 12a9 9 0 1 0 18 0a9 9 0 1 0 -18 0\" /> <path d=\"M12 3l0 2\" /> <path d=\"M12 19l0 2\" /> <path d=\"M3 12l2 0\" /> <path d=\"M19 12l2 0\" />","eye":"<path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /> <path d=\"M21 12c-2.4 4 -5.4 6 -9 6c-3.6 0 -6.6 -2 -9 -6c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6\" />","eye-check":"<path d=\"M10 12a2 2 0 1 0 4 0a2 2 0 0 0 -4 0\" /> <path d=\"M11.102 17.957c-3.204 -.307 -5.904 -2.294 -8.102 -5.957c2.4 -4 5.4 -6 9 -6c3.6 0 6.6 2 9 6a19.5 19.5 0 0 1 -.663 1.032\" /> <path d=\"M15 19l2 2l4 -4\" />","flask":"<path d=\"M9 3l6 0\" /> <path d=\"M10 9l4 0\" /> <path d=\"M10 3v6l-4 11a.7 .7 0 0 0 .5 1h11a.7 .7 0 0 0 .5 -1l-4 -11v-6\" />","git-commit":"<path d=\"M9 12a3 3 0 1 0 6 0a3 3 0 1 0 -6 0\" /> <path d=\"M12 3l0 6\" /> <path d=\"M12 15l0 6\" />","git-merge":"<path d=\"M5 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M5 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M15 12a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M7 8l0 8\" /> <path d=\"M7 8a4 4 0 0 0 4 4h4\" />","git-pull-request":"<path d=\"M4 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M4 6a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M16 18a2 2 0 1 0 4 0a2 2 0 1 0 -4 0\" /> <path d=\"M6 8l0 8\" /> <path d=\"M11 6h5a2 2 0 0 1 2 2v8\" /> <path d=\"M14 9l-3 -3l3 -3\" />","language":"<path d=\"M9 6.371c0 4.418 -2.239 6.629 -5 6.629\" /> <path d=\"M4 6.371h7\" /> <path d=\"M5 9c0 2.144 2.252 3.908 6 4\" /> <path d=\"M12 20l4 -9l4 9\" /> <path d=\"M19.1 18h-6.2\" /> <path d=\"M6.694 3l.793 .582\" />","list-search":"<path d=\"M11 15a4 4 0 1 0 8 0a4 4 0 1 0 -8 0\" /> <path d=\"M18.5 18.5l2.5 2.5\" /> <path d=\"M4 6h16\" /> <path d=\"M4 12h4\" /> <path d=\"M4 18h4\" />","lock":"<path d=\"M5 13a2 2 0 0 1 2 -2h10a2 2 0 0 1 2 2v6a2 2 0 0 1 -2 2h-10a2 2 0 0 1 -2 -2v-6\" /> <path d=\"M11 16a1 1 0 1 0 2 0a1 1 0 0 0 -2 0\" /> <path d=\"M8 11v-4a4 4 0 1 1 8 0v4\" />","message-2":"<path d=\"M8 9h8\" /> <path d=\"M8 13h6\" /> <path d=\"M9 18h-3a3 3 0 0 1 -3 -3v-8a3 3 0 0 1 3 -3h12a3 3 0 0 1 3 3v8a3 3 0 0 1 -3 3h-3l-3 3l-3 -3\" />","package":"<path d=\"M12 3l8 4.5l0 9l-8 4.5l-8 -4.5l0 -9l8 -4.5\" /> <path d=\"M12 12l8 -4.5\" /> <path d=\"M12 12l0 9\" /> <path d=\"M12 12l-8 -4.5\" /> <path d=\"M16 5.25l-8 4.5\" />","player-pause":"<path d=\"M6 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12\" /> <path d=\"M14 6a1 1 0 0 1 1 -1h2a1 1 0 0 1 1 1v12a1 1 0 0 1 -1 1h-2a1 1 0 0 1 -1 -1l0 -12\" />","player-play":"<path d=\"M7 4v16l13 -8l-13 -8\" />","replace":"<path d=\"M3 4a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /> <path d=\"M15 16a1 1 0 0 1 1 -1h4a1 1 0 0 1 1 1v4a1 1 0 0 1 -1 1h-4a1 1 0 0 1 -1 -1l0 -4\" /> <path d=\"M21 11v-3a2 2 0 0 0 -2 -2h-6l3 3m0 -6l-3 3\" /> <path d=\"M3 13v3a2 2 0 0 0 2 2h6l-3 -3m0 6l3 -3\" />","rocket":"<path d=\"M4 13a8 8 0 0 1 7 7a6 6 0 0 0 3 -5a9 9 0 0 0 6 -8a3 3 0 0 0 -3 -3a9 9 0 0 0 -8 6a6 6 0 0 0 -5 3\" /> <path d=\"M7 14a6 6 0 0 0 -3 6a6 6 0 0 0 6 -3\" /> <path d=\"M14 9a1 1 0 1 0 2 0a1 1 0 1 0 -2 0\" />","shield-half":"<path d=\"M12 3a12 12 0 0 0 8.5 3a12 12 0 0 1 -8.5 15a12 12 0 0 1 -8.5 -15a12 12 0 0 0 8.5 -3\" /> <path d=\"M12 3v18\" />","terminal-2":"<path d=\"M8 9l3 3l-3 3\" /> <path d=\"M13 15l3 0\" /> <path d=\"M3 6a2 2 0 0 1 2 -2h14a2 2 0 0 1 2 2v12a2 2 0 0 1 -2 2h-14a2 2 0 0 1 -2 -2l0 -12\" />"};
function svgInner(name) {
  return TABLER_ICONS[name]
    ? '<svg class="ti-g" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + TABLER_ICONS[name] + '</svg>'
    : '';
}
function injectIcons(html) {
  return html.replace(/<i class="ti ti-([a-z0-9-]+)"([^>]*)><\/i>/g, function (m, name, rest) {
    return TABLER_ICONS[name] ? '<i class="ti ti-' + name + '"' + rest + '>' + svgInner(name) + '</i>' : m;
  });
}

function pipelineHtml(base) {
  // Clickable skill labels link the diagram to the catalog skill pages (depth-aware base).
  const skill = (slug, x, y, label, anchor = 'start') =>
    `<a href="${base}skills/${slug}.html"><text x="${x}" y="${y}" text-anchor="${anchor}" class="pp-skill">${label}</text></a>`;
  return `<figure class="pipeline">
<svg viewBox="0 0 940 322" xmlns="http://www.w3.org/2000/svg">
<title>Development-to-release git-flow</title>
<desc>Feature, fix and hotfix branches start from develop (issue-to-branch) and merge back after review (finish-branch); a release is cut from develop into a short-lived rc branch (cut-rc), built and approved, then ship-release tags the built commit and merges it into main (production), which syncs back into develop.</desc>
  <defs>
    <linearGradient id="ppSync" x1="0" y1="1" x2="1" y2="0">
      <stop offset="0" stop-color="#86e70b"/><stop offset="1" stop-color="#5b8def"/>
    </linearGradient>
    <filter id="ppGlow" x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="2.4" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <marker id="ppA-dev" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="pp-arrow-dev"/></marker>
    <marker id="ppA-rc" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="6.5" markerHeight="6.5" orient="auto"><path d="M0 0 L10 5 L0 10 z" class="pp-arrow-rc"/></marker>
    <path id="ppJourney" fill="none" d="M150 96 L185 96 C185 50 222 44 255 44 C300 44 326 70 330 96 L372 96 C372 135 366 156 366 190 L548 190 C548 228 562 250 566 280 L640 280 C726 274 690 118 736 96"/>
  </defs>
  <text x="14" y="100" class="pp-lane pp-lane-dev">develop</text>
  <text x="14" y="194" class="pp-lane pp-lane-rc">rc-X.Y.Z</text>
  <text x="14" y="284" class="pp-lane pp-lane-main">main</text>
  <line class="pp-rail pp-rail-dev"  x1="150" y1="96"  x2="810" y2="96"/>
  <line class="pp-rail pp-rail-rc"   x1="360" y1="190" x2="560" y2="190"/>
  <line class="pp-rail pp-rail-main" x1="150" y1="280" x2="810" y2="280"/>
  <path class="pp-link pp-link-feat" pathLength="1" d="M185 96 C185 50 222 44 255 44 C300 44 326 70 330 94" marker-end="url(#ppA-dev)"/>
  <circle class="pp-node pp-node-dev" cx="255" cy="44" r="5"/>
  <text x="255" y="26" text-anchor="middle" class="pp-cap">create-issue · smart-commit · ensure-tests</text>
  ${skill('issue-to-branch', 150, 70, '/issue-to-branch')}
  ${skill('finish-branch', 336, 84, '/finish-branch')}
  <path class="pp-link pp-link-rc" pathLength="1" d="M372 96 C372 135 366 156 366 185" marker-end="url(#ppA-rc)"/>
  ${skill('cut-rc', 384, 150, '/cut-rc')}
  <text x="384" y="180" class="pp-ann">build version · build → store approval</text>
  <path class="pp-link pp-link-main" pathLength="1" d="M548 190 C548 228 562 250 566 272"/>
  ${skill('ship-release', 582, 277, '/ship-release')}
  <text x="582" y="294" class="pp-ann">tag X.Y.Z · "Release vX.Y.Z"</text>
  <path class="pp-link pp-link-sync" pathLength="1" d="M648 280 C726 274 690 118 736 98" marker-end="url(#ppA-dev)"/>
  <text x="652" y="158" class="pp-ann">sync · "RC vX.Y.Z"</text>
  <circle class="pp-node pp-node-dev" cx="170" cy="96" r="5"/>
  <circle class="pp-node pp-node-dev" cx="372" cy="96" r="5"/>
  <circle class="pp-node pp-node-dev" cx="736" cy="96" r="5"/>
  <circle class="pp-node pp-node-rc" cx="366" cy="190" r="5"/>
  <circle class="pp-node pp-node-rc" cx="460" cy="190" r="5"/>
  <circle class="pp-node pp-node-rc" cx="548" cy="190" r="5"/>
  <circle class="pp-node pp-node-main" cx="170" cy="280" r="5"/>
  <circle class="pp-node pp-node-main" cx="760" cy="280" r="5"/>
  <circle class="pp-halo" cx="566" cy="280" r="13"/>
  <circle class="pp-tag" cx="566" cy="280" r="6.5" filter="url(#ppGlow)"/>
  <circle r="5.5" class="pp-comet" filter="url(#ppGlow)">
    <animateMotion dur="11s" repeatCount="indefinite" calcMode="linear"><mpath href="#ppJourney"/></animateMotion>
    <animate attributeName="opacity" dur="11s" repeatCount="indefinite" values="0;1;1;0" keyTimes="0;0.08;0.9;1" calcMode="linear"/>
  </circle>
  <text x="818" y="92" class="pp-role">integration</text>
  <text x="818" y="276" class="pp-role">production</text>
</svg>
</figure>`;
}

// The step-by-step journey — the pipeline as ordered STATES, each reached by a skill (the transition).
// A complementary lens to the git-flow PIPELINE (topology). Pure HTML/CSS (.j-* in theme.css):
// phase-colored connector spine (blue develop -> teal release -> green production), gate diamonds at
// the approval checkpoints, clickable skill chips, one-shot stagger-in. Embedded via {{JOURNEY:dev-release}}.
function journeyHtml(base) {
  const steps = [
    ['develop', 'Issue filed', 'A bug or idea becomes a tracked, labeled issue.', [['create-issue', '/create-issue']]],
    ['develop', 'Branch planned', 'The issue becomes a branch off develop, with a plan.', [['issue-to-branch', '/issue-to-branch']]],
    ['develop', 'Changes committed', 'A messy working tree becomes clean, atomic commits.', [['smart-commit', '/smart-commit']]],
    ['develop', 'Tests green', 'Coverage decided, the suite run, failures fixed.', [['ensure-tests', '/ensure-tests']]],
    ['develop', 'PR opened', 'Readiness checked; the PR opens against develop.', [['finish-branch', '/finish-branch']]],
    ['develop', 'Reviewed', 'Reviewed with Claude Code and Codex native PR review; replies stay evidence-based, never auto-posted.', [], 'gate'],
    ['develop', 'Merged to develop', 'The approved PR merges into the integration branch.', []],
    ['release', 'Release candidate', 'rc-X.Y.Z is cut from develop and the version is set.', [['cut-rc', '/cut-rc']]],
    ['release', 'Built & distributed', 'CI builds the RC and distributes it to testers or a staging channel.', []],
    ['release', 'Release gate', 'A release gate clears the build — store review, package-registry publish, or a deploy sign-off.', [], 'gate'],
    ['release', 'Shipped', 'Tag the built commit, merge rc→main, publish the release.', [['ship-release', '/ship-release']]],
    ['production', 'Live in production', 'main reflects production; develop is synced for the next cycle.', [], 'live'],
  ];
  const PHASE = { develop: 'Develop', release: 'Release', production: 'Production' };
  let last = '';
  const rows = steps.map(([phase, state, note, skills, kind], i) => {
    const tag = phase !== last ? ((last = phase), `<span class="j-phasetag">${PHASE[phase]}</span>`) : '';
    const chips = skills.length
      ? `<div class="j-chips">${skills.map(([slug, label]) => `<a class="j-chip" href="${base}skills/${slug}.html">${esc(label)}</a>`).join('')}</div>`
      : '';
    return `<div class="j-step j-${phase}" style="animation-delay:${(i * 0.06).toFixed(2)}s">
<div class="j-marker"><span class="j-node ${kind || ''}"></span></div>
<div class="j-body">${tag}<div class="j-state">${esc(state)}</div>${chips}<div class="j-note">${esc(note)}</div></div>
</div>`;
  }).join('');
  return `<figure class="journey" aria-label="The development-to-release pipeline as twelve ordered steps, each with the skill that runs it.">${rows}</figure>`;
}

// ---------- "pick your pain" interactive home ----------
// Six everyday dev tasks; pick one and assets/pick.js plays it step by step, then shows the manual
// steps skipped, an estimated time saved, and an animated follow-up flow. Flow nodes that name a
// shipped skill link to its catalog page. Trusted template data — authored here, never user input.
const PICK_SCENARIOS = [
  { id: 'issue', icon: 'ti-bug', label: 'Report a bug, properly', sub: 'one sentence → a tracked issue', title: 'your-repo — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">/create-issue users stay logged in after deleting their account</span>`, why: `You report the problem in one sentence — that's the whole input.` },
      { cls: 'out', html: `Searching existing issues… no duplicate`, why: `It checks for a dup first, so you don't file the same bug twice.` },
      { cls: 'out', html: `Inferred type: bug · labels: <span class="gd">auth, privacy</span>`, why: `Type and labels come from your repo's own taxonomy.` },
      { cls: 'out', html: `Drafted repro steps + acceptance criteria`, why: `It writes the boring scaffolding — repro, acceptance — for you.` },
      { cls: 'ok', html: `&#10003; Draft ready (<span class="gd">#482</span>) — shown first, nothing filed without you`, why: `You approve the draft before anything is created.` },
    ],
    tail: `That's <span class="gd">/create-issue</span> — a sentence becomes a clean, tracked issue.`,
    byHand: ['Search for an existing duplicate', 'Write a clear title + repro steps', 'Pick the right type and labels', 'Add acceptance criteria'],
    saved: '≈ 20 min', savedNote: 'every issue, every time',
    flow: [{ label: '/create-issue', slug: 'create-issue', on: true }, { label: '/issue-to-branch', slug: 'issue-to-branch' }, { label: '/smart-commit', slug: 'smart-commit' }, { label: '/finish-branch', slug: 'finish-branch' }] },
  { id: 'commit', icon: 'ti-git-commit', label: 'A messy pile of changes', sub: '→ clean, atomic commits', title: 'your-repo — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">/smart-commit</span>`, why: `One command on a messy tree — no manual staging dance.` },
      { cls: 'out', html: `14 changed files — grouping by module…`, why: `It reads every change and groups what belongs together.` },
      { cls: 'out', html: `Plan: <span class="gd">3 commits</span> — Fix: debounce · Test: filter · Docs: changelog`, why: `You see the commit plan before anything happens.` },
      { cls: 'out', html: `Plan approved`, why: `Nothing commits until you say yes.` },
      { cls: 'ok', html: `&#10003; 3 atomic commits created — nothing pushed`, why: `Clean, semantic history — and it never pushes.` },
    ],
    tail: `That's <span class="gd">/smart-commit</span> — a messy tree becomes a clean history.`,
    byHand: ['Eyeball 14 changed files', 'Decide what groups with what', 'Stage each hunk separately', 'Write three good messages'],
    saved: '≈ 30–45 min', savedNote: 'clean history, every time',
    flow: [{ label: '/smart-commit', slug: 'smart-commit', on: true }, { label: '/ensure-tests', slug: 'ensure-tests' }, { label: '/finish-branch', slug: 'finish-branch' }] },
  { id: 'migrate', icon: 'ti-replace', label: 'A tedious migration', sub: 'sweeping edits, nothing committed', title: 'your-repo — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">rename the logging helper to a structured logger, everywhere</span>`, why: `One sentence describes a change that's an afternoon by hand.` },
      { cls: 'out', html: `Found <span class="gd">118 call sites</span> across 42 files`, why: `It maps the full blast radius before editing — like a careful senior.` },
      { cls: 'out', html: `Rewrote each, preserving the message + privacy level`, why: `It keeps each call's intent, not just the text.` },
      { cls: 'out', html: `Wrote a summary of every change`, why: `You get a reviewable summary, not a mystery diff.` },
      { cls: 'ok', html: `&#10003; Done — nothing committed; review with git diff`, why: `Nothing is committed or pushed. You review and decide.` },
    ],
    tail: `Plain English, no skill needed — and you always hold the diff.`,
    byHand: ['grep for all 118 call sites', 'Edit every one by hand', 'Keep each message + privacy level right', 'Catch the ones you missed in review'],
    saved: '≈ a full day', savedNote: 'an afternoon → minutes',
    flow: [{ label: 'your edit', on: true }, { label: '/smart-commit', slug: 'smart-commit' }, { label: '/ensure-tests', slug: 'ensure-tests' }, { label: '/finish-branch', slug: 'finish-branch' }] },
  { id: 'tests', icon: 'ti-flask', label: 'A flaky test before release', sub: 'a green suite, with judgment', title: 'your-repo — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">/ensure-tests</span>`, why: `A /command runs a written playbook — the same steps every time.` },
      { cls: 'out', html: `Branch adds debouncing — new tests needed: <span class="gd">yes</span>`, why: `It decides whether your change actually needs coverage.` },
      { cls: 'out', html: `Wrote 4 cases · ran the full suite`, why: `It writes the tests, then runs everything.` },
      { cls: 'out', html: `1 failure — re-ran it on main in a throwaway worktree`, why: `Instead of guessing, it checks main to isolate the cause.` },
      { cls: 'ok', html: `&#10003; Already red on main → a flaky mock, not your change → fixed`, why: `It tells your bug from a pre-existing flake — that's judgment.` },
    ],
    tail: `That's <span class="gd">/ensure-tests</span> — a green suite, and it knows what it's looking at.`,
    byHand: ['Decide what needs coverage', 'Write the test cases', 'Run the suite, read the failures', 'Re-run on main to check blame', 'Track down the flake'],
    saved: '≈ 1–2 h', savedNote: '+ the pre-release stress',
    flow: [{ label: '/ensure-tests', slug: 'ensure-tests', on: true }, { label: '/finish-branch', slug: 'finish-branch' }, { label: 'review' }, { label: '/cut-rc', slug: 'cut-rc' }] },
  { id: 'release', icon: 'ti-rocket', label: 'The release dance', sub: 'cut, build, ship — in order', title: 'app — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">/cut-rc --minor</span>`, why: `One command opens the whole release, from your integration branch.` },
      { cls: 'out', html: `Pre-flight: develop clean · synced · no open release PRs`, why: `It refuses to cut a release from a dirty or stale branch.` },
      { cls: 'out', html: `Version <span class="gd">3.0.4 → 3.1.0</span> — from your commit prefixes`, why: `It suggests the next version from your Feat / Fix history.` },
      { cls: 'out', html: `Cut rc-3.1.0 · bumped version · pushed → CI build`, why: `Branch, bump, and the push that triggers the build — in one shot.` },
      { cls: 'ok', html: `&#10003; Build → store; ship with /ship-release after approval`, why: `After approval, one command tags, merges, and publishes.` },
    ],
    tail: `That's <span class="gd">/cut-rc</span> → <span class="gd">/ship-release</span> — the release dance, automated and safe.`,
    byHand: ['Bump the version file by hand', 'Cut and name the RC branch', 'Write the changelog', 'Tag, merge, back-merge — in order'],
    saved: '≈ 1–2 h', savedNote: 'and no missed step',
    flow: [{ label: '/cut-rc', slug: 'cut-rc', on: true }, { label: 'build · approve' }, { label: '/ship-release', slug: 'ship-release' }, { label: 'live' }] },
  { id: 'think', icon: 'ti-bulb', label: 'A hard design call', sub: 'structured reasoning, trade-offs', title: 'your-repo — claude',
    steps: [
      { cls: 'cmd', html: `<span class="pr">&gt;</span> <span class="c">/deepthink how to cache images app-wide without unbounded memory</span>`, why: `You hand it the hard problem in plain words.` },
      { cls: 'out', html: `Decomposing: constraints · current usage · eviction options`, why: `It breaks the problem down before proposing anything.` },
      { cls: 'out', html: `Comparing 3 designs — <span class="gd">LRU vs cost-based vs hybrid</span>`, why: `It weighs real alternatives, not just the first idea.` },
      { cls: 'ok', html: `&#10003; Strategy: recommendation · trade-offs · phased rollout`, why: `You get a reasoned plan to react to — a sharper starting point.` },
    ],
    tail: `That's <span class="gd">/deepthink</span> — a structured second brain for the hard calls.`,
    byHand: ['Hold the whole problem in your head', 'Weigh the options on a whiteboard', 'Probably miss an edge case or two'],
    saved: '≈ half a day', savedNote: 'a sharper decision',
    flow: [{ label: '/deepthink', slug: 'deepthink', on: true }, { label: '/create-issue', slug: 'create-issue' }, { label: '/issue-to-branch', slug: 'issue-to-branch' }] },
];
const PICK_TRUST = [
  ['ti-eye', 'It shows its work', 'Every step is visible — you watch what it reads and changes.'],
  ['ti-git-commit', 'It never pushes for you', 'Commits and PRs wait for approval. You hold the merge button.'],
  ['ti-lock', 'Your code isn&rsquo;t training data', 'On the Team plan, no training on our code by default.'],
];
// Render the interactive home hero + a JSON island the controller reads. `<` is escaped to < so
// the embedded JSON can never terminate the <script> early (the step HTML contains <span> markup).
function pickHomeHtml(assets) {
  const known = new Set(assets.filter((a) => a.type === 'skill' || a.type === 'tool').map((a) => a.slug));
  // The skill a dev would run for each scenario; null = no single command (send them to Start here).
  const USE_NOW = { issue: 'create-issue', commit: 'smart-commit', migrate: null, tests: 'ensure-tests', release: 'cut-rc', think: 'deepthink' };
  const scenarios = {};
  for (const p of PICK_SCENARIOS) {
    const un = USE_NOW[p.id];
    scenarios[p.id] = {
      title: p.title,
      steps: p.steps.map((s) => ({ cls: s.cls, html: s.html, why: s.why })),
      tail: p.tail, byHand: p.byHand, saved: p.saved, savedNote: p.savedNote,
      flow: p.flow.map((f) => ({ label: f.label, href: (f.slug && known.has(f.slug)) ? `./skills/${f.slug}.html` : null, on: !!f.on })),
      useNow: (un && known.has(un)) ? { href: `./skills/${un}.html`, label: `Use /${un} now` } : { href: './getting-started.html', label: 'Try it in your terminal' },
    };
  }
  const data = JSON.stringify({ scenarios, trust: PICK_TRUST, icons: TABLER_ICONS }).replace(/</g, '\\u003c');
  const cards = PICK_SCENARIOS.map((p) =>
    `<button class="pyp-pick" data-id="${escAttr(p.id)}"><span class="pyp-run">&#9654; run</span><i class="ti ${escAttr(p.icon)}" aria-hidden="true"></i><span class="pyp-pl">${esc(p.label)}</span><span class="pyp-ps">${esc(p.sub)}</span></button>`).join('');
  return `<header class="hero"><div class="container pyp">
<div class="pyp-eyebrow"><span class="b">ai&middot;devkit</span> &mdash; an AI agent for your terminal</div>
<p class="pyp-dek">Install it once and it runs your team&rsquo;s workflows — issues, branches, commits, PRs — in every repo.</p>
<div class="pyp-hook">Which of these would you rather not do by hand?</div>
<p class="pyp-sub" id="pyp-sub">Pick one — it plays out step by step (pause anytime). Then see what it skipped, and where it leads.</p>
<div class="pyp-picks" id="pyp-picks">${cards}</div>
<div class="pyp-stage" id="pyp-stage"></div>
<div class="pyp-foot"><button class="pyp-ghost" id="pyp-trust-btn"><i class="ti ti-shield-half" aria-hidden="true"></i>what about trust?</button><a class="pyp-ghost" href="./getting-started.html"><i class="ti ti-rocket" aria-hidden="true"></i>how do I start?</a></div>
<div id="pyp-reveal"></div>
<script type="application/json" id="pyp-data">${data}</script>
</div></header>`;
}

// A horizontal, clickable carousel of the installed skills — a visual taste of the catalog on the
// home, with a CTA to the full list. pick.js wires the prev/next arrows; native scroll-snap otherwise.
function skillsShowcaseHtml(assets) {
  const all = assets.filter((a) => a.type === 'skill' || a.type === 'tool');
  if (!all.length) return '';
  // Curated showcase: create-issue leads (it lands centered first), and a few skills sit out of the deck.
  const HIDE = new Set(['cleanup', 'ship-release', 'update-branch-plan']);
  const ORDER = ['create-issue', 'issue-to-branch', 'smart-commit', 'ensure-tests', 'finish-branch', 'cut-rc', 'deepthink', 'devkit-init'];
  const rank = (a) => { const i = ORDER.indexOf(a.slug); return i === -1 ? ORDER.length + 1 : i; };
  const deck = all.filter((a) => !HIDE.has(a.slug)).sort((x, y) => rank(x) - rank(y) || (x.slug < y.slug ? -1 : 1));
  const cards = deck.map((a) => {
    const ex = a.example ? `<div class="pyp-deck-ex">${esc(a.example)}</div>` : '';
    return `<a class="pyp-deck-card" href="./skills/${a.slug}.html"><div class="pyp-deck-name"><code>/${esc(a.slug)}</code></div><p class="pyp-deck-sum">${esc(a.summary || a.description || '')}</p>${ex}</a>`;
  }).join('');
  return `<section class="container pyp-skills">
<div class="pyp-skills-head"><p class="pyp-explore-eyebrow">${all.length} skills, one install</p><div class="pyp-skills-nav"><button class="pyp-carobtn" id="pyp-caro-prev" aria-label="Scroll skills left">&lsaquo;</button><button class="pyp-carobtn" id="pyp-caro-next" aria-label="Scroll skills right">&rsaquo;</button></div></div>
<div class="pyp-deck-wrap"><div class="pyp-deck" id="pyp-skills-deck">${cards}</div></div>
<div class="pyp-skills-cta"><a class="pyp-cta-btn" href="./catalog.html">Browse the catalog &rarr;</a></div>
</section>`;
}

function homePage(assets) {
  const body = injectIcons(`${pickHomeHtml(assets)}

<section class="container" id="new-to-agents"><div class="callout"><p><strong>New to AI coding agents?</strong> An agent is a program that runs in your terminal: you type what you want in plain English, and it reads your code, edits files, and runs commands — showing its work and asking before anything risky. If you can use a terminal, you can use everything here. <a href="./getting-started.html">The Start-here guide assumes zero AI experience &rarr;</a></p></div></section>

<section class="container" id="setup"><h2>Set up in three steps${anchorLink('setup')}</h2>
<div class="steps">
<div class="step"><span class="n">1</span><h3>Get an agent</h3><p>Claude Code or Codex — both run in your terminal, and everything here works with both.</p><pre>npm install -g @anthropic-ai/claude-code
npm install -g @openai/codex</pre><p><a href="./getting-started.html">Which one? Details in Start here &rarr;</a></p></div>
<div class="step"><span class="n">2</span><h3>Install ai-devkit</h3><p>Inside a Claude Code session, type:</p><pre>/plugin marketplace add alexandremorgado/ai-devkit
/plugin install ai-devkit@ai-devkit</pre><p>In Codex it&rsquo;s the same two commands, prefixed <code>codex plugin</code> in your shell.</p></div>
<div class="step"><span class="n">3</span><h3>Use it — in any repo</h3><p>The workflows now work everywhere you code. Try one:</p><pre>/create-issue the favorites list flashes when filtering</pre><p>In Codex the same skill is <code>$create-issue</code>. No agent at all? The skills are just markdown — <a href="./getting-started.html">read or paste the playbooks directly</a>.</p></div>
</div></section>

<section class="container" id="pipeline"><h2>From a bug to a shipped release${anchorLink('pipeline')}</h2>
<p class="muted" style="max-width:820px">Every skill is one step in a single arc — from &ldquo;someone filed a bug&rdquo; to &ldquo;it&rsquo;s live in production&rdquo;. Here&rsquo;s the whole flow as git topology, then the same path as ordered steps. Each labeled skill links to its page.</p>
${pipelineHtml('./')}
${journeyHtml('./')}</section>

${skillsShowcaseHtml(assets)}

<section class="container why-skills" id="why-skills"><div class="kicker">why skills</div>
<h2>Repetitive work is exactly what a skill is for${anchorLink('why-skills')}</h2>
<p class="muted" style="max-width:820px">A skill is a written playbook your agent follows step by step. The payoff is biggest on the rituals you repeat all day &mdash; the multi-step dances you do the same way every time, where forgetting step&nbsp;3 quietly costs you twenty minutes. Write the dance down once, and run it with a single command &mdash; in any repo, forever.</p>
<div class="why-grid">
<ul class="why-points">
<li><strong>Consistent every time.</strong> The same steps run the same way &mdash; nothing skipped because it&rsquo;s late and you&rsquo;re tired.</li>
<li><strong>Your conventions, baked in.</strong> Branch names, labels, commit style, test commands &mdash; written once, applied everywhere.</li>
<li><strong>Repetition becomes one command.</strong> The boring multi-step rituals collapse into a single invocation you can trigger anywhere.</li>
<li><strong>Shareable and auditable.</strong> It&rsquo;s just markdown &mdash; hand a teammate your workflow in one PR, and read exactly what the agent will do before it does it.</li>
</ul>
<figure class="repeat-demo">
<div class="repeat-head"><span class="lbl">By hand &middot; every task</span><span class="issue">issue #482</span></div>
<ul class="repeat-steps">
<li class="repeat-step"><span class="si">1</span>Open the issue, re-read the scope</li>
<li class="repeat-step"><span class="si">2</span>Think up a branch name that fits convention</li>
<li class="repeat-step"><span class="si">3</span>Create the branch (worktree if it&rsquo;s risky)</li>
<li class="repeat-step"><span class="si">4</span>Write a plan doc &mdash; goals, steps, test plan</li>
<li class="repeat-step"><span class="si">5</span>Link the plan back to the issue</li>
</ul>
<div class="repeat-arrow">one command replaces all of it</div>
<div class="repeat-cmd"><span class="p">&gt;</span> <span class="c">/issue-to-branch #482</span><span class="ok">&#10003; branch + plan ready, built from the issue</span></div>
</figure>
</div>
<blockquote class="author-note">
<p>For months I started every task the same way: open the issue, re-read the scope, invent a branch name that matched our convention, create the branch, spin up a plan doc, list the steps, link it back. The same ten-minute warm-up before any real work &mdash; <em>every single time</em>.</p>
<p>One afternoon I wrote the whole ritual down as a skill. Now I type <span class="cmd">/issue-to-branch #482</span> and the agent runs the entire warm-up in one shot, the same way every time. That was the moment skills clicked for me: the parts of my day that were pure repetition turned into a single command.</p>
<footer>&mdash; Alexandre, building ai-devkit</footer>
</blockquote></section>

<section class="container" id="adapt"><h2>Not on the stack a skill was written for? Adapt it${anchorLink('adapt')}</h2>
<p class="muted" style="max-width:780px">A skill is a written playbook, not a compiled binary — so it doesn&rsquo;t have to be ported by hand. Every skill page ends with an <strong>Adapt to your platform</strong> prompt: paste it into your agent, tell it your stack, and the agent rewrites the skill for your project. Each skill is tagged with how well it travels:</p>
<div class="legend">
<div><span class="badge portable">portable</span> works on any stack as-is</div>
<div><span class="badge adaptable">adaptable</span> same workflow — your agent swaps the tooling</div>
<div><span class="badge platform-specific">platform-specific</span> read it for the pattern, don&rsquo;t port it</div>
</div></section>

<section class="container" id="contribute"><h2>Built something other teams could use?${anchorLink('contribute')}</h2>
<p class="muted" style="max-width:780px">A skill is just a markdown file — if your team has a workflow worth sharing, contributing it takes one PR. <a href="./contribute.html">How to contribute &rarr;</a></p></section>`);
  return layout({ title: 'Home', active: '', depth: 0, body, description: 'ai-devkit is a toolbox you install into an AI coding agent — Claude Code or Codex. One install teaches the agent a battle-tested daily loop: turn a sentence into a GitHub issue, an issue into a planned branch, messy changes into clean commits, and a finished branch into a PR.', path: '' });
}

function catalogPage(assets) {
  const cards = assets.map(card).join('');
  const filterRow = (label, key, vals) => `<div class="filters"><span class="label">${label}</span>
<button class="chip active" data-key="${key}" data-val="" aria-pressed="true">all</button>
${vals.map((v) => `<button class="chip" data-key="${key}" data-val="${escAttr(v)}" aria-pressed="false">${esc(v)}</button>`).join('')}</div>`;
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
<div class="grid" id="grid">${cards}</div>
<p class="empty" id="grid-empty" hidden>No matches — <button class="btn ghost" type="button" id="grid-reset">clear filters</button></p></section>
<script>
const f={type:'',portability:'',platform:''};
function setChip(k,val){f[k]=val;document.querySelectorAll('.chip[data-key="'+k+'"]').forEach(x=>{const on=x.dataset.val===val;x.classList.toggle('active',on);x.setAttribute('aria-pressed',String(on))})}
document.querySelectorAll('.chip').forEach(c=>c.onclick=()=>{setChip(c.dataset.key,c.dataset.val);apply()});
function apply(){let shown=0;document.querySelectorAll('#grid .card').forEach(card=>{const ok=(!f.type||card.dataset.type===f.type)&&(!f.portability||card.dataset.portability===f.portability)&&(!f.platform||card.dataset.platform===f.platform);card.style.display=ok?'':'none';if(ok)shown++});const e=document.getElementById('grid-empty');if(e)e.hidden=shown>0}
var reset=document.getElementById('grid-reset');if(reset)reset.onclick=()=>{setChip('type','');setChip('portability','');setChip('platform','');apply()};
</script>`;
  return layout({ title: 'Catalog', active: 'catalog', depth: 0, body, description: 'Browse every ai-devkit skill — what it does, a copy-paste example, and a prompt to adapt it to your stack.', path: 'catalog.html' });
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

function staticPage(title, active, inner, rawMd, path, description) {
  // Derive a description from the first ~150 chars of the raw markdown (markers/markup stripped) when
  // the caller doesn't supply one, so each static page still gets a meaningful meta description.
  const derived = (rawMd || '')
    .replace(/\{\{[^}]*\}\}/g, ' ')          // drop {{TERMINAL:…}} / {{DETAILS:…}} markers
    .replace(/[#>*`_\-|]/g, ' ')             // strip common markdown punctuation
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // links -> their text
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 150);
  const desc = description || derived || undefined;
  return layout({ title, active, depth: 0, description: desc, path, body: `<header class="hero" style="padding:56px 0 28px"><div class="container"><h1 style="font-size:36px">${esc(title)}</h1></div></header><section class="container content">${markdownCopyBlock(rawMd)}${linkifySkills(inner, './')}</section>` });
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

  // Skill auto-linking targets: only skills/tools that actually ship in THIS build, so a linkified
  // <code>/slug</code> never points at a page the public build excluded.
  SKILL_SLUGS = new Set(assets.filter((a) => a.type === 'skill' || a.type === 'tool').map((a) => a.slug));

  writeFileSync(join(DIST, 'index.html'), homePage(assets));
  writeFileSync(join(DIST, 'catalog.html'), catalogPage(assets));

  // Resolve {{INSTALLED_SKILLS}} from source so the "what installs" list can't drift. Done on the raw
  // markdown so both the rendered page AND the "Copy as Markdown" output carry the resolved list.
  // Terminal/fold markers (see resolveMarkers) become live components in HTML and plain markdown in
  // the copyable version.
  const gsMd = (readDoc('getting-started') || defaultGettingStarted()).replace('{{INSTALLED_SKILLS}}', installedListMd(allAssets));
  const coMd = readDoc('contribute') || defaultContribute();
  writeFileSync(join(DIST, 'getting-started.html'), staticPage('Start here', 'getting-started', resolveMarkers(mdToHtml(gsMd)), resolveMarkersMd(gsMd), 'getting-started.html'));
  writeFileSync(join(DIST, 'contribute.html'), staticPage('Contribute', 'contribute', resolveMarkers(mdToHtml(coMd)), resolveMarkersMd(coMd), 'contribute.html'));

  for (const a of assets) {
    mkdirSync(join(DIST, a.outDir), { recursive: true });
    writeFileSync(join(DIST, a.outDir, `${a.slug}.html`), detailPage(a));
  }

  // GitHub Pages serves the output as-is (no Jekyll processing). robots + sitemap use ABSOLUTE URLs
  // (the only place absolute URLs belong); on-page links/assets stay relative for the project subpath.
  writeFileSync(join(DIST, '.nojekyll'), '');
  writeFileSync(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);
  const sitemapUrls = [
    `${SITE}/`,
    `${SITE}/catalog.html`,
    `${SITE}/getting-started.html`,
    `${SITE}/contribute.html`,
    ...assets.map((a) => `${SITE}/${a.outDir}/${a.slug}.html`),
  ];
  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    sitemapUrls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n') +
    `\n</urlset>\n`;
  writeFileSync(join(DIST, 'sitemap.xml'), sitemap);

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
Add this repo as a plugin marketplace, then \`/plugin install ai-devkit@ai-devkit\`. Or drop a single skill's \`SKILL.md\` into \`~/.claude/skills/<name>/\`.

### No agent?
A skill is just markdown — clone the repo and read any \`skills/<name>/SKILL.md\` as a step-by-step playbook, or paste it into any LLM.

### Adapt a skill to your platform
Open any skill, copy its **Adapt to your platform** prompt, fill in your stack, and paste it into Claude or Codex.

> Secrets are never committed — tokens are read from environment variables, never files.`);
}
function defaultContribute() {
  return (`## Share an asset

1. Add a directory under \`skills/\`, \`tools/\`, \`tutorials/\`, \`cases/\`, or \`best-practices/\`.
2. Add the markdown (\`SKILL.md\` for skills) with frontmatter per the content model.
3. Set \`portability\` honestly and write \`adaptation_notes\` so other teams can adapt it.
4. Add the asset to \`site/public-allowlist.json\`, run \`npm run build:public\` to preview, then open a PR.

**Two rules:** never commit secrets, and \`publish: private\` is the default — an asset reaches the site only when it is \`publish: public\` **and** on the reviewed allowlist.`);
}

build();
