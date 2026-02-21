import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// .env 파싱 함수 (간단 구현)
function loadEnv() {
    const envPath = path.resolve(__dirname, '../.env');
    if (!fs.existsSync(envPath)) return {};

    const content = fs.readFileSync(envPath, 'utf8');
    const env = {};
    content.split('\n').forEach(line => {
        const match = line.match(/^([^=]+)=(.*)$/);
        if (match) {
            env[match[1].trim()] = match[2].trim();
        }
    });
    return env;
}

// -----------------------------------------------------
// 퍼지 매칭 유틸 (EventIngestor.tsx 동일 로직)
// -----------------------------------------------------
const normalize = (s) => (s || '').replace(/[\s!\-_.,()（）]/g, '').toLowerCase();

const tokenize = (s) => {
    const stopwords = ['dj', '소셜', 'social', 'monthly', 'live', 'night', 'club', 'band', 'in', 'the', 'of'];
    const cleaned = (s || '').replace(/[^가-힣a-zA-Z0-9]/g, ' ');
    return cleaned.split(/\s+/).filter(t => t.length >= 2 && !stopwords.includes(t.toLowerCase()));
};

const tokenOverlap = (a, b) => {
    const tokensA = tokenize(a);
    const tokensB = tokenize(b);
    if (tokensA.length === 0 || tokensB.length === 0) return 0;
    let matchCount = 0;
    tokensA.forEach(ta => {
        if (tokensB.some(tb => ta.includes(tb) || tb.includes(ta))) matchCount++;
    });
    return matchCount / Math.max(tokensA.length, tokensB.length);
};

const calcMatchScore = (scrapedData, dbEvent) => {
    const sDate = scrapedData.date || '';
    const sTitle = normalize(scrapedData.title || '');
    const sDjs = (scrapedData.djs || []).map(normalize);
    const dbDate = dbEvent.date || '';
    const dbTitle = normalize(dbEvent.title || '');
    const dbDjs = (dbEvent.dj ? [normalize(dbEvent.dj)] : []);
    const dbOrganizer = normalize(dbEvent.organizer || '');

    let score = 0;
    const reasons = [];

    // 1단계: 날짜 일치 (최우선, 40점)
    if (sDate === dbDate) {
        score += 40;
        reasons.push('날짜 일치');
    } else return { score: 0, reasons: [] };

    // 2단계: DJ 일치 (최대 30점) — 날짜 다음으로 중요
    let djMatched = false;
    const allSDjs = sDjs;
    const dbTitleDjs = dbTitle.match(/dj\s*([^\s,()]+)/gi)?.map(m => normalize(m)) || [];
    const allDbDjs = [...dbDjs, ...dbTitleDjs];

    if (allSDjs.length > 0 && allDbDjs.length > 0) {
        djMatched = allSDjs.some(sd => allDbDjs.some(dd => sd.includes(dd) || dd.includes(sd)));
        if (djMatched) {
            score += 30;
            reasons.push('DJ 일치');
        }
    }
    if (!djMatched && allSDjs.length > 0) {
        djMatched = allSDjs.some(sd => dbTitle.includes(sd));
        if (djMatched) {
            score += 25;
            reasons.push('DJ→DB제목 포함');
        }
    }
    if (!djMatched && allDbDjs.length > 0) {
        const djInScraped = allDbDjs.some(dd => sTitle.includes(dd));
        if (djInScraped) {
            djMatched = true;
            score += 25;
            reasons.push('DB DJ→수집제목 포함');
        }
    }

    // 3단계: 제목 유사도 (최대 25점)
    if (sTitle === dbTitle) {
        score += 25;
        reasons.push('제목 완전일치');
    } else if (sTitle.includes(dbTitle) || dbTitle.includes(sTitle)) {
        score += 20;
        reasons.push('제목 포함관계');
    } else {
        const overlap = tokenOverlap(scrapedData.title || '', dbEvent.title || '');
        if (overlap >= 0.4) {
            score += Math.round(overlap * 25);
            reasons.push(`제목 토큰 ${Math.round(overlap * 100)}%`);
        } else if (overlap > 0) {
            score += Math.round(overlap * 15);
            reasons.push(`제목 부분일치 ${Math.round(overlap * 100)}%`);
        }
        if (djMatched && overlap < 0.4) {
            score += 10;
            reasons.push('DJ일치+제목상이 보정');
        }
    }

    // DJ가 양쪽 다 있는데 불일치하면 감점
    if (!djMatched && allSDjs.length > 0 && allDbDjs.length > 0) {
        score -= 20;
        reasons.push('DJ 불일치 (-20)');
    }

    // 4단계: 주최/키워드 일치 (보너스 5점)
    const sKeyword = normalize(scrapedData.keyword || '');
    if (sKeyword && dbOrganizer && (sKeyword.includes(dbOrganizer) || dbOrganizer.includes(sKeyword))) {
        score += 5;
        reasons.push('주최 유사');
    }

    return { score, reasons };
};
// -----------------------------------------------------

