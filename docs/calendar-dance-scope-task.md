# 캘린더 장르 스코프 적용 작업

## 목적

스윙 외 장르 수집 범위가 넓어지면 `/calendar`에 모든 장르가 섞여 표시된다. 캘린더는 선택한 장르 스코프 안에서만 데이터를 로딩하고 표시해야 한다.

예시:

- 스윙: 스윙, 린디합, 지터벅, 발보아, 블루스, 솔로재즈
- 탱고: 탱고, 밀롱가, 프랙티카
- 살사: 살사
- 바차타: 바차타
- 스트릿: 힙합, 왁킹, 팝핑, 락킹, 하우스, 브레이킹, 크럼프

## 현재 결정

- 운영 DB 스키마는 바로 변경하지 않는다.
- 로컬 DB에 먼저 컬럼/백필/샘플 데이터를 적용해서 화면 동작을 검증한 뒤 운영 반영 여부를 결정한다.
- 캘린더 기본 스코프는 기존 사용자 경험을 위해 `swing`으로 둔다.
- `partner` 같은 큰 묶음은 캘린더 로딩 필터로 사용하지 않는다.
- DB 변경은 반드시 백업 SQL 실행 후 진행한다.
- 백필은 기존 핵심 컬럼(`title`, `date`, `start_date`, `end_date`, `category`, `genre`, 링크류)을 수정하지 않고 새 메타 컬럼만 채운다.

## DB 안전장치

수동 실행용 SQL은 Cafe24 마이그레이션 트리 밖의 별도 수동 작업 경로에 둔다. 자동 적용 경로와 분리해, 커밋만으로 운영 DB에 반영되지 않도록 유지한다.

실행 순서:

1. `01_backup_events.sql`
   - `public.events_backup_before_dance_scope_20260520` 백업 테이블 생성
   - `public.events` 전체를 백업
   - source/backup count 비교
2. `02_apply_schema.sql`
   - 새 컬럼만 추가
   - 제약 조건과 인덱스 추가
3. `03_dry_run_backfill.sql`
   - 업데이트 없이 분류 결과만 확인
   - 기존 스윙 중심 데이터는 fallback으로 `swing`에 남긴다.
   - 명시적으로 `unknown`인 행이 있으면 운영 적용 전에 검토한다.
4. `04_apply_backfill.sql`
   - 새 메타 컬럼만 업데이트
   - 기존 핵심 이벤트 데이터는 변경하지 않음
5. 문제 발생 시 `05_rollback_metadata_columns.sql`
   - 새 인덱스/제약/컬럼 제거
   - 기존 이벤트 데이터는 그대로 유지

운영 적용 전 확인해야 할 조건:

- `01_backup_events.sql` 결과에서 `source_count == backup_count`
- `03_dry_run_backfill.sql` 결과에서 비스윙 장르 판정 샘플이 실제 데이터와 맞는지 확인
- 백필 대상이 새 컬럼만인지 SQL diff로 확인
- 운영 적용 직전 코드 체크포인트 커밋 존재

## 권장 데이터 모델

운영 DB `events`에 다음 컬럼을 추가하는 방향을 검토한다.

```sql
alter table public.events add column if not exists dance_scope text;
alter table public.events add column if not exists dance_genre text;
alter table public.events add column if not exists activity_type text;
alter table public.events add column if not exists dance_tags jsonb default '[]'::jsonb;
```

검토할 제약 조건:

```sql
alter table public.events
  add constraint events_dance_scope_check
  check (dance_scope is null or dance_scope in ('swing', 'salsa', 'bachata', 'tango', 'street', 'unknown'));

alter table public.events
  add constraint events_activity_type_check
  check (activity_type is null or activity_type in ('class', 'social', 'event', 'recruit'));
```

## 적용 단계

1. `src/utils/danceTaxonomy.ts`의 판정 기준을 운영 캘린더용 스코프까지 확장한다.
2. `/admin/v2/ingestor` 등록 로직에서 운영 DB insert 시 `dance_scope`, `dance_genre`, `activity_type`, `dance_tags`를 같이 넣는다.
3. 기존 운영 DB 이벤트 백필 SQL을 작성한다. 바로 실행하지 말고 dry-run select로 결과 검증한다.
4. `/calendar` URL 파라미터를 추가한다.
   - `/calendar?dance=swing`
   - `/calendar?dance=tango`
   - `/calendar?dance=salsa`
   - `/calendar?dance=bachata`
   - `/calendar?dance=street`
5. 캘린더 데이터 쿼리를 스코프 기준으로 제한한다.
6. 캘린더 화면 상단에 장르 스코프 선택 UI를 추가한다.
7. 기존 탭 `전체 / 소셜&행사 / 강습`은 선택된 장르 안에서만 동작하게 한다.

## 검증 기준

- `/calendar?dance=swing`에서 탱고, 살사, 바차타, 스트릿 이벤트가 보이지 않아야 한다.
- `/calendar?dance=tango`에서 스윙 이벤트가 보이지 않아야 한다.
- `/calendar?dance=bachata`에서 살사 이벤트가 섞이지 않아야 한다.
- `/calendar?dance=street`에서 스윙/탱고/살사/바차타 이벤트가 보이지 않아야 한다.
- 캘린더, 리스트, 지도 모드 모두 같은 스코프 필터를 공유해야 한다.
- `/events`에서 캘린더로 이동할 때 현재 선택 장르가 있으면 해당 `dance` 파라미터를 전달해야 한다.

## 리스크

- 현재 운영 DB `events.genre`는 자유 문자열이라 기존 데이터의 스코프 판정이 애매할 수 있다.
- DB 컬럼 추가 전에는 프론트 fallback 판정으로 동작시킬 수 있지만, 장기적으로는 정확도가 떨어진다.
- 백필 전에 기존 데이터 샘플을 반드시 확인해야 한다.

## 보류 항목

- 운영 DB 마이그레이션 실행
- 기존 운영 DB 백필 실행
