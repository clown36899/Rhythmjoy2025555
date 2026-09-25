// Package the existing collector and its shared rules without the web app build.
// Dependency versions remain owned by the repository package-lock.json.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const destination = path.resolve(process.argv[2] || '');
if (!process.argv[2] || destination === root || root.startsWith(`${destination}/`)) {
  throw new Error('Provide a separate staging directory');
}
const entries = ['scripts/run-ingestion.sh', 'scripts/test-ingestion-standards.mjs',
  'scripts/ingestion/swing-daily-native.mjs', 'scripts/ingestion/audit-swing-social-map.mjs',
  'scripts/ingestion/run-lock.sh', 'scripts/ingestion/telegram-notify.sh',
  'scripts/ingestion/telegram-notification-policy.mjs',
  'scripts/ingestion/ai-adjudication.schema.json', 'scripts/ingestion/ai-benefit-review.schema.json',
  'scripts/ingestion/ai-social-extraction.schema.json'];
const copied = new Set();
async function copy(relative) {
  if (copied.has(relative)) return;
  copied.add(relative);
  const source = path.resolve(root, relative);
  if (!source.startsWith(root)) throw new Error(`Outside repository: ${relative}`);
  const data = await fs.readFile(source);
  const target = path.join(destination, relative);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, data);
  if (/\.(mjs|js)$/.test(relative)) {
    for (const match of data.toString().matchAll(/\bfrom\s+['"](\.[^'"]+)['"]/g)) {
      await copy(path.normalize(path.join(path.dirname(relative), match[1])));
    }
  }
}
await Promise.all(entries.map(copy));
const lock = JSON.parse(await fs.readFile(path.join(root, 'package-lock.json'), 'utf8'));
const dependencies = Object.fromEntries(['playwright', 'playwright-extra', 'puppeteer-extra-plugin-stealth']
  .map(name => [name, lock.packages[`node_modules/${name}`].version]));
await fs.writeFile(path.join(destination, 'package.json'), JSON.stringify({
  name: 'rhythmjoy-ingestion-runtime', private: true, type: 'module', dependencies,
}, null, 2) + '\n');
console.log(`Staged ${copied.size} source files in ${destination}`);
