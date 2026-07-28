import assert from 'node:assert/strict';
import test from 'node:test';

import {
  JAZZ_TRACKS,
  chooseNextTrack,
  emulatorLaunchArguments,
  isInstalledPackagePath,
  parseAdbDevices,
  parseUiNodes,
  selectTargetEmulatorSerial,
} from './instagram-reel-adb.mjs';
import {
  canRetryPublicationState,
  resolveShellDefaultExpression,
} from './run-scheduled-social-reel.mjs';

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

test('ADB device parsing keeps serial and state so publishing can target one emulator', () => {
  assert.deepEqual(
    parseAdbDevices([
      'List of devices attached',
      '192.168.0.36:5555 device product:kiosk model:TV',
      'emulator-5554 device product:sdk_gphone64_arm64 model:sdk_gphone64_arm64',
      'emulator-5556 offline transport_id:3',
      '',
    ].join('\n')),
    [
      { serial: '192.168.0.36:5555', state: 'device' },
      { serial: 'emulator-5554', state: 'device' },
      { serial: 'emulator-5556', state: 'offline' },
    ],
  );
});

test('emulator always cold boots without reading or writing Quick Boot snapshots', () => {
  assert.deepEqual(
    emulatorLaunchArguments('Medium_Phone'),
    [
      '-avd',
      'Medium_Phone',
      '-no-audio',
      '-no-snapshot-load',
      '-no-snapshot-save',
    ],
  );
});

test('a sole wrong AVD is never substituted for the Instagram publishing AVD', () => {
  assert.equal(
    selectTargetEmulatorSerial([
      {
        serial: 'emulator-5556',
        state: 'device',
        avdName: 'Medium_Phone_2',
      },
    ], 'Medium_Phone'),
    '',
  );
  assert.equal(
    selectTargetEmulatorSerial([
      {
        serial: 'emulator-5554',
        state: 'device',
        avdName: 'Medium_Phone',
      },
      {
        serial: 'emulator-5556',
        state: 'device',
        avdName: 'Medium_Phone_2',
      },
    ], 'Medium_Phone'),
    'emulator-5554',
  );
});

test('duplicate instances of the publishing AVD fail closed', () => {
  assert.throws(
    () => selectTargetEmulatorSerial([
      {
        serial: 'emulator-5554',
        state: 'device',
        avdName: 'Medium_Phone',
      },
      {
        serial: 'emulator-5556',
        state: 'device',
        avdName: 'Medium_Phone',
      },
    ], 'Medium_Phone'),
    /Multiple running emulators/,
  );
});

test('only an actual Package Manager path proves Instagram is installed', () => {
  assert.equal(
    isInstalledPackagePath(
      'package:/data/app/example/com.instagram.android/base.apk',
    ),
    true,
  );
  assert.equal(isInstalledPackagePath(''), false);
  assert.equal(isInstalledPackagePath('com.instagram.android'), false);
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

test('publisher retries only failures known to occur before Share', () => {
  assert.equal(canRetryPublicationState({ status: 'failed-before-share' }), true);
  assert.equal(canRetryPublicationState({ status: 'verification-required' }), false);
  assert.equal(canRetryPublicationState({ status: 'published' }), false);
});
