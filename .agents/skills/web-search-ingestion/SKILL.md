---
name: web-search-ingestion
description: 대한민국 스윙 및 승인된 확장 댄스 장르의 오늘 포함 미래 일정 수집과 원문·등록 실패 및 당일 재시도 진단 지침
---

# Web Search Ingestion V2

이 지침의 목적은 대한민국 스윙 씬과 승인된 확장 장르의 **미래 이벤트만** 수집하고, 현재 운영 정책인 **Cafe24 단일 백엔드** 기준으로 후보를 저장하는 것이다.

## 최우선 규칙

- 2026-09-25 사용자 후속 결정: 소셜 자동수집·등록을 복구한다. `collection-registry.mjs`의 `automaticSocialCollectionEnabled=true`가 현재 정책이다. 공식 공지 직접 연결은 수집 일정과 함께 제공한다. 중단 결정을 다시 적용하지 않는다. [최신 결정 기록](../../../docs/decisions/2026-09-25-social-discovery-windows.md).
- `swing-daily` 자동 실행은 반드시 `getAutomationSourceList('swing-daily')`만 사용한다.
- deprecated `event-ingestion`, `cafe-lesson-ingestion` 흐름은 절대 사용하지 않는다.
- 실제 포스트 URL과 본문, 날짜가 확인된 후보만 저장한다. 강습은 포스터 없이도 저장·자동등록할 수 있다.
- 강습은 이미지가 없어도 원문 근거·날짜·장소·AI 검증을 통과하면 자동등록한다. 그 외 유형은 기존 이미지 규칙을 따른다.
- 로그인 유도, 권한 부족, 응답 중단이 발생한 소스는 즉시 스킵하고 접근불가에 기록한다.
- 어떤 상황에서도 마지막에는 summary 블록을 stdout에 출력하고 종료한다.

## 실행 규율

- 정규 소셜의 반복 재시도는 게시일이 아닌 **행사 당일(KST)** 에만 한다. 전날 공지가 없거나 미래 회차가 미완료라는 이유로 반복 재시도하지 않는다.
- 예약된 스윙 수집은 기존 `INGESTION_NATIVE_FULL_SCAN_HOURS`의 각 시간대에서 새 글·변경 근거를 한 번 확인한다. 중간 예약은 공개 일정에서 오늘 미확정인 정규 소셜만 재확인한다. 늦은 기동은 현재 시간대 한 번으로 따라잡고 놓친 시간대마다 연속 실행하지 않는다. 새 글 탐색을 하루 한 번으로 제한하거나 전체 완료 실패를 전체 재실행 근거로 삼지 않는다.
- 등록 완료·확정 휴무·관리자 삭제는 재시도를 멈추는 근거다. 날짜가 지나면 지난 회차는 종료하며 다음 정규 날짜는 별도 회차로 판단한다. 무한 루프나 실행 중 같은 출처 반복으로 대신하지 않는다.
- 여러 날짜가 섞인 원문은 당일 재시도에서 오늘 소셜만 처리한다. 실패한 미래 소셜은 내용이 같으면 행사일까지 보류하고, 과거 실패 회차를 다음 날 다시 처리하지 않는다. 새 글/원문 변경 확인과 완료 항목 재처리를 구분한다.

- 전체 수집 제한: 20분
- 소스당 제한: 60초
- Playwright 호출 제한: 20초
- `max-turns 120` 기준 110턴 도달 시 즉시 수집 중단 후 summary 출력

Playwright가 멈추면 현재 단계 실패를 기록하고 실행 중 같은 소스를 반복하지 않는다. 종료는 기존 `scripts/run-ingestion.sh`의 자식 프로세스 정리와 실행 잠금에 맡긴다. Mini PC에서 수동 중단이 필요하면 해당 `rhythmjoy-ingestion@<profile>.service`만 대상으로 한다. 프로세스 이름 전체에 대한 `pkill`, 다른 Chrome·키오스크·예약 자동화 종료, 살아 있는 실행의 잠금 삭제는 금지한다. 다음 예약의 당일 재시도 자격은 별도로 판단한다.

## 장애와 재시도 진단

