#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const failures = [];
const retiredNames = {
  legacyDbUpper: ['SUPA', 'BASE'].join(''),
  legacyDbLower: ['supa', 'base'].join(''),
  legacyDeployLower: ['net', 'lify'].join(''),
};

const directConfigFiles = [
  'package.json',
  '.env',
  '.env.local',
  '.env.local-db.example',
  'vite.config.ts',
];

const runtimeRoots = ['src', 'server', 'scripts', '.agent', '.agents'];
const runtimeExtensions = new Set(['.js', '.mjs', '.cjs', '.ts', '.tsx', '.json', '.md']);
const ignoredPathParts = [
  `${path.sep}node_modules${path.sep}`,
  `${path.sep}dist${path.sep}`,
  `${path.sep}_archive${path.sep}`,
];
const ignoredRelativePaths = new Set([
  'scripts/audit-cafe24-only.mjs',
  'CHANGELOG.md',
  'TRANSLATION_PLAN.md',
  'YOUTUBE_LEARNING_PLAN.md',
  'code_review_report.md',
  'replit.md',
  'site_review_report_v2.md',
]);

const optionalScanFiles = [
  '.cursorrules',
  '.gitignore',
  'docs/cafe24-full-migration.md',
  'docs/calendar-dance-scope-task.md',
  'docs/INGESTION_STATUS.md',
];

const bannedPatterns = [
  {
    pattern: new RegExp([
      `VITE_PUBLIC_${retiredNames.legacyDbUpper}_URL`,
      `VITE_PUBLIC_${retiredNames.legacyDbUpper}_ANON_KEY`,
      `${retiredNames.legacyDbUpper}_SERVICE_KEY`,
      `${retiredNames.legacyDbUpper}_URL`,
      `${retiredNames.legacyDbUpper}_KEY`,
      `VITE_FORCE_PROD_${retiredNames.legacyDbUpper}`,
    ].join('|'), 'g'),
    reason: 'retired env/config reference',
  },
  {
    pattern: new RegExp(`@${retiredNames.legacyDbLower}/|@${retiredNames.legacyDeployLower}/`, 'g'),
    reason: 'direct retired platform package import',
  },
  {
    pattern: new RegExp(`${retiredNames.legacyDeployLower}/functions|edge-functions|${retiredNames.legacyDeployLower}\\.toml`, 'gi'),
    reason: 'retired deployment reference',
  },
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function scanFile(filePath) {
  const rel = path.relative(projectRoot, filePath);
  if (ignoredRelativePaths.has(rel)) return;
  const text = readText(filePath);
  for (const { pattern, reason } of bannedPatterns) {
    const match = text.match(pattern);
    if (match) {
      failures.push(`${rel}: ${reason} (${match[0]})`);
    }
  }
}

function walk(dirPath) {
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (ignoredPathParts.some((part) => fullPath.includes(part))) continue;
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!runtimeExtensions.has(path.extname(entry.name))) continue;
    scanFile(fullPath);
  }
}

for (const relPath of directConfigFiles) {
  const fullPath = path.join(projectRoot, relPath);
  if (fs.existsSync(fullPath)) scanFile(fullPath);
}

for (const relPath of optionalScanFiles) {
  const fullPath = path.join(projectRoot, relPath);
  if (fs.existsSync(fullPath)) scanFile(fullPath);
}

for (const root of runtimeRoots) {
  const fullPath = path.join(projectRoot, root);
  if (fs.existsSync(fullPath)) walk(fullPath);
}

if (failures.length > 0) {
  console.error('Cafe24-only policy audit failed:');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log('cafe24-only policy audit ok');
