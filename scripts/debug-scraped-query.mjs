import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('환경변수가 설정되지 않았습니다.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function todayKST() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

async function diagnose() {
  const targetIds = ['8f61214038b3d12e', '4904eac79c7a6ad2', 'fda7a5f6f940adf4'];
  const minDate = todayKST();
  console.log(`[진단] 기준 날짜 (오늘 KST): ${minDate}`);

  // 1. 단순 ID 조회로 DB 적재 상태 재확인
  console.log('\n--- 1. 단순 ID 조회 ---');
  for (const id of targetIds) {
    const { data, error } = await supabase
      .from('scraped_events')
      .select('id, is_collected, status, structured_data->>date, structured_data->>dance_scope')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`ID ${id} 조회 에러:`, error.message);
    } else {
      console.log(`ID: ${id} | 데이터:`, data);
    }
  }

  // 2. 쿼리 단계별 테스트
  console.log('\n--- 2. 단계별 쿼리 테스트 ---');
  
  // A. 기본 select + is_collected=false
  let qA = supabase.from('scraped_events').select('id', { count: 'exact' }).eq('is_collected', false);
  const { count: cntA, error: errA } = await qA;
  console.log(`단계 A (is_collected = false) 전체 개수: ${cntA}`);

  // B. or 조건 추가
  let qB = supabase.from('scraped_events')
    .select('id', { count: 'exact' })
    .or('status.is.null,and(status.neq.excluded,status.neq.duplicate)')
    .eq('is_collected', false);
  const { count: cntB, error: errB, data: dataB } = await qB;
  if (errB) console.error('단계 B 에러:', errB.message);
  console.log(`단계 B (or 조건 추가) 전체 개수: ${cntB}`);
  console.log('단계 B 결과에 타겟 ID 포함 여부:', targetIds.map(id => ({ id, found: dataB?.some(row => row.id === id) })));

  // C. 날짜 gte 조건 추가
  let qC = supabase.from('scraped_events')
    .select('id', { count: 'exact' })
    .or('status.is.null,and(status.neq.excluded,status.neq.duplicate)')
    .eq('is_collected', false)
    .gte('structured_data->>date', minDate);
  const { count: cntC, error: errC, data: dataC } = await qC;
  if (errC) console.error('단계 C 에러:', errC.message);
  console.log(`단계 C (날짜 gte 조건 추가) 전체 개수: ${cntC}`);
  console.log('단계 C 결과에 타겟 ID 포함 여부:', targetIds.map(id => ({ id, found: dataC?.some(row => row.id === id) })));
}

diagnose().catch(console.error);
