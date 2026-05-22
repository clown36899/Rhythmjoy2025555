const SUPABASE_URL = 'https://mkoryudscamnopvxdelk.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1OTQ4MDQ4MiwiZXhwIjoyMDc1MDU2NDgyfQ.IePfNFCPqhpVLvj_YqVX5pcF_zIoVPWUAZ_D-Z9rHmE';

// 잔존 가짜 데이터 7건 개별 확인 후 삭제
async function run() {
  console.log('=== 🧹 2차 정밀 청소: 잔존 가짜 데이터 확인 ===\n');

  const url = `${SUPABASE_URL}/rest/v1/scraped_events?select=id,keyword,source_url,structured_data,extracted_text&order=created_at.desc&limit=500`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}` }
  });
  const data = await res.json();
  console.log(`DB 현재 ${data.length}건\n`);

  // 각 데이터의 날짜를 본문에서 영문/한글 모두 검증
  const MONTH_NAMES_FULL = ['','January','February','March','April','May','June','July','August','September','October','November','December'];
  const MONTH_NAMES_SHORT = ['','Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const MONTH_NAMES_UPPER = ['','JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];

  const toDelete = [];

  for (const row of data) {
    const sd = row.structured_data || {};
    const text = row.extracted_text || '';
    if (!sd.date || !text) continue;

    const dateParts = sd.date.split('-');
    if (dateParts.length !== 3) continue;
    
    const month = parseInt(dateParts[1]);
    const day = parseInt(dateParts[2]);
    
    // 한글 날짜 표기
    const checks = [
      `${month}월`,
      `${month}/${day}`,
      `${month}.${day}`,
      sd.date,
      `${month}월 ${day}일`,
    ];
    
    // 영문 날짜 표기
    if (MONTH_NAMES_FULL[month]) checks.push(MONTH_NAMES_FULL[month]);
    if (MONTH_NAMES_SHORT[month]) checks.push(MONTH_NAMES_SHORT[month]);
    if (MONTH_NAMES_UPPER[month]) checks.push(MONTH_NAMES_UPPER[month]);
    
    // YYYY.MM.DD, YYYY/MM/DD
    checks.push(`${dateParts[0]}.${dateParts[1]}.${dateParts[2]}`);
    checks.push(`${dateParts[0]}/${dateParts[1]}/${dateParts[2]}`);

    const textLower = text.toLowerCase();
    const hasDate = checks.some(c => textLower.includes(c.toLowerCase()));

    if (!hasDate) {
      toDelete.push({ id: row.id, keyword: row.keyword, date: sd.date, text: text.substring(0, 200) });
      console.log(`❌ [삭제 대상] ID: ${row.id} | 날짜: ${sd.date} | 본문 미매칭`);
      console.log(`   본문: ${text.substring(0, 150).replace(/\n/g, ' ')}...\n`);
    }
  }

  console.log(`\n삭제 대상: ${toDelete.length}건\n`);

  if (toDelete.length === 0) {
    console.log('✅ DB 정화 100% 완료! 가짜 정보 0건.');
    return;
  }

  let deleted = 0;
  for (const item of toDelete) {
    const delUrl = `${SUPABASE_URL}/rest/v1/scraped_events?id=eq.${item.id}`;
    const delRes = await fetch(delUrl, {
      method: 'DELETE',
      headers: { 'apikey': SUPABASE_KEY, 'Authorization': `Bearer ${SUPABASE_KEY}`, 'Prefer': 'return=minimal' }
    });
    if (delRes.ok) deleted++;
    else console.error(`  삭제 실패: ${item.id}`);
  }

  console.log(`\n=== 🧹 2차 청소 완료: ${deleted}건 삭제 ===`);
}

run().catch(console.error);
