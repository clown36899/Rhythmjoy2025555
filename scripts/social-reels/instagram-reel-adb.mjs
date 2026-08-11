import { execFile, spawn } from 'node:child_process';
import {
  mkdir,
  open,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const artifactRoot = path.join(repositoryRoot, 'artifacts/social-reels');
const instagramPackage = 'com.instagram.android';
const expectedAccount = process.env.INSTAGRAM_ACCOUNT || 'korea_swing_social';
const adbPath = process.env.ADB_PATH || '/opt/homebrew/bin/adb';
const emulatorPath = process.env.ANDROID_EMULATOR_PATH
  || path.join(process.env.USERPROFILE || process.env.HOME || '', 'Library/Android/sdk/emulator/emulator');
const avdName = process.env.ANDROID_AVD_NAME || 'Medium_Phone';
const pollIntervalMs = 700;
const normalTimeoutMs = 30_000;
const lockMaxAgeMs = 30 * 60 * 1000;
let activeAdbSerial = process.env.ANDROID_SERIAL || '';

export const JAZZ_TRACKS = Object.freeze([
  { title: 'Take Five', artist: 'Dave Brubeck' },
  { title: 'Like It Is', artist: 'Erroll Garner' },
  { title: 'Teo', artist: 'Miles Davis' },
  { title: 'Sunday', artist: 'Ben Webster, Oscar Peterson' },
  { title: 'Do What You Wanna', artist: 'Ramsey Lewis' },
  { title: 'So What', artist: 'Miles Davis' },
]);

function parseArguments(argv) {
  const values = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [key, ...parts] = argument.slice(2).split('=');
    values[key] = parts.length ? parts.join('=') : true;
  }
  return values;
}

function todayInKorea() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function decodeXml(value) {
  return String(value)
    .replaceAll('&quot;', '"')
    .replaceAll('&apos;', "'")
    .replaceAll('&lt;', '<')
    .replaceAll('&gt;', '>')
    .replaceAll('&amp;', '&');
}

export function parseUiNodes(xml) {
  const nodes = [];
  for (const match of xml.matchAll(/<node\b([^>]*)>/g)) {
    const attributes = {};
    for (const attribute of match[1].matchAll(/([\w-]+)="([^"]*)"/g)) {
      attributes[attribute[1]] = decodeXml(attribute[2]);
    }
    const boundsMatch = attributes.bounds?.match(
      /^\[(\d+),(\d+)]\[(\d+),(\d+)]$/,
    );
    nodes.push({
      ...attributes,
      text: attributes.text || '',
      description: attributes['content-desc'] || '',
      resourceId: attributes['resource-id'] || '',
      clickable: attributes.clickable === 'true',
      selected: attributes.selected === 'true',
      bounds: boundsMatch
        ? {
          left: Number(boundsMatch[1]),
          top: Number(boundsMatch[2]),
          right: Number(boundsMatch[3]),
          bottom: Number(boundsMatch[4]),
        }
        : null,
    });
  }
  return nodes;
}

export function chooseNextTrack(history, tracks = JAZZ_TRACKS) {
  const last = history.at(-1);
  const lastIndex = tracks.findIndex(
    (track) => track.title === last?.title && track.artist === last?.artist,
  );
  const startIndex = lastIndex >= 0 ? (lastIndex + 1) % tracks.length : 0;
  return tracks.map((_, offset) => tracks[(startIndex + offset) % tracks.length]);
}

async function run(command, args, options = {}) {
  const {
    timeout = 60_000,
    encoding = 'utf8',
    maxBuffer = 20 * 1024 * 1024,
  } = options;
  try {
    return await execFileAsync(command, args, { timeout, encoding, maxBuffer });
  } catch (error) {
    const detail = error.stderr?.toString().trim() || error.stdout?.toString().trim();
    throw new Error(
      `${command} ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`,
      { cause: error },
    );
  }
}

async function adb(args, options = {}) {
  const scopedArgs = activeAdbSerial && args[0] !== 'devices'
    ? ['-s', activeAdbSerial, ...args]
    : args;
  return run(adbPath, scopedArgs, options);
}

