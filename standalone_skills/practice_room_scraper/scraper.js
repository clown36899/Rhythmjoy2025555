const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);

const fs = require('fs');
const path = require('path');
const os = require('os');

function getExecutablePath() {
  const platform = os.platform();
  if (platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  if (platform === 'win32') return 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
  return '/usr/bin/google-chrome';
}

async function runScraper() {
  const executablePath = getExecutablePath();
  const userDataDir = path.join(os.tmpdir(), 'chrome_scraper_session');

  console.log('🤖 스크래핑 스크립트 시작 (네이버 플레이스 예약 탭 파싱 고도화)');

  const context = await chromium.launchPersistentContext(userDataDir, {
    executablePath,
    headless: false,
    viewport: { width: 400, height: 800 }, // 모바일 뷰 강제
    args: ['--disable-blink-features=AutomationControlled', '--no-sandbox']
  });

  const page = await context.newPage();
  const listData = [];

  page.on('response', async (response) => {
    try {
      const url = response.url();
      if (url.includes('graphql') && url.includes('naver.com')) {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('application/json')) {
          listData.push(await response.json());
        }
      }
    } catch (err) {}
  });

  try {
    console.log('🔗 네이버 플레이스(모바일) 사당역 연습실 검색 페이지로 이동합니다...');
    await page.goto('https://m.place.naver.com/place/list?query=%EC%82%AC%EB%8B%B9%EC%97%AD%20%EC%97%B0%EC%8A%B5%EC%8B%A4', { waitUntil: 'domcontentloaded' });

    console.log('⏳ 리스트 데이터 확보 대기...');
    for (let i = 0; i < 4; i++) {
      await page.mouse.wheel(0, 1500);
      await page.waitForTimeout(1000);
    }

    const practiceRooms = [];
    
    function findSpaces(obj) {
      if (Array.isArray(obj)) {
        obj.forEach(findSpaces);
      } else if (obj !== null && typeof obj === 'object') {
        if (obj.name && obj.id && typeof obj.id === 'string' && obj.id.length > 5) {
           practiceRooms.push({
             id: obj.id,
             상호명: obj.name,
             거리: obj.distance || obj.distanceFromStation || '거리 정보 없음',
             리뷰수: obj.visitorReviewCount || 0
           });
        }
        Object.values(obj).forEach(findSpaces);
      }
    }

    findSpaces(listData);
    
    let uniqueRooms = Array.from(new Set(practiceRooms.map(r => r.id)))
                           .map(id => practiceRooms.find(r => r.id === id));

    console.log(`✅ 리스트 확보 완료: 총 ${uniqueRooms.length}개의 연습실이 발견되었습니다.`);
    if (uniqueRooms.length > 20) {
      console.log('빠른 테스트를 위해 상위 20개만 상세 가격 조회를 진행합니다.');
      uniqueRooms = uniqueRooms.slice(0, 20);
    }

    // 예약(Ticket) 탭에서 정확한 가격만 수집
    for (let i = 0; i < uniqueRooms.length; i++) {
      const room = uniqueRooms[i];
      console.log(`🔍 [${i+1}/${uniqueRooms.length}] ${room.상호명} 시간대별 예약 정보 수집 중...`);
      
      try {
        await page.goto(`https://m.place.naver.com/place/${room.id}/ticket`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500); 
        
        // 텍스트 기반 시간대별 가격 파싱
        const text = await page.evaluate(() => document.body.innerText);
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        
        let exactPrices = [];
        for (let j = 0; j < lines.length; j++) {
           // '원'이 포함된 줄에서 단일 가격(예: 4,000원) 또는 범위(예: 3,000~4,000원) 추출
           const priceMatch = lines[j].match(/([0-9,]+(?:\s*~\s*|-)[0-9,]+원)|([0-9]{1,3}(,[0-9]{3})+원|[0-9]{4,6}원)/);
           if (priceMatch && priceMatch[0]) {
             // 바로 윗줄이 시간대/옵션명일 확률이 높음
             const title = j > 0 ? lines[j-1] : '';
             const price = priceMatch[0];
             
             // 한 줄(lines[j]) 자체가 너무 긴 설명문단인 경우 건너뛰기
             if (lines[j].length > 40) continue;
             
             // 윗줄이 너무 길거나, 쓰레기 데이터면 타이틀 제외
             if (title.length > 1 && title.length < 35 && !title.includes('원') && !title.includes('리뷰') && !title.includes('예약') && !title.includes('쿠폰')) {
                exactPrices.push(`[${title}] ${price}`);
             } else {
                exactPrices.push(price);
             }
           }
        }
        
        if (exactPrices.length > 0) {
          // 중복 제거 후 최대 4개 시간대까지 표시
          const uniquePrices = Array.from(new Set(exactPrices));
          room.가격정보 = uniquePrices.slice(0, 4).join(' / ');
        } else {
          // 예약 탭에 없으면 홈 탭에서 요약 검색
          await page.goto(`https://m.place.naver.com/place/${room.id}/home`, { waitUntil: 'domcontentloaded' });
          await page.waitForTimeout(1000);
          const homeText = await page.evaluate(() => document.body.innerText);
          const homePriceMatches = homeText.match(/[0-9]{1,3}(,[0-9]{3})+원|[0-9]{4,6}원/g);
          
          if (homePriceMatches && homePriceMatches.length > 0) {
             const uniqueHomePrices = Array.from(new Set(homePriceMatches));
             room.가격정보 = uniqueHomePrices.slice(0, 3).join(' / ') + ' (시간대 미상)';
          } else {
             room.가격정보 = '예약/가격 정보 없음';
          }
        }
      } catch (e) {
        room.가격정보 = '조회 실패';
      }
    }

    const dataDir = path.join(__dirname, 'data');
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir);
    
    console.log(`\n🎉 모든 시간대별 데이터 추출 완료!`);
    
    const finalData = uniqueRooms.map(r => ({
      상호명: r.상호명,
      사당역_거리: r.거리,
      시간대별가격: r.가격정보,
      리뷰수: r.리뷰수,
      바로가기: `https://m.place.naver.com/place/${r.id}/home` // 뷰어용 링크 추가
    }));
    
    console.table(finalData);
    fs.writeFileSync(path.join(dataDir, `naver_results_${Date.now()}.json`), JSON.stringify(finalData, null, 2), 'utf-8');

  } catch (error) {
    console.error('❌ 스크래핑 중 오류 발생:', error);
  } finally {
    console.log('🛑 브라우저를 닫습니다.');
    await context.close();
  }
}

runScraper();
