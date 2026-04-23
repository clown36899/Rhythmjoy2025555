#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const filePath = path.resolve(__dirname, '../../../../src/data/scraped_events.json');

// 한국시간 기준 오늘 날짜 구하기
const now = new Date();
const today = new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);

console.log(`[Cleanup] 오늘 날짜(KST): ${today}`);

try {
  const raw = fs.readFileSync(filePath, 'utf8');
  const events = JSON.parse(raw);
  console.log(`[Cleanup] 정리 전 총 데이터: ${events.length}건`);

  // 소스(keyword)별 그룹화
  const groups = {};
  events.forEach(e => {
    const kw = e.keyword || 'unknown';
    if (!groups[kw]) groups[kw] = [];
    groups[kw].push(e);
  });

  const kept = [];
  const removed = [];

  Object.keys(groups).forEach(kw => {
    const group = groups[kw];

    // 각 그룹의 데이터를 날짜 역순(최신이 위로) 정렬
    group.sort((a, b) => {
      const dA = a.structured_data?.date || a.parsed_data?.date || '0000-00-00';
      const dB = b.structured_data?.date || b.parsed_data?.date || '0000-00-00';
      return dB.localeCompare(dA);
    });

    const seen = new Set();

    group.forEach((e, idx) => {
      const date = e.structured_data?.date || e.parsed_data?.date || '0000-00-00';
      const title = e.structured_data?.title || e.parsed_data?.title || '';
      const uniqueKey = `${date}_${title}`;

      // 중복 체크
      if (seen.has(uniqueKey)) {
        removed.push({ id: e.id, reason: '중복', kw, date });
        return;
      }
      seen.add(uniqueKey);

      // 인덱스 0은 가장 최신 데이터이므로 앵커로 취급하여 무조건 보존
      if (idx === 0) {
        kept.push(e);
        console.log(`  [${kw}] 앵커 보존: ${e.id} (${date})`);
        return;
      }

      // 오늘 이전 과거 데이터는 삭제, 오늘 이후 데이터는 보존
      if (date >= today) {
        kept.push(e);
      } else {
        removed.push({ id: e.id, reason: '과거 데이터', kw, date });
      }
    });
  });

  // 보존된 데이터를 다시 날짜 역순으로 정렬
  kept.sort((a, b) => {
    const dA = a.structured_data?.date || a.parsed_data?.date || '0000-00-00';
    const dB = b.structured_data?.date || b.parsed_data?.date || '0000-00-00';
    return dB.localeCompare(dA);
  });

  fs.writeFileSync(filePath, JSON.stringify(kept, null, 2));

  console.log(`\n[Cleanup] 결과 종합:`);
  console.log(`  보존: ${kept.length}건`);
  console.log(`  삭제: ${removed.length}건`);

} catch (err) {
  console.error('[Cleanup] 오류 발생:', err.message);
  process.exit(1);
}