async function adbShell(...args) {
  return adb(['shell', ...args]);
}

async function writeJsonAtomically(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporaryPath, filePath);
}

async function readJson(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function processIsRunning(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function acquireLock(lockPath) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const handle = await open(lockPath, 'wx');
      await handle.writeFile(`${JSON.stringify({
        pid: process.pid,
        createdAt: new Date().toISOString(),
      })}\n`);
      return handle;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const existing = await readJson(lockPath, {});
      const lockStats = await stat(lockPath).catch(() => null);
      const ageMs = lockStats ? Date.now() - lockStats.mtimeMs : Number.POSITIVE_INFINITY;
      if (processIsRunning(existing.pid) && ageMs < lockMaxAgeMs) {
        throw new Error(`Instagram publisher is already running (PID ${existing.pid}).`);
      }
      await unlink(lockPath);
    }
  }
  throw new Error('Could not acquire the Instagram publisher lock.');
}

async function releaseLock(lockPath, handle) {
  await handle?.close().catch(() => {});
  await unlink(lockPath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  });
}

export function parseAdbDevices(output = '') {
  return String(output)
    .split(/\r?\n/)
    .slice(1)
    .map((line) => line.trim().split(/\s+/))
    .filter(([serial, state]) => serial && state)
    .map(([serial, state]) => ({ serial, state }));
}

export function emulatorLaunchArguments(targetAvdName = avdName) {
  return [
    '-avd', targetAvdName,
    '-no-audio',
    '-no-snapshot-load',
    '-no-snapshot-save',
  ];
}

export function selectTargetEmulatorSerial(
  emulatorStates,
  targetAvdName = avdName,
) {
  const matches = emulatorStates.filter((emulator) => (
    emulator.state === 'device'
    && emulator.serial.startsWith('emulator-')
    && emulator.avdName === targetAvdName
  ));
  if (matches.length > 1) {
    throw new Error(
      `Multiple running emulators use the Instagram AVD name ${targetAvdName}.`,
    );
  }
  return matches[0]?.serial || '';
}

export function isInstalledPackagePath(output = '') {
  return String(output).trim().startsWith('package:');
}

async function installedPackagePath(packageName) {
  try {
    return (await adbShell('pm', 'path', packageName)).stdout.trim();
  } catch (error) {
    const commandFailedWithoutDiagnostic = error.cause?.code === 1
      && !error.cause?.stdout?.toString().trim()
      && !error.cause?.stderr?.toString().trim();
    if (commandFailedWithoutDiagnostic) return '';
    throw error;
  }
}

async function findTargetEmulatorSerial() {
  const { stdout } = await run(adbPath, ['devices']);
  const onlineEmulators = parseAdbDevices(stdout)
    .filter(({ serial, state }) => state === 'device' && serial.startsWith('emulator-'));
  const emulatorStates = [];

  for (const emulator of onlineEmulators) {
    try {
      const { stdout: runningAvdName } = await run(
        adbPath,
        ['-s', emulator.serial, 'emu', 'avd', 'name'],
        { timeout: 5_000 },
      );
      emulatorStates.push({
        ...emulator,
        avdName: runningAvdName.trim().split(/\r?\n/)[0],
      });
    } catch {
      // Continue checking other online emulators.
    }
  }

  return selectTargetEmulatorSerial(emulatorStates);
}

