// main.ts — DUSTLINE entrypoint for make.fun threejs-fps-02.
// Copies game/ and screenshots/ from this repository to /output (or
// $MAKEFUN_OUTPUT_DIR outside the grader) and writes /output/dossier.json
// with buildDossier from vendor/makefun-threejs.ts. Node 22 stdlib only.
// Deterministic: the same repository writes the same bytes on every run.
import { buildDossier } from './vendor/makefun-threejs.ts';
import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = dirname(fileURLToPath(import.meta.url));
const outDir = resolve(process.env.MAKEFUN_OUTPUT_DIR || '/output');

const CAPS = {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
};

function copyTree(src, dst) {
  mkdirSync(dst, { recursive: true });
  const entries = readdirSync(src).sort();
  for (const name of entries) {
    const s = join(src, name);
    const d = join(dst, name);
    const st = lstatSync(s);
    if (st.isSymbolicLink()) throw new Error(`refusing symlink: ${s}`);
    if (st.isDirectory()) copyTree(s, d);
    else if (st.isFile()) cpSync(s, d);
  }
}

function main() {
  const gameSrc = join(repoRoot, 'game');
  const shotsSrc = join(repoRoot, 'screenshots');
  if (!existsSync(gameSrc)) throw new Error('game/ missing from repository');
  if (!existsSync(shotsSrc)) throw new Error('screenshots/ missing from repository');
  mkdirSync(outDir, { recursive: true });
  // start clean so a stale file can never leak into a second run
  for (const sub of ['game', 'screenshots', 'dossier.json']) {
    const p = join(outDir, sub);
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  }
  copyTree(gameSrc, join(outDir, 'game'));
  copyTree(shotsSrc, join(outDir, 'screenshots'));
  const dossier = buildDossier(outDir, CAPS);
  writeFileSync(join(outDir, 'dossier.json'), dossier);
  const n = readdirSync(join(outDir, 'game')).length;
  console.log(`DUSTLINE: wrote ${outDir} (game entries: ${n}, dossier ${dossier.length} bytes)`);
}

main();
