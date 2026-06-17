#!/usr/bin/env node
// Regenerates the marketplace plugin wrapper at plugins/ai-devkit/ from the
// canonical repo-root sources: skills/, .codex-plugin/, and
// .claude-plugin/plugin.json. Run after editing any of those —
// scripts/validate-codex-plugin.mjs (wired into `npm test`) fails until the
// wrapper matches.
import { cpSync, mkdirSync, rmSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const WRAPPER = join(ROOT, 'plugins', 'ai-devkit');
const IGNORED = new Set(['.DS_Store']);

const MIRRORED = ['skills', '.codex-plugin', join('.claude-plugin', 'plugin.json')];

for (const rel of MIRRORED) {
  const src = join(ROOT, rel);
  const dest = join(WRAPPER, rel);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true, filter: (path) => !IGNORED.has(basename(path)) });
  console.log(`synced ${rel}`);
}
console.log('Wrapper plugins/ai-devkit regenerated from repo root.');