async function ensureEmulator() {
  activeAdbSerial = await findTargetEmulatorSerial();
  if (!activeAdbSerial) {
    const child = spawn(emulatorPath, emulatorLaunchArguments(), {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();

    const deviceDeadline = Date.now() + 120_000;
    while (Date.now() < deviceDeadline && !activeAdbSerial) {
      await wait(1_000);
      activeAdbSerial = await findTargetEmulatorSerial();
    }
    if (!activeAdbSerial) {
      throw new Error(`Android emulator ${avdName} did not appear in adb devices.`);
    }
  }

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const bootCompleted = (await adbShell('getprop', 'sys.boot_completed'))
      .stdout.trim();
    if (bootCompleted === '1') break;
    await wait(1_500);
  }
  const bootCompleted = (await adbShell('getprop', 'sys.boot_completed')).stdout.trim();
  if (bootCompleted !== '1') throw new Error('Android emulator did not finish booting.');

  const runningAvdName = (await adb(['emu', 'avd', 'name'], { timeout: 5_000 }))
    .stdout.trim().split(/\r?\n/)[0];
  if (runningAvdName !== avdName) {
    throw new Error(`Wrong Instagram AVD selected: ${runningAvdName || 'unknown'} (${activeAdbSerial}).`);
  }
  const instagramPackagePath = await installedPackagePath(instagramPackage);
  if (!isInstalledPackagePath(instagramPackagePath)) {
    throw new Error(
      `Instagram is missing from ${runningAvdName} (${activeAdbSerial}). `
      + 'Package Manager is the source of truth; restore the app and login under a cold boot.',
    );
  }
  const health = {
    status: 'instagram-emulator-ready',
    avdName: runningAvdName,
    adbSerial: activeAdbSerial,
    instagramPackage: instagramPackage,
    instagramPackagePath,
    snapshotLoadDisabled: true,
  };
  console.log(JSON.stringify(health));

  await adbShell('svc', 'power', 'stayon', 'true');
  await adbShell('settings', 'put', 'system', 'screen_off_timeout', '2147483647');
  await adbShell('input', 'keyevent', 'KEYCODE_WAKEUP');
  await adbShell('wm', 'dismiss-keyguard').catch(() => {});
  return health;
}

async function dumpUi() {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await adbShell(
        'uiautomator',
        'dump',
        '--compressed',
        '/sdcard/rhythmjoy-ui.xml',
      );
      const { stdout } = await adb(
        ['exec-out', 'cat', '/sdcard/rhythmjoy-ui.xml'],
        { maxBuffer: 10 * 1024 * 1024 },
      );
      return parseUiNodes(stdout);
    } catch (error) {
      lastError = error;
      if (attempt < 3) await wait(500 * attempt);
    }
  }
  throw lastError;
}

function matches(node, selector) {
  if (selector.resourceId && node.resourceId !== selector.resourceId) return false;
  if (selector.resourceIdEndsWith && !node.resourceId.endsWith(selector.resourceIdEndsWith)) {
    return false;
  }
  if (selector.text && node.text !== selector.text) return false;
  if (selector.textIncludes && !node.text.includes(selector.textIncludes)) return false;
  if (selector.description && node.description !== selector.description) return false;
  if (
    selector.descriptionStartsWith
    && !node.description.startsWith(selector.descriptionStartsWith)
  ) return false;
  if (selector.descriptionIncludes && !node.description.includes(selector.descriptionIncludes)) {
    return false;
  }
  if (selector.clickable !== undefined && node.clickable !== selector.clickable) return false;
  return Boolean(node.bounds);
}

async function waitForNode(selector, options = {}) {
  const timeout = options.timeout || normalTimeoutMs;
  const deadline = Date.now() + timeout;
  let lastNodes = [];
  while (Date.now() < deadline) {
    lastNodes = await dumpUi();
    const node = lastNodes.find((candidate) => matches(candidate, selector));
    if (node) return { node, nodes: lastNodes };
    await wait(pollIntervalMs);
  }
  const visible = lastNodes
    .filter((node) => node.text || node.description)
    .slice(-25)
    .map((node) => node.text || node.description);
  throw new Error(
    `Timed out waiting for ${JSON.stringify(selector)}. Visible: ${visible.join(' | ')}`,
  );
}

async function waitForAny(selectors, options = {}) {
  const timeout = options.timeout || normalTimeoutMs;
  const deadline = Date.now() + timeout;
  let lastNodes = [];
  while (Date.now() < deadline) {
    lastNodes = await dumpUi();
    for (const selector of selectors) {
      const node = lastNodes.find((candidate) => matches(candidate, selector));
      if (node) return { node, nodes: lastNodes, selector };
    }
    await wait(pollIntervalMs);
  }
  const visible = lastNodes
    .filter((node) => node.text || node.description)
    .slice(-25)
    .map((node) => node.text || node.description);
  throw new Error(
    `Timed out waiting for any of ${JSON.stringify(selectors)}. Visible: ${visible.join(' | ')}`,
  );
}

