import { chromium } from 'playwright';

const browser = await chromium.launch({ headless: false, slowMo: 300 });
const page = await browser.newPage();

await page.goto('https://www.instagram.com/happyhall2004/p/DWBA5q3EfBn/', {
  waitUntil: 'domcontentloaded', timeout: 15000
});
await page.waitForTimeout(3000);
try { await page.keyboard.press('Escape'); } catch(e) {}
await page.waitForTimeout(1000);

// article 전체 텍스트 덤프
const articleText = await page.$eval('article', el => el.innerText).catch(() => '');
console.log('=== article.innerText ===');
console.log(articleText.substring(0, 500));

// 모든 h1 텍스트
const h1s = await page.$$eval('h1', els => els.map(e => e.innerText?.trim()).filter(Boolean));
console.log('\n=== h1 목록 ===', h1s);

// span들 중 긴 것
const spans = await page.$$eval('span', els =>
  els.map(e => e.innerText?.trim()).filter(t => t && t.length > 20).slice(0, 10)
);
console.log('\n=== span (20자 이상) ===');
spans.forEach((s, i) => console.log(`${i}: ${s.substring(0, 100)}`));

await browser.close();
