#!/usr/bin/env node

// Netlify 배포 후 Supabase에 알림
const SUPABASE_URL = process.env.VITE_PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.log('⚠️  Supabase 환경변수 없음, 배포 알림 스킵');
  process.exit(0);
}

const buildId = `build-${Date.now()}`;

fetch(`${SUPABASE_URL}/rest/v1/deployments`, {
  method: 'POST',
  headers: {
    'apikey': SUPABASE_ANON_KEY,
    'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    'Prefer': 'return=minimal'
  },
  body: JSON.stringify({ build_id: buildId })
})
  .then(res => {
    if (res.ok) {
      console.log('✅ 배포 알림 전송 완료:', buildId);
    } else {
      console.log('⚠️  배포 알림 실패:', res.status);
    }
  })
  .catch(err => {
    console.log('⚠️  배포 알림 에러:', err.message);
  });
