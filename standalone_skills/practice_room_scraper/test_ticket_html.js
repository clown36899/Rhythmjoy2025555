const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://m.place.naver.com/place/1127089150/ticket', { waitUntil: 'networkidle' });
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('ticket_dump.html', html);
  await browser.close();
})();
