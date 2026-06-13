#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

function todayKST(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function parseArgs(argv) {
  const args = {
    apply: false,
    out: '',
    today: todayKST(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--today') args.today = argv[++i] || args.today;
  }

  return args;
}

function writeJson(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

const args = parseArgs(process.argv.slice(2));
const result = {
  ok: true,
  applied: false,
  skipped: true,
  today: args.today,
  reason: 'legacy cleanup retired',
  count: 0,
  deleted: 0,
  targets: [],
};

writeJson(args.out, result);
console.log(JSON.stringify(result));
