import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// Exercise the real release script with external commands recorded, never sent.
async function runRelease(mode, dirty = false) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cafe24-release-scope-'));
  try {
    for (const dir of ['scripts', 'dist/assets', 'bin']) await fs.mkdir(path.join(root, dir), { recursive: true });
    await fs.copyFile(new URL('./deploy-cafe24.sh', import.meta.url), path.join(root, 'scripts/deploy-cafe24.sh'));
    await fs.writeFile(path.join(root, 'dist/index.html'), '<html>release</html>');
    await fs.writeFile(path.join(root, 'dist/service-worker.js'), '// worker');
    await fs.writeFile(path.join(root, 'dist/version.json'), JSON.stringify({ buildTime: 'verified-build' }));
    await fs.writeFile(path.join(root, 'package-lock.json'), '{}');
    const commands = {
      git: `case "$*" in\n 'status --porcelain --untracked-files=all') [ "$REVIEW_DIRTY" = 0 ] || echo ' M unrelated';;\n 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}') echo origin/test;;\n 'rev-parse HEAD'|'rev-parse origin/test') echo verified-commit;;\n esac`,
      ssh: `printf 'SSH %s\\n' "$*" >> "$REVIEW_COMMAND_LOG"\n case "$*" in *' hostname') echo clown313python.cafe24.com;; esac`,
      rsync: `printf 'RSYNC %s\\n' "$*" >> "$REVIEW_COMMAND_LOG"`,
      npm: `printf 'NPM %s\\n' "$*" >> "$REVIEW_COMMAND_LOG"`,
    };
    for (const [name, body] of Object.entries(commands)) await fs.writeFile(path.join(root, 'bin', name), `#!/bin/sh\n${body}\nexit 0\n`, { mode: 0o700 });
    const log = path.join(root, 'commands.log');
    const run = spawnSync('bash', ['scripts/deploy-cafe24.sh', ...mode], { cwd: root, encoding: 'utf8', env: {
      ...process.env, PATH: `${root}/bin:${process.env.PATH}`, CAFE24_DEPLOY_TARGET_FILE: '/nonexistent',
      CAFE24_SSH_TARGET: 'test@invalid', CAFE24_SSH_KEY: '/nonexistent', REVIEW_COMMAND_LOG: log, REVIEW_DIRTY: dirty ? '1' : '0',
    } });
    return { status: run.status, output: run.stdout + run.stderr, commands: await fs.readFile(log, 'utf8').catch(() => '') };
  } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('frontend release stages all entry files and publishes version last without API, database, scheduler, or package mutations', async () => {
  const result = await runRelease(['--frontend-only']);
  assert.equal(result.status, 0, result.output);
  assert.match(result.commands, /NPM run build:only/);
  const transfers = result.commands.split('\n').filter(line => line.startsWith('RSYNC'));
  assert.equal(transfers.length, 3);
  assert.ok(transfers.every(line => /dist\//.test(line)));
  assert.doesNotMatch(result.commands, /MYSQL_PASSWORD|systemctl (?:restart|reload)|npm install|run-cafe24-cron|RSYNC[^\n]*(?:server\/|dist-cafe24\/|package-lock)/);
  assert.match(result.commands, /publish_entry index.html\npublish_entry service-worker.js\npublish_entry version.json/);
  assert.match(result.commands, /curl -fsS .*__health/);
});

test('the existing full release still includes API artifacts and its backend verification', async () => {
  const result = await runRelease([]);
  assert.equal(result.status, 0, result.output);
  assert.match(result.commands, /NPM run build:cafe24/);
  assert.match(result.commands, /RSYNC[^\n]*dist-cafe24\//);
  assert.match(result.commands, /RSYNC[^\n]*server\/cafe24\//);
  assert.match(result.commands, /systemctl restart 'swingenjoy'/);
});

test('frontend-only keeps the clean/pushed source preflight before builds or transfers', async () => {
  const result = await runRelease(['--frontend-only'], true);
  assert.equal(result.status, 2);
  assert.equal(result.commands, '');
  assert.match(result.output, /uncommitted or untracked/);
});
