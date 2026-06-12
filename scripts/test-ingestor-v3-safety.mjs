#!/usr/bin/env node
import fs from 'node:fs';

const files = [
  'server/cafe24/ingestor-v3-api.js',
  'scripts/ingestion/audit-ingestor-consistency.mjs',
];

const forbiddenLiveEventWritePatterns = [
  /\bINSERT\s+INTO\s+events\b/i,
  /\bUPDATE\s+events\b/i,
  /\bDELETE\s+FROM\s+events\b/i,
  /\bREPLACE\s+INTO\s+events\b/i,
  /\bALTER\s+TABLE\s+events\b/i,
  /\bDROP\s+TABLE\s+events\b/i,
  /saveCafe24TableRow\(\s*['"]events['"]/i,
  /\.from\(\s*['"]events['"]\s*\)\s*\.\s*(insert|update|upsert|delete)\b/i,
];

const failures = [];

for (const file of files) {
  const content = fs.readFileSync(file, 'utf8');
  for (const pattern of forbiddenLiveEventWritePatterns) {
    if (pattern.test(content)) {
      failures.push(`${file}: forbidden live events write pattern ${pattern}`);
    }
  }
}

const api = fs.readFileSync('server/cafe24/ingestor-v3-api.js', 'utf8');
if (!/export async function cafe24IngestorV3RegisterBlocked/.test(api)) {
  failures.push('server/cafe24/ingestor-v3-api.js: missing blocked register endpoint');
}
if (!/Live event writes are blocked/.test(api)) {
  failures.push('server/cafe24/ingestor-v3-api.js: blocked register endpoint message missing');
}

const migration = fs.readFileSync('server/cafe24/migrations/2026-06-12-ingestor-v3.sql', 'utf8');
for (const pattern of [
  /\bCREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?events\b/i,
  /\bALTER\s+TABLE\s+events\b/i,
  /\bINSERT\s+INTO\s+events\b/i,
  /\bUPDATE\s+events\b/i,
  /\bDELETE\s+FROM\s+events\b/i,
]) {
  if (pattern.test(migration)) {
    failures.push(`server/cafe24/migrations/2026-06-12-ingestor-v3.sql: forbidden migration pattern ${pattern}`);
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('Ingestor V3 safety checks passed.');
