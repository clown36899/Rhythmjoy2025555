const baseUrl = process.env.CAFE24_INTERNAL_BASE_URL || 'http://127.0.0.1:3001';
const token = process.env.PUSH_CRON_TOKEN || '';

async function postCron(path) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(token ? { 'x-cron-token': token } : {}),
    },
    body: JSON.stringify(token ? { token } : {}),
  });
  const text = await response.text();
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = { raw: text };
  }
  console.log(`[cafe24:cron] ${path} ${response.status}`, JSON.stringify(payload));
  if (!response.ok) process.exitCode = 1;
}

await postCron('/api/__cron/daily-digest');
await postCron('/api/__cron/notification-queue');