- 출처 오류 조사에서는 같은 출처의 마지막 성공 후보·공개 이벤트와 문제 회차를 먼저 대조한다. 후보 ID, `source_url`, 행사 날짜, 본문/포스터 근거, 등록 이벤트 ID를 확인한다. 성공 예시를 확보하지 못했으면 그 한계를 명시한다. 이전 날짜의 내용·DJ는 현재 회차의 등록 근거로 재사용하지 않는다.
- `레지스트리 탐색 URL → 실제 게시글 URL → 이동 후 URL → 추출 본문 → 후보 저장 → 공개 등록 → 다음 예약 대상` 중 처음 달라진 단계를 찾는다. 보조 홈페이지와 실제 수집 원문을 구분하고, 최근 로그인 오류가 이전 추출·저장 실패까지 설명한다고 단정하지 않는다. 빈 화면은 즉시 링크 오류나 게시글 없음으로 확정하지 않는다.
- 로그인 필요 여부는 **실행 장비의 수집 전용 브라우저**에서 성공 예시와 문제 원문을 읽은 결과로 판단한다. 일반 Chrome 로그인, 쿠키 유무, HTTP 200만으로 성공/실패를 판정하지 않는다. 로그인·권한·검증 차단은 우회하지 않는다.
- 반복 여부는 알림이 아니라 실행 기록, 기존 진행 파일, 공개 일정 및 `pipeline.reconciliation.sameDayRetry`를 대조한다. 이 필드는 해당 실행 범위의 관측 결과이며 재시도 원장이 아니다. 레거시 결과에 필드가 없으면 현재 원장을 읽고 판정한다. 출처 전체 잔여와 오늘 미수집 회차를 구분하고, 알림 24시간 억제를 수집 중단으로 해석하지 않는다.
- 복구 요청의 의도와 실제 결과를 구분한다. 저장 API가 반환한 ID·상태, 자동등록 응답의 이벤트 ID 및 공개 조회까지 확인한 뒤 완료를 보고한다. 내용 식별 안전장치가 ID를 분리하거나 상태를 duplicate로 바꾸면 응답을 기준으로 후속 검증한다. HTTP 성공이나 빈 실행만으로 공개 등록 성공을 보고하지 않는다.
- 재시도 변경 검증은 기존 메인 루프 검사에서 `당일 실패 → 다음 예약 재시도 → 공개 등록 성공 → 이후 중단`을 연결해 확인한다. 함께 영향을 받는 전날/다음날, 휴무/삭제, 다중 회차 일부 성공, 원장 조회 실패만 추가로 검사한다. 실패 출처 전체를 재시도하거나 예약 횟수를 줄여 항목 선정 오류를 덮지 않는다.
- `already checked`는 공개 완료의 증거가 아니다. 구형 `instagramSeenPosts`와 문서/후보 `completedItems`를 대조하고 실제 게시물 선택 함수까지 검증한다. 원문 내용 비교에서 Instagram CDN 서명 갱신을 새 포스터로 오인하지 않는다.
- 주간 공지의 `9월 4주`는 `9월 4일`이 아니다. 상대 요일은 확인된 게시 시각의 KST 주와 명시적 소셜/휴무 구절을 기준으로 검증한다. 휴무는 후보 저장과 공개 정규 일정 반영까지 대조하며 다음 날 정기 반영을 성공으로 대신하지 않는다. [주간 공지 사고 기록](../../../docs/decisions/2026-09-25-weekly-social-completion.md)을 참고한다.

Mini PC 실행 코드 갱신·중단·복구는 [기존 운영 절차](../../../ops/ingestion/mini-pc/README.md)를 따른다. 진단 근거와 한계는 `docs/ISSUE_LOG.md`에 남긴다.

## 수집 범위

프로필은 아래 세 가지만 사용한다.

| 프로필 | 용도 | 저장 여부 |
|---|---|---|
| `swing-daily` | 매일 자동 실행. 스윙 소스만 안정 수집 | 저장 가능 |
| `expanded-research` | 타장르 씬 조사 | 저장 금지 |
| `expanded-ingestion` | 검증된 타장르 후보 저장 | 저장 가능 |

확장 수집 허용 장르는 `street`, `salsa`, `bachata`, `tango`뿐이다. 공연예술/상업 퍼포먼스 계열은 감지만 하고 저장하지 않는다.

## 필터링 핵심 규칙

1. 오늘 포함 미래 일정만 수집한다.
2. 강습이 여러 날짜를 가진 경우 첫 회 날짜가 오늘 이전이면 제외한다.
3. 마감일, 입금일, 공지일을 행사 날짜로 오인하지 않는다.
4. 소셜은 DJ명 또는 구체적 운영 정보가 포스트에 있어야 저장한다.
5. 비공식 내부 API 직접 호출은 금지한다. 브라우저 기반 확인만 허용한다.

## 표준 자동화 파일

아래 파일을 단일 기준으로 사용한다.

