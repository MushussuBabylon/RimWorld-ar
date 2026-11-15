// Builds the one and only output of this repo: dist/ArabicSupport  (zipped as dist/ArabicSupport.zip by the workflow).
//
//   dist/ArabicSupport/Mods/ArabicSupport/               the ArabicSupport mod (Mods/ArabicSupport of the repo)
//     About/About.xml                                    reshaped + bidi-js (the Arabic text of the mod's name / description)
//     Languages/Arabic/                                  the repo's Data/ folder (Core + every DLC) merged into ONE language
//                                                        folder, reshaped + bidi-js. RimWorld only loads translations from a
//                                                        mod's Languages/ folder, so it can not stay in a Data/ folder.
//   dist/ArabicSupport/Mods/<other mod>/                 every other mod of Mods/ (for example Arabic AutoTranslation):
//     About/About.xml                                    reshaped + bidi-js
//     Languages/<Arabic folder>/                         reshaped + bidi-js (any depth: 1.6/Languages, Common/Languages, ...)
//                                                        everything else in the mod is copied untouched
//
// Two different kinds of translation files, never mixed up:
//   1. <repo>/Data/            Core + DLC translations (source of truth). Lives in the repo root, NOT in any mod.
//   2. <mod>/Languages/Arabic  translations of one mod of Mods/ (found by scanning the mod).
//
// The only transformations are Arabic reshaping and bidi-js (see process.ts). Files without Arabic letters are not touched.

import * as fs from 'fs';
import * as path from 'path';
import { processXml, processText, hasRtl } from './process';

const NAME = 'ArabicSupport';

const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'Data');   // Core + DLC translations (repo root)
const MODS_DIR = path.join(ROOT, 'Mods');   // ArabicSupport (packaging target) + the other mods
const OUT_DIR = path.join(ROOT, 'dist', NAME);        // zip root
const OUT_MODS_DIR = path.join(OUT_DIR, 'Mods');      // extract into the RimWorld folder: merges with RimWorld/Mods

const failures: string[] = [];

// ---------------------------------------------------------------------------
// File helpers
// ---------------------------------------------------------------------------

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function copyDir(src: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function subDirs(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name);
}

const rel = (p: string) => path.relative(ROOT, p).replace(/\\/g, '/');

// ---------------------------------------------------------------------------
// Reshaping + bidi-js for one translation file (.xml / .txt)
// ---------------------------------------------------------------------------

/** Returns the processed content of a file, or null when it needs nothing (not .xml/.txt, or no Arabic letters). */
function processFile(file: string): string | null {
  const ext = path.extname(file).toLowerCase();
  if (ext !== '.xml' && ext !== '.txt') return null;
  const content = fs.readFileSync(file, 'utf-8');
  if (!hasRtl(content)) return null;
  try {
    return ext === '.xml' ? processXml(content) : processText(content);
  } catch (err: any) {
    failures.push(`${rel(file)}: ${err?.message ?? err}`);
    console.error(`  [ERROR] ${rel(file)}: ${err?.message ?? err}`);
    return null;
  }
}

/** In place: every .xml / .txt under a folder. Returns how many files were changed. */
function processFolder(dir: string): number {
  let count = 0;
  for (const file of getAllFiles(dir)) {
    const result = processFile(file);
    if (result !== null) {
      fs.writeFileSync(file, result, 'utf-8');
      count++;
    }
  }
  return count;
}

/** In place: <mod>/About/About.xml (name, description, ...), only when it has Arabic text. */
function processAbout(modDir: string): boolean {
  const file = path.join(modDir, 'About', 'About.xml');
  if (!fs.existsSync(file)) return false;
  const result = processFile(file);
  if (result === null) return false;
  fs.writeFileSync(file, result, 'utf-8');
  return true;
}

// ---------------------------------------------------------------------------
// 1) The ArabicSupport mod = packaging target only
// ---------------------------------------------------------------------------

function copyShell(): string {
  const src = path.join(MODS_DIR, NAME);
  if (!fs.existsSync(path.join(src, 'About', 'About.xml'))) {
    throw new Error(
      `The ${NAME} mod was not found at ${rel(src)} (About/About.xml is missing). ` +
      `Put the ready-to-ship ${NAME} mod folder there (About/, Assemblies, Fonts, ...).`
    );
  }
  const dest = path.join(OUT_MODS_DIR, NAME);
  copyDir(src, dest);
  const about = processAbout(dest);
  console.log(`  [MOD] ${rel(src)} -> ${rel(dest)} (copied as it is${about ? ', About.xml reshaped + bidi-js' : ''})`);
  return dest;
}

// ---------------------------------------------------------------------------
// 2) The repo's Data/ folder (Core + DLCs) -> <ArabicSupport mod>/Languages/<language>, merged
// ---------------------------------------------------------------------------