async function tapNode(node) {
  if (!node?.bounds) throw new Error('Cannot tap a UI node without bounds.');
  const x = Math.round((node.bounds.left + node.bounds.right) / 2);
  const y = Math.round((node.bounds.top + node.bounds.bottom) / 2);
  await adbShell('input', 'tap', String(x), String(y));
}

async function doubleTapNode(node) {
  if (!node?.bounds) throw new Error('Cannot double tap a UI node without bounds.');
  const x = Math.round((node.bounds.left + node.bounds.right) / 2);
  const y = Math.round((node.bounds.top + node.bounds.bottom) / 2);
  await adb(['shell', `input tap ${x} ${y}; input tap ${x} ${y}`]);
}

async function tapAndWait(selector, nextSelector, options = {}) {
  const { node } = await waitForNode(selector, options);
  await tapNode(node);
  return waitForNode(nextSelector, options);
}

async function screenshot(filePath) {
  const { stdout } = await adb(
    ['exec-out', 'screencap', '-p'],
    { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024 },
  );
  await writeFile(filePath, stdout);
}

async function pushMedia(localPath, remotePath) {
  await adbShell('mkdir', '-p', path.posix.dirname(remotePath));
  await adb(['push', localPath, remotePath], { timeout: 60_000 });
  await adbShell('touch', remotePath);
  await adbShell(
    'am',
    'broadcast',
    '-a',
    'android.intent.action.MEDIA_SCANNER_SCAN_FILE',
    '-d',
    `file://${remotePath}`,
  );
}

export function initialInstagramPermissionAction(nodes = []) {
  const visibleText = nodes
    .map((node) => node.text || node.description)
    .filter(Boolean);
  if (visibleText.some((value) => value.includes('access photos and videos'))) {
    return { prompt: 'media', buttonText: 'Allow all' };
  }
  if (visibleText.some((value) => (
    value.includes('take pictures and record video')
    || value.includes('record audio')
    || value.includes('send you notifications')
  ))) {
    return { prompt: 'nonessential-permission', buttonText: 'Don’t allow' };
  }
  return null;
}

export function instagramOnboardingDismissAction(nodes = []) {
  const visibleText = nodes
    .map((node) => node.text || node.description)
    .filter(Boolean);
  if (
    visibleText.includes('Create a sticker')
    && visibleText.includes('Not now')
  ) {
    return { prompt: 'create-a-sticker', buttonText: 'Not now' };
  }
  if (
    visibleText.includes('New ways to reuse')
    && visibleText.includes('OK')
  ) {
    return { prompt: 'new-ways-to-reuse', buttonText: 'OK' };
  }
  return null;
}

async function dismissInitialPermissionPrompts(timeout = 60_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const nodes = await dumpUi();
    if (nodes.some((node) => matches(node, { description: 'Profile' }))) return;
    const action = initialInstagramPermissionAction(nodes);
    if (action) {
      const button = nodes.find((node) => node.text === action.buttonText);
      if (!button) {
        throw new Error(
          `Instagram ${action.prompt} permission prompt is missing ${action.buttonText}.`,
        );
      }
      await tapNode(button);
      await wait(750);
      continue;
    }
    await wait(pollIntervalMs);
  }
}

async function waitForNodeDismissingPermissions(selector, options = {}) {
  const timeout = options.timeout || normalTimeoutMs;
  const deadline = Date.now() + timeout;
  let lastNodes = [];
  while (Date.now() < deadline) {
    lastNodes = await dumpUi();
    const node = lastNodes.find((candidate) => matches(candidate, selector));
    if (node) return { node, nodes: lastNodes };
    const action = initialInstagramPermissionAction(lastNodes);
    if (action) {
      const button = lastNodes.find((candidate) => candidate.text === action.buttonText);
      if (!button) {
        throw new Error(
          `Instagram ${action.prompt} permission prompt is missing ${action.buttonText}.`,
        );
      }
      await tapNode(button);
      await wait(750);
      continue;
    }
    const onboardingAction = instagramOnboardingDismissAction(lastNodes);
    if (onboardingAction) {
      const button = lastNodes.find((candidate) => (
        candidate.text === onboardingAction.buttonText
        && candidate.clickable
      )) || lastNodes.find((candidate) => candidate.text === onboardingAction.buttonText);
      if (!button) {
        throw new Error(
          `Instagram ${onboardingAction.prompt} prompt is missing ${onboardingAction.buttonText}.`,
        );
      }
      await tapNode(button);
      await wait(750);
      continue;
    }
    await wait(pollIntervalMs);
  }
  const visible = lastNodes
    .filter((node) => node.text || node.description)
    .slice(-25)
    .map((node) => node.text || node.description);
  throw new Error(
    `Timed out waiting for ${JSON.stringify(selector)}. Visible: ${visible.join(' | ')}`,
  );
}

