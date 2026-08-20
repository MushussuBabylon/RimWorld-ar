// Validates the translation files under Data/ without modifying or building
// a release. Ported from RimWorld-ru's check scripts, adapted to this repo's
// single Data/ tree (recursive scan, same as build.ts's getAllFiles).
//
// Checks:
//   1. Every .xml/.txt file is valid UTF-8.
//   2. Every .xml file is well-formed XML.
//   3. reportString values don't end with a period (RimWorld appends its
//      own punctuation after these — a trailing period doubles it up).
//
// Exits with code 1 if any issue is found, so the Action run is flagged red.

import * as fs from 'fs';
import * as path from 'path';
import { DOMParser } from '@xmldom/xmldom';

interface Issue {
  file: string;
  type: 'ENCODING' | 'XML' | 'REPORT_STRING_DOT';
  message: string;
}

function getAllFiles(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...getAllFiles(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

const dataDir = path.resolve(import.meta.dirname, '../Data');
const targetFiles = getAllFiles(dataDir).filter((f) => {
  const ext = path.extname(f).toLowerCase();
  return ext === '.xml' || ext === '.txt';
});

console.log(`Checking ${targetFiles.length} translation file(s) under Data/...\n`);

const issues: Issue[] = [];
// Matches tags like <Foo.reportString>...</...> whose text content ends with a period.
const reportStringDotRegex = /\.[^<]*[rR]eportString>([^<]*)\.<\//;

for (const file of targetFiles) {
  const rel = path.relative(dataDir, file);
  const buffer = fs.readFileSync(file);

  // 1. UTF-8 validity
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    issues.push({ file: rel, type: 'ENCODING', message: 'File is not valid UTF-8.' });
    continue;
  }

  const ext = path.extname(file).toLowerCase();

  // 2. XML well-formedness (XML files only)
  if (ext === '.xml') {
    const xmlErrors: string[] = [];
    const parser = new DOMParser({
      locator: {},
      errorHandler: {
        warning: () => {},
        error: (msg: string) => { xmlErrors.push(msg); },
        fatalError: (msg: string) => { xmlErrors.push(msg); },
      },
    } as any);

    try {
      parser.parseFromString(content, 'application/xml');
    } catch (err: any) {
      xmlErrors.push(err.message || String(err));
    }

    for (const msg of xmlErrors) {
      issues.push({ file: rel, type: 'XML', message: msg.trim().replace(/\r?\n/g, '  ') });
    }
  }

  // 3. reportString trailing-dot check
  content.split(/\r?\n/).forEach((line, idx) => {
    if (line.trim().startsWith('<!--')) return;
    const cleanLine = line.replace(/<!--.*$/, '');
    if (reportStringDotRegex.test(cleanLine)) {
      issues.push({
        file: rel,
        type: 'REPORT_STRING_DOT',
        message: `Line ${idx + 1}: reportString value ends with a period.`,
      });
    }
  });
}

if (issues.length === 0) {
  console.log('✅ No issues found. Translation looks good.');
  process.exit(0);
}

console.log(`❌ Found ${issues.length} issue(s):\n`);
for (const issue of issues) {
  console.log(`  [${issue.type}]  ${issue.file}  —  ${issue.message}`);
}
process.exit(1);
