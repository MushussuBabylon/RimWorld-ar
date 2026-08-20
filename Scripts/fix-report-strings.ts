// Run it locally (not in CI) once, review the diff, then delete this file.
//
// Usage:
//   node Scripts/fix-report-strings.ts
//
// It finds every line matching the same pattern check.ts flags
// (a dot-qualified tag ending in "reportString" whose text ends with a
// period) and removes that one trailing period. Nothing else on the line
// is touched.

import * as fs from 'fs';
import * as path from 'path';

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
const xmlFiles = getAllFiles(dataDir).filter((f) => f.toLowerCase().endsWith('.xml'));

// Same detection pattern as check.ts, but capturing so we can rewrite it.
const reportStringDotRegex = /(\.[^<]*[rR]eportString>[^<]*)\.(<\/)/;

let filesChanged = 0;
let linesChanged = 0;

for (const file of xmlFiles) {
  const content = fs.readFileSync(file, 'utf-8');
  let fileChanged = false;

  const newLines = content.split(/\r?\n/).map((line) => {
    if (line.trim().startsWith('<!--')) return line;
    const cleanLine = line.replace(/<!--.*$/, '');
    if (reportStringDotRegex.test(cleanLine) && !line.includes('<!--')) {
      const updated = line.replace(reportStringDotRegex, '$1$2');
      if (updated !== line) {
        fileChanged = true;
        linesChanged++;
        return updated;
      }
    }
    return line;
  });

  if (fileChanged) {
    fs.writeFileSync(file, newLines.join('\n'), 'utf-8');
    filesChanged++;
    console.log(`Fixed: ${path.relative(dataDir, file)}`);
  }
}

console.log(`\nDone. ${linesChanged} line(s) fixed across ${filesChanged} file(s).`);