async function dismissOptionalOnboardingPrompt(timeout = 8_000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const nodes = await dumpUi();
    const action = instagramOnboardingDismissAction(nodes);
    if (action) {
      const button = nodes.find((node) => node.text === action.buttonText);
      if (!button) {
        throw new Error(
          `Instagram ${action.prompt} prompt is missing ${action.buttonText}.`,
        );
      }
      await tapNode(button);
      await wait(750);
      return true;
    }
    if (nodes.some((node) => matches(node, { description: 'Add audio' }))) {
      return false;
    }
    await wait(pollIntervalMs);
  }
  return false;
}

export function parseInstagramPostCount(nodes) {
  for (const node of nodes) {
    const match = node.description.match(/^([\d,]+)posts$/);
    if (match) return Number(match[1].replaceAll(',', ''));
  }
  return null;
}

export function publicationNeedsReconciliation(state = {}) {
  return ['sharing', 'verification-required'].includes(state.status);
}

export function publicationCountConfirmsSuccess(state = {}, currentCount) {
  return Number.isInteger(state.postCountBefore)
    && Number.isInteger(currentCount)
    && currentCount > state.postCountBefore;
}

async function openInstagramProfile() {
  await adbShell('am', 'force-stop', instagramPackage);
  await adbShell(
    'monkey',
    '-p',
    instagramPackage,
    '-c',
    'android.intent.category.LAUNCHER',
    '1',
  );
  await dismissInitialPermissionPrompts();
  const { node: profileTab } = await waitForNode(
    { description: 'Profile' },
    { timeout: 60_000 },
  );
  await tapNode(profileTab);
  const { nodes } = await waitForNode(
    { resourceIdEndsWith: ':id/action_bar_title', text: expectedAccount },
    { timeout: 30_000 },
  );
  const postCount = parseInstagramPostCount(nodes);
  if (!Number.isInteger(postCount)) {
    throw new Error('Could not read the Instagram profile post count.');
  }
  return postCount;
}

async function readExpectedProfilePostCountForVerification() {
  await adbShell(
    'am',
    'start',
    '-W',
    '-a',
    'android.intent.action.VIEW',
    '-d',
    `https://www.instagram.com/${expectedAccount}/`,
    instagramPackage,
  );
  const { nodes } = await waitForNodeDismissingPermissions(
    { resourceIdEndsWith: ':id/action_bar_title', text: expectedAccount },
    { timeout: 30_000 },
  );
  const postCount = parseInstagramPostCount(nodes);
  if (!Number.isInteger(postCount)) {
    throw new Error('Could not read the Instagram profile post count during verification.');
  }
  return postCount;
}

