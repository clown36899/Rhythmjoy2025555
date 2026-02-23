---
description: [Admin] Supabase 데이터베이스 직접 접속/관리 가이드 (CLI 활용)
---

# Supabase DB 직접 접속 가이드

이 문서는 개발자가 로컬 환경에서 운영 DB(Supabase)에 직접 접속하여 쿼리를 실행하거나 데이터를 확인할 때 사용하는 절차를 설명합니다.

## 📋 사전 준비 (Prerequisites)
1. **Netlify CLI**: 프로젝트에 연결된 환경 변수를 가져오기 위해 필요합니다. (`npx netlify`)
2. **PostgreSQL Client**: `psql` (터미널) 또는 DBeaver, TablePlus 같은 GUI 툴이 설치되어 있어야 합니다.

---

## 🚀 접속 단계 (Step-by-Step)

### 1단계: Netlify 환경 변수 확인
터미널에서 아래 명령어를 실행하여 현재 프로젝트에 설정된 Supabase 접속 정보를 확인합니다.

```bash
# 프로젝트 루트 디렉토리에서 실행
npx netlify env:list
```

출력 결과에서 다음 항목들을 찾습니다:
- **`VITE_PUBLIC_SUPABASE_URL`**: Supabase 프로젝트 URL (호스트 정보 유추 가능)
- **`SUPABASE_DB_HOST`** (또는 유사한 이름): `db.[project-ref].supabase.co` 형태
- **`SUPABASE_DB_USER`**: 보통 `postgres` 또는 `postgres.monitor` 등
- **`SUPABASE_DB_PASSWORD`**: (보안상 없을 수 있음 -> **사용자에게 직접 문의 필요**)

> **[Tip]** 만약 `DATABASE_URL`이라는 환경 변수가 있다면, 그 값을 그대로 사용하면 됩니다.

### 2단계: DB 비밀번호 확보
**⚠️ 중요**: DB 접속 비밀번호는 보안상의 이유로 환경 변수에 없을 수 있습니다.
- 만약 `env:list` 결과에 비밀번호가 없다면, **프로젝트 관리자(사용자)에게 직접 비밀번호를 요청**하세요.
- 받은 비밀번호는 절대 코드에 하드코딩하지 말고, 접속 시에만 입력하세요.

### 3단계: 접속 명령어 실행 (CLI)
확인한 정보를 바탕으로 `psql` 명령어를 구성하여 실행합니다.

**기본 형식:**
```bash
psql -h [HOST] -p 5432 -U [USER] -d postgres
```

**예시 (Transaction Pooler 포트 6543 사용 권장):**
```bash
# 비밀번호 입력 프롬프트가 뜨면 입력하세요.
psql -h aws-0-ap-northeast-2.pooler.supabase.com -p 6543 -U postgres.xxxxuser -d postgres
```

**또는 Connection String 사용:**
```bash
psql "postgresql://[USER]:[PASSWORD]@[HOST]:[PORT]/postgres?sslmode=require"
```

### 4단계: 접속 확인 및 쿼리 실행
접속에 성공하면 `postgres=>` 프롬프트가 뜹니다.

```sql
-- 테이블 목록 확인
\dt

-- 사이트 통계 인덱스 조회 예시
SELECT * FROM site_stats_index ORDER BY created_at DESC LIMIT 5;
```

---

## 🛠 트러블슈팅 (Troubleshooting)

1. **Connection Timeout / Refused**:
   - 포트가 `5432`인지 `6543`(Pooler)인지 확인하세요. (Supabase는 직접 접속 시 5432, Pooler 경유 시 6543을 사용합니다.)
   - 사내 방화벽이나 VPN이 DB 접속을 차단하는지 확인하세요.

2. **Password Authentication Failed**:
   - 비밀번호에 특수문자가 있다면 URL 인코딩을 해야 할 수 있습니다.
   - 사용자에게 최신 비밀번호인지 재확인하세요.

3. **SSL Error**:
   - 접속 문자열 끝에 `?sslmode=require` 옵션을 추가해 보세요.