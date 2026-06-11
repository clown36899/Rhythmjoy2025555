import dotenv from 'dotenv';
import path from 'node:path';
import { invokeFetchStyleFunction } from '../server/cafe24/cafe24-function-adapter.js';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });

const request = new Request('http://127.0.0.1/__cron/refresh-stats', {
  method: 'POST',
});

const response = await invokeFetchStyleFunction('cron-refresh-stats', request);
const body = await response.text();

console.log(`[cafe24:cron] refresh-stats ${response.status}`);
if (body) console.log(body);

if (!response.ok) process.exitCode = 1;
