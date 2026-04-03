/**
 * 스윙댄스 이벤트 수집 스크립트
 * 가이드: .claude/skills/scrape-events/SKILL.md
 *
 * 실행: node scripts/scrape-events.mjs
 * - 로그인 없음
 * - 9개 지정 소스만
 * - DJ 소셜 파티만 수집
 * - 원본 이미지 즉시 다운로드 (CDN 토큰 만료 전)
 */
import { chromium } from 'playwright';
import { execSync } from 'child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SCRAPED_DIR = `${PROJECT_ROOT}/public/scraped`;
const JSON_PATH = `${PROJECT_ROOT}/src/data/scraped_events.json`;

if (!existsSync(SCRAPED_DIR)) mkdirSync(SCRAPED_DIR, { recursive: true });

// ── 환경변수 ──────────────────────────────────────────
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

// ── 수집 소스 정의 ────────────────────────────────────
const SOURCES = [
  { name: '네오스윙',   type: 'ig',     handle: 'neo_swing',       url: 'https://www.instagram.com/neo_swing/' },
  { name: '스윙스캔들', type: 'naver',  handle: null,              url: 'https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I' },
  { name: '경성홀',     type: 'ig',     handle: 'kyungsunghall',   url: 'https://www.instagram.com/kyungsunghall/' },
  { name: '해피홀',     type: 'ig',     handle: 'happyhall2004',   url: 'https://www.instagram.com/happyhall2004/' },
  { name: '피에스타',   type: 'ig',     handle: 'fiesta_swingdance', url: 'https://www.instagram.com/fiesta_swingdance/' },
  { name: '스윙타임',   type: 'ig',     handle: 'swingtimebar',    url: 'https://www.instagram.com/swingtimebar/' },
  { name: '스윙프렌즈', type: 'google', handle: null,              query: '스윙프렌즈 소셜 인스타그램' },
  { name: '박쥐스윙',   type: 'ig',     handle: 'batswing2003',    url: 'https://www.instagram.com/batswing2003/' },
  { name: '대전스윙피버',type: 'ig',    handle: 'daejeon.swingfever', url: 'https://www.instagram.com/daejeon.swingfever/' },
  { name: '스윙홀릭',   type: 'ig',     handle: 'swingholic',      url: 'https://www.instagram.com/swingholic/' },
];

// ── DJ 소셜 판별 ───────────────────────────────────────
const SOCIAL_KW = ['소셜', 'social', '파티', 'party', 'dj', '디제이'];
const SKIP_KW   = ['강습', '클래스', '워크숍', 'workshop', '공연', '발표', '대회', '후기', '리뷰'];

function isSocialParty(text) {
  const lower = text.toLowerCase();
  const hasSocial = SOCIAL_KW.some(k => lower.includes(k));
  const onlyClass = !hasSocial && SKIP_KW.some(k => lower.includes(k));
  return hasSocial && !onlyClass;
}

