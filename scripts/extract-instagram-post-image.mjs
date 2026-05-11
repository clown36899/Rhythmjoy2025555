import { chromium } from 'playwright';
import fs from 'node:fs';

const postUrl = process.argv[2];
const outputPath = process.argv[3];

if (!postUrl || !outputPath) {
  console.error('Usage: node scripts/extract-instagram-post-image.mjs <instagram-post-url> <output-file>');
  process.exit(2);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1600, height: 1200 },
  deviceScaleFactor: 2,
});

try {
  await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await page.waitForTimeout(5000);

  const picked = await page.evaluate(() => {
    const badUrl = /(s150x150|p240x240|s240x240|s640x640|stp=c\d)/;
    const candidates = Array.from(document.querySelectorAll('article img, img'))
      .map((img) => {
        const rect = img.getBoundingClientRect();
        const src = img.currentSrc || img.src;
        return {
          src,
          width: img.naturalWidth,
          height: img.naturalHeight,
          alt: img.alt || '',
          score: (img.naturalWidth * img.naturalHeight) + (rect.width * rect.height),
          isBadPreview: badUrl.test(src),
          isProfile: /profile_pic|s150x150/.test(src) || rect.width <= 40 || rect.height <= 40,
        };
      })
      .filter((item) => item.src.includes('cdninstagram') && item.width >= 500 && item.height >= 500 && !item.isProfile)
      .sort((a, b) => Number(a.isBadPreview) - Number(b.isBadPreview) || b.score - a.score);

    return candidates[0] || null;
  });

  if (!picked) throw new Error('No high-resolution Instagram post image found');

  const image = await page.evaluate(async (url) => {
    const response = await fetch(url);
    if (!response.ok) throw new Error(`image fetch failed: ${response.status}`);
    const blob = await response.blob();
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
    return {
      type: blob.type || 'application/octet-stream',
      size: blob.size,
      base64: String(dataUrl).split(',')[1],
    };
  }, picked.src);

  fs.writeFileSync(outputPath, Buffer.from(image.base64, 'base64'));
  console.log(JSON.stringify({
    source: postUrl,
    output: outputPath,
    contentType: image.type,
    size: image.size,
    width: picked.width,
    height: picked.height,
    url: picked.src,
  }, null, 2));
} finally {
  await browser.close();
}
