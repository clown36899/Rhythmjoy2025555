import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JAZZ_TRACKS,
  chooseNextTrack,
  parseUiNodes,
} from './instagram-reel-adb.mjs';
import { resolveShellDefaultExpression } from './run-scheduled-social-reel.mjs';

test('UI XML parser decodes accessibility fields and bounds', () => {
  const nodes = parseUiNodes([
    '<hierarchy>',
    '<node text="New reel" resource-id="com.instagram.android:id/action_bar_title"',
    ' content-desc="Rock &amp; Roll" clickable="true" selected="false"',
    ' bounds="[189,105][413,168]" />',
    '</hierarchy>',
  ].join(''));
  assert.equal(nodes.length, 1);
  assert.equal(nodes[0].text, 'New reel');
  assert.equal(nodes[0].description, 'Rock & Roll');
  assert.equal(nodes[0].clickable, true);
  assert.deepEqual(nodes[0].bounds, {
    left: 189,
    top: 105,
    right: 413,
    bottom: 168,
  });
});

test('music rotation never repeats the previous successful track', () => {
  const previous = JAZZ_TRACKS[2];
  const candidates = chooseNextTrack([previous]);
  assert.notDeepEqual(candidates[0], previous);
  assert.deepEqual(candidates[0], JAZZ_TRACKS[3]);
  assert.equal(candidates.length, JAZZ_TRACKS.length);
});

test('unknown history safely starts from the first configured jazz track', () => {
  const candidates = chooseNextTrack([{ title: 'Unknown', artist: 'Unknown' }]);
  assert.deepEqual(candidates[0], JAZZ_TRACKS[0]);
});

test('shell-style environment defaults resolve for the shared notification config', () => {
  assert.equal(
    resolveShellDefaultExpression(
      'TELEGRAM_BOT_TOKEN',
      '${TELEGRAM_BOT_TOKEN:-calendar-token}',
      '${TELEGRAM_BOT_TOKEN:-calendar-token}',
    ),
    'calendar-token',
  );
  assert.equal(
    resolveShellDefaultExpression(
      'TELEGRAM_BOT_TOKEN',
      '${TELEGRAM_BOT_TOKEN:-calendar-token}',
      'explicit-token',
    ),
    'explicit-token',
  );
});
