---
name: Web Search Ingestion V2
description: 대한민국 스윙 및 확장 댄스 장르의 미래 데이터(오늘 이후)를 수집하기 위한 자율 에이전트 지침서
---

# Web Search Ingestion V2

이 지침의 목적은 대한민국 스윙 씬과 승인된 확장 장르의 **미래 이벤트만** 수집하고, 현재 운영 정책인 **Cafe24 단일 백엔드** 기준으로 후보를 저장하는 것이다.

## 최우선 규칙

- `swing-daily` 자동 실행은 반드시 `getAutomationSourceList('swing-daily')`만 사용한다.
- deprecated `event-ingestion`, `cafe-lesson-ingestion` 흐름은 절대 사용하지 않는다.
- 실제 포스트 URL과 본문, 날짜, 이미지가 확인된 후보만 저장한다.
- 이미지가 없으면 저장하지 않는다.
- 로그인 유도, 권한 부족, 응답 중단이 발생한 소스는 즉시 스킵하고 접근불가에 기록한다.
- 어떤 상황에서도 마지막에는 summary 블록을 stdout에 출력하고 종료한다.

## 실행 규율

- 전체 수집 제한: 20분
- 소스당 제한: 60초
- Playwright 호출 제한: 20초
- `max-turns 120` 기준 110턴 도달 시 즉시 수집 중단 후 summary 출력

Playwright가 멈추면 즉시 아래를 실행하고 같은 소스는 재시도하지 않는다.

```bash
pkill -9 -f "chrome-headless-shell" 2>/dev/null
pkill -9 -f "playwright" 2>/dev/null
sleep 1
```

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
- 이미지: `poster_url` 또는 `imageData` 중 하나는 반드시 포함
- `poster_url`이 외부 원격 자산이면 서버가 로컬 업로드로 치환할 수 있으나, 가능하면 `imageData`까지 함께 보낸다.

```bash
node -e "import('./scripts/ingestion/candidate-utils.mjs').then(({ buildCafe24Payload }) => console.log(typeof buildCafe24Payload))"
```

## 이미지 규칙

- 썸네일, 정사각 크롭, 저해상도 이미지는 금지한다.
- Instagram/Facebook 메타 이미지보다 실제 본문 이미지의 `currentSrc`, `naturalWidth`, `naturalHeight`를 우선한다.
- 저장 전 `file` 또는 `sips`로 크기 확인이 가능하면 확인한다.
- 원본급 이미지를 확보하지 못하면 저장하지 않는다.

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
- 이미지 확보 완료
- 날짜가 미래 일정으로 확인됨
- `activity_type`, `genre_family`, `dance_scope`, `dance_genre`, `tags`가 본문 기준으로 채워짐
- `swing-daily`는 summary-first 규칙을 지켰음

## 수동 보고

자동 실행 중에는 `docs/INGESTION_STATUS.md`를 갱신하지 않는다. 수동 점검을 별도로 지시받았을 때만 갱신한다.

## 종료 형식

자동 실행과 수동 실행 모두 마지막에는 wrapper가 파싱할 수 있는 summary 블록을 반드시 stdout에 출력한다. summary 없이 종료하면 실패다.
