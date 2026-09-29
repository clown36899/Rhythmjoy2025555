import assert from 'node:assert/strict';
import {
  mkdtemp,
  readdir,
  rm,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  JAZZ_TRACKS,
  chooseNextTrack,
  emulatorLaunchArguments,
  initialInstagramPermissionAction,
  instagramOnboardingDismissAction,
  isInstalledPackagePath,
  parseAndroidDisplaySize,
  parseAdbDevices,
  parseAvailableStorageBytes,
  parseInstagramPostCount,
  parseUiNodes,
  profileRefreshSwipeArguments,
  publishedLocalArtifactPaths,
  publicationCountConfirmsSuccess,
  publicationNeedsReconciliation,
  removePublishedLocalArtifacts,
  requiredRemoteStorageBytes,
  resolveCoverEditorTransition,
  selectTargetEmulatorSerial,
  selectManagedRemoteMediaPaths,
} from './instagram-reel-adb.mjs';
import {
  buildPublicationProblemNotification,
  canPublishReelDate,
  canRetryPublicationState,
  publicationStateRequiresGeneration,
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

test('cover editor supports both direct camera-roll entry and the legacy overlay', () => {
  const direct = resolveCoverEditorTransition([{
    description: 'Add from camera roll',
    resourceId: 'com.instagram.android:id/add_from_gallery',
    clickable: true,
    bounds: { left: 42, top: 2189, right: 1038, bottom: 2305 },
  }]);
  assert.equal(direct.mode, 'ready');
  assert.equal(direct.node.resourceId, 'com.instagram.android:id/add_from_gallery');

  const legacy = resolveCoverEditorTransition([{
    description: '',
    resourceId: 'com.instagram.android:id/clip_thumbnail_layout',
    clickable: true,
    bounds: { left: 50, top: 100, right: 250, bottom: 400 },
  }]);
  assert.equal(legacy.mode, 'tap-overlay');
  assert.equal(resolveCoverEditorTransition([{ description: 'Edit cover' }]), null);
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

test('remote media cleanup is restricted to publisher-owned dated files', () => {
  assert.deepEqual(
    selectManagedRemoteMediaPaths([
      '/sdcard/Movies/Rhythmjoy/RHYTHMJOY-2026-08-23-AUTO.mp4',
      '/sdcard/Pictures/Rhythmjoy/RHYTHMJOY-2026-08-23-COVER-AUTO.jpg',
      '/sdcard/Movies/Rhythmjoy/family-video.mp4',
      '/sdcard/Pictures/Rhythmjoy/RHYTHMJOY-logo.jpg',
      '/sdcard/DCIM/RHYTHMJOY-2026-08-23-AUTO.mp4',
      '/sdcard/Movies/Rhythmjoy/RHYTHMJOY-2026-08-23-AUTO.mp4.bak',
    ]),
    [
      '/sdcard/Movies/Rhythmjoy/RHYTHMJOY-2026-08-23-AUTO.mp4',
      '/sdcard/Pictures/Rhythmjoy/RHYTHMJOY-2026-08-23-COVER-AUTO.jpg',
    ],
  );
});

test('confirmed publication cleanup removes only generated local media', async (context) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'rhythmjoy-reel-cleanup-'));
  context.after(() => rm(directory, { recursive: true, force: true }));
  const date = '2026-08-27';
  const generatedPaths = publishedLocalArtifactPaths(directory, date);
  assert.deepEqual(generatedPaths.map((filePath) => path.basename(filePath)), [
    `${date}-social-reel-4k.mp4`,
    `${date}-social-reel-cover-4k.jpg`,
    `${date}-social-reel-midpoint-4k.jpg`,
    'calendar-raw@4x.png',
    'calendar-2160x3840.png',
    'label-overlay-4k.png',
    'arrow-overlay-4k.png',
  ]);
  assert.throws(
    () => publishedLocalArtifactPaths(directory, '../../unsafe'),
    /invalid date/,
  );

  await Promise.all(generatedPaths.map((filePath) => writeFile(filePath, 'generated')));
  await Promise.all([
    writeFile(path.join(directory, 'publication-state.json'), '{}'),
    writeFile(path.join(directory, 'instagram-share-ready.png'), 'proof'),
  ]);

  const removedPaths = await removePublishedLocalArtifacts(directory, date);
  assert.deepEqual(removedPaths, generatedPaths);
  assert.deepEqual(
    (await readdir(directory)).sort(),
    ['instagram-share-ready.png', 'publication-state.json'],
  );
  assert.deepEqual(await removePublishedLocalArtifacts(directory, date), []);
});

