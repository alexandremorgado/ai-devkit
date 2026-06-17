#!/usr/bin/env node
// Guards the marketplace plugin wrapper at plugins/ai-devkit/.
//
// Both marketplace manifests (.claude-plugin/marketplace.json for Claude Code,
// .agents/plugins/marketplace.json for Codex) install the plugin from
// ./plugins/ai-devkit — a byte-for-byte mirror of the canonical repo-root
// sources: skills/, .codex-plugin/, and .claude-plugin/plugin.json.
//
// Root is the source of truth. Never edit the wrapper by hand: edit the root
// files, then run `npm run sync:plugin` to regenerate it. This script (wired
// into `npm test`) fails on any drift, on malformed/incomplete manifests, and
// on skills missing their SKILL.md frontmatter.
import { existsSync, lstatSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRAPPER = join(ROOT, 'plugins', 'ai-devkit');
const IGNORED = new Set(['.DS_Store']);
const PLUGIN_NAME = 'ai-devkit';
const PLUGIN_PATH = './plugins/ai-devkit';
const SYNC_HINT = 'root is canonical — run `npm run sync:plugin`';

function fail(message) {
  console.error(message);
  process.exitCode = 1;
}

function readJson(path) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch (err) {
    fail(`${relative(ROOT, path)}: unreadable — ${err.message}`);
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    fail(`${relative(ROOT, path)}: invalid JSON — ${err.message}`);
    return null;
  }
}

function listFiles(base, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(base, prefix))) {
    if (IGNORED.has(entry)) continue;
    const rel = join(prefix, entry);
    const full = join(base, rel);
    const stat = lstatSync(full);
    if (stat.isDirectory()) out.push(...listFiles(base, rel));
    else if (stat.isFile()) out.push(rel);
    else fail(`${relative(ROOT, full)}: unexpected entry type — only plain files ship in the plugin`);
  }
  return out.sort();
}

function compareFiles(leftRoot, rightRoot, label) {
  const leftFiles = listFiles(leftRoot);
  const rightFiles = listFiles(rightRoot);
  const leftSet = new Set(leftFiles);
  const rightSet = new Set(rightFiles);
  for (const file of leftFiles) {
    if (!rightSet.has(file)) fail(`${label}: missing wrapper file ${file} (${SYNC_HINT})`);
  }
  for (const file of rightFiles) {
    if (!leftSet.has(file)) fail(`${label}: extra wrapper file ${file} (${SYNC_HINT})`);
  }
  for (const file of leftFiles.filter((file) => rightSet.has(file))) {
    const left = readFileSync(join(leftRoot, file));
    const right = readFileSync(join(rightRoot, file));
    if (!left.equals(right)) fail(`${label}: wrapper drift in ${file} (${SYNC_HINT})`);
  }
}

function requirePath(path) {
  if (existsSync(path)) return true;
  fail(`Missing required path: ${relative(ROOT, path)}`);
  return false;
}

// A plugin manifest must parse, carry the plugin name and a version, and (for
// Codex manifests) point its `skills` field at a directory that exists
// relative to the plugin root — the layout Codex materializes on install.
function checkPluginManifest(path, { expectSkillsDir = false } = {}) {
  const manifest = readJson(path);
  if (!manifest) return;
  const rel = relative(ROOT, path);
  if (manifest.name !== PLUGIN_NAME) fail(`${rel}: name must be "${PLUGIN_NAME}"`);
  if (!manifest.version) fail(`${rel}: missing version`);
  if (!expectSkillsDir) return;
  if (typeof manifest.skills !== 'string') {
    fail(`${rel}: missing "skills" directory pointer`);
    return;
  }
  const pluginRoot = dirname(dirname(path));
  const skillsDir = join(pluginRoot, manifest.skills);
  if (!existsSync(skillsDir) || !lstatSync(skillsDir).isDirectory()) {
    fail(`${rel}: skills path "${manifest.skills}" does not resolve to a directory`);
  }
}

// Every skill directory must ship a SKILL.md whose frontmatter has at least
// name + description — the fields the marketplace listing depends on.
function checkSkills(skillsRoot) {
  for (const entry of readdirSync(skillsRoot)) {
    if (IGNORED.has(entry)) continue;
    const dir = join(skillsRoot, entry);
    if (!lstatSync(dir).isDirectory()) continue;
    const skillMd = join(dir, 'SKILL.md');
    if (!existsSync(skillMd)) {
      fail(`${relative(ROOT, dir)}: missing SKILL.md`);
      continue;
    }
    const text = readFileSync(skillMd, 'utf8');
    const end = text.startsWith('---\n') ? text.indexOf('\n---', 4) : -1;
    if (end === -1) {
      fail(`${relative(ROOT, skillMd)}: missing frontmatter block`);
      continue;
    }
    const frontmatter = text.slice(4, end).split('\n');
    for (const field of ['name', 'description']) {
      if (!frontmatter.some((line) => line.startsWith(`${field}:`))) {
        fail(`${relative(ROOT, skillMd)}: frontmatter missing ${field}`);
      }
    }
  }
}

