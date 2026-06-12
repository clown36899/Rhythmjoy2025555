#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    process.env[match[1]] ??= value;
  }
}

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
    allowLargeDelete: false,
    out: '',
    today: todayKST(),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--apply') args.apply = true;
    else if (arg === '--allow-large-delete') args.allowLargeDelete = true;
    else if (arg === '--out') args.out = argv[++i] || '';
    else if (arg === '--today') args.today = argv[++i] || args.today;
  }

  return args;
}

function eventDateOf(row) {
  return String(row?.structured_data?.date || row?.date || '').slice(0, 10);
}

function assertSafeTarget(row, today) {
  const date = eventDateOf(row);
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && date < today && row?.is_collected === true;
}

function writeJson(filePath, data) {
  if (!filePath) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function emit(args, result, exitCode = 0) {
  writeJson(args.out, result);
  console.log(JSON.stringify(result));
  process.exit(exitCode);
}

function normalizeSupabaseUrl(value) {
  return String(value || '').replace(/\/+$/, '');
}

async function supabaseRequest(baseUrl, key, pathName, params, options = {}) {
  const url = new URL(`${baseUrl}/rest/v1/${pathName}`);
  for (const [name, value] of Object.entries(params || {})) {
    if (value !== undefined && value !== null && value !== '') url.searchParams.set(name, value);
  }

  const response = await fetch(url, {
    method: options.method || 'GET',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...(options.prefer ? { Prefer: options.prefer } : {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Supabase ${options.method || 'GET'} ${response.status}: ${text.slice(0, 300)}`);
  }

  if (!text) return [];
  try {
    return JSON.parse(text);
  } catch {
    return [];
  }
}

async function loadCollectedRows(baseUrl, key, today) {
  const select = 'id,display_no,is_collected,source_url,structured_data,updated_at';
  try {
    return await supabaseRequest(baseUrl, key, 'scraped_events', {
      select,
      is_collected: 'eq.true',
      'structured_data->>date': `lt.${today}`,
      limit: '500',
    });
  } catch (error) {
    const rows = await supabaseRequest(baseUrl, key, 'scraped_events', {
      select,
      is_collected: 'eq.true',
      limit: '1000',
    });
    return rows.filter((row) => eventDateOf(row) < today);
  }
}

async function deleteRows(baseUrl, key, ids) {
  if (!ids.length) return 0;
  let deleted = 0;
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const idFilter = `in.(${chunk.map((id) => `"${String(id).replace(/"/g, '\\"')}"`).join(',')})`;
    const rows = await supabaseRequest(baseUrl, key, 'scraped_events', { id: idFilter }, {
      method: 'DELETE',
      prefer: 'return=representation',
    });
    deleted += Array.isArray(rows) ? rows.length : 0;
  }
  return deleted;
}

const args = parseArgs(process.argv.slice(2));
loadEnv(path.join(projectRoot, '.env'));

const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL);
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  emit(args, {
    ok: true,
    applied: false,
    skipped: true,
    today: args.today,
    reason: 'supabase env missing',
    count: 0,
    deleted: 0,
    targets: [],
  });
}

let candidates;
try {
  candidates = (await loadCollectedRows(supabaseUrl, supabaseKey, args.today))
    .filter((row) => eventDateOf(row) < args.today)
    .sort((a, b) => eventDateOf(a).localeCompare(eventDateOf(b)) || String(a.id).localeCompare(String(b.id)));
} catch (error) {
  emit(args, {
    ok: false,
    applied: false,
    skipped: true,
    today: args.today,
    reason: 'cleanup request failed',
    error: error?.message || String(error),
    count: 0,
    deleted: 0,
    targets: [],
  });
}

const unsafe = candidates.filter((row) => !assertSafeTarget(row, args.today));
if (unsafe.length > 0) {
  emit(args, {
    ok: false,
    applied: false,
    today: args.today,
    reason: 'unsafe cleanup target detected',
    unsafe: unsafe.map((row) => ({ id: row.id, date: eventDateOf(row), is_collected: row.is_collected })),
  }, 2);
}

if (candidates.length > 200 && !args.allowLargeDelete) {
  emit(args, {
    ok: false,
    applied: false,
    today: args.today,
    reason: 'large cleanup blocked',
    count: candidates.length,
  }, 3);
}

let deleted = 0;
if (args.apply) {
  try {
    deleted = await deleteRows(supabaseUrl, supabaseKey, candidates.map((row) => row.id));
  } catch (error) {
    emit(args, {
      ok: false,
      applied: true,
      skipped: true,
      today: args.today,
      reason: 'cleanup delete failed',
      error: error?.message || String(error),
      count: candidates.length,
      deleted: 0,
      targets: candidates.map((row) => ({
        id: row.id,
        display_no: row.display_no ?? null,
        date: eventDateOf(row),
        title: row.structured_data?.title || '',
        location: row.structured_data?.location || row.structured_data?.venue_name || '',
        source_url: row.source_url || '',
        updated_at: row.updated_at || '',
      })),
    });
  }
}

emit(args, {
  ok: true,
  applied: args.apply,
  today: args.today,
  count: candidates.length,
  deleted,
  targets: candidates.map((row) => ({
    id: row.id,
    display_no: row.display_no ?? null,
    date: eventDateOf(row),
    title: row.structured_data?.title || '',
    location: row.structured_data?.location || row.structured_data?.venue_name || '',
    source_url: row.source_url || '',
    updated_at: row.updated_at || '',
  })),
});
