#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const collectorPath = path.join(scriptDirectory, 'swing-daily-native.mjs');

function parseArguments(argv) {
  const values = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [key, ...parts] = argument.slice(2).split('=');
    values[key] = parts.length ? parts.join('=') : true;
  }
  return values;
}

function timestamp() {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date()).replace(/[-: ]/g, '');
}

async function runCollector(environment) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [collectorPath], {
      cwd: repositoryRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
      process.stdout.write(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`Exception backtest collector exited with ${code}.`));
    });
  });
}

function parseResult(stdout) {
  const match = stdout.match(
    /INGESTION_RESULT_JSON_START\s*([\s\S]*?)\s*INGESTION_RESULT_JSON_END/,
  );
  if (!match) throw new Error('Collector output did not contain a result block.');
  return JSON.parse(match[1]);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const outputDirectory = path.resolve(
    typeof args['output-dir'] === 'string'
      ? args['output-dir']
      : path.join(repositoryRoot, 'artifacts/ingestion-exception-backtest'),
  );
  await mkdir(outputDirectory, { recursive: true });

  const environment = {
    ...process.env,
    INGESTION_PROFILE: 'swing-daily',
    INGESTION_NATIVE_DRY_RUN: '1',
    INGESTION_EXCEPTION_BACKTEST: '1',
    INGESTION_EXCEPTION_LOOKBACK_DAYS: String(args['lookback-days'] || 180),
    INGESTION_NATIVE_SOURCE_TYPES: String(
      args['source-types'] || 'instagram,naver_cafe,daum_cafe,littly',
    ),
    INGESTION_NATIVE_POST_LIMIT: String(args['post-limit'] || 8),
    INGESTION_NATIVE_INSTAGRAM_POST_LIMIT: String(args['instagram-post-limit'] || 8),
    INGESTION_NATIVE_NAVER_POST_LIMIT: String(args['naver-post-limit'] || 12),
    INGESTION_NATIVE_DAUM_POST_LIMIT: String(args['daum-post-limit'] || 12),
    INGESTION_NATIVE_LITTLY_CARD_LIMIT: String(args['littly-card-limit'] || 18),
    INGESTION_NATIVE_RUN_BUDGET_MS: String(args['budget-ms'] || 15 * 60_000),
    INGESTION_INSTAGRAM_SAFE_MODE: '0',
    INGESTION_INSTAGRAM_SOURCE_DELAY_MS: '0',
    INGESTION_INSTAGRAM_POST_DELAY_MS: '0',
    ...(typeof args['source-ids'] === 'string'
      ? { INGESTION_NATIVE_SOURCE_IDS: args['source-ids'] }
      : {}),
    ...(typeof args['source-limit'] === 'string'
      ? { INGESTION_NATIVE_SOURCE_LIMIT: args['source-limit'] }
      : {}),
  };

  const startedAt = new Date();
  const { stdout } = await runCollector(environment);
  const result = parseResult(stdout);
  const report = {
    mode: 'swing-exception-backtest',
    storageWrites: false,
    startedAt: startedAt.toISOString(),
    completedAt: new Date().toISOString(),
    lookbackDays: Number(environment.INGESTION_EXCEPTION_LOOKBACK_DAYS),
    sourceIds: environment.INGESTION_NATIVE_SOURCE_IDS?.split(',').filter(Boolean) || [],
    result,
  };
  const outputPath = path.join(outputDirectory, `${timestamp()}-exceptions.json`);
  await writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: 'complete',
    outputPath,
    candidateCount: result.candidates.length,
    accessFailureCount: result.accessFailures.length,
    storageWrites: false,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