async function openNewestVideo() {
  await tapAndWait(
    { description: 'Create New' },
    { description: 'Create new reel' },
  );
  const { node: createReel } = await waitForNode({ description: 'Create new reel' });
  await tapNode(createReel);
  const nextScreen = await waitForAny([
    { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
    { text: 'Start new video' },
  ]);
  if (nextScreen.node.text === 'Start new video') {
    await tapAndWait(
      { text: 'Start new video' },
      { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
    );
  }
  const { nodes } = await waitForNode({
    resourceIdEndsWith: ':id/gallery_grid_item_thumbnail',
    descriptionStartsWith: 'Unselected Video thumbnail created on',
  });
  const newestVideo = nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_grid_item_thumbnail')
      && node.description.startsWith('Unselected Video thumbnail created on'),
  );
  await tapNode(newestVideo);
  await waitForNodeDismissingPermissions(
    { description: 'Next' },
    { timeout: 60_000 },
  );
}

async function searchAndSelectTrack(trackCandidates) {
  await dismissOptionalOnboardingPrompt();
  await tapAndWait(
    { description: 'Add audio' },
    { resourceIdEndsWith: ':id/row_search_edit_text' },
    { timeout: 60_000 },
  );

  for (let index = 0; index < trackCandidates.length; index += 1) {
    const track = trackCandidates[index];
    const { node: searchField } = await waitForNode({
      resourceIdEndsWith: ':id/row_search_edit_text',
    });
    await tapNode(searchField);
    const clearResult = await dumpUi();
    const clearButton = clearResult.find((node) => node.description === 'Clear text');
    if (clearButton) {
      await tapNode(clearButton);
      await wait(300);
    }
    const query = `${track.title} ${track.artist}`.replaceAll(' ', '%s');
    await adbShell('input', 'text', query);

    try {
      const { node: result } = await waitForNode(
        {
          resourceIdEndsWith: ':id/track_container',
          descriptionStartsWith: `Select track ${track.title} by ${track.artist},`,
        },
        { timeout: 12_000 },
      );
      await tapNode(result);
      await tapAndWait(
        { resourceIdEndsWith: ':id/select_button_tap_target' },
        { resourceIdEndsWith: ':id/music_editor_done_button', description: 'Done' },
        { timeout: 20_000 },
      );
      await tapAndWait(
        { resourceIdEndsWith: ':id/music_editor_done_button', description: 'Done' },
        { description: 'Next' },
        { timeout: 20_000 },
      );
      return track;
    } catch (error) {
      if (index === trackCandidates.length - 1) throw error;
    }
  }
  throw new Error('No configured jazz track was available.');
}

async function setCoverAndReachShareScreen() {
  const { node: next } = await waitForNode(
    { description: 'Next' },
    { timeout: 60_000 },
  );
  await tapNode(next);
  const coverEntry = await waitForAny([
    { resourceIdEndsWith: ':id/clip_thumbnail_text', text: 'Edit cover' },
    { description: 'Double tap to edit cover photo' },
  ], { timeout: 60_000 });
  const editCover = coverEntry.node;
  if (editCover.description === 'Double tap to edit cover photo') {
    await doubleTapNode(editCover);
    const { node: editCoverOverlay } = await waitForNode({
      resourceIdEndsWith: ':id/clip_thumbnail_layout',
      clickable: true,
    });
    await tapNode(editCoverOverlay);
  } else {
    await tapNode(editCover);
  }
  await tapAndWait(
    { description: 'Add from camera roll' },
    { resourceIdEndsWith: ':id/gallery_image', descriptionStartsWith: 'Photo thumbnail, Added on' },
  );
  const { nodes } = await waitForNode({
    resourceIdEndsWith: ':id/gallery_image',
    descriptionStartsWith: 'Photo thumbnail, Added on',
  });
  const newestPhoto = nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_image')
      && /^Photo thumbnail, Added on \d+ seconds? ago$/.test(node.description),
  ) || nodes.find(
    (node) => node.resourceId.endsWith(':id/gallery_image')
      && node.description.startsWith('Photo thumbnail, Added on'),
  );
  await tapNode(newestPhoto);
  const { node: done } = await waitForNode(
    { resourceIdEndsWith: ':id/action_bar_button_text', description: 'Done' },
    { timeout: 30_000 },
  );
  await tapNode(done);
  const shareStep = await waitForAny([
    {
      resourceIdEndsWith: ':id/clips_original_audio_nux_sheet_turn_off_and_share_button',
      description: 'Turn off and share',
    },
    { resourceIdEndsWith: ':id/share_button', description: 'Share' },
    { resourceIdEndsWith: ':id/share_button', description: 'Next' },
  ], { timeout: 30_000 });
  if (shareStep.node.description === 'Next') {
    await tapNode(shareStep.node);
    return waitForAny([
      {
        resourceIdEndsWith: ':id/clips_original_audio_nux_sheet_turn_off_and_share_button',
        description: 'Turn off and share',
      },
      { resourceIdEndsWith: ':id/share_button', description: 'Share' },
    ], { timeout: 30_000 });
  }
  return shareStep;
}

