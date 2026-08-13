import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import test from 'node:test';

const configUrl = new URL('../deploy/cafe24/apache/00-swingenjoy-modsecurity-exceptions.conf', import.meta.url);

test('direct UUID navigation excludes only the affected SPA query arguments', async () => {
  const config = await fs.readFile(configUrl, 'utf8');

  assert.match(
    config,
    /@streq \/board.*ctl:ruleRemoveTargetById=981173;ARGS:postId/,
  );
  assert.match(
    config,
    /@streq \/calendar.*ctl:ruleRemoveTargetById=981173;ARGS:id/,
  );
  assert.doesNotMatch(config, /<Location "\/board">\s*SecRuleRemoveById 981173/);
});
