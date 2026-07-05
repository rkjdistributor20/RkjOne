import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['app', 'components', 'lib'];
const TEXT_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const MOJIBAKE_RE = /[ÃÂ�]|â(?:€|€™|€œ|€|€¦|€˜|€”|€“)/;
const UUID_LITERAL_RE = /['"`][0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}['"`]/i;
const ID_FALLBACK_HINT_RE = /\?\?\s*[\w.]+(?:_id|Id|\.id)\b|\|\|\s*[\w.]+(?:_id|Id|\.id)\b/;

function walk(dir, files = []) {
 if (!fs.existsSync(dir)) return files;
 for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
  if (entry.name === 'node_modules' || entry.name === '.next' || entry.name === '.git') continue;
  const fullPath = path.join(dir, entry.name);
  if (entry.isDirectory()) {
   walk(fullPath, files);
   continue;
  }
  if (TEXT_EXTENSIONS.has(path.extname(entry.name))) files.push(fullPath);
 }
 return files;
}

const fatal = [];
const warnings = [];

for (const scanDir of SCAN_DIRS) {
 for (const file of walk(path.join(ROOT, scanDir))) {
  const relative = path.relative(ROOT, file).replaceAll(path.sep, '/');
  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split(/\r?\n/);
  lines.forEach((line, index) => {
   const location = `${relative}:${index + 1}`;
   if (MOJIBAKE_RE.test(line)) {
    fatal.push(`${location} contains mojibake/broken encoding text.`);
   }
   if ((relative.endsWith('.tsx') || relative.startsWith('app/')) && UUID_LITERAL_RE.test(line)) {
    fatal.push(`${location} contains a hard-coded UUID literal in UI code.`);
   }
   const internalOnlyLine =
    line.includes('key=') ||
    line.includes('.filter(') ||
    line.trim().startsWith('if ') ||
    line.trim().startsWith('const ');
   if (
    relative.endsWith('.tsx') &&
    !internalOnlyLine &&
    ID_FALLBACK_HINT_RE.test(line) &&
    /(label|Label|title|Title|name|Name|SelectValue|placeholder|description|Description)/.test(line)
   ) {
    warnings.push(`${location} may expose a raw ID as a visible fallback.`);
   }
  });
 }
}

if (warnings.length) {
 console.warn('UI polish warnings:');
 for (const warning of warnings.slice(0, 30)) console.warn(`- ${warning}`);
 if (warnings.length > 30) console.warn(`- ... ${warnings.length - 30} more warnings`);
}

if (fatal.length) {
 console.error('UI polish verification failed:');
 for (const issue of fatal) console.error(`- ${issue}`);
 process.exit(1);
}

console.log(JSON.stringify({
 status: 'ok',
 checkedDirs: SCAN_DIRS,
 warningCount: warnings.length,
 fatalCount: fatal.length,
}, null, 2));
