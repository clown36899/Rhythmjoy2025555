import { chromium } from 'playwright';

async function getInstagramCaptionsViaGoogle(page, query, name) {
  console.log(`\n▶ [${name}] 구글 자연어 검색 탐색 중 (query: ${query})...`);
  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(query)}`;
  
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await page.waitForTimeout(3000);
    
    // 구글 검색 결과 항목들 파싱
    const results = await page.evaluate(() => {
      const items = [];
      const searchBlocks = Array.from(document.querySelectorAll('div.g'));
      
      for (const block of searchBlocks) {
        const linkEl = block.querySelector('a');
        const titleEl = block.querySelector('h3');
        const snippetEl = block.querySelector('.VwiC3b, .yDsk6d, div[style*="-webkit-line-clamp"]');
        
        if (linkEl && titleEl) {
          items.push({
            href: linkEl.href,
            title: titleEl.innerText?.trim() || '',
            snippet: snippetEl?.innerText?.trim() || ''
          });
        }
      }
      return items;
    });
    
    // 인스타그램 링크 필터링
    const igResults = results.filter(item => item.href.includes('instagram.com'));
    
    console.log(`  구글 검색 결과 수: ${results.length} (인스타그램: ${igResults.length})`);
    for (let i = 0; i < igResults.length; i++) {
      const item = igResults[i];
      console.log(`  [포스트 ${i+1}] ${item.href}`);
      console.log(`  제목: ${item.title}`);
      console.log(`  스니펫: ${item.snippet.substring(0, 150).replace(/\n/g, ' ')}...`);
    }
    return igResults;
  } catch (e) {
    console.error(`❌ [${name}] 구글 탐색 중 오류:`, e.message);
    return [];
  }
}

async function run() {
  console.log('=== Real Instagram Dance Account Captions Test (Google Search Bypass V2) ===');
  
  const ANTI_BOT_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-extensions',
    '--disable-gpu',
    '--mute-audio',
  ];

  const browser = await chromium.launch({
    headless: true,
    args: ANTI_BOT_ARGS
  });
  
  const page = await browser.newPage();
  
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  });

  // 살사바, 탱고바, WCS 대표 인스타그램 계정 탐색 (구글 자연어 검색 우회)
  await getInstagramCaptionsViaGoogle(page, '턴라틴바 인스타그램', '턴라틴바 (살사/바차타)');
  await getInstagramCaptionsViaGoogle(page, '엘땅고 인스타그램', '엘땅고 (탱고)');
  await getInstagramCaptionsViaGoogle(page, '코리아웨스티스 인스타그램', '코리아웨스티스 (WCS)');

  await browser.close();
  console.log('\n=== Instagram Diagnostic Finished ===');
}

run().catch(console.error);
