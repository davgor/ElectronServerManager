const fs = require('fs');
const outPath = 'tsprune.out';
const ignorePath = '.tsprune-ignore';

// Helper to normalize a line: strip non-printable prefix, normalize slashes
function normalize(line) {
  if (!line) return '';
  // Remove leading non-printable characters and trim
  line = line.replace(/^[^\w\\\/]+/, '').trim();
  if (!line) return '';
  // Normalize backslashes to forward slashes
  line = line.replace(/\\+/g, '/');
  // Remove any trailing parenthetical notes like " (used in module)"
  line = line.replace(/\s*\([^)]*\)\s*$/, '');
  // Remove any leading slash
  line = line.replace(/^\//, '');
  return line;
}

let out = [];
if (fs.existsSync(outPath)) {
  out = fs
    .readFileSync(outPath, 'utf8')
    .split(/\r?\n/)
    .map((s) => normalize(s))
    .filter(Boolean);
}

let ignore = [];
if (fs.existsSync(ignorePath)) {
  ignore = fs
    .readFileSync(ignorePath, 'utf8')
    .split(/\r?\n/)
    .map((s) => normalize(s))
    .filter(Boolean);
}

const newLines = out.filter((l) => !ignore.includes(l));
if (newLines.length > 0) {
  console.error('New dead exports detected:');
  newLines.forEach((l) => console.error(l));
  process.exit(2);
} else {
  console.log('No new dead exports found.');
  process.exit(0);
}
