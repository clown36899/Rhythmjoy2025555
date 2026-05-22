import fs from 'fs';
import path from 'path';

async function run() {
  console.log('=== 🔎 DB 내 수집 데이터 & 이미지 & 신뢰성 정밀 검증 시작 ===');

  const supabaseUrl = 'https://mkoryudscamnopvxdelk.supabase.co';
  const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

  // scraped_events 테이블에서 최신 100건 가져오기
  const url = `${supabaseUrl}/rest/v1/scraped_events?select=id,keyword,source_url,poster_url,structured_data,extracted_text,created_at&order=created_at.desc&limit=100`;
  const res = await fetch(url, {
    headers: {
      'apikey': supabaseKey,
      'Authorization': `Bearer ${supabaseKey}`
    }
  });

  if (!res.ok) {
    console.error('❌ Supabase 조회 에러:', res.status, res.statusText);
    return;
  }

  const data = await res.json();
  console.log(`✅ DB로부터 최신 수집 데이터 ${data.length}건을 성공적으로 조회했습니다.`);

  let posterMissingCount = 0;
  let posterLocalExists = 0;
  let posterLocalMissing = 0;
  let fakeInfoCount = 0;

  console.log('\n--- 1. 이미지 수집(poster_url) 무결성 검증 ---');
  data.forEach((row, i) => {
    const poster = row.poster_url;
    if (!poster) {
      posterMissingCount++;
      if (i < 20) console.log(`  [미수집] ID: ${row.id} - poster_url이 비어있음`);
    } else if (poster.startsWith('/scraped/')) {
      const fullPath = path.join('/Users/inteyeo/Rhythmjoy2025555-5/public', poster);
      if (fs.existsSync(fullPath)) {
        const stats = fs.statSync(fullPath);
        posterLocalExists++;
        if (i < 10) console.log(`  [로컬 존재] ID: ${row.id} - ${poster} (${stats.size} bytes)`);
      } else {
        posterLocalMissing++;
        if (i < 20) console.log(`  [로컬 누락 ⚠️] ID: ${row.id} - ${poster} 파일이 로컬 폴더에 실제로 존재하지 않음!`);
      }
    } else {
      if (i < 10) console.log(`  [외부 링크] ID: ${row.id} - ${poster}`);
    }
  });

  console.log(`\n📊 [이미지 통계]`);
  console.log(`  - poster_url이 아예 없음: ${posterMissingCount}건`);
  console.log(`  - 로컬 파일 실제 존재: ${posterLocalExists}건`);
  console.log(`  - 로컬 파일 경로 매핑되었으나 디스크 누락 (깨진 이미지): ${posterLocalMissing}건`);

  console.log('\n--- 2. 가짜 정보 (본문에 없는 추측/허위 정보) 정밀 검증 ---');
  let checkedCount = 0;
  data.forEach((row) => {
    const sd = row.structured_data || {};
    const text = row.extracted_text || '';
    if (!text && !sd.title) return;

    checkedCount++;
    const fakeReasons = [];

    // 본문이 아예 비어있는데 구조화된 세부 데이터가 들어가 있는지 체크
    if (!text && (sd.djs?.length > 0 || sd.times?.length > 0 || sd.fee)) {
      fakeReasons.push('본문 텍스트가 비어있으나 DJ/시간/비용 데이터가 강제 주입됨');
    }

    // 추출된 DJ 검증
    if (sd.djs && sd.djs.length > 0) {
      sd.djs.forEach(dj => {
        if (!text.toLowerCase().includes(dj.toLowerCase()) && !sd.title?.toLowerCase().includes(dj.toLowerCase())) {
          fakeReasons.push(`DJ "${dj}"가 본문 원문에 전혀 언급되지 않음 (허위 DJ 추측)`);
        }
      });
    }

    // 추출된 날짜 검증
    if (sd.date) {
      const dateParts = sd.date.split('-');
      if (dateParts.length === 3) {
        const month = parseInt(dateParts[1]);
        const day = parseInt(dateParts[2]);
        const mStr1 = `${month}월`;
        const mStr2 = `${month}/${day}`;
        const mStr3 = `${month}.${day}`;
        const hasDateInText = text.includes(mStr1) || text.includes(mStr2) || text.includes(mStr3) || text.includes(sd.date) || text.includes(`${month}월 ${day}일`);
        if (!hasDateInText) {
          fakeReasons.push(`날짜 "${sd.date}"(${month}월 ${day}일)가 본문 원문에 명시적으로 나오지 않음 (허위 날짜 추측)`);
        }
      }
    }

    if (fakeReasons.length > 0) {
      fakeInfoCount++;
      console.log(`\n❌ [가짜 정보 발견] ID: ${row.id} | 키워드: ${row.keyword}`);
      console.log(`   출처: ${row.source_url}`);
      console.log(`   타이틀: ${sd.title} | 날짜: ${sd.date}`);
      fakeReasons.forEach(r => console.log(`   🚨 사유: ${r}`));
      console.log(`   [본문 원문]`);
      console.log(text ? text.replace(/\n/g, ' ↵ ').substring(0, 400) : '(본문 없음)');
      console.log('-'.repeat(80));
    }
  });

  console.log(`\n📊 [신뢰성 통계]`);
  console.log(`  - 정밀 대조 검증 건수: ${checkedCount}건`);
  console.log(`  - 가짜/추측/허위 정보 감지 건수: ${fakeInfoCount}건`);
}

run().catch(console.error);