async function discardDryRun() {
  let cancelNode = null;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const nodes = await dumpUi();
    cancelNode = nodes.find((node) => matches(node, { description: 'Cancel' }));
    if (cancelNode) break;
    await adbShell('input', 'keyevent', 'KEYCODE_BACK');
    await wait(750);
  }
  if (!cancelNode) {
    await waitForNode({ description: 'Cancel' });
  }
  await tapAndWait(
    { description: 'Cancel' },
    { text: 'Start over' },
  );
  await tapAndWait(
    { text: 'Start over' },
    { resourceIdEndsWith: ':id/gallery_title_text', text: 'New reel' },
  );
  await tapAndWait(
    { resourceIdEndsWith: ':id/gallery_cancel_button', description: 'Back to Home' },
    { description: 'Profile' },
  );
}

async function verifyPostCountIncrement(previousCount, timeout = 10 * 60_000) {
  const deadline = Date.now() + timeout;
  // Leave Instagram enough time to hand the upload to its background worker before
  // navigating away from the newly published reel screen.
  await wait(20_000);
  while (Date.now() < deadline) {
    try {
      const currentCount = await readExpectedProfilePostCountForVerification();
      if (Number.isInteger(currentCount) && currentCount > previousCount) {
        return currentCount;
      }
    } catch {
      // Instagram may still be encoding or uploading; poll again.
    }
    await wait(8_000);
  }
  return null;
}