const args = process.argv.slice(2);
if (args.length === 0) {
    console.error(`사용법: node scripts/check-duplicate.js '{"date":"2026-02-21", "title":"소셜", "djs":["몽룡"], "keyword":"스윙스캔들"}'`);
    process.exit(1);
}

let scrapedData;
try {
    scrapedData = JSON.parse(args[0]);
} catch (e) {
    console.error('JSON 파싱 오류:', e.message);
    process.exit(1);
}

if (!scrapedData.date) {
    console.error('필수 필드 누락: date 가 필요합니다.');
    process.exit(1);
}

const env = loadEnv();
const supabaseUrl = env.VITE_PUBLIC_SUPABASE_URL;
const supabaseKey = env.VITE_PUBLIC_SUPABASE_ANON_KEY;

async function checkDuplicate() {
    // 해당 날짜의 이벤트 목록 가져오기
    const url = `${supabaseUrl}/rest/v1/events?select=id,date,title,organizer,venue_name&date=eq.${scrapedData.date}`;
    try {
        const response = await fetch(url, {
            headers: {
                'apikey': supabaseKey,
                'Authorization': `Bearer ${supabaseKey}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) throw new Error(`HTTP 오류: ${response.status}`);

        const dbEvents = await response.json();
        if (dbEvents.length === 0) {
            console.log('\n[NEW] 해당 날짜에 등록된 이벤트가 없어 새로운 이벤트로 간주합니다.');
            process.exit(0);
        }

        let bestMatch = null;
        let bestScore = 0;

        for (const db of dbEvents) {
            const match = calcMatchScore(scrapedData, db);
            if (match.score > bestScore) {
                bestScore = match.score;
                bestMatch = { db, reasons: match.reasons };
            }
        }

        console.log(`\n=== 중복 검사 결과 (대상 날짜: ${scrapedData.date}) ===`);
        console.log(`파싱 데이터: 제목[${scrapedData.title}], DJ[${(scrapedData.djs || []).join(',')}]`);

        if (bestScore >= 85) {
            console.log(`\n🚨 [DUPLICATE] 이미 등록된 이벤트입니다 (유사도: ${bestScore}점)`);
            console.log(`- 기준점 초과 원인: ${bestMatch.reasons.join(', ')}`);
            console.log(`- DB 매칭 이벤트: [${bestMatch.db.title}] (DJ: ${bestMatch.db.dj || '없음'})`);
            console.log(`\n💡 AI 지침: 이 이벤트를 저장소(scraped_events.json)에 수집 기록하지 마세요.`);
        } else if (bestScore > 0) {
            console.log(`\n🆕 [NEW] 새로운 이벤트입니다 (유사도: ${bestScore}점 - 85점 미만)`);
            console.log(`- 가장 유사한 DB 이벤트: [${bestMatch.db.title}] (DJ: ${bestMatch.db.dj || '없음'})`);
            console.log(`- 유사 이유: ${bestMatch.reasons.join(', ')}`);
            console.log(`\n💡 AI 지침: 이 이벤트를 정상적으로 수집/저장하세요.`);
        } else {
            console.log(`\n🆕 [NEW] 새로운 이벤트입니다 (유사도: 0점)`);
            console.log(`\n💡 AI 지침: 이 이벤트를 정상적으로 수집/저장하세요.`);
        }
    } catch (e) {
        console.error('DB 조회 실패:', e.message);
        console.log('\n🆕 [NEW] (오류로 인한 안전 통과)');
    }
}

checkDuplicate();