// Returns the single ai-devkit entry of a marketplace manifest, or null.
function marketplaceEntry(path, marketplace) {
  if (!marketplace) return null;
  const rel = relative(ROOT, path);
  if (!Array.isArray(marketplace.plugins)) {
    fail(`${rel}: "plugins" must be an array`);
    return null;
  }
  const entries = marketplace.plugins.filter((plugin) => plugin?.name === PLUGIN_NAME);
  if (entries.length === 0) {
    fail(`${rel}: missing ${PLUGIN_NAME} plugin entry`);
    return null;
  }
  if (entries.length > 1) fail(`${rel}: duplicate ${PLUGIN_NAME} plugin entries`);
  return entries[0];
}

const rootCodexManifest = join(ROOT, '.codex-plugin', 'plugin.json');
const wrapperCodexManifest = join(WRAPPER, '.codex-plugin', 'plugin.json');
const rootClaudeManifest = join(ROOT, '.claude-plugin', 'plugin.json');
const wrapperClaudeManifest = join(WRAPPER, '.claude-plugin', 'plugin.json');

const haveRootCodex = requirePath(rootCodexManifest);
const haveWrapperCodex = requirePath(wrapperCodexManifest);
const haveRootClaude = requirePath(rootClaudeManifest);
const haveWrapperClaude = requirePath(wrapperClaudeManifest);
const haveRootSkills = requirePath(join(ROOT, 'skills'));
const haveWrapperSkills = requirePath(join(WRAPPER, 'skills'));

if (haveRootCodex) checkPluginManifest(rootCodexManifest, { expectSkillsDir: true });
if (haveWrapperCodex) checkPluginManifest(wrapperCodexManifest, { expectSkillsDir: true });
if (haveRootClaude) checkPluginManifest(rootClaudeManifest);
if (haveWrapperClaude) checkPluginManifest(wrapperClaudeManifest);

if (haveRootCodex && haveWrapperCodex) {
  compareFiles(join(ROOT, '.codex-plugin'), join(WRAPPER, '.codex-plugin'), '.codex-plugin');
}
if (haveRootClaude && haveWrapperClaude) {
  const left = readFileSync(rootClaudeManifest);
  const right = readFileSync(wrapperClaudeManifest);
  if (!left.equals(right)) fail(`.claude-plugin: wrapper drift in plugin.json (${SYNC_HINT})`);
}
if (haveWrapperClaude) {
  // The wrapper's .claude-plugin must hold plugin.json only — a stray file
  // (e.g. a nested marketplace.json) would ship to every installer.
  const extras = readdirSync(join(WRAPPER, '.claude-plugin'))
    .filter((entry) => !IGNORED.has(entry) && entry !== 'plugin.json');
  for (const extra of extras) {
    fail(`plugins/ai-devkit/.claude-plugin: unexpected file ${extra} (${SYNC_HINT})`);
  }
}
if (haveRootSkills && haveWrapperSkills) {
  compareFiles(join(ROOT, 'skills'), join(WRAPPER, 'skills'), 'skills');
}
if (haveRootSkills) checkSkills(join(ROOT, 'skills'));

const agentsMarketplacePath = join(ROOT, '.agents', 'plugins', 'marketplace.json');
const claudeMarketplacePath = join(ROOT, '.claude-plugin', 'marketplace.json');
const agentsMarketplace = readJson(agentsMarketplacePath);
const claudeMarketplace = readJson(claudeMarketplacePath);

const agentsEntry = marketplaceEntry(agentsMarketplacePath, agentsMarketplace);
if (agentsEntry) {
  if (agentsEntry.source?.source !== 'local') {
    fail(`${relative(ROOT, agentsMarketplacePath)}: ${PLUGIN_NAME} source.source must be "local"`);
  }
  if (agentsEntry.source?.path !== PLUGIN_PATH) {
    fail(`${relative(ROOT, agentsMarketplacePath)}: ${PLUGIN_NAME} source.path must be ${PLUGIN_PATH}`);
  }
}

const claudeEntry = marketplaceEntry(claudeMarketplacePath, claudeMarketplace);
if (claudeEntry && claudeEntry.source !== PLUGIN_PATH) {
  fail(`${relative(ROOT, claudeMarketplacePath)}: ${PLUGIN_NAME} source must be ${PLUGIN_PATH}`);
}

// Both marketplaces must offer the same plugin set — a plugin added to one
// file only would silently vanish for half the installers.
if (Array.isArray(agentsMarketplace?.plugins) && Array.isArray(claudeMarketplace?.plugins)) {
  const agentsNames = agentsMarketplace.plugins.map((plugin) => plugin?.name).sort();
  const claudeNames = claudeMarketplace.plugins.map((plugin) => plugin?.name).sort();
  if (JSON.stringify(agentsNames) !== JSON.stringify(claudeNames)) {
    fail(`marketplaces disagree on the plugin set: .agents has [${agentsNames}], .claude-plugin has [${claudeNames}]`);
  }
}

if (!process.exitCode) {
  console.log('Codex plugin wrapper is in sync.');
}
