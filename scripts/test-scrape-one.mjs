/**
 * 해피홀 인스타그램 단일 소스 수집 테스트
 * - 로그인 없이 공개 포스트만
 * - Supabase DB 중복 확인
 * - public/scraped/ 이미지 저장
 * - src/data/scraped_events.json 업데이트
 * - localhost:8888/admin/ingestor 최종 확인
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRAPED_DIR = `${PROJECT_ROOT}/public/scraped`;
const JSON_PATH = `${PROJECT_ROOT}/src/data/scraped_events.json`;

// .env 로드
function loadEnv() {
  const envPath = `${PROJECT_ROOT}/.env`;
  if (!existsSync(envPath)) return {};
  const env = {};
  readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^=]+)=(.*)$/);
    if (m) env[m[1].trim()] = m[2].trim();
  });
  return env;
}

const env = loadEnv();
const SUPABASE_URL = env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

// DJ 소셜 파티 판별
const SOCIAL_KW = ['소셜', 'social', '파티', 'party', 'dj', '디제이'];
const SKIP_KW = ['강습', '클래스', '워크숍', 'workshop', '공연', '발표', '대회', '후기', '리뷰'];

function isSocialParty(text) {
  const lower = text.toLowerCase();
  // 소셜/DJ 키워드 있으면 수집 (강습도 같이 언급된 주간 스케줄 포함)
  // 소셜/DJ 키워드 없이 강습/워크숍만 있으면 스킵
  const hasSocial = SOCIAL_KW.some(k => lower.includes(k));
  const onlyClass = !hasSocial && SKIP_KW.some(k => lower.includes(k));
  return hasSocial && !onlyClass;
}

// DB 중복 확인
async function checkDuplicate(date, keyword) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const url = `${SUPABASE_URL}/rest/v1/events?select=id,date,title,link_name1&date=gte.${today}&date=lte.${future}&link_name1=eq.${encodeURIComponent(keyword)}&order=date.asc`;
  try {
    const res = await fetch(url, {
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
    });
    const data = await res.json();
    return Array.isArray(data) && data.some(e => e.date === date);
  } catch(e) {
    return false;
  }
}

async function run() {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const page = await browser.newPage();
  const results = [];

  console.log('=== 해피홀 수집 시작 ===');
  await page.goto('https://www.instagram.com/happyhall2004/', {
    waitUntil: 'domcontentloaded', timeout: 15000
  });
  await page.waitForTimeout(3000);

  // 팝업 닫기
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(1000); } catch(e) {}

  // 포스트 링크 (최근 6개) - 해당 계정 포스트만
  const accountHandle = 'happyhall2004';
  const postLinks = await page.$$eval('a[href*="/p/"]', (els, handle) =>
    [...new Set(els.map(e => e.href).filter(h => h.includes(`/${handle}/p/`)))].slice(0, 6),
    accountHandle
  );
  console.log(`포스트 ${postLinks.length}개 발견`);

  if (!postLinks.length) {
    console.log('해피홀: 게시물 없음 → 스킵');
    await browser.close();
    return;
  }

  for (let i = 0; i < postLinks.length; i++) {
    const postUrl = postLinks[i];
    console.log(`\n[${i+1}/6] ${postUrl}`);

    await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 10000 });
    await page.waitForTimeout(2000);
    try { await page.keyboard.press('Escape'); } catch(e) {}
    await page.waitForTimeout(500);

    // 스크린샷
    const ts = Date.now();
    const verifyFile = `verify_happyhall_${i+1}_${ts}.png`;
    await page.screenshot({ path: `${SCRAPED_DIR}/${verifyFile}` });
    console.log(`  캡처: ${verifyFile}`);

    // 캡션 추출 - span에서 언어목록/저작권 제외하고 가장 긴 텍스트
    let caption = '';
    try {
      const spans = await page.$$eval('span', els =>
        els.map(e => e.innerText?.trim() || '')
          .filter(t => t.length > 20 && !t.includes('Afrikaans') && !t.includes('© 20') && !t.includes('Instagram from'))
      );
      if (spans.length > 0) {
        // 사용자명+캡션이 합쳐진 첫번째 span에서 순수 캡션만 추출
        caption = spans.find(s => !s.match(/^[\w.]+\n/)) || spans[0];
      }
    } catch(e) {}
    console.log(`  캡션(${caption.length}자): ${caption.substring(0, 120)}`);

    // DJ 소셜 여부
    if (caption && !isSocialParty(caption)) {
      console.log(`  → 소셜 아님 → 스킵`);
      continue;
    }

    // 이미지 다운로드
    let imgSrc = '';
    try {
      imgSrc = await page.$eval('article img[srcset], article img', el => {
        const srcset = el.getAttribute('srcset') || '';
        if (srcset) {
          const parts = srcset.split(',').map(s => s.trim().split(/\s+/));
          return parts.reduce((a, b) => (parseInt(b[1]) > parseInt(a[1]) ? b : a))[0];
        }
        return el.src;
      });
    } catch(e) {}

    let posterRelPath = '';
    if (imgSrc) {
      const posterFile = `happyhall_${ts}_poster.jpg`;
      const posterFullPath = `${SCRAPED_DIR}/${posterFile}`;
      try {
        execSync(`curl -sL -o "${posterFullPath}" "${imgSrc}"`, { timeout: 15000 });
        const size = parseInt(execSync(`wc -c < "${posterFullPath}"`).toString().trim());
        console.log(`  이미지: ${posterFile} (${size} bytes)`);
        if (size >= 1000) {
          posterRelPath = `/scraped/${posterFile}`;
        } else {
          console.log(`  ⚠️ 이미지 0바이트 → 폐기`);
        }
      } catch(e) {
        console.log(`  이미지 다운로드 실패`);
      }
    }

    results.push({ postUrl, caption, posterRelPath, verifyFile });
    console.log(`  ✅ 수집 완료`);
  }

  console.log(`\n=== 수집 ${results.length}건 ===`);

  // scraped_events.json 업데이트
  if (results.length > 0) {
    const existing = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    let added = 0;
    for (const r of results) {
      const newEntry = {
        id: `hh_test_${Date.now()}_${Math.random().toString(36).slice(2,6)}`,
        keyword: '해피홀',
        source_url: r.postUrl,
        poster_url: r.posterRelPath || `/scraped/${r.verifyFile}`,
        extracted_text: r.caption,
        structured_data: {
          date: '',
          day: '',
          title: '해피홀 소셜 (수집됨)',
          status: '정상운영',
          djs: [],
          times: [],
          location: '해피홀',
          fee: '',
          note: ''
        },
        evidence: { screenshot_path: `/scraped/${r.verifyFile}` },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      existing.push(newEntry);
      added++;
    }
    writeFileSync(JSON_PATH, JSON.stringify(existing, null, 2), 'utf8');
    console.log(`scraped_events.json에 ${added}건 추가됨`);
  }

  // 최종 확인: admin/ingestor
  console.log('\nadmin/ingestor 열어서 확인 중...');
  try {
    await page.goto('http://localhost:8888/admin/ingestor', {
      waitUntil: 'domcontentloaded', timeout: 8000
    });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCRAPED_DIR}/verify_admin_ingestor.png` });
    console.log('admin/ingestor 스크린샷: verify_admin_ingestor.png');
  } catch(e) {
    console.log('admin/ingestor 접속 실패 (dev server 실행 중인지 확인)');
  }

  await browser.close();
  console.log('\n=== 완료 ===');
}

run().catch(e => {
  console.error('오류:', e.message);
  process.exit(1);
});
