import { readFileSync, writeFileSync } from 'fs';

const JSON_PATH = '/Users/inteyeo/Rhythmjoy2025555-5/src/data/scraped_events.json';

const data = JSON.parse(readFileSync(JSON_PATH, 'utf8'));
const today = new Date().toISOString().split('T')[0]; // 2026-05-21

console.log(`전체 ${data.length}건`);

// 미래 이벤트 + 날짜 있는 것만 남김
const clean = data.filter(e => {
  const sd = e.structured_data || {};
  if (!sd.date) {
    console.log(`[제거] 날짜 없음: ${e.id} - ${e.keyword}`);
    return false;
  }
  if (sd.date < today) {
    console.log(`[제거] 과거: ${e.id} - ${sd.date} - ${e.keyword}`);
    return false;
  }
  if (sd.status === 'IGNORED') {
    console.log(`[제거] IGNORED: ${e.id} - ${e.keyword}`);
    return false;
  }
  return true;
});

writeFileSync(JSON_PATH, JSON.stringify(clean, null, 2), 'utf8');
console.log(`\n정리 완료: ${data.length}건 → ${clean.length}건 (${data.length - clean.length}건 제거)`);