export async function publishInstagramReel(options = {}) {
  const date = options.date || todayInKorea();
  const dryRun = Boolean(options.dryRun);
  const cleanup = options.cleanup !== false;
  const artifactDirectory = path.resolve(
    options.artifactDirectory || path.join(artifactRoot, date),
  );
  const videoPath = path.resolve(
    options.videoPath || path.join(artifactDirectory, `${date}-social-reel-4k.mp4`),
  );
  const coverPath = path.resolve(
    options.coverPath || path.join(artifactDirectory, `${date}-social-reel-cover-4k.jpg`),
  );
  const publicationStatePath = path.join(artifactDirectory, 'publication-state.json');
  const historyPath = path.join(artifactRoot, 'music-history.json');
  const lockPath = path.join(artifactRoot, '.instagram-publisher.lock');

  await Promise.all([stat(videoPath), stat(coverPath)]);
  await mkdir(artifactDirectory, { recursive: true });
  const previousState = await readJson(publicationStatePath, {});
  if (previousState.status === 'published') {
    return { status: 'already-published', state: previousState };
  }

  const lockHandle = await acquireLock(lockPath);
  const startedAt = new Date();
  try {
    if (publicationNeedsReconciliation(previousState)) {
      await ensureEmulator();
      const currentCount = await readExpectedProfilePostCountForVerification();
      if (publicationCountConfirmsSuccess(previousState, currentCount)) {
        const recoveredAt = new Date();
        const recoveredState = {
          ...previousState,
          status: 'published',
          postCountAfter: currentCount,
          completedAt: recoveredAt.toISOString(),
          recoveredAt: recoveredAt.toISOString(),
          recoveryMethod: 'profile-post-count',
        };
        delete recoveredState.verificationFailedAt;
        delete recoveredState.note;
        await writeJsonAtomically(publicationStatePath, recoveredState);

        if (previousState.selectedTrack) {
          const historyState = await readJson(historyPath, { history: [] });
          const history = historyState.history || [];
          const alreadyRecorded = history.some((entry) => entry.date === date);
          if (!alreadyRecorded) {
            await writeJsonAtomically(historyPath, {
              history: [
                ...history,
                {
                  ...previousState.selectedTrack,
                  date,
                  publishedAt: previousState.shareCommittedAt || recoveredAt.toISOString(),
                  recoveredAt: recoveredAt.toISOString(),
                },
              ].slice(-50),
            });
          }
        }
        return recoveredState;
      }
      if (!options.forceRecovery) {
        throw new Error(
          'A previous Share action remains unconfirmed. The profile count did not increase; '
          + 'automatic retry is blocked to prevent a duplicate.',
        );
      }
    }

    await writeJsonAtomically(publicationStatePath, {
      status: 'preparing',
      date,
      dryRun,
      startedAt: startedAt.toISOString(),
    });
    await ensureEmulator();
    const remoteVideo = `/sdcard/Movies/Rhythmjoy/RHYTHMJOY-${date}-AUTO.mp4`;
    const remoteCover = `/sdcard/Pictures/Rhythmjoy/RHYTHMJOY-${date}-COVER-AUTO.jpg`;
    await pushMedia(videoPath, remoteVideo);
    const postCountBefore = await openInstagramProfile();
    await openNewestVideo();

    const historyState = await readJson(historyPath, {
      history: [{
        title: 'Sunday',
        artist: 'Ben Webster, Oscar Peterson',
        source: 'existing-post-seed',
      }],
    });
    const trackCandidates = chooseNextTrack(historyState.history || []);
    const selectedTrack = await searchAndSelectTrack(trackCandidates);

    await pushMedia(coverPath, remoteCover);
    const finalShareTarget = await setCoverAndReachShareScreen();
    const readyScreenshotPath = path.join(artifactDirectory, 'instagram-share-ready.png');
    await screenshot(readyScreenshotPath);

    if (dryRun) {
      const completedAt = new Date();
      const state = {
        status: 'dry-run-ready',
        date,
        selectedTrack,
        postCountBefore,
        readyScreenshotPath,
        completedAt: completedAt.toISOString(),
        elapsedSeconds: Number(((completedAt - startedAt) / 1000).toFixed(1)),
      };
      await writeJsonAtomically(publicationStatePath, state);
      if (cleanup) await discardDryRun();
      return state;
    }

    const sharingState = {
      status: 'sharing',
      date,
      selectedTrack,
      postCountBefore,
      readyScreenshotPath,
      shareCommittedAt: new Date().toISOString(),
      note: 'Do not automatically retry this date unless the profile is checked first.',
    };
    await writeJsonAtomically(publicationStatePath, sharingState);
    const { node: shareButton } = await waitForNode(finalShareTarget.selector);
    await tapNode(shareButton);

    const postCountAfter = await verifyPostCountIncrement(postCountBefore);
    if (!Number.isInteger(postCountAfter)) {
      const uncertainState = {
        ...sharingState,
        status: 'verification-required',
        verificationFailedAt: new Date().toISOString(),
      };
      await writeJsonAtomically(publicationStatePath, uncertainState);
      throw new Error(
        'Share was tapped, but the profile count did not confirm publication. Automatic retry is blocked.',
      );
    }

    const completedAt = new Date();
    const publishedState = {
      status: 'published',
      date,
      selectedTrack,
      postCountBefore,
      postCountAfter,
      readyScreenshotPath,
      completedAt: completedAt.toISOString(),
      elapsedSeconds: Number(((completedAt - startedAt) / 1000).toFixed(1)),
    };
    await writeJsonAtomically(publicationStatePath, publishedState);
    await writeJsonAtomically(historyPath, {
      history: [
        ...(historyState.history || []),
        {
          ...selectedTrack,
          date,
          publishedAt: completedAt.toISOString(),
        },
      ].slice(-50),
    });
    return publishedState;
  } catch (error) {
    const currentState = await readJson(publicationStatePath, {});
    if (!['sharing', 'verification-required'].includes(currentState.status)) {
      await writeJsonAtomically(publicationStatePath, {
        ...currentState,
        status: 'failed-before-share',
        failedAt: new Date().toISOString(),
        error: error.message,
      });
    }
    throw error;
  } finally {
    await releaseLock(lockPath, lockHandle);
  }
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const result = await publishInstagramReel({
    date: typeof args.date === 'string' ? args.date : undefined,
    dryRun: Boolean(args['dry-run']),
    cleanup: !args['leave-ready'],
    forceRecovery: Boolean(args['force-recovery']),
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
