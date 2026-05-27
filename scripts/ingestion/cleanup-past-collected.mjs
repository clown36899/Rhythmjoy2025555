import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

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
  return String(row?.structured_data?.date || '').slice(0, 10);
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

const args = parseArgs(process.argv.slice(2));
loadEnv(path.join(projectRoot, '.env'));

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY || process.env.SUPABASE_SERVICE_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('SUPABASE_URL/SUPABASE_KEY 환경변수를 찾을 수 없습니다.');
}

const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });

const { data, error } = await supabase
  .from('scraped_events')
  .select('id,display_no,is_collected,source_url,structured_data,updated_at')
  .eq('is_collected', true)
  .lt('structured_data->>date', args.today)
  .order('structured_data->>date', { ascending: true })
  .limit(500);

if (error) throw error;

const candidates = data || [];
const unsafe = candidates.filter((row) => !assertSafeTarget(row, args.today));
if (unsafe.length > 0) {
  const result = {
    ok: false,
    applied: false,
    today: args.today,
    reason: 'unsafe cleanup target detected',
    unsafe: unsafe.map((row) => ({ id: row.id, date: eventDateOf(row), is_collected: row.is_collected })),
  };
  writeJson(args.out, result);
  console.log(JSON.stringify(result));
  process.exit(2);
}

if (candidates.length > 200 && !args.allowLargeDelete) {
  const result = {
    ok: false,
    applied: false,
    today: args.today,
    reason: 'large cleanup blocked',
    count: candidates.length,
  };
  writeJson(args.out, result);
  console.log(JSON.stringify(result));
  process.exit(3);
}

let deleted = 0;
if (args.apply && candidates.length > 0) {
  const { error: deleteError, count } = await supabase
    .from('scraped_events')
    .delete({ count: 'exact' })
    .in('id', candidates.map((row) => row.id));

  if (deleteError) throw deleteError;
  deleted = count || 0;
}

const result = {
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
};

writeJson(args.out, result);
console.log(JSON.stringify(result));
