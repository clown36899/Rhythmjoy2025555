const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.spacecloud.kr/search/space?q=사당역%20연습실', { waitUntil: 'networkidle' });
  const text = await page.evaluate(() => document.body.innerText);
  console.log(text.substring(0, 500));
  await browser.close();
})();
