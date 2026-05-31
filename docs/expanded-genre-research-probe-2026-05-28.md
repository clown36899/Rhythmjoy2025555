# 확장 장르 실제 소스 프로브 2026-05-28

**모드**: `expanded-research`  
**범위**: 살사, 바차타, 탱고, 스트릿  
**실행 기준일**: 2026-05-28  
**저장 여부**: 운영 DB/Storage 쓰기 없음. `swingenjoy.com/.netlify/functions/scraped-events` 호출 없음.

## 요약

- 레지스트리 기반 검사 소스: 33개
- 접근 성공: 30개
- 미래 날짜 후보가 잡힌 소스: 12개
- 이미지 후보가 잡힌 소스: 21개
- 목적: 후보 저장이 아니라 소스 구조, 최근성, 원본 추적 가능성 확인

## 장르별 결과

### 살사

- 접근 성공: 15/15
- 미래 날짜가 잡힌 소스: `latin-in-seoul`, `salsavida-seoul`, `korea-latin-dance-hub`, `latindancehub-seoul-guide`, `lsk-meetup`, `sidf`, `salsavida-seoul-sample`
- 이미지 후보가 잡힌 소스: 12개
- 활동 키워드 총량: class 243, social 1553, event 145, recruit 14

| 소스 | 판정 | 미래 날짜 | 이미지 | 저장 판단 |
|---|---:|---:|---:|---|
| Latin in Seoul | candidate-source | 13 | 8 | 주간 허브. venue 공식 원본 역추적 필요 |
| SalsaVida Seoul | discovery-only | 11 | 8 | recurring social 디렉터리. 자체 저장 금지 |
| LSK Latin Dance Meetup | discovery-only | 4 | 8 | 입문/커뮤니티 발견용 |
| SIDF | verified-source | 3 | 8 | 공식 대형 행사 축. 수동 원본성 확인 후 후보 가능 |
| Korea Latin Dance Hub | discovery-only | 1 | 8 | 클럽/커뮤니티 디렉터리 |
| SA Latin | discovery-only | 0 | 8 | 링크 허브. 원본 채널 추적 필요 |
| PlaceOcean | candidate-source | 0 | 3 | mixed social hub. 링크 목적지 추출 필요 |

### 바차타

- 접근 성공: 3/4
- 미래 날짜가 잡힌 소스: `flowdat-after-jeju-sample`
- 이미지 후보가 잡힌 소스: `flowdat-korea`, `social-dance-today`, `flowdat-after-jeju-sample`
- 활동 키워드 총량: class 9, social 4, event 5, recruit 2

| 소스 | 판정 | 미래 날짜 | 이미지 | 저장 판단 |
|---|---:|---:|---:|---|
| Flowdat AFTER JEJU sample | discovery-only | 3 | 1 | 공식 Instagram/행사 원본 역추적 필요 |
| Social Dance Today | discovery-only | 0 | 2 | 글로벌 디렉터리. 자체 저장 금지 |
| Flowdat Korea Search | discovery-only | 0 | 1 | 발견용 |
| BS Bachata | candidate-source | 0 | 0 | 현재 DNS 실패. 보류 |

### 탱고

- 접근 성공: 5/5
- 미래 날짜가 잡힌 소스: `koreatango`
- 이미지 후보가 잡힌 소스: `koreatango`
- 활동 키워드 총량: class 2, social 0, event 5, recruit 4

| 소스 | 판정 | 미래 날짜 | 이미지 | 저장 판단 |
|---|---:|---:|---:|---|
| Korea Tango Cooperative | candidate-source | 2 | 8 | 공식 공지/대회 축. 개별 게시물 단위 확인 필요 |
| Tango Calendar Korea | needs-js-route | 0 | 0 | JS 렌더링/API 분석 필요. 허브로 유지 |
| Instagram 계정 3개 | reject-current-pass | 0 | 0 | 로그인 벽으로 자동 추출 불안정 |

### 스트릿

