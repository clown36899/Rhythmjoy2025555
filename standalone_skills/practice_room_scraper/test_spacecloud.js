const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto('https://www.spacecloud.kr/', { waitUntil: 'networkidle' });
  await page.screenshot({ path: 'spacecloud_home.png' });
  await browser.close();
})();
