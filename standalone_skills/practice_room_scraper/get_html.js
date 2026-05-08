const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.spacecloud.kr/', { waitUntil: 'networkidle' });
  const html = await page.content();
  const fs = require('fs');
  fs.writeFileSync('spacecloud_home.html', html);
  await browser.close();
})();
