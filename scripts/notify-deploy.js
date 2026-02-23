#!/usr/bin/env node

// Netlify 배포 후 Supabase에 알림 (Service Role Key 사용 권장)
const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
// RLS 우회를 위해 Service Role Key 우선 사용, 없으면 Anon Key 사용
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.log('⚠️  [notify-deploy] Supabase 환경변수 누락 (URL 또는 KEY 없음), 알림 스킵');
  if (!SUPABASE_URL) console.log('   - URL: Missing');
  if (!SUPABASE_KEY) console.log('   - KEY: Missing (SUPABASE_SERVICE_KEY or VITE_PUBLIC_SUPABASE_ANON_KEY)');
  process.exit(0);
}

// 키 타입 로깅 (보안상 앞 5자리만 노출)
const keyType = process.env.SUPABASE_SERVICE_KEY ? 'Service Role (Admin)' : 'Anon (Public)';
console.log(`🚀 [notify-deploy] 배포 알림 전송 시작... (Key Type: ${keyType})`);

const buildId = `build-${Date.now()}`;

fetch(`${SUPABASE_URL}/rest/v1/deployments`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_KEY,
    'Authorization': `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({ build_id: buildId })
})
  .then(async res => {
    if (res.ok) {
      console.log('✅ [notify-deploy] 배포 알림 전송 성공:', buildId);
    } else {
      const errorText = await res.text();
      console.log(`⚠️  [notify-deploy] 배포 알림 실패 (Status: ${res.status})`);
      console.log(`   - Error: ${errorText}`);
      console.log('   - Tip: Netlify 환경변수에 SUPABASE_SERVICE_KEY가 설정되어 있는지 확인하세요.');
    }
  })
  .catch(err => {
    console.log('⚠️  [notify-deploy] 네트워크/스크립트 에러:', err.message);
  });
