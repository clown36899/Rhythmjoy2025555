# 환경 변수 설정 가이드

## Netlify 환경 변수 확인

카카오 로그인이 정상 작동하려면 Netlify에 다음 환경 변수가 올바르게 설정되어 있어야 합니다.

### 필수 환경 변수

1. **Netlify Dashboard 접속**
   - Site Settings → Environment Variables

2. **확인 및 설정할 변수**

   ```bash
   # Supabase 설정
   VITE_PUBLIC_SUPABASE_URL=https://mkoryudscamnopvxdelk.supabase.co
   VITE_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
   SUPABASE_SERVICE_KEY=<service_role_key>  # ⚠️ 중요: service_role 키여야 함 (anon 키 아님)
   
   # 카카오 설정
   VITE_KAKAO_REST_API_KEY=<kakao_rest_api_key>
   
   # 관리자 설정
   VITE_ADMIN_EMAIL=<admin_email>
   ```

3. **SUPABASE_SERVICE_KEY 확인 방법**
   - Supabase Dashboard → Project Settings → API
   - **service_role** 섹션의 키를 복사 (⚠️ **anon** 키가 아님!)
   - 이 키는 `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1rb3J5dWRzY2Ftbm9wdnhkZWxrIiwicm9sZSI6InNlcnZpY2Vfcm9sZSI...`로 시작해야 함

### 로컬 개발 환경 (.env)

로컬에서도 동일한 환경 변수를 `.env` 파일에 설정해야 합니다:

```bash
# .env 파일
VITE_PUBLIC_SUPABASE_URL=https://mkoryudscamnopvxdelk.supabase.co
VITE_PUBLIC_SUPABASE_ANON_KEY=<anon_key>
SUPABASE_SERVICE_KEY=<service_role_key>
VITE_KAKAO_REST_API_KEY=<kakao_rest_api_key>
VITE_ADMIN_EMAIL=<admin_email>
```

### 확인 방법

환경 변수가 올바르게 설정되었는지 확인:

1. **Netlify Functions 로그 확인**
   - Netlify Dashboard → Functions → kakao-login
   - 로그에서 `[kakao-login] 환경변수 확인` 메시지 찾기
   - `hasServiceKey: true`, `serviceKeyPrefix: eyJhbGciOiJIUzI1NiIs...` 확인

2. **로컬 테스트**
   ```bash
   # 환경 변수 출력 (민감 정보 주의)
   echo $SUPABASE_SERVICE_KEY | head -c 50
   ```

### 문제 해결

만약 여전히 RLS 에러가 발생한다면:

1. Netlify 환경 변수 재배포
   - 환경 변수 변경 후 **Trigger deploy** 필요
   
2. Supabase 키 재확인
   - service_role 키가 맞는지 다시 확인
   - 키가 만료되지 않았는지 확인
