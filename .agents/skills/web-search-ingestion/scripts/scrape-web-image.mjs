import { chromium } from 'playwright';
import path from 'path';
import fs from 'fs';

// 실행 예시: node scrape-web-image.mjs "URL" "OUTPUT_PATH"
const args = process.argv.slice(2);
if (args.length < 2) {
  console.error('Usage: node scrape-web-image.mjs <SOURCE_URL> <OUTPUT_PATH>');
  process.exit(1);
}

const sourceUrl = args[0];
const outputPath = path.resolve(args[1]);

// 포스터 이미지 CDN 도메인 판별
function isPosterCdnUrl(url) {
  if (!url || !url.startsWith('http')) return false;
  const skip = ['logo', 'icon', 'profile', 'avatar', 'button', 'banner', 'promo', 'gnb', 'svg', 'adimg', 'searchad'];
  if (skip.some(p => url.toLowerCase().includes(p))) return false;
  return url.includes('cafeptthumb') || url.includes('postfiles') ||
         url.includes('daumcdn.net') || url.includes('kakaocdn.net') ||
         url.includes('cdninstagram.com') || url.includes('fbcdn.net');
}

(async () => {
  console.log(`[Scraper] ⚡️ 수집 시작: ${sourceUrl}`);

  const ANTI_BOT_ARGS = ['--disable-blink-features=AutomationControlled', '--no-first-run', '--no-default-browser-check'];

  let context;
  try {
    const CHROME_PROFILE = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
    context = await chromium.launchPersistentContext(CHROME_PROFILE, {
      channel: 'chrome', headless: false, slowMo: 50, args: ANTI_BOT_ARGS,
      viewport: { width: 1280, height: 1000 }
    });
  } catch {
    const b = await chromium.launch({ channel: 'chrome', headless: false, args: ANTI_BOT_ARGS });
    context = await b.newContext({ viewport: { width: 1280, height: 1000 } });
  }

  try {
    const page = await context.newPage();

    // 이미지 응답 버퍼를 크기 순으로 수집
    const capturedImages = []; // { url, buffer, size }

    context.on('response', async (response) => {
      try {
        const url = response.url();
        const contentType = response.headers()['content-type'] || '';
        if (!contentType.startsWith('image/') || !isPosterCdnUrl(url)) return;
        const buffer = await response.body();
        if (buffer.length < 10000) return; // 10KB 미만 스킵 (썸네일/아이콘)
        capturedImages.push({ url, buffer, size: buffer.length });
        console.log(`[Scraper] 📥 캡처: ${Math.round(buffer.length/1024)}KB ${url.substring(0, 80)}`);
      } catch {
        // 응답 body 읽기 실패는 무시
      }
    });

    await page.goto(sourceUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);
    try { await page.keyboard.press('Escape'); } catch {}

    // 스크롤로 lazy load 이미지 강제 로드
    await page.evaluate(() => window.scrollBy(0, 800));
    await page.waitForTimeout(2000);

    if (capturedImages.length === 0) {
      // iframe 내부 스크롤 시도
      const frames = page.frames();
      for (const frame of frames) {
        await frame.evaluate(() => window.scrollBy(0, 500)).catch(() => {});
      }
      await page.waitForTimeout(1500);
    }

    console.log(`[Scraper] 📊 수집된 이미지: ${capturedImages.length}개`);

    if (capturedImages.length > 0) {
      // 가장 큰 이미지 = 포스터 원본
      capturedImages.sort((a, b) => b.size - a.size);
      const best = capturedImages[0];
      fs.writeFileSync(outputPath, best.buffer);
      console.log(`[Scraper] ✅ CDN 원본 저장: ${Math.round(best.size/1024)}KB → ${path.basename(outputPath)}`);
      console.log(`[Scraper] 🔗 소스 URL: ${best.url}`);
      return;
    }

    // Fallback: DOM에서 img src 추출 후 curl
    console.log('[Scraper] ⚠️ 버퍼 캡처 실패 → DOM img src 시도');
    let domImgUrl = null;
    for (const frame of page.frames()) {
      const url = await frame.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img'));
        const found = imgs.find(img =>
          img.naturalWidth > 300 && img.src && img.src.startsWith('http') &&
          (img.src.includes('cafeptthumb') || img.src.includes('postfiles') ||
           img.src.includes('daumcdn') || img.src.includes('kakaocdn') || img.src.includes('pstatic'))
        );
        return found ? found.src : null;
      }).catch(() => null);
      if (url) { domImgUrl = url; break; }
    }

    if (domImgUrl) {
      console.log(`[Scraper] 🔗 DOM img: ${domImgUrl.substring(0, 100)}`);
      // Playwright로 직접 fetch (세션 쿠키 포함)
      const res = await page.evaluate(async (url) => {
        const r = await fetch(url);
        const ab = await r.arrayBuffer();
        return Array.from(new Uint8Array(ab));
      }, domImgUrl);
      const buf = Buffer.from(res);
      if (buf.length > 10000) {
        fs.writeFileSync(outputPath, buf);
        console.log(`[Scraper] ✅ DOM fetch 저장: ${Math.round(buf.length/1024)}KB`);
        return;
      }
    }

    // 최종 Fallback: 스크린샷
    console.log('[Scraper] ⚠️ 최종 fallback → 스크린샷');
    await page.screenshot({ path: outputPath, type: 'png' });
    console.log(`[Scraper] ✅ 스크린샷 저장: ${outputPath}`);

  } catch (err) {
    console.error(`[Scraper] ❌ 오류: ${err.message}`);
    process.exit(1);
  } finally {
    await context.close();
  }
})();