// The packs of Data/ all use the same relative paths (Keyed/Alerts.xml exists in Core and in every DLC), so a plain
// copy would overwrite files. What happens when a path already exists in the merged language folder:
//   - Keyed/ and DefInjected/ .xml: the file name does not matter to RimWorld, so the file gets the pack name as prefix
//   - .txt (WordInfo/, Strings/): word lists, one entry per line, so the lines are appended
//   - anything else (LanguageInfo.xml, LangIcon.png): the first one (Core) stays
function mergeFile(content: string | Buffer, langDir: string, pack: string, relPath: string) {
  let target = path.join(langDir, relPath);
  if (fs.existsSync(target)) {
    const ext = path.extname(relPath).toLowerCase();
    const top = relPath.split(path.sep)[0];
    if (ext === '.xml' && (top === 'Keyed' || top === 'DefInjected')) {
      const dir = path.dirname(target);
      const base = path.basename(target);
      target = path.join(dir, `${pack}_${base}`);
      for (let i = 2; fs.existsSync(target); i++) target = path.join(dir, `${pack}${i}_${base}`);
    } else if (ext === '.txt') {
      const existing = fs.readFileSync(target, 'utf-8');
      fs.writeFileSync(target, existing + (existing.endsWith('\n') ? '' : '\n') + content, 'utf-8');
      return;
    } else {
      return;
    }
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content);
}

function buildData(modDir: string) {
  if (!fs.existsSync(DATA_DIR)) {
    throw new Error(`Core/DLC translation folder not found: ${rel(DATA_DIR)}`);
  }
  const packs = subDirs(DATA_DIR)
    .filter(p => fs.existsSync(path.join(DATA_DIR, p, 'Languages')))
    .sort((a, b) => (a === 'Core' ? -1 : b === 'Core' ? 1 : a.localeCompare(b)));
  if (!packs.includes('Core')) throw new Error(`${rel(DATA_DIR)}/Core/Languages is missing.`);

  let total = 0;
  for (const pack of packs) {
    const languagesDir = path.join(DATA_DIR, pack, 'Languages');
    for (const language of subDirs(languagesDir)) {
      const srcLangDir = path.join(languagesDir, language);
      const destLangDir = path.join(modDir, 'Languages', language);
      let count = 0;
      for (const file of getAllFiles(srcLangDir)) {
        const processed = processFile(file);
        mergeFile(processed !== null ? processed : fs.readFileSync(file), destLangDir, pack, path.relative(srcLangDir, file));
        count++;
        if (processed !== null) total++;
      }
      console.log(`  [DATA] ${rel(srcLangDir)} -> ${rel(destLangDir)}: ${count} file(s)`);
    }
  }
  console.log(`  [DATA] ${total} file(s) reshaped + bidi-js, merged into ${rel(path.join(modDir, 'Languages'))}`);
}

// ---------------------------------------------------------------------------
// 3) Every other mod of Mods/: About.xml + its own Arabic Languages/ folder(s) reshaped + bidi-js
// ---------------------------------------------------------------------------

// Language folders of a mod: "Arabic", "Arabic (العربية)", "ar", "ar-SA", ...
const isArabicFolder = (name: string) =>
  /[\u0600-\u06FF]/.test(name) || /arab/i.test(name) || /^ar([\s\-_(\[]|$)/i.test(name);

/** Every <Languages>/<Arabic folder> inside a mod, at any depth (1.5/Languages, Common/Languages, ...). */
function findArabicLanguageFolders(dir: string): string[] {
  const found: string[] = [];
  for (const sub of subDirs(dir)) {
    const full = path.join(dir, sub);
    if (sub.toLowerCase() === 'languages') {
      found.push(...subDirs(full).filter(isArabicFolder).map(d => path.join(full, d)));
    } else {
      found.push(...findArabicLanguageFolders(full));
    }
  }
  return found;
}

function buildMods() {
  if (!fs.existsSync(MODS_DIR)) return;
  for (const mod of subDirs(MODS_DIR).sort()) {
    if (mod.toLowerCase() === NAME.toLowerCase()) continue; // packaging target, handled above

    const src = path.join(MODS_DIR, mod);
    const dest = path.join(OUT_MODS_DIR, mod);
    copyDir(src, dest);

    const about = processAbout(dest);
    let count = 0;
    const folders = findArabicLanguageFolders(src);
    for (const folder of folders) {
      count += processFolder(path.join(dest, path.relative(src, folder)));
    }
    console.log(
      `  [MOD] ${rel(src)} -> ${rel(dest)}: About.xml ${about ? 'reshaped + bidi-js' : 'unchanged'}, ` +
      `${count} file(s) in ${folders.length} Arabic Languages/ folder(s) reshaped + bidi-js, rest untouched`
    );
  }
}

// ---------------------------------------------------------------------------

function main() {
  fs.rmSync(OUT_DIR, { recursive: true, force: true });
  fs.mkdirSync(OUT_MODS_DIR, { recursive: true });

  console.log(`\n[1/3] ${NAME} mod (packaging target)`);
  const modDir = copyShell();

  console.log(`\n[2/3] Core + DLC translations: Data/ -> ${NAME}/Languages`);
  buildData(modDir);

  console.log('\n[3/3] Other mods of Mods/ (About.xml + their own Languages/ folders)');
  buildMods();

  if (failures.length > 0) {
    console.error(`\n❌ ${failures.length} file(s) could not be processed:`);
    failures.forEach(f => console.error(`  - ${f}`));
    process.exit(1);
  }
  console.log(`\n✅ Built ${rel(OUT_DIR)}`);
}

try {
  main();
} catch (err: any) {
  console.error(`\n❌ ${err?.message ?? err}`);
  process.exit(1);
}
