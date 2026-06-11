import fs from 'node:fs/promises';
import path from 'node:path';
import app from './app.js';
import { initServerVersionWatcher } from './diagnostics-api.js';

const host = process.env.CAFE24_HOST || '127.0.0.1';
const port = Number(process.env.PORT || process.env.CAFE24_PORT || 3001);

app.listen(port, host, () => {
  console.log(`[cafe24] swingenjoy server listening on http://${host}:${port}`);
  initServerVersionWatcher();
  const versionFile = path.resolve(process.cwd(), process.env.CAFE24_DIST_DIR || 'dist', 'version.json');
  fs.readFile(versionFile, 'utf8')
    .then((text) => console.log(`[cafe24] active dist version ${text.trim()}`))
    .catch((error) => console.warn(`[cafe24] active dist version unavailable: ${error.message}`));
});
