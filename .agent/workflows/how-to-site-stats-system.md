---
description: 사이트 통계(Site Stats) 시스템 아키텍처 및 갱신 로직 설명
---

# 사이트 통계(Site Stats) 시스템 작동 원리

이 문서는 `events`, `users` 등의 원천 데이터를 집계하여 프론트엔드(`SwingSceneStats.tsx` 등)에 제공하는 통계 시스템의 아키텍처를 설명합니다.

## 1. 핵심 아키텍처 (2단계 구조)

통계 시스템은 **성능 최적화**를 위해 2단계 캐싱 구조를 따릅니다.

### 1단계: Database Indexing (`site_stats_index`)
- **역할**: 원천 데이터(`events`, `users` 등)의 **'통계용 요약본(Fact Table)'**
- **저장 단위**: "2월 15일 린디합 강습 1개", "현재 회원 수 150명" 등 개별 팩트 단위.
- **갱신 주체**: `refresh_site_stats_index()` (PostgreSQL RPC 함수)
- **특징**: 무거운 원천 테이블을 매번 뒤지는 것을 방지함.

### 2단계: API Caching (`metrics_cache`)
- **역할**: 프론트엔드가 즉시 사용할 수 있는 **'최종 JSON 완제품(Response Cache)'**
- **저장 단위**: `{ summary: {...}, monthly: [...] }` 형태의 거대 JSON 덩어리.
- **갱신 주체**: Cafe24 통계 API (`/api/stats/site`)
- **특징**: `site_stats_index`조차 매번 계산하지 않고, 만들어진 결과를 24시간 동안 재사용함.

---

## 2. 데이터 흐름 (Data Flow)

### [Scenario A: 일반 사용자 접속 시] (⚡ 초고속)
1. **Client**: `/api/stats/site` API 호출
2. **Server**: `metrics_cache` 테이블 조회
   - **Cache Hit (24시간 이내)**: 저장된 JSON 반환 (DB 연산 0)
   - **Cache Miss (24시간 경과)**: -> [Scenario B]로 자동 전환

### [Scenario B: 캐시 만료 또는 최초 접속 시] (🔄 자동 갱신)
1. **Server**: `metrics_cache`가 없거나 오래됨(24h+)을 감지.
2. **Server**: `rpc('refresh_site_stats_index')` **자동 호출**.
   - DB 내부에서 `events` -> `site_stats_index`로 최신 데이터 재집계 (약 1~2초 소요)
3. **Server**: 갱신된 `site_stats_index`를 조회하여 통계 로직(Promo, Monthly 등) 수행.
4. **Server**: 결과를 `metrics_cache`에 **저장(Upsert)**하고 Client에 반환.

### [Scenario C: 관리자 수동 갱신] (🔨 강제 갱신)
1. **Admin**: 'DB 통계 갱신' 버튼 클릭
2. **Client**: `rpc('refresh_site_stats_index')` 직접 호출하여 DB 인덱스 강제 갱신.
3. **Client**: 갱신 완료 후 `/api/stats/site?refresh=true` 호출.
4. **Server**: `refresh=true` 파라미터 확인 -> 캐시 무시하고 인덱스 조회 -> 캐시 덮어쓰기 -> 최신 데이터 반환.
5. **Client**: `statsUpdated` 이벤트 발송 -> 사이드바(`SideDrawer`) 등 전체 UI 즉시 반영.

---

## 3. 주요 파일 및 함수

- **Backend**: `server/cafe24/stats-api.js`
  - Cafe24 통계 API 엔드포인트. 캐시 관리 및 RPC 자동 호출 로직 포함.
- **Admin**: `src/pages/v2/components/SwingSceneStats.tsx`
  - 통계 차트 컴포넌트 및 'DB 갱신' 버튼 핸들러.
- **Frontend**: `src/components/SideDrawer.tsx`
  - `statsUpdated` 이벤트 리스너를 통해 실시간으로 관리자 대시보드 수치 갱신.
- **Database**:
  - Table `site_stats_index`: 통계 요약 테이블
  - Table `metrics_cache`: API 응답 캐시 테이블
  - Function `refresh_site_stats_index()`: 인덱스 갱신용 PL/pgSQL 함수

## 4. 유지보수 가이드

- **통계 로직 수정 시**: `server/cafe24/stats-api.js` 내의 계산 로직을 수정하면, 다음 캐시 갱신 시(또는 수동 갱신 시) 반영됨.
- **새로운 지표 추가 시**:
  1. `refresh_site_stats_index` 함수 수정 (DB에서 데이터 추출)
  2. `server/cafe24/stats-api.js` 수정 (추출된 데이터 가공 및 응답 포함)
  3. `SwingSceneStats.tsx` 수정 (UI 표시)
