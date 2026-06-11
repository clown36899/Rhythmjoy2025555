/**
 * Playwright 기반 스윙 이벤트 수집 스크립트
 * swing-daily 프로필 - Instagram + 네이버 카페 + Littly 소스 순회
 */

import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { execSync } from 'child_process';
import { readFileSync } from 'fs';

// 환경변수 로드
function loadEnv() {
  try {
    const env = readFileSync('/Users/inteyeo/Rhythmjoy2025555-5/.env', 'utf8');
    env.split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  } catch {}
  try {
    const env2 = readFileSync('/Users/inteyeo/Rhythmjoy2025555-5/.env.local', 'utf8');
    env2.split('\n').forEach(line => {
      const m = line.match(/^([^#=]+)=(.*)$/);
      if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
    });
  } catch {}
}
loadEnv();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY;
const TODAY = '2026-06-11';
const START_TIME = Date.now();
const MAX_MS = 18 * 60 * 1000; // 18분

let newCount = 0;
let skipCount = 0;
let failedSources = [];

function makeDeterministicId(sourceUrl, date, suffix = '') {
  const raw = `${sourceUrl}|${date}${suffix}`;
  return createHash('md5').update(raw).digest('hex').slice(0, 16);
}

function isTimeUp() {
  return (Date.now() - START_TIME) > MAX_MS;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function uploadToSupabase(imageBuffer, filename, contentType = 'image/jpeg') {
  try {
    const response = await fetch(`${SUPABASE_URL}/storage/v1/object/scraped/${filename}`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': contentType,
        'x-upsert': 'true',
      },
      body: imageBuffer,
    });
    if (response.ok) {
      return `${SUPABASE_URL}/storage/v1/object/public/scraped/${filename}`;
    }
    console.error('Storage upload failed:', response.status, await response.text());
    return null;
  } catch (e) {
    console.error('Upload error:', e.message);
    return null;
  }
}

async function downloadImage(url) {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' }
    });
    if (!res.ok) return null;
    const buf = await res.arrayBuffer();
    return Buffer.from(buf);
  } catch {
    return null;
  }
}

