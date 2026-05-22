import { chromium } from 'playwright';
import { writeFileSync } from 'fs';

async function run() {
  console.log('=== Google Search Debug Start ===');
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-infobars',
      '--disable-extensions',
      '--disable-gpu',
      '--mute-audio',
      '--user-agent=Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ]
  });
  
  const page = await browser.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  const query = '턴라틴바 인스타그램';
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  
  console.log(`Navigating to ${searchUrl}...`);
  try {
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 25000 });
    await page.waitForTimeout(3000);
    
    // 스크린샷 저장
    const screenshotPath = '/Users/inteyeo/Rhythmjoy2025555-5/public/scraped/google_debug_screenshot.png';
    await page.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);
    
    // HTML 바디 내용 저장
    const html = await page.content();
    const htmlPath = '/Users/inteyeo/Rhythmjoy2025555-5/public/scraped/google_debug.html';
    writeFileSync(htmlPath, html, 'utf8');
    console.log(`HTML saved to ${htmlPath}`);
    
    // 결과 검색 셀렉터 테스트
    const selectors = ['div.g', 'div[data-ved]', 'a h3', 'div.v7W4eb', 'div.hlcw3c'];
    for (const sel of selectors) {
      const count = await page.locator(sel).count();
      console.log(`Selector "${sel}" count: ${count}`);
    }
  } catch (err) {
    console.error('Error during google search:', err);
  } finally {
    await browser.close();
  }
}

run().catch(console.error);
