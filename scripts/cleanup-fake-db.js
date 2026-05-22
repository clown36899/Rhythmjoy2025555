import fs from 'fs';
import path from 'path';

const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

const PUBLIC_DIR = '/Users/inteyeo/Rhythmjoy2025555-5/public';

async function run() {
  console.log('=== 🧹 DB 가짜/깨진 데이터 완전 삭제 청소 시작 ===\n');

  // 1. scraped_events 테이블 전량 조회
  const url = `${SUPABASE_URL}/rest/v1/scraped_events?select=id,keyword,source_url,poster_url,structured_data,extracted_text,created_at&order=created_at.desc&limit=500`;
  const res = await fetch(url, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`
    }
  });

  if (!res.ok) {
    console.error('❌ Supabase 조회 에러:', res.status, res.statusText);
    return;
  }

  const data = await res.json();
  console.log(`DB에서 ${data.length}건 조회됨\n`);

  const toDelete = [];

  for (const row of data) {
    const sd = row.structured_data || {};
    const text = row.extracted_text || '';
    const reasons = [];

    // 검증 1: 본문이 아예 없는 데이터
    if (!text || text === '(본문 없음)') {
      reasons.push('본문 텍스트가 비어있음 (추측 데이터)');
    }

    // 검증 2: 날짜가 본문에 없는 허위 날짜
    if (sd.date && text) {
      const dateParts = sd.date.split('-');
      if (dateParts.length === 3) {
        const month = parseInt(dateParts[1]);
        const day = parseInt(dateParts[2]);
        const mStr1 = `${month}월`;
        const mStr2 = `${month}/${day}`;
        const mStr3 = `${month}.${day}`;
        const mStr4 = sd.date;
        const mStr5 = `${month}월 ${day}일`;
        // 영어 날짜 표기도 확인 (Oct 8, Nov 13 등)
        const monthNames = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        const mStr6 = monthNames[month] ? `${monthNames[month]} ${day}` : '';
        const mStr7 = monthNames[month] ? `${monthNames[month]}` : '';
        
        const hasDateInText = text.includes(mStr1) || text.includes(mStr2) || text.includes(mStr3) || 
                              text.includes(mStr4) || text.includes(mStr5) ||
                              (mStr6 && text.includes(mStr6)) || 
                              (mStr7 && text.toLowerCase().includes(mStr7.toLowerCase()));
        if (!hasDateInText) {
          reasons.push(`날짜 "${sd.date}"가 본문에 없음 (허위 날짜)`);
        }
      }
    }

    // 검증 3: 날짜 정보 자체가 없는 데이터
    if (!sd.date) {
      reasons.push('날짜 정보 자체가 없음');
    }

    // 검증 4: 로컬 이미지 파일이 누락된 데이터
    const poster = row.poster_url;
    if (poster && poster.startsWith('/scraped/')) {
      const fullPath = path.join(PUBLIC_DIR, poster);
      if (!fs.existsSync(fullPath)) {
        reasons.push(`이미지 파일 누락: ${poster}`);
      } else {
        const stats = fs.statSync(fullPath);
        if (stats.size < 1000) {
          reasons.push(`이미지 파일 크기 너무 작음: ${stats.size} bytes`);
        }
      }
    }

    if (reasons.length > 0) {
      toDelete.push({ id: row.id, keyword: row.keyword, reasons });
    }
  }

  console.log(`\n🔍 삭제 대상: ${toDelete.length}건 / 전체 ${data.length}건\n`);

  if (toDelete.length === 0) {
    console.log('✅ 삭제할 가짜/깨진 데이터가 없습니다. DB가 깨끗합니다.');
    return;
  }

  // 삭제 대상 목록 출력
  for (const item of toDelete) {
    console.log(`🗑️  [삭제] ID: ${item.id} | 키워드: ${item.keyword}`);
    item.reasons.forEach(r => console.log(`   사유: ${r}`));
  }

  // 실제 삭제 실행
  console.log(`\n⚡ ${toDelete.length}건 삭제 실행 중...`);
  
  let deletedCount = 0;
  let failedCount = 0;

  for (const item of toDelete) {
    const deleteUrl = `${SUPABASE_URL}/rest/v1/scraped_events?id=eq.${item.id}`;
    try {
      const delRes = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Prefer': 'return=minimal'
        }
      });
      if (delRes.ok) {
        deletedCount++;
      } else {
        console.error(`  ❌ 삭제 실패 ID: ${item.id} - ${delRes.status} ${delRes.statusText}`);
        failedCount++;
      }
    } catch (e) {
      console.error(`  ❌ 삭제 오류 ID: ${item.id} - ${e.message}`);
      failedCount++;
    }
  }

  console.log(`\n=== 🧹 청소 완료 ===`);
  console.log(`  삭제 성공: ${deletedCount}건`);
  console.log(`  삭제 실패: ${failedCount}건`);
  console.log(`  남은 데이터: ${data.length - deletedCount}건`);
}

run().catch(console.error);
