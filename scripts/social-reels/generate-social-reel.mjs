import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import ffmpegStatic from 'ffmpeg-static';
import { chromium } from 'playwright';
import sharp from 'sharp';

import {
  DEFAULT_LAYOUT,
  calculateSocialReelLayout,
  fallbackTargetForDate,
} from './layout.mjs';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(scriptDirectory, '../..');
const FRAME_WIDTH = DEFAULT_LAYOUT.frameWidth;
const FRAME_HEIGHT = DEFAULT_LAYOUT.frameHeight;
const RENDER_SCALE = 2;
const RENDER_WIDTH = FRAME_WIDTH * RENDER_SCALE;
const RENDER_HEIGHT = FRAME_HEIGHT * RENDER_SCALE;
const SAFE_CONTENT_HEIGHT_RATIO = 0.9;
const CAPTURE_VIEWPORT = { width: 390, height: 844 };
const DEVICE_SCALE_FACTOR = 5;
const CALENDAR_URL = 'https://swingenjoy.com/calendar';
const MOBILE_USER_AGENT = [
  'Mozilla/5.0 (Linux; Android 14; Pixel 8 Pro)',
  'AppleWebKit/537.36 (KHTML, like Gecko)',
  'Chrome/138.0.0.0 Mobile Safari/537.36',
].join(' ');

function parseArguments(argv) {
  const values = {};
  for (const argument of argv) {
    if (!argument.startsWith('--')) continue;
    const [key, ...parts] = argument.slice(2).split('=');
    values[key] = parts.length ? parts.join('=') : true;
  }
  return values;
}

function localDateParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(
    formatter.formatToParts(date)
      .filter((part) => part.type !== 'literal')
      .map((part) => [part.type, part.value]),
  );
  return {
    iso: `${parts.year}-${parts.month}-${parts.day}`,
    day: Number(parts.day),
  };
}

function parseKoreanDate(value) {
  if (!value) return null;
  const parsed = new Date(`${value}T12:00:00+09:00`);
  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Invalid --date value: ${value}`);
  }
  return parsed;
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function polygonPoints(points) {
  return points.map(({ x, y }) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
}

function makeLabelSvg(layout, text) {
  const { x, y, width, height } = layout.label;
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${RENDER_WIDTH}"
      height="${RENDER_HEIGHT}"
      viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}"
    >
      <rect
        x="${x}"
        y="${y}"
        width="${width}"
        height="${height}"
        rx="20"
        ry="20"
        fill="#ffffff"
        stroke="#d7d7d7"
        stroke-width="4"
      />
      <text
        x="${x + width / 2}"
        y="${y + height / 2 + 38}"
        text-anchor="middle"
        font-family="Apple SD Gothic Neo, Nanum Gothic, sans-serif"
        font-size="${DEFAULT_LAYOUT.labelFontSize}"
        font-weight="${DEFAULT_LAYOUT.labelFontWeight}"
        fill="#111111"
      >${escapeXml(text)}</text>
    </svg>
  `;
}

function makeArrowSvg(layout) {
  const points = polygonPoints(layout.arrow.polygon);
  return `
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="${RENDER_WIDTH}"
      height="${RENDER_HEIGHT}"
      viewBox="0 0 ${FRAME_WIDTH} ${FRAME_HEIGHT}"
    >
      <polygon
        points="${points}"
        fill="#35a9e8"
        stroke="#ffffff"
        stroke-width="${DEFAULT_LAYOUT.arrowOuterStroke}"
        stroke-linejoin="round"
      />
      <polygon
        points="${points}"
        fill="#35a9e8"
        stroke="#17689f"
        stroke-width="${DEFAULT_LAYOUT.arrowInnerStroke}"
        stroke-linejoin="round"
      />
    </svg>
  `;
}