async function checkL3Duplicate(title, date) {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/scraped_events?structured_data->>date=eq.${date}&select=id,structured_data->>title`,
      { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } }
    );
    const data = await res.json();
    if (!Array.isArray(data)) return false;

    function norm(s) { return s.toLowerCase().replace(/[^\w가-힣a-zA-Z0-9]/g, ''); }
    function trigrams(s) {
      s = norm(s);
      if (s.length < 3) return new Set([s]);
      const t = new Set();
      for (let i = 0; i <= s.length - 3; i++) t.add(s.slice(i, i+3));
      return t;
    }
    function ngramSim(a, b) {
      const ta = trigrams(a), tb = trigrams(b);
      if (!ta.size || !tb.size) return 0;
      let inter = 0;
      for (const x of ta) if (tb.has(x)) inter++;
      return inter / (ta.size + tb.size - inter);
    }
    function commonPrefixLen(a, b) {
      const na = norm(a), nb = norm(b);
      let i = 0;
      while (i < Math.min(na.length, nb.length) && na[i] === nb[i]) i++;
      return i;
    }

    for (const row of data) {
      const exTitle = row.title || '';
      const ng = ngramSim(title, exTitle);
      const cp = commonPrefixLen(title, exTitle);
      const n1 = norm(title), n2 = norm(exTitle);
      const s1 = n1.slice(cp), s2 = n2.slice(cp);
      const sfxNg = (s1 && s2) ? ngramSim(s1, s2) : 1.0;
      if (s1.length >= 4 && s2.length >= 4 && sfxNg < 0.3 && cp < n1.length * 0.85) continue;
      if (ng >= 0.55 || (cp >= 5 && ng >= 0.25) || (cp >= 3 && ng >= 0.45)) {
        console.log(`  ⏭ L3 중복: "${title}" ≈ "${exTitle}"`);
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('L3 check error:', e.message);
    return false;
  }
}

async function saveEvent(event) {
  try {
    const resp = await fetch('https://swingenjoy.com/.netlify/functions/scraped-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(event),
    });
    const data = await resp.json();
    if (data && data.count > 0) {
      newCount++;
      console.log(`  ✅ 저장 성공: ${event.structured_data.title} (${event.structured_data.date})`);
      return true;
    } else if (data && data.skipped) {
      skipCount++;
      console.log(`  ⏭ 스킵(중복): ${event.structured_data.title}`);
      return false;
    } else {
      skipCount++;
      console.log(`  ⏭ 응답:`, JSON.stringify(data).slice(0, 100));
      return false;
    }
  } catch (e) {
    console.error('  ❌ 저장 오류:', e.message);
    return false;
  }
}

// Instagram 포스트 수집
async function collectInstagram(page, accountUrl, accountName) {
  console.log(`\n📸 [Instagram] ${accountName}: ${accountUrl}`);
  if (isTimeUp()) { console.log('  ⏰ 시간 초과'); return; }

  try {
    await page.goto(accountUrl, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);

    const content = await page.content();
    if (content.includes('로그인') && content.includes('Instagram에 로그인')) {
      console.log(`  🔒 로그인 필요 - 스킵`);
      failedSources.push(`${accountName}(로그인필요)`);
      return;
    }

    // 포스트 링크 추출
    const posts = await page.evaluate(() => {
      const links = Array.from(document.querySelectorAll('a[href*="/p/"]'));
      return links.slice(0, 6).map(a => ({
        href: a.href,
        img: a.querySelector('img')?.src || ''
      }));
    });

    if (!posts.length) {
      console.log(`  📭 포스트 없음`);
      failedSources.push(`${accountName}(포스트없음)`);
      return;
    }

    console.log(`  📋 포스트 ${posts.length}개 발견`);

    for (const post of posts.slice(0, 4)) {
      if (isTimeUp()) break;
      await sleep(2000);

      try {
        await page.goto(post.href, { waitUntil: 'domcontentloaded', timeout: 20000 });
        await sleep(3000);

        // 포스트 내용 추출
        const postData = await page.evaluate(() => {
          // meta description
          const desc = document.querySelector('meta[name="description"]')?.content || '';
          const ogDesc = document.querySelector('meta[property="og:description"]')?.content || '';
          const title = document.querySelector('meta[property="og:title"]')?.content || '';
          
          // 이미지 찾기
          const imgs = Array.from(document.querySelectorAll('article img, div[role="dialog"] img'))
            .map(img => ({
              src: img.currentSrc || img.src,
              w: img.naturalWidth,
              h: img.naturalHeight,
            }))
            .filter(i => i.w > 400 && i.h > 400 && !i.src.includes('p240x240') && !i.src.includes('s240x240'));
          
          imgs.sort((a, b) => (b.w * b.h) - (a.w * a.h));
          
          return {
            description: desc || ogDesc,
            title,
            imageUrl: imgs[0]?.src || '',
            url: window.location.href,
          };
        });

        const text = postData.description;
        if (!text || text.length < 20) {
          console.log(`  📭 내용 없음: ${post.href}`);
          continue;
        }

        // 날짜 파싱
        const datePatterns = [
          /(\d{4})[\.\-\/](\d{1,2})[\.\-\/](\d{1,2})/g,
          /(\d{1,2})월\s*(\d{1,2})일/g,
          /6\/(\d{1,2})/g,
          /7\/(\d{1,2})/g,
        ];

        let eventDate = null;
        
        // 2026-MM-DD 패턴
        const fullDateMatch = text.match(/(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/);
        if (fullDateMatch) {
          const d = new Date(parseInt(fullDateMatch[1]), parseInt(fullDateMatch[2])-1, parseInt(fullDateMatch[3]));
          const dateStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
          if (dateStr >= TODAY) eventDate = dateStr;
        }
        
        if (!eventDate) {
          // 월/일 패턴
          const monthDayMatch = text.match(/(\d{1,2})월\s*(\d{1,2})일/);
          if (monthDayMatch) {
            const month = parseInt(monthDayMatch[1]);
            const day = parseInt(monthDayMatch[2]);
            const year = month >= 6 ? 2026 : 2027;
            const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            if (dateStr >= TODAY) eventDate = dateStr;
          }
        }
        
        if (!eventDate) {
          // 6/XX 패턴
          const slashMatch = text.match(/([67])\/(\d{1,2})/);
          if (slashMatch) {
            const month = parseInt(slashMatch[1]);
            const day = parseInt(slashMatch[2]);
            const dateStr = `2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
            if (dateStr >= TODAY) eventDate = dateStr;
          }
        }

        if (!eventDate) {
          console.log(`  📅 날짜 미확인 스킵: ${text.slice(0, 50)}`);
          continue;
        }

        if (!postData.imageUrl) {
          console.log(`  🖼️ 이미지 없음 스킵`);
          continue;
        }

        // 제목 추출 
        let eventTitle = '';
        const titleLine = text.split('\n').find(l => l.trim().length > 5 && !l.includes('http'));
        eventTitle = (titleLine || text.slice(0, 30)).trim();
        if (!eventTitle) eventTitle = `${accountName} 이벤트`;

        // L3 중복 체크
        const isDup = await checkL3Duplicate(eventTitle, eventDate);
        if (isDup) { skipCount++; continue; }

        // 이미지 업로드
        const id = makeDeterministicId(postData.url, eventDate);
        const imgBuf = await downloadImage(postData.imageUrl);
        let posterUrl = postData.imageUrl;
        
        if (imgBuf) {
          const ext = postData.imageUrl.includes('.png') ? 'png' : 'jpg';
          const filename = `ig_${id}.${ext}`;
          const uploaded = await uploadToSupabase(imgBuf, filename, ext === 'png' ? 'image/png' : 'image/jpeg');
          if (uploaded) posterUrl = uploaded;
        }

        // 이벤트 타입 추론
        let activityType = 'social';
        let eventType = '소셜';
        const lowerText = text.toLowerCase();
        if (lowerText.includes('강습') || lowerText.includes('클래스') || lowerText.includes('워크샵') || lowerText.includes('레슨')) {
          activityType = 'class'; eventType = '강습';
        } else if (lowerText.includes('파티') || lowerText.includes('페스티벌') || lowerText.includes('배틀')) {
          activityType = 'event'; eventType = '파티/행사';
        } else if (lowerText.includes('모집') || lowerText.includes('오디션')) {
          activityType = 'recruit'; eventType = '파티/행사';
        }

        // DJ 추출
        const djMatch = text.match(/DJ\s+([A-Za-z가-힣\s]+?)(?:\n|,|&|$)/i);
        const djs = djMatch ? [djMatch[1].trim()] : [];

        // 소셜은 DJ 명시 필요
        if (activityType === 'social' && djs.length === 0) {
          const hasDJ = text.match(/DJ/i);
          if (!hasDJ) {
            console.log(`  🎵 소셜인데 DJ 없음 스킵`);
            skipCount++;
            continue;
          }
        }

        const dayNames = ['일','월','화','수','목','금','토'];
        const d = new Date(eventDate);
        const dayName = dayNames[d.getDay()];

        const payload = {
          id,
          keyword: accountName,
          source_url: postData.url,
          poster_url: posterUrl,
          extracted_text: text.slice(0, 500),
          structured_data: {
            date: eventDate,
            day: dayName,
            title: eventTitle.slice(0, 80),
            event_type: eventType,
            activity_type: activityType,
            genre_family: 'partner',
            dance_genre: 'swing',
            tags: djs.length ? ['dj'] : [],
            status: '정상운영',
            djs,
            times: [],
            location: accountName,
            fee: '',
            note: '',
          },
          is_collected: false,
        };

        await saveEvent(payload);
      } catch (e) {
        console.log(`  ❌ 포스트 오류: ${e.message}`);
      }
    }
  } catch (e) {
    console.log(`  ❌ 계정 접근 오류: ${e.message}`);
    failedSources.push(`${accountName}(오류)`);
  }
}