| 파일 | 역할 |
|---|---|
| `scripts/ingestion/collection-registry.mjs` | 허용 장르, 제외 소스, 정적 소스, 동적 검색어 |
| `scripts/ingestion/candidate-utils.mjs` | 후보 정규화, ID 생성, 분류, 검증 |
| `scripts/test-ingestion-standards.mjs` | 표준 규칙 테스트 |

후보 저장 직전에는 아래 명령을 통과시킨다.

```bash
node scripts/test-ingestion-standards.mjs
```

## 후보 구조

최종 후보는 반드시 `prepareCandidate()` 또는 `buildCafe24Payload()`와 같은 기준을 따라야 한다.

- 필수: `id`, `source_url`, `structured_data.date`, `activity_type`, `genre_family`, `dance_scope`, `dance_genre`
- 이미지: 강습은 선택 항목이다. 있으면 `poster_url` 또는 `imageData`에 원본을 포함한다. 다른 유형은 기존 검증 기준을 따른다.
- `poster_url`이 외부 원격 자산이면 서버가 로컬 업로드로 치환할 수 있으나, 가능하면 `imageData`까지 함께 보낸다.

```bash
node -e "import('./scripts/ingestion/candidate-utils.mjs').then(({ buildCafe24Payload }) => console.log(typeof buildCafe24Payload))"
```

## 이미지 규칙

- 썸네일, 정사각 크롭, 저해상도 이미지는 금지한다.
- Instagram/Facebook 메타 이미지보다 실제 본문 이미지의 `currentSrc`, `naturalWidth`, `naturalHeight`를 우선한다.
- 저장 전 `file` 또는 `sips`로 크기 확인이 가능하면 확인한다.
- 강습에 이미지가 없으면 빈 이미지로 등록하며 임의 이미지를 만들지 않는다. 원본 포스터가 있으면 확보해 보존한다. 다른 유형은 원본급 이미지를 확보하지 못하면 기존 검증 기준에 따른다.

권장 방식:

1. Playwright로 본문 이미지 URL 추출
2. 가능하면 data URL로 변환해 후보의 `imageData`에 포함
3. 원본 URL은 `poster_url`에도 함께 남김

서버는 `/api/scraped-events`에서 `imageData`를 받아 Cafe24 업로드로 로컬화한다.

## 저장 엔드포인트

- 기본 후보 저장: `https://swingenjoy.com/api/scraped-events`
- V3 후보 저장/검수: `https://swingenjoy.com/api/ingestor-v3/candidates`
- wrapper는 더 이상 레거시 백엔드 cleanup을 수행하지 않는다.

신규 후보 저장은 직접 DB INSERT가 아니라 위 API를 통해서만 한다.

```bash
curl -s -X POST "https://swingenjoy.com/api/scraped-events" \
  -H "Content-Type: application/json" \
  -H "x-ingestion-token: $INGESTION_API_TOKEN" \
  -d '[{"id":"candidate_id","source_url":"https://source","poster_url":"https://poster","imageData":"data:image/jpeg;base64,...","structured_data":{"date":"2026-06-13","title":"이벤트명"},"activity_type":"social","genre_family":"partner","dance_scope":"swing","dance_genre":"swing","is_collected":false}]'
```

## 중복 방지

- L1: `source_url + date` 기반 결정론 ID
- L2/L3: `prepareCandidate()`와 서버 저장 로직이 제목/날짜/소스 기준으로 중복을 다시 걸러낸다.
- 직접 임의 UUID를 만들지 않는다.

## 제외 소스

현재 제외 기준은 `collection-registry.mjs`를 단일 기준으로 본다. 예시:

- `https://www.meroniswing.com/`
- `https://batswing.co.kr/`
- `https://www.instagram.com/batswing2003/`

새 제외 규칙이 필요하면 레지스트리와 테스트를 같이 수정한다. 자동화가 임의로 DB 상태를 직접 패치하지 않는다.

## 완료 체크

- `node scripts/test-ingestion-standards.mjs` 통과
- 실제 포스트 본문 확인 완료
- 강습은 이미지 선택, 포스터가 있으면 원본 보존 확인
- 날짜가 미래 일정으로 확인됨
- `activity_type`, `genre_family`, `dance_scope`, `dance_genre`, `tags`가 본문 기준으로 채워짐
- `swing-daily`는 summary-first 규칙을 지켰음

## 수동 보고

자동 실행 중에는 `docs/INGESTION_STATUS.md`를 갱신하지 않는다. 수동 점검을 별도로 지시받았을 때만 갱신한다.

## 종료 형식

자동 실행과 수동 실행 모두 마지막에는 wrapper가 파싱할 수 있는 summary 블록을 반드시 stdout에 출력한다. summary 없이 종료하면 실패다.