- 접근 성공: 7/9
- 미래 날짜가 잡힌 소스: `dancecode`, `hydance-popup`, `edancestreet`
- 이미지 후보가 잡힌 소스: `dancecode`, `hydance-street`, `hydance-popup`, `edancestreet`, `justjerkcrew`
- 활동 키워드 총량: class 35, social 1, event 27, recruit 21

| 소스 | 판정 | 미래 날짜 | 이미지 | 저장 판단 |
|---|---:|---:|---:|---|
| DanceCode | candidate-source | 1 | 8 | 플랫폼 상세 페이지 단위로 저장 후보 가능 |
| HY Dance Studio Popup | candidate-source | 1 | 2 | 팝업/원데이 확인용 |
| 이댄스학원 | candidate-source | 1 | 2 | 상시 소개는 제외, 날짜 있는 모집만 후보 |
| HY Dance Studio | scene-map-only | 0 | 1 | 학원 구조 파악용 |
| JustJerk | scene-map-only | 0 | 1 | 상업/크루 축. 저장 전 범위 확인 필요 |
| FREEZE | access-problem | 0 | 0 | 검색상 살아있으나 현재 로컬 DNS 실패 |

## 추가 허브 접근 테스트

레지스트리 바깥에서 “주기적으로 씬 동향을 모으는 곳”을 별도로 찾고 접근했다. 자세한 허브 중심 판단은 `docs/expanded-genre-hub-discovery-2026-05-28.md`에 정리했다.

접근 성공:

- `Latin in Seoul weekly`: 200, 본문 40k+, 이미지 223개, 2026-05-27~31 확인
- `Where to Dance Salsa Seoul`: 200, weekly social 디렉터리 확인
- `Where to Dance Bachata Seoul`: 200, weekly social 디렉터리 확인
- `SalsaVida Seoul Calendar`: 200, 본문 13k+, 링크 384개
- `PlaceOcean`: 200, mixed social hub 확인
- `Tango Calendar`: 200, JS 렌더링 허브 확인
- `Tanguear Seoul`: 200, 글로벌 탱고 이벤트 허브 확인
- `TangotoCUP Seoul`: 200, 2026-07-10~12 서울 예선 확인
- `Jeju SUMM Milonga`: 200, 2026년 8월 행사 확인
- `Chuncheon Tango Festival`: 200, 2026-10-03~05 확인
- `DanceCode`: 200, 행사 플랫폼 확인
- `DanceCode HSDF`: 200, 날짜/장소/비용/이미지 확인
- `DanceChives`: 200, 스트릿 아카이브/발견 도구 확인
- `Flowdat street sample`: 200, 동방배틀 샘플 확인
- `Flowdat latin sample`: 200, AFTER JEJU 라틴 이벤트 확인

## 접근/품질 이슈

- `www.freezekr.com`: 검색 크롤러에는 살아있으나 현재 로컬 DNS에서 해석 실패. 자동화 안정성 재검증 필요.
- `bsbachata.com`: DNS 실패. 현재 레지스트리 후보로는 약함.
- Instagram 단독 프로필은 로그인/봇판정 리스크 때문에 허브가 아니라 공식 원본 포스트 확인용으로만 다룬다.

## 다음 액션

1. 허브 워처를 먼저 만든다: Latin in Seoul, Where to Dance Salsa, SalsaVida, Tango Calendar, DanceCode, FREEZE, Flowdat.
2. 허브에서 venue/organizer를 추출한다.
3. venue/organizer 공식 원본으로 이동해 날짜, 장소, 이미지, 장르, 활동 타입을 확인한다.
4. 공식 원본 검증이 끝난 개별 항목만 `expanded-ingestion` 후보로 승격한다.

==TELEGRAM_SUMMARY_START==
신규: 0건
스킵: 33건
과거데이터삭제: 0건
접근불가: freezekr-stage(DNS 실패), bsbachata(DNS 실패)
이슈: expanded research only; 주기적 허브 우선 전략으로 전환; 운영 DB/Storage 저장 없음
==TELEGRAM_SUMMARY_END==