test('Android df output and media headroom produce a byte-accurate storage gate', () => {
  assert.equal(
    parseAvailableStorageBytes([
      'Filesystem     1K-blocks    Used Available Use% Mounted on',
      '/dev/block/dm-53  6082144 5951072    131072  98% /data/user/0',
    ].join('\n')),
    128 * 1024 * 1024,
  );
  assert.equal(parseAvailableStorageBytes('Data-Free: unknown'), null);
  assert.equal(
    requiredRemoteStorageBytes([4 * 1024 * 1024, 1 * 1024 * 1024], 64 * 1024 * 1024),
    69 * 1024 * 1024,
  );
  assert.throws(
    () => requiredRemoteStorageBytes([-1], 64 * 1024 * 1024),
    /non-negative/,
  );
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

test('post-share verification parses profile counts and reconciles only uncertain runs', () => {
  assert.equal(parseInstagramPostCount([
    { description: '17posts' },
  ]), 17);
  assert.equal(parseInstagramPostCount([
    { description: '1,234posts' },
  ]), 1234);
  assert.equal(parseInstagramPostCount([{ description: 'Profile' }]), null);

  assert.equal(publicationNeedsReconciliation({ status: 'sharing' }), true);
  assert.equal(publicationNeedsReconciliation({ status: 'verification-required' }), true);
  assert.equal(publicationNeedsReconciliation({ status: 'failed-before-share' }), false);
  assert.equal(
    publicationCountConfirmsSuccess({ postCountBefore: 16 }, 17),
    true,
  );
  assert.equal(
    publicationCountConfirmsSuccess({ postCountBefore: 16 }, 16),
    false,
  );
});

test('profile verification refresh uses the active Android display dimensions', () => {
  assert.deepEqual(
    parseAndroidDisplaySize('Physical size: 1080x2400\n'),
    { width: 1080, height: 2400 },
  );
  assert.deepEqual(
    parseAndroidDisplaySize('Physical size: 1080x2400\nOverride size: 720x1600\n'),
    { width: 720, height: 1600 },
  );
  assert.equal(parseAndroidDisplaySize('size unavailable'), null);
  assert.deepEqual(
    profileRefreshSwipeArguments({ width: 1080, height: 2400 }),
    ['input', 'swipe', '540', '504', '540', '1500', '700'],
  );
});

test('initial Instagram permissions allow media but deny camera and microphone', () => {
  assert.deepEqual(
    initialInstagramPermissionAction([
      { text: 'Allow Instagram to access photos and videos on this device?' },
      { text: 'Allow all' },
    ]),
    { prompt: 'media', buttonText: 'Allow all' },
  );
  assert.deepEqual(
    initialInstagramPermissionAction([
      { text: 'Allow Instagram to take pictures and record video?' },
      { text: 'Don’t allow' },
    ]),
    { prompt: 'nonessential-permission', buttonText: 'Don’t allow' },
  );
  assert.deepEqual(
    initialInstagramPermissionAction([
      { text: 'Allow Instagram to record audio?' },
      { text: 'Don’t allow' },
    ]),
    { prompt: 'nonessential-permission', buttonText: 'Don’t allow' },
  );
  assert.deepEqual(
    initialInstagramPermissionAction([
      { text: 'Allow Instagram to send you notifications?' },
      { text: 'Don’t allow' },
    ]),
    { prompt: 'nonessential-permission', buttonText: 'Don’t allow' },
  );
  assert.equal(initialInstagramPermissionAction([{ description: 'Profile' }]), null);
});

test('optional Instagram sticker onboarding is dismissed without enabling it', () => {
  assert.deepEqual(
    instagramOnboardingDismissAction([
      { text: 'Create a sticker' },
      { text: 'Try it' },
      { text: 'Not now' },
    ]),
    { prompt: 'create-a-sticker', buttonText: 'Not now' },
  );
  assert.deepEqual(
    instagramOnboardingDismissAction([
      { text: 'New ways to reuse' },
      { text: 'OK', clickable: true },
      { text: 'Manage settings' },
    ]),
    { prompt: 'new-ways-to-reuse', buttonText: 'OK' },
  );
  assert.equal(
    instagramOnboardingDismissAction([{ description: 'Add audio' }]),
    null,
  );
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

test('a confirmed publication skips media regeneration while retryable states keep it', () => {
  assert.equal(publicationStateRequiresGeneration({ status: 'published' }), false);
  assert.equal(publicationStateRequiresGeneration({ status: 'failed-before-share' }), true);
  assert.equal(publicationStateRequiresGeneration({ status: 'verification-required' }), true);
  assert.equal(publicationStateRequiresGeneration({}), true);
});

test('actual publishing rejects a non-current date unless explicitly overridden', () => {
  assert.equal(canPublishReelDate({
    date: '2026-08-23',
    today: '2026-08-23',
  }), true);
  assert.equal(canPublishReelDate({
    date: '2026-08-22',
    today: '2026-08-23',
  }), false);
  assert.equal(canPublishReelDate({
    date: '2026-08-22',
    today: '2026-08-23',
    dryRun: true,
  }), true);
  assert.equal(canPublishReelDate({
    date: '2026-08-22',
    today: '2026-08-23',
    allowNoncurrentDate: true,
  }), true);
});

test('post-share uncertainty is reported as confirmation pending instead of failure', () => {
  const pending = buildPublicationProblemNotification({
    date: '2026-08-13',
    elapsedSeconds: '816.9',
    errorMessage: 'Profile count did not confirm publication.',
    state: { status: 'verification-required' },
  });
  assert.equal(pending.title, 'Rhythmjoy Instagram 확인 대기');
  assert.match(pending.message, /공유 완료 · 게시 확인 대기/);
  assert.doesNotMatch(pending.message, /자동화 실패/);

  const failed = buildPublicationProblemNotification({
    date: '2026-08-13',
    elapsedSeconds: '20.0',
    errorMessage: 'Instagram is not installed.',
    state: { status: 'failed-before-share' },
  });
  assert.equal(failed.title, 'Rhythmjoy Instagram 오류');
  assert.match(failed.message, /자동화 실패/);
});