async function run(command, args) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with code ${code}`));
    });
  });
}

async function captureCalendar(rawScreenshotPath) {
  const executablePath = process.env.CHROME_PATH
    || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const browser = await chromium.launch({ headless: true, executablePath });
  try {
    const page = await browser.newPage({
      viewport: CAPTURE_VIEWPORT,
      deviceScaleFactor: DEVICE_SCALE_FACTOR,
      isMobile: true,
      hasTouch: true,
      userAgent: MOBILE_USER_AGENT,
      locale: 'ko-KR',
      colorScheme: 'dark',
    });
    await page.goto(CALENDAR_URL, { waitUntil: 'networkidle', timeout: 60_000 });
    await page.getByRole('button', { name: '오늘', exact: true }).click();
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1_200);

    const todayItem = page.locator('.calendar-sticky-weekday-item.is-today');
    await todayItem.waitFor({ state: 'visible', timeout: 15_000 });
    const dateBox = await todayItem.locator('.calendar-sticky-date-text').boundingBox();
    if (!dateBox) throw new Error('Could not measure the blue today date marker.');

    await page.screenshot({ path: rawScreenshotPath, type: 'png', fullPage: false });
    return {
      cssTarget: {
        x: dateBox.x + dateBox.width / 2,
        y: dateBox.y + dateBox.height / 2,
      },
    };
  } finally {
    await browser.close();
  }
}

async function prepareBackground(rawScreenshotPath, backgroundPath, cssTarget) {
  const metadata = await sharp(rawScreenshotPath).metadata();
  const rawWidth = metadata.width;
  const rawHeight = metadata.height;
  if (!rawWidth || !rawHeight) throw new Error('Calendar screenshot dimensions are missing.');

  const safeContentHeight = Math.round(
    RENDER_HEIGHT * SAFE_CONTENT_HEIGHT_RATIO / 2,
  ) * 2;
  const fitScale = Math.min(RENDER_WIDTH / rawWidth, safeContentHeight / rawHeight);
  const renderedWidth = Math.round(rawWidth * fitScale);
  const renderedHeight = Math.round(rawHeight * fitScale);
  const padX = Math.floor((RENDER_WIDTH - renderedWidth) / 2);
  const padY = Math.floor((RENDER_HEIGHT - renderedHeight) / 2);
  const topSafeMargin = Math.floor((RENDER_HEIGHT - safeContentHeight) / 2);
  const bottomSafeMargin = RENDER_HEIGHT - safeContentHeight - topSafeMargin;

  await sharp(rawScreenshotPath)
    .resize({
      width: RENDER_WIDTH,
      height: safeContentHeight,
      fit: 'contain',
      background: '#111312',
      kernel: sharp.kernel.lanczos3,
    })
    .sharpen({ sigma: 0.8 })
    .extend({
      top: topSafeMargin,
      bottom: bottomSafeMargin,
      background: '#111312',
    })
    .png()
    .toFile(backgroundPath);

  return {
    x: (padX + cssTarget.x * DEVICE_SCALE_FACTOR * fitScale) / RENDER_SCALE,
    y: (padY + cssTarget.y * DEVICE_SCALE_FACTOR * fitScale) / RENDER_SCALE,
    source: 'calendar-dom',
  };
}

async function encodeVideo({
  backgroundPath,
  labelPath,
  arrowPath,
  outputPath,
  layout,
}) {
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
  const { unit, motionDistance, motionPeriodSeconds } = layout.arrow;
  const motion = `sin(2*PI*t/${motionPeriodSeconds})`;
  const arrowX = `${(unit.x * motionDistance * RENDER_SCALE).toFixed(4)}*${motion}`;
  const arrowY = `${(unit.y * motionDistance * RENDER_SCALE).toFixed(4)}*${motion}`;
  const filter = [
    '[0:v]fps=30,format=rgba[bg]',
    '[1:v]format=rgba[label]',
    '[2:v]format=rgba[arrow]',
    '[bg][label]overlay=0:0:format=auto[with_label]',
    `[with_label][arrow]overlay=x='${arrowX}':y='${arrowY}':eval=frame:format=auto[composite]`,
    `[composite]scale=${RENDER_WIDTH}:${RENDER_HEIGHT}:flags=lanczos:in_range=pc:out_range=tv:out_color_matrix=bt709,format=yuv420p,setparams=range=limited:color_primaries=bt709:color_trc=bt709:colorspace=bt709[video]`,
  ].join(';');

  await run(ffmpegPath, [
    '-y',
    '-loop', '1', '-framerate', '30', '-i', backgroundPath,
    '-loop', '1', '-framerate', '30', '-i', labelPath,
    '-loop', '1', '-framerate', '30', '-i', arrowPath,
    '-filter_complex', filter,
    '-map', '[video]',
    '-t', '15',
    '-r', '30',
    '-an',
    '-c:v', 'libx264',
    '-preset', 'slow',
    '-profile:v', 'high',
    '-level:v', '5.1',
    '-crf', '16',
    '-maxrate', '45M',
    '-bufsize', '90M',
    '-g', '60',
    '-x264-params', 'colorprim=bt709:transfer=bt709:colormatrix=bt709:fullrange=off',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

async function extractFrame(videoPath, framePath, seconds = 0) {
  const ffmpegPath = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
  await run(ffmpegPath, [
    '-y',
    '-ss', String(seconds),
    '-i', videoPath,
    '-frames:v', '1',
    '-update', '1',
    '-q:v', '1',
    framePath,
  ]);
}

async function main() {
  const args = parseArguments(process.argv.slice(2));
  const now = localDateParts();
  const requestedDate = parseKoreanDate(args.date) || new Date(`${now.iso}T12:00:00+09:00`);
  const requestedParts = localDateParts(requestedDate);

  if (args['dry-layout']) {
    const target = fallbackTargetForDate(requestedDate);
    console.log(JSON.stringify(calculateSocialReelLayout(target), null, 2));
    return;
  }

  if (requestedParts.iso !== now.iso) {
    throw new Error('Live generation only supports today. Use --dry-layout to test another date.');
  }

  const artifactDirectory = path.resolve(
    args['output-dir'] || path.join(repositoryRoot, 'artifacts/social-reels', now.iso),
  );
  await mkdir(artifactDirectory, { recursive: true });

  const rawScreenshotPath = path.join(artifactDirectory, 'calendar-raw@4x.png');
  const backgroundPath = path.join(artifactDirectory, 'calendar-2160x3840.png');
  const labelPath = path.join(artifactDirectory, 'label-overlay-4k.png');
  const arrowPath = path.join(artifactDirectory, 'arrow-overlay-4k.png');
  const outputPath = path.resolve(
    args.output || path.join(artifactDirectory, `${now.iso}-social-reel-4k.mp4`),
  );
  const coverPath = path.join(artifactDirectory, `${now.iso}-social-reel-cover-4k.jpg`);
  const midpointPath = path.join(artifactDirectory, `${now.iso}-social-reel-midpoint-4k.jpg`);

  const capture = await captureCalendar(rawScreenshotPath);
  const target = await prepareBackground(
    rawScreenshotPath,
    backgroundPath,
    capture.cssTarget,
  );
  const layout = calculateSocialReelLayout(target);
  const label = `${requestedParts.day}일 소셜`;

  await sharp(Buffer.from(makeLabelSvg(layout, label))).png().toFile(labelPath);
  await sharp(Buffer.from(makeArrowSvg(layout))).png().toFile(arrowPath);
  await encodeVideo({ backgroundPath, labelPath, arrowPath, outputPath, layout });
  await extractFrame(outputPath, coverPath, 0);
  await extractFrame(outputPath, midpointPath, 7.5);

  console.log(JSON.stringify({
    status: 'created',
    outputPath,
    coverPath,
    midpointPath,
    resolution: `${RENDER_WIDTH}x${RENDER_HEIGHT}`,
    label,
    target,
    layout,
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
