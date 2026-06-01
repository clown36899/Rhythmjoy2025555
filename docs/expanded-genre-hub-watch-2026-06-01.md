# 확장 장르 허브 워치 결과 2026-06-01

**모드**: `expanded-research`  
**저장 여부**: DB/Storage 저장 없음. 리서치 스냅샷만 생성.  
**검사 소스**: 12개  
**접근 성공**: 11개

## 결론

타장르는 개별 이벤트를 바로 수집하지 않고, 먼저 살아있는 허브에서 venue/organizer를 뽑아야 한다. 이번 워치 결과 기준 우선 루트는 다음이다.

- 라틴/바차타: Latin in Seoul, Where to Dance Salsa/Bachata, SalsaVida, PlaceOcean
- 탱고: Tango Calendar Korea, Tanguear, Korea Tango Cooperative, TangotoCUP, Jeju SUMM Milonga, Chuncheon Tango Festival
- 스트릿: DanceCode, DanceChives, Flowdat, FREEZE는 DNS 재검증 후 보류

## 장르별 결과

### salsa

- 접근 성공: 6/6
- 살아있는 허브: latin-in-seoul-weekly, salsavida-seoul, salsavida-seoul-calendar, where-to-dance-salsa-seoul
- 공식 이벤트 후보: 없음
- 접근 문제: 없음
- 활동 키워드: class:182, social:1802, event:204, recruit:2

- Latin in Seoul Weekly Info: live-hub, extract-venue-organizer-list, future=17, images=12
- Latin in Seoul: origin-candidate, item-level-check, future=17, images=12
- SalsaVida Seoul Calendar: live-hub, extract-venue-organizer-list, future=2, images=12
- Where to Dance Salsa Seoul: live-hub, extract-venue-organizer-list, future=2, images=12
- SalsaVida Seoul: live-hub, extract-venue-organizer-list, future=9, images=12

### bachata

- 접근 성공: 2/2
- 살아있는 허브: where-to-dance-bachata-seoul
- 공식 이벤트 후보: 없음
- 접근 문제: 없음
- 활동 키워드: class:5, social:47, event:11, recruit:1

- Where to Dance Bachata Seoul: live-hub, extract-venue-organizer-list, future=3, images=7

### tango

- 접근 성공: 2/2
- 살아있는 허브: 없음
- 공식 이벤트 후보: 없음
- 접근 문제: 없음
- 활동 키워드: class:2, social:0, event:5, recruit:4

- Korea Tango Cooperative: origin-candidate, item-level-check, future=2, images=12
- Tango Calendar Korea: needs-js-route, inspect-rendered-calendar-or-api, future=0, images=0

### street

- 접근 성공: 1/2
- 살아있는 허브: 없음
- 공식 이벤트 후보: 없음
- 접근 문제: freezekr-stage
- 활동 키워드: class:0, social:1, event:22, recruit:16

- 후보 없음

## 소스별 결과

| 장르 | 소스 | 역할 | 상태 | 다음 액션 | 미래날짜 | 이미지 | 이유 | URL |
|---|---|---|---|---|---:|---:|---|---|
| salsa | Latin in Seoul | origin-candidate | origin-candidate | item-level-check | 17 | 12 | 미래 날짜와 이미지가 있으므로 개별 항목 단위 확인 필요 | https://salsa.atoo.kr/ |
| salsa | Latin in Seoul Weekly Info | hub-discovery | live-hub | extract-venue-organizer-list | 17 | 12 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://salsa.atoo.kr/category/weekly-info/ |
| street | DanceCode | origin-candidate | scene-map-source | keep-for-scene-map | 0 | 12 | 현재성 신호는 있으나 저장 후보 필드가 부족 | https://www.dancecode.kr/ |
| street | Freeze KR | origin-candidate | blocked | manual-retry-or-replace | 0 | 0 | page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.freezekr.com/stage | https://www.freezekr.com/stage |
| tango | Tango Calendar Korea | origin-candidate | needs-js-route | inspect-rendered-calendar-or-api | 0 | 0 | 페이지는 살아있지만 본문 추출이 짧아 캘린더 렌더링 경로 분석 필요 | https://tangocalendar.kr/ |
| bachata | Where to Dance Bachata Seoul | hub-discovery | live-hub | extract-venue-organizer-list | 3 | 7 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://where-to-dance-salsa.com/bachata/seoul/weekly/ |
| salsa | Place Ocean | origin-candidate | weak-source | deprioritize | 0 | 1 | 현재성/날짜/이미지 신호가 약함 | https://www.placeocean.kr/ |
| salsa | SalsaVida Seoul | hub-discovery | live-hub | extract-venue-organizer-list | 9 | 12 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://www.salsavida.com/guides/south-korea/seoul/socials/ |
| salsa | SalsaVida Seoul Calendar | hub-discovery | live-hub | extract-venue-organizer-list | 2 | 12 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://www.salsavida.com/guides/south-korea/seoul/calendar/ |
| salsa | Where to Dance Salsa Seoul | hub-discovery | live-hub | extract-venue-organizer-list | 2 | 12 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://where-to-dance-salsa.com/cities/seoul/ |
| tango | Korea Tango Cooperative | origin-candidate | origin-candidate | item-level-check | 2 | 12 | 미래 날짜와 이미지가 있으므로 개별 항목 단위 확인 필요 | https://www.koreatango.co.kr/ |
| bachata | Flowdat Korea Search | hub-discovery | hub-needs-review | extract-venue-organizer-list | 0 | 1 | 허브/디렉터리이므로 자체 저장하지 말고 원본 venue/organizer를 역추적 | https://flowdat.co/ |

## 운영 반영 규칙

1. `live-hub`는 저장하지 않고 venue/organizer 추출 대상으로 둔다.
2. `official-candidate`는 날짜/장소/이미지/공식성을 수동 확인한 뒤에만 후보 저장으로 승격한다.
3. `needs-js-route`는 페이지가 살아있지만 렌더링/API 분석이 먼저 필요하다.
4. `blocked`는 자동화 안정성이 낮으므로 대체 소스나 수동 확인 루트를 찾는다.

==TELEGRAM_SUMMARY_START==
신규: 0건
스킵: 12건
과거데이터삭제: 0건
접근불가: freezekr-stage(page.goto: net::ERR_NAME_NOT_RESOLVED at https://www.freezekr.com/stage)
이슈: expanded hub watch only; 운영 저장 없음; 허브 우선/원본 역추적 전략
==TELEGRAM_SUMMARY_END==