// Littly 링크허브 수집
async function collectLittly(page, url, name) {
  console.log(`\n🔗 [Littly] ${name}: ${url}`);
  if (isTimeUp()) return;

  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(2000);

    const links = await page.evaluate(() => {
      return Array.from(document.querySelectorAll('a[href]'))
        .map(a => ({ href: a.href, text: a.textContent.trim() }))
        .filter(l => l.href && !l.href.includes('litt.ly') && l.text.length > 2);
    });

    console.log(`  링크 ${links.length}개 발견`);
    // 링크 중 이벤트 관련 있는지 확인
    for (const link of links.slice(0, 5)) {
      console.log(`    ${link.text.slice(0,30)}: ${link.href}`);
    }
  } catch (e) {
    console.log(`  ❌ 오류: ${e.message}`);
    failedSources.push(`${name}(오류)`);
  }
}

async function main() {
  console.log('🚀 스윙 이벤트 수집 시작 (2026-06-11 KST)');
  console.log('=' .repeat(50));

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-blink-features=AutomationControlled']
  });

  const context = await browser.newContext({
    viewport: { width: 1600, height: 1200 },
    deviceScaleFactor: 2,
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'ko-KR',
  });
  const page = await context.newPage();

  // Instagram 소스 (주요)
  const instagramSources = [
    { name: '해피홀', url: 'https://www.instagram.com/happyhall2004/' },
    { name: '스윙타임', url: 'https://www.instagram.com/swingtimebar/' },
    { name: '봉천살롱', url: 'https://www.instagram.com/bongcheonsalon/' },
    { name: '비밥바', url: 'https://www.instagram.com/bebopbar_swing/' },
    { name: '루나', url: 'https://www.instagram.com/luna_swingbar/' },
    { name: '인더무드신림', url: 'https://www.instagram.com/inthemood_sillim/' },
    { name: 'Dialogue', url: 'https://www.instagram.com/dialogue_swing/' },
    { name: '아수라장', url: 'https://www.instagram.com/asurajang_swing/' },
    { name: '쏘셜클럽', url: 'https://www.instagram.com/sosyalclub_swing/' },
    { name: '스윙잇', url: 'https://www.instagram.com/swingit_seoul/' },
    { name: '피에스타', url: 'https://www.instagram.com/fiesta_swingdance/' },
    { name: '스파', url: 'https://www.instagram.com/spa_swingdance/' },
    { name: '경성홀', url: 'https://www.instagram.com/kyungsunghall/' },
    { name: '강남웨스티스', url: 'https://www.instagram.com/gangnam_westies/' },
    { name: '스윙키즈', url: 'https://www.instagram.com/swingkids_kr/' },
    { name: '스윙팩토리', url: 'https://www.instagram.com/swingfactory_kr/' },
    { name: '스윙홀릭', url: 'https://www.instagram.com/swingholic/' },
    { name: '스탭업댄스', url: 'https://www.instagram.com/stepupdance_swing/' },
    { name: '스윙팝', url: 'https://www.instagram.com/swingpopseoul/' },
  ];

  for (const src of instagramSources) {
    if (isTimeUp()) { console.log('\n⏰ 20분 제한 초과 - 수집 종료'); break; }
    await collectInstagram(page, src.url, src.name);
    await sleep(8000 + Math.floor(Math.random() * 5000));
  }

  await browser.close();

  // 최종 요약
  const elapsed = Math.round((Date.now() - START_TIME) / 1000);
  console.log('\n' + '='.repeat(50));
  console.log(`⏱ 수집 시간: ${elapsed}초`);
  console.log(`✅ 신규: ${newCount}건`);
  console.log(`⏭ 스킵: ${skipCount}건`);
  console.log(`❌ 접근불가: ${failedSources.join(', ') || '없음'}`);

  // TELEGRAM_SUMMARY 블록
  const failedStr = failedSources.length ? failedSources.join(', ') : '없음';
  console.log(`
==TELEGRAM_SUMMARY_START==
신규: ${newCount}건
스킵: ${skipCount}건
과거데이터삭제: 0건
접근불가: ${failedStr}
이슈: Instagram 로그인 장벽으로 일부 소스 제한
==TELEGRAM_SUMMARY_END==`);
}

main().catch(e => {
  console.error('수집 오류:', e);
  console.log(`
==TELEGRAM_SUMMARY_START==
신규: ${newCount}건
스킵: ${skipCount}건
과거데이터삭제: 0건
접근불가: 스크립트오류
이슈: ${e.message}
==TELEGRAM_SUMMARY_END==`);
  process.exit(1);
});
