# Supabase CLI 접속 방법

## 환경변수 가져오기

```bash
# Netlify 환경변수 확인 (값 표시)
npx netlify env:list
# 프롬프트에서 'y' 입력하여 값 표시

# 필요한 정보:
# - VITE_PUBLIC_SUPABASE_URL: https://mkoryudscamnopvxdelk.supabase.co
# - SUPABASE_SERVICE_KEY: (Netlify env에서 확인)
# - DATABASE_PASSWORD: 5Go7aHutmffqk8Je (필요 시 사용자에게 요청)
```

## ✅ 방법 1: Node.js 스크립트 (권장)

**가장 확실한 방법!**

```bash
# 스크립트 실행
node scripts/check_db_structure.js
```

스크립트 내용:
- Supabase Service Key 사용
- `select('*').limit(1)`로 테이블 컬럼 확인
- 실제 데이터 샘플로 구조 파악

## 방법 2: DB 접속 URL 구성

```bash
DATABASE_URL="postgresql://postgres.mkoryudscamnopvxdelk:5Go7aHutmffqk8Je@aws-0-ap-northeast-2.pooler.supabase.com:6543/postgres"
```

### SQL 실행 방법

```bash
# SQL 파일 생성
cat > /tmp/query.sql << 'EOF'
SELECT column_name, data_type, is_nullable 
FROM information_schema.columns 
WHERE table_name = 'board_anonymous_comment_likes' 
ORDER BY ordinal_position;
EOF

# 실행 (현재 작동하지 않음 - Supabase CLI 버그)
npx supabase db remote exec --db-url "$DATABASE_URL" < /tmp/query.sql
```

## 마이그레이션 실행

### 방법 1: Supabase Dashboard (권장)
1. Supabase Dashboard → SQL Editor
2. 마이그레이션 파일 내용 복사하여 실행

### 방법 2: CLI (작동 시)
```bash
npx supabase db remote exec --db-url "$DATABASE_URL" < supabase/migrations/20251231_your_migration.sql
```

## 주의사항

- DATABASE_PASSWORD는 민감 정보이므로 Git에 커밋하지 말 것
- 필요 시 사용자에게 비밀번호 요청
- Netlify 환경변수에서 최신 정보 확인
- **Node.js 스크립트 방법이 가장 확실함**