// ── 캡션 파싱 ─────────────────────────────────────────
function parseCaption(caption, sourceName) {
  let date = '';
  let day = '';
  const datePatterns = [
    /(\d{1,2})월\s*([\d,\s]+)일/,                // 3월 14,15일
    /(\d{4})[.\-\/](\d{1,2})[.\-\/](\d{1,2})/,   // 2026.03.22
    /(\d{1,2})[\/\.](\d{1,2})\s*[\(\（]/,           // 3/22( or 3.22(
    /(\d{4})-(\d{1,2})-(\d{1,2})/,                // 2026-03-18
  ];

  const year = new Date().getFullYear();
  for (const regex of datePatterns) {
    const m = caption.match(regex);
    if (m) {
      if (m[0].includes('년') || m[1]?.length === 4) {
        date = `${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
      } else if (m[0].includes('월')) {
        const firstDay = m[2].match(/\d+/)[0]; // 14,15일 중 14만 추출
        date = `${year}-${String(m[1]).padStart(2,'0')}-${String(firstDay).padStart(2,'0')}`;
      } else {
        date = `${year}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
      }
      break;
    }
  }

  if (date) console.log(`      [파싱] 날짜 발견: ${date}`);
  else      console.log(`      [파싱] ⚠️ 날짜 추출 실패 - 본문 요약: "${caption.substring(0, 100).replace(/\n/g, ' ')}..."`);

  // 요일 추출
  const dayMatch = caption.match(/[(\（]([월화수목금토일])[)\）]/) || 
                   caption.match(/([월화수목금토일])\s*소셜/) ||
                   caption.match(/([월화수목금토일])요일/);
  if (dayMatch) day = dayMatch[1];

  // DJ 추출 (시간/기호 제거)
  const djMatches = caption.match(/(?:DJ|디제이)\s*[★☆\*"'"']?([^\n★☆\*,，、]+)/gi) || [];
  const djs = djMatches
    .map(m => m.replace(/^(?:DJ|디제이)\s*[★☆\*"'"']?\s*/i, '').trim())
    .map(d => d.replace(/^[\s:：]+/, '').replace(/\s*(PM|AM)\s*\d+[:：]\d+.*/i, '').replace(/\s*\d{1,2}[:：]\d{2}.*/,'').replace(/["'"']/g,'').replace(/@[\w.]+/g,'').trim())
    .filter(d => d && d.length > 0 && d.length < 30);

  // 시간
  const timeMatch = caption.match(/(\d{1,2}:\d{2})\s*[~\-～]/);
  const times = timeMatch ? [`${timeMatch[1]} ~`] : [];

  // 가격
  const feeMatch = caption.match(/(\d[\d,]+)\s*원/);
  const fee = feeMatch ? `${feeMatch[1]}원` : '';

  // 상태
  const status = caption.includes('CLOSED') || caption.includes('휴무') || caption.includes('쉽니다') ? 'CLOSED' : '정상운영';


  return { date, day, title: `${sourceName} 소셜${djs.length ? ` (${djs.join(', ')})` : ''}`, status, djs, times, location: sourceName, fee, note: '' };
}

// ── ID 생성 ───────────────────────────────────────────
function makeId(sourceName, date, idx) {
  const prefixMap = {
    '해피홀': 'hh', '스윙타임': 'st', '경성홀': 'ks', '박쥐스윙': 'bs',
    '대전스윙피버': 'dsf', '스윙홀릭': 'sh', '네오스윙': 'ns',
    '스윙스캔들': 'ss', '스윙프렌즈': 'sf'
  };
  const prefix = prefixMap[sourceName] || sourceName.slice(0,2);
  if (date) {
    const d = date.replace(/-/g, '').slice(2); // YYMMDD
    return `${prefix}_${d}`;
  }
  return `${prefix}_${Date.now()}_${idx}`;
}

// ── 중복 확인 ─────────────────────────────────────────
async function isAlreadyInDB(sourceName) {
  if (!SUPABASE_URL || !SUPABASE_KEY) return false;
  const today = new Date().toISOString().split('T')[0];
  const future = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
  const url = `${SUPABASE_URL}/rest/v1/events?select=id,link_name1&date=gte.${today}&date=lte.${future}&link_name1=eq.${encodeURIComponent(sourceName)}`;
  try {
    const res = await fetch(url, { headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` } });
    const data = await res.json();
    return Array.isArray(data) && data.length > 0;
  } catch { return false; }
}

function isInJson(url) {
  try {
    const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
    return data.some(e => e.source_url === url);
  } catch { return false; }
}

// ── 이미지 다운로드 (브라우저 컨텍스트 fetch) ─────────
async function downloadImageViaPage(page, cdnUrl, filePath) {
  try {
    const base64 = await page.evaluate(async (url) => {
      try {
        console.log(`[Browser] Fetching: ${url.substring(0, 50)}...`);
        const res = await fetch(url);
        if (!res.ok) {
          console.error(`[Browser] Fetch failed: ${res.status} ${res.statusText}`);
          return null;
        }
        const blob = await res.blob();
        return new Promise((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result.split(',')[1]);
          reader.readAsDataURL(blob);
        });
      } catch (e) {
        console.error(`[Browser] Error in evaluate: ${e.message}`);
        return null;
      }
    }, cdnUrl);
    if (!base64) {
      console.log(`    ❌ 브라우저 fetch 결과 없음 (base64 is null)`);
      return 0;
    }
    writeFileSync(filePath, Buffer.from(base64, 'base64'));
    const size = parseInt(execSync(`wc -c < "${filePath}"`).toString().trim());
    return size >= 1000 ? size : 0;
  } catch (e) {
    console.log(`    ❌ downloadImageViaPage 오류: ${e.message}`);
    return 0;
  }
}

// curl 방식 (fallback)
function downloadImage(cdnUrl, filePath) {
  try {
    execSync(`curl -sL --max-time 15 -o "${filePath}" "${cdnUrl}"`);
    const size = parseInt(execSync(`wc -c < "${filePath}"`).toString().trim());
    return size >= 1000 ? size : 0;
  } catch { return 0; }
}

// ── 팝업 닫기 (로그인 모달 포함) ──────────────────────
async function dismissPopup(page) {
  // 1차: ESC 키로 모달 닫기 시도 (가장 빠름)
  try { await page.keyboard.press('Escape'); await page.waitForTimeout(500); } catch {}

  // 2차: 로그인/가입 유도 팝업 특정 및 닫기 버튼 클릭
  const LOGIN_MODAL_SELECTORS = [
    'div[role="dialog"]:has-text("로그인")', 
    'div[role="dialog"]:has-text("가입하기")',
    'div[role="dialog"]:has-text("Instagram")',
    'div[role="presentation"] div[role="dialog"]'
  ];

  for (const modalSel of LOGIN_MODAL_SELECTORS) {
    try {
      const modal = page.locator(modalSel).first();
      if (await modal.isVisible({ timeout: 1000 })) {
        console.log(`    [팝업] 로그인 유도 창 발견 -> 닫기 시도...`);
        // 팝업 내부의 '닫기' 성격의 버튼(svg 포함)들 탐색
        const closeBtn = modal.locator('svg[aria-label="닫기"], svg[aria-label="Close"], button:has(svg), [role="button"]').first();
        if (await closeBtn.isVisible({ timeout: 500 })) {
          await closeBtn.click();
          // 팝업이 사라질 때까지 최대 2초 대기
          await modal.waitFor({ state: 'hidden', timeout: 2000 }).catch(() => {});
          console.log(`    [팝업] 팝업 제거 완료 ✅`);
          break;
        }
      }
    } catch {}
  }

  // 3차: 최후 수단으로 바깥 영역 클릭
  try {
    const backdrop = page.locator('div[role="presentation"]').first();
    if (await backdrop.isVisible({ timeout: 500 })) {
      await page.mouse.click(10, 10);
      await page.waitForTimeout(500);
    }
  } catch {}
}

async function extractInstagramCaption(page) {
  let caption = '';
  try {
    // 1순위: META og:description (가장 안정적 - 비로그인 팝업 우회)
    caption = await page.locator('meta[property="og:description"]').getAttribute('content').catch(() => '');
    if (caption) {
      // "5 likes, 0 comments - swingtimebar on March 12, 2026: \"...\"" 형태에서 본문만 추출 (끝 따옴표 누락 대응)
      const match = caption.match(/(?:likes|comments).*?:\s*\"([\s\S]*?)(?:\"$|$)/i) || caption.match(/:\s*\"([\s\S]*?)(?:\"$|$)/);
      if (match) caption = match[1];
      return caption.trim();
    }

    // 2순위: JSON-LD 메타데이터
    const ldJson = await page.evaluate(() => {
      const script = Array.from(document.querySelectorAll('script[type="application/ld+json"]'))
        .find(s => s.innerText.includes('"articleBody"'));
      return script ? JSON.parse(script.innerText) : null;
    });
    if (ldJson?.articleBody) return ldJson.articleBody.trim();

    // 3순위: article h1 또는 특정 testid
    caption = await page.locator('article h1, [data-testid="post-comment-text"]').first().innerText().catch(() => '');
    if (caption.length > 20) return caption.trim();

    // 4순위: 긴 텍스트 span
    const spans = await page.$$eval('span', els =>
      els.map(e => e.innerText?.trim() || '')
        .filter(t => t.length > 20 && !t.includes('님의 게시물을 놓치지') && !t.includes('Instagram from'))
    );
    caption = spans.find(s => !s.match(/^[\w.]+\n/)) || spans[0] || '';
  } catch (err) {
    console.log(`    캡션 추출 중 오류: ${err.message}`);
  }
  return caption.trim();
}

// ── 인스타그램 수집 ───────────────────────────────────
async function scrapeInstagram(page, source) {
  console.log(`\n▶ [${source.name}] ${source.url}`);
  const collected = [];

  try {
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
    await dismissPopup(page);
  } catch {
    console.log(`  계정 접속 불가 → 스킵`);
    return collected;
  }

  // 해당 계정 포스트만
  const postLinks = await page.$$eval('a[href*="/p/"]', (els, handle) =>
    [...new Set(els.map(e => e.href).filter(h => h.includes(`/${handle}/p/`)))].slice(0, 6),
    source.handle
  );
  console.log(`  포스트 ${postLinks.length}개 발견`);
  if (!postLinks.length) { console.log(`  결과 없음 → 스킵`); return collected; }

  for (let i = 0; i < postLinks.length; i++) {
    const postUrl = postLinks[i];
    console.log(`  [${i+1}/${postLinks.length}] ${postUrl}`);

    // JSON 중복 확인
    if (isInJson(postUrl)) { console.log(`    이미 수집됨 → 스킵`); continue; }

    try {
      await page.goto(postUrl, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(3500);
      await dismissPopup(page);
      // 실제 캡션이 렌더링될 때까지 대기 (최대 5초)
      await page.waitForFunction(
        () => Array.from(document.querySelectorAll('span'))
          .some(s => (s.innerText || '').length > 30 && !(s.innerText || '').includes('님의 게시물을 놓치지')),
        { timeout: 5000 }
      ).catch(() => {});
    } catch {
      console.log(`    포스트 접속 실패 → 스킵`);
      continue;
    }

    // 스크린샷 (verify)
    const ts = Date.now();
    const slug = source.handle.replace(/\./g, '_');
    const verifyFile = `verify_${slug}_${i+1}_${ts}.png`;
    await page.screenshot({ path: `${SCRAPED_DIR}/${verifyFile}`, timeout: 10000 }).catch(() => {});

    // 캡션 추출 (고도화된 공통 함수 사용)
    const caption = await extractInstagramCaption(page);

    console.log(`    캡션 수집 완료 (${caption.length}자)`);

    if (caption && !isSocialParty(caption)) {
      console.log(`    → 소셜 아님 → 스킵`);
      continue;
    }

    // 이미지 추출: CDN 다운로드 우선, 실패 시 article img 엘리먼트 스크린샷으로 크롭
    let posterRelPath = '';
    const posterFile = `poster_${slug}_${ts}.png`;
    const posterFullPath = `${SCRAPED_DIR}/${posterFile}`;

    // 1차: CDN URL 다운로드 시도
    let cdnUrl = '';
    try {
      const IMG_SELECTORS = [
        'article img[src*="cdninstagram.com"]',
        'div[role="dialog"] img[src*="cdninstagram.com"]',
        'img[src*="cdninstagram.com"]',
        'img[src*="fbcdn.net"]',
        'img[src*="scontent"]',
        'img[src^="http"]',
      ];
      for (const sel of IMG_SELECTORS) {
        console.log(`    검색 중: ${sel}...`);
        await page.waitForSelector(sel, { timeout: 1500 }).catch(() => {});
        const url = await page.evaluate((selector) => {
          const els = Array.from(document.querySelectorAll(selector));
          // ★ [보안] 300px 미만(아바타 등) 이미지 제외 루틴 추가
          const postImg = els.find(el => (el.naturalWidth > 300 || el.width > 300));
          if (!postImg) return null;

          const srcset = postImg.getAttribute('srcset') || '';
          if (srcset) {
            const parts = srcset.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]?.startsWith('http'));
            if (parts.length) return parts.reduce((a, b) => (parseInt(b[1])||0) > (parseInt(a[1])||0) ? b : a)[0];
          }
          return postImg.currentSrc || postImg.src || '';
        }, sel).catch(() => null);

        if (url?.startsWith('http')) {
          console.log(`    URL 발견: ${url.substring(0, 50)}...`);
          cdnUrl = url;
          break;
        }
      }
    } catch {}

    if (cdnUrl) {
      // 1차: 브라우저 fetch (쿠키/토큰 포함)
      let size = await downloadImageViaPage(page, cdnUrl, posterFullPath);
      if (size > 0) {
        posterRelPath = `/scraped/${posterFile}`;
        console.log(`    이미지(브라우저fetch): ${posterFile} (${size} bytes) ✅`);
      } else {
        // 2차: curl fallback
        size = downloadImage(cdnUrl, posterFullPath);
        if (size > 0) {
          posterRelPath = `/scraped/${posterFile}`;
          console.log(`    이미지(curl): ${posterFile} (${size} bytes) ✅`);
        }
      }
    }

    // 2차: CDN 실패 시 article img 엘리먼트만 스크린샷 크롭
    if (!posterRelPath) {
      try {
        const imgEl = page.locator('article img').first();
        if (await imgEl.count() > 0) {
          await imgEl.screenshot({ path: posterFullPath, timeout: 5000 });
          const size = parseInt(execSync(`wc -c < "${posterFullPath}"`).toString().trim());
          if (size >= 1000) {
            posterRelPath = `/scraped/${posterFile}`;
            console.log(`    이미지(크롭): ${posterFile} (${size} bytes) ✅`);
          }
        }
      } catch {}
      if (!posterRelPath) console.log(`    이미지 추출 실패 → verify 사용`);
    }



    const structured = parseCaption(caption, source.name);

    // 날짜 미확인 플래그
    if (!structured.date) {
      structured.note = (structured.note ? structured.note + ' | ' : '') + '⚠️ 날짜 미확인 - 이미지 확인 필요';
    }

    // 미래 이벤트만 수집 (날짜 파싱 성공한 경우만 필터)
    if (structured.date) {
      const today = new Date().toISOString().split('T')[0];
      if (structured.date < today) {
        console.log(`    → 과거 이벤트 (${structured.date}) → 스킵`);
        continue;
      }
    }

    const id = makeId(source.name, structured.date, i);

    collected.push({
      id,
      keyword: source.name,
      source_url: postUrl,
      poster_url: posterRelPath || `/scraped/${verifyFile}`,
      extracted_text: caption,
      structured_data: structured,
      evidence: { screenshot_path: `/scraped/${verifyFile}` },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    console.log(`    ✅ 수집: ${structured.date || '⚠️날짜미상'} / DJ: ${structured.djs.join(', ') || '미상'}`);
  }

  return collected;
}

// ── 네이버 카페 수집 ──────────────────────────────────
async function scrapeNaver(page, source) {
  console.log(`\n▶ [${source.name}] ${source.url}`);
  const collected = [];

  try {
    await page.goto(source.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(3000);
  } catch {
    console.log(`  접속 불가 → 스킵`);
    return collected;
  }

  // 오른쪽 리스트 게시물만 확인
  const posts = await page.$$eval('a[href*="articleid"], .article-item a, .board-list a', els =>
    els.slice(0, 10).map(e => ({ title: e.textContent?.trim(), href: e.href })).filter(p => p.title && p.href)
  ).catch(() => []);

  console.log(`  게시물 ${posts.length}개 발견`);
  if (!posts.length) { console.log(`  결과 없음 → 스킵`); return collected; }

  for (const post of posts.slice(0, 5)) {
    if (!isSocialParty(post.title)) continue;
    if (isInJson(post.href)) { console.log(`  이미 수집됨 → 스킵`); continue; }

    console.log(`  DJ 소셜 발견: ${post.title}`);
    
    // 증빙용 스크린샷 캡쳐 추가
    const ts = Date.now();
    const verifyFile = `verify_naver_ss_${ts}.png`;
    try {
      await page.goto(post.href, { waitUntil: 'domcontentloaded', timeout: 10000 });
      await page.screenshot({ path: `${SCRAPED_DIR}/${verifyFile}` });
    } catch {}

    const structured = parseCaption(post.title, source.name);
    const id = makeId(source.name, structured.date, Date.now());

    collected.push({
      id,
      keyword: source.name,
      source_url: post.href,
      poster_url: `/scraped/${verifyFile}`, // 스크린샷을 포스터 대용으로 사용
      extracted_text: post.title,
      structured_data: structured,
      evidence: { screenshot_path: `/scraped/${verifyFile}` },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }
  return collected;
}

// ── 구글 검색 수집 ────────────────────────────────────
async function scrapeGoogle(page, source) {
  console.log(`\n▶ [${source.name}] 구글: ${source.query}`);
  const collected = [];

  const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(source.query)}&tbs=qdr:w`;
  try {
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(2000);
  } catch {
    console.log(`  접속 불가 → 스킵`);
    return collected;
  }

  const results = await page.$$eval('h3', els =>
    els.slice(0, 10).map(e => ({
      title: e.textContent?.trim(),
      href: e.closest('a')?.href || ''
    })).filter(r => r.title && r.href)
  ).catch(() => []);

  console.log(`  결과 ${results.length}개`);
  for (const r of results) {
    if (isSocialParty(r.title)) {
      console.log(`  DJ 소셜 발견: ${r.title}`);
      
      // 인스타그램 게시물로 이동 + 로그인 팝업 닫기
      const ts = Date.now();
      const slug = source.name.replace(/\s/g, '');
      const verifyFile = `verify_google_${ts}.png`;
      const posterFile = `poster_${slug}_${ts}.png`;
      const posterFullPath = `${SCRAPED_DIR}/${posterFile}`;
      let posterRelPath = '';

      try {
        await page.goto(r.href, { waitUntil: 'domcontentloaded', timeout: 10000 });
        await page.waitForTimeout(2000);
        // ★ 로그인 팝업 닫기 (SKILL.md 비로그인 원칙)
        await dismissPopup(page);
        await page.waitForTimeout(500);
      } catch {}

      // CDN 이미지 다운로드 시도 (인스타그램 게시물인 경우)
      if (r.href.includes('instagram.com')) {
        try {
          const IMG_SELECTORS = [
            'article img[src*="cdninstagram.com"]',
            'div[role="dialog"] img[src*="cdninstagram.com"]',
            'img[src*="cdninstagram.com"]',
            'img[src*="fbcdn.net"]',
            'img[src*="scontent"]',
            'img[src^="http"]',
          ];
          for (const sel of IMG_SELECTORS) {
            console.log(`    검색 중: ${sel}...`);
            await page.waitForSelector(sel, { timeout: 1500 }).catch(() => {});
            const url = await page.evaluate((selector) => {
              const els = Array.from(document.querySelectorAll(selector));
              // ★ [보안] 300px 미만(아바타 등) 이미지 제외 루틴 추가
              const postImg = els.find(el => (el.naturalWidth > 300 || el.width > 300));
              if (!postImg) return null;

              const srcset = postImg.getAttribute('srcset') || '';
              if (srcset) {
                const parts = srcset.split(',').map(s => s.trim().split(/\s+/)).filter(p => p[0]?.startsWith('http'));
                if (parts.length) return parts.reduce((a, b) => (parseInt(b[1])||0) > (parseInt(a[1])||0) ? b : a)[0];
              }
              return postImg.currentSrc || postImg.src || '';
            }, sel).catch(() => null);

            if (url?.startsWith('http')) {
              console.log(`    URL 발견: ${url.substring(0, 50)}...`);
              // 1차: 브라우저 fetch (쿠키/토큰 포함)
              let size = await downloadImageViaPage(page, url, posterFullPath);
              if (size > 0) {
                posterRelPath = `/scraped/${posterFile}`;
                console.log(`    이미지(브라우저fetch): ${posterFile} (${size} bytes) ✅`);
              } else {
                // 2차: curl fallback
                size = downloadImage(url, posterFullPath);
                if (size > 0) {
                  posterRelPath = `/scraped/${posterFile}`;
                  console.log(`    이미지(curl): ${posterFile} (${size} bytes) ✅`);
                }
              }
              break;
            }
          }
        } catch {}

        // CDN 실패 시 article img 엘리먼트 크롭 스크린샷
        if (!posterRelPath) {
          try {
            const imgEl = page.locator('article img').first();
            if (await imgEl.count() > 0) {
              await imgEl.screenshot({ path: posterFullPath, timeout: 5000 });
              const size = parseInt(execSync(`wc -c < "${posterFullPath}"`).toString().trim());
              if (size >= 1000) {
                posterRelPath = `/scraped/${posterFile}`;
                console.log(`    이미지(크롭): ${posterFile} (${size} bytes) ✅`);
              }
            }
          } catch {}
        }
      }

      // 팝업 닫은 뒤 증빙 스크린샷 캡처
      try {
        await page.screenshot({ path: `${SCRAPED_DIR}/${verifyFile}` });
      } catch {}

      // 본문 텍스트 추출 (r.title 대신 실제 페이지 본문 수집)
      const caption = await extractInstagramCaption(page);
      console.log(`    본문 수집 완료 (${caption.length}자)`);

      const structured = parseCaption(caption || r.title, source.name);
      collected.push({
        id: makeId(source.name, structured.date, Date.now()),
        keyword: source.name,
        source_url: r.href,
        poster_url: posterRelPath || `/scraped/${verifyFile}`,
        extracted_text: caption || r.title,
        structured_data: structured,
        evidence: { screenshot_path: `/scraped/${verifyFile}` },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  if (!collected.length) console.log(`  결과 없음 → 스킵`);
  return collected;
}

// ── 메인 ──────────────────────────────────────────────
async function main() {
  console.log('='.repeat(50));
  console.log('스윙댄스 이벤트 수집 시작');
  console.log(`기준일: ${new Date().toLocaleDateString('ko-KR')}`);
  console.log('='.repeat(50));

  // DB 사전 확인
  console.log('\n[0] 기존 DB 확인 중...');
  try { execSync('node scripts/check-db-events.js ' + new Date().toISOString().split('T')[0] + ' ' + new Date(Date.now()+21*86400000).toISOString().split('T')[0], { stdio: 'inherit', cwd: PROJECT_ROOT }); } catch {}

  // Chrome 실행파일 + 봇감지 우회 설정
  // Chrome 프로필 사용 시도 (Chrome 닫혀있을 때), 실패 시 Chrome 바이너리로 fallback
  const CHROME_PROFILE = `${process.env.HOME}/Library/Application Support/Google/Chrome`;
  const ANTI_BOT_ARGS = [
    '--disable-blink-features=AutomationControlled',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-infobars',
    '--disable-extensions',
    '--disable-gpu',
    '--mute-audio',
  ];
  let browser, page;
  try {
    const context = await chromium.launchPersistentContext(CHROME_PROFILE, {
      channel: 'chrome',
      headless: false,
      slowMo: 300,
      args: ANTI_BOT_ARGS,
    });
    // webdriver 속성 숨기기
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    page = await context.newPage();
    browser = { close: () => context.close() };
    console.log('✅ Chrome 프로필 사용 (쿠키/세션 유지)');
  } catch (e) {
    console.log('⚠️  Chrome 프로필 사용 불가 (Chrome 실행 중?), Chrome 바이너리로 실행');
    const b = await chromium.launch({
      channel: 'chrome',
      headless: false,
      slowMo: 400,
      args: ANTI_BOT_ARGS,
    });
    const context = await b.newContext();
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });
    page = await context.newPage();
    browser = { close: () => b.close() };
    console.log('✅ Chrome 바이너리 실행 (새 세션)');
  }

  const allResults = [];
  for (const source of SOURCES) {
    let results = [];
    if (source.type === 'ig')     results = await scrapeInstagram(page, source);
    if (source.type === 'naver')  results = await scrapeNaver(page, source);
    if (source.type === 'google') results = await scrapeGoogle(page, source);
    
    if (results.length > 0) {
      console.log(`\n[저장] ${source.name}: ${results.length}건 → scraped_events.json`);
      const existing = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
      const existingUrls = new Set(existing.map(e => e.source_url));
      const newItems = results.filter(r => !existingUrls.has(r.source_url));
      existing.push(...newItems);
      writeFileSync(JSON_PATH, JSON.stringify(existing, null, 2), 'utf8');
      console.log(`  신규 ${newItems.length}건 추가 완료 ✅`);
      allResults.push(...newItems);
    }
  }

  if (allResults.length === 0) {
    console.log('\n[저장] 이번 실행에서 새로 수집된 이벤트 없음');
  }

  // 파일 무결성 검사
  console.log('\n[검사] public/scraped/ 0바이트 파일 확인');
  try {
    const check = execSync('find public/scraped -name "poster_*" -size 0 2>/dev/null', { cwd: PROJECT_ROOT }).toString().trim();
    if (check) console.log(`  ⚠️ 0바이트 파일:\n${check}`);
    else console.log('  이상 없음 ✅');
  } catch {}

  // admin/ingestor 확인
  console.log('\n[확인] admin/ingestor 열기...');
  try {
    await page.goto('http://localhost:8888/admin/ingestor', { waitUntil: 'domcontentloaded', timeout: 8000 });
    await page.waitForTimeout(2000);
    await page.screenshot({ path: `${SCRAPED_DIR}/verify_admin_ingestor_${Date.now()}.png` });
    console.log('  스크린샷 저장 ✅');
  } catch {
    console.log('  접속 실패 (dev server 확인)');
  }

  await browser.close();

  console.log('\n' + '='.repeat(50));
  console.log(`완료: 총 ${allResults.length}건 수집`);
  console.log('='.repeat(50));
}

main().catch(e => { console.error('오류:', e.message); process.exit(1); });
