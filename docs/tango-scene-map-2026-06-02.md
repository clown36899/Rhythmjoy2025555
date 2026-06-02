# Tango Scene Map (2026-06-02)

Generated: 2026-06-02T08:45:19.465Z

## Scope

- 대상: 한국/서울 중심 아르헨티나 탱고 씬
- 목적: 밀롱가, 프랙티카, 클래스, 대회/페스티벌, venue/organizer 축을 분리해서 장기적으로 씬 지도를 만든다.
- DB 저장: 기본 실행은 리서치 전용이다. `--save-candidates`를 붙이면 Tango Calendar 일정을 `scraped_events` 후보로만 저장한다. 운영 `events` 등록은 관리자 등록 버튼 전까지 하지 않는다.
- 자동 수집 분리: 스윙 일일 자동 수집에는 포함하지 않는다. 탱고는 이 스크립트처럼 별도 research/manual 파이프라인으로만 실행한다.

## Live Calendar Snapshot

| Range | Dates | Count | Unknown venue | Source |
| --- | --- | ---: | ---: | --- |
| Today | 2026-06-02~2026-06-02 | 4 | 2 | https://tangocalendar.kr/api/events?startDate=2026-06-02&endDate=2026-06-02 |
| Week | 2026-06-02~2026-06-08 | 18 | 3 | https://tangocalendar.kr/api/events?startDate=2026-06-02&endDate=2026-06-08 |
| Month | 2026-06-01~2026-06-30 | 30 | 3 | https://tangocalendar.kr/api/events?startDate=2026-06-01&endDate=2026-06-30 |
| Year-to-date future | 2026-06-02~2026-12-31 | 27 | 3 | https://tangocalendar.kr/api/events?startDate=2026-06-02&endDate=2026-12-31 |

### Today

| KST | Title | Venue | DJ | Fee |
| --- | --- | --- | --- | --- |
| 2026. 06. 02. 19:30 | Orange | T.B.A | - | 13000 |
| 2026. 06. 02. 08:00 | 솔로땅고화요정모 | 장소미상 | Solotango | 13000 |
| 2026. 06. 03. 08:00 | UNO | 장소미상 | 태양 실버 | 13000 |
| 2026. 06. 02. 20:00 | 까사밀롱가 | 탱고 클럽 오초 | 사수 | 13000 |

### This Week Top Venues

| Venue | Count |
| --- | --- |
| 탱고 클럽 오초 | 8 |
| 탱고 엔빠스 스튜디오 | 1 |
| 탱고 오나다 | 1 |
| Carlos | 1 |
| Cya | 1 |
| Diego Xen | 1 |
| O.N.E | 1 |
| T.B.A | 1 |

### This Month Recurring Titles

| Title | Count |
| --- | --- |
| 까베세오 | 5 |
| 월루미 | 5 |
| 그리셀밀롱가 | 1 |
| 금나다 | 1 |
| 까사밀롱가 | 1 |
| 딴또로꼬밀롱가 | 1 |
| 무쵸밀롱가 | 1 |
| 서울밀롱가 | 1 |
| 솔로땅고화요정모 | 1 |
| 수에잇밀롱가 | 1 |
| 월나다 | 1 |
| 일루미밀롱가 | 1 |
| 토에잇밀롱가 | 1 |
| 프리메라낮밀롱가 | 1 |
| A.M. | 1 |

## Venue Candidates

| Venue / bar / studio | Hits | Representative schedules | Map status |
| --- | --- | --- | --- |
| 탱고 클럽 오초 | 9 | 그리셀밀롱가(1), 까사밀롱가(1), 딴또로꼬밀롱가(1), 무쵸밀롱가(1), 서울밀롱가(1), 수에잇밀롱가(1), 일루미밀롱가(1), 토에잇밀롱가(1) | needs-kakao-place-link |
| 탱고 엔빠스 스튜디오 | 5 | 월루미(5) | needs-kakao-place-link |
| 탱고 오나다 | 2 | 금나다(1), 월나다(1) | needs-kakao-place-link |
| Carlos | 2 | 까베세오(2) | needs-kakao-place-link |
| O.N.E | 2 | A.M.(1), A.M. afternoon milonga(1) | needs-kakao-place-link |
| 경미 | 1 | Grande(1) | needs-kakao-place-link |
| Alex | 1 | Alonga(1) | needs-kakao-place-link |
| Cya | 1 | Luminoso(1) | needs-kakao-place-link |
| Diego Xen | 1 | 까베세오(1) | needs-kakao-place-link |
| Hug | 1 | 까베세오(1) | needs-kakao-place-link |
| Morning | 1 | 까베세오(1) | needs-kakao-place-link |

## Major 2026 Axes

| Name | Date | Venue | Role | Source |
| --- | --- | --- | --- | --- |
| TangotoWorld CUP Seoul Preliminary 2026 | 2026-07-10~2026-07-12 | Freestyle Tango Studio | competition | https://tangotocup.com/competition/65 |
| JEJU SUMM MILONGA | 2026-08-21~2026-08-23 | SEAORE RESORT, Jeju | festival-milonga | https://www.jejusummmilonga.com/ |
| Chuncheon International Tango Festival | 2026-10-03~2026-10-05 | Chuncheon | festival | https://kcctf.org/ |
| Seoul Tango Festival 2026 | 2026 | Seoul | festival | https://seoultangofestival.com/2026/01/16/2026-stf/ |

## Source Map

| Source | Role | Policy | Probe | Title / note | URL |
| --- | --- | --- | --- | --- | --- |
| Tango Calendar Korea | scene_research | verified_original_required | 200 | Tango Calendar in Seoul, Korea - Tango Milongas & Events | https://tangocalendar.kr/ |
| 까사밀롱가 | scene_research | verified_original_required | skipped | instagram/browser-session-required | https://www.instagram.com/casamilonga_seoul/ |
| 엘땅고 | scene_research | verified_original_required | skipped | instagram/browser-session-required | https://www.instagram.com/eltango_seoul/ |
| Korea Tango Cooperative | scene_research | verified_original_required | 200 | Korea Tango Cooperative 코리아탱고 협동조합 | https://www.koreatango.co.kr/ |
| 탱고피플 | scene_research | verified_original_required | skipped | instagram/browser-session-required | https://www.instagram.com/tangopeople_korea/ |
| Chuncheon International Tango Festival | major_event_axis | official_event_page_allowed | 200 | Chuncheon International Tango Festival 2026 | https://kcctf.org/ |
| Jeju SUMM Milonga | major_event_axis | official_event_page_allowed | 200 | Tango Encuentro / Jeju summ milonga / South Korea | https://www.jejusummmilonga.com/ |
| Seoul Tango Festival | major_event_axis | official_event_page_allowed | 200 | 2026 Seoul Tango Festival &#8211; 2027 Seoul Tango Festival | https://seoultangofestival.com/2026/01/16/2026-stf/ |
| TangotoCUP Seoul Preliminary | major_event_axis | official_event_page_allowed | 200 | TangotoCUP - Official Website - Tango - Cup - Vals - Milonga | https://tangotocup.com/competition/65 |
| Tanguear Seoul Tango Events | scene_research | external_hub_only | 200 | Milonga tango a Seoul - Seoul tango festival - / 29/04/2027 - Tanguear | https://tanguear.com/event/3af5-6126 |
| Enjoy Tango Seoul / Korea events | scene_research | external_hub_only | 200 | 2026 Korea Tango Championship - KTC - 韩国 - Events - Enjoy Tango | https://www.enjoytango.com/app/show.php?aid=2520 |
| PlaceOcean Tango Hub | scene_research | external_hub_only | 200 | Korea Social Dance Hub, Tango Milonga, Salsa Dance Schedule, Bachata Classes, West Coast Swing Events, Social Dance Community | https://www.placeocean.kr/ |
| Seoul Tango Community Meetup | scene_research | external_hub_only | 200 | Seoul Tango Community! / Meetup | https://www.meetup.com/ko-KR/secret-fancy-tango/ |

## Collection Logic

1. Tango Calendar Korea: 오늘/이번주/이번달 밀롱가 흐름과 반복 venue 파악에 사용한다. 이미지가 없으므로 사이트 내부 DB 저장 후보로 바로 승격하지 않는다.
2. 공식 대회/페스티벌: KTC, TangotoCUP, Jeju SUMM, Chuncheon, Seoul Tango Festival은 이미지/장소/날짜가 확인되면 개별 행사 후보로 선별할 수 있다.
3. Venue/organizer SNS: 엘땅고, 까사밀롱가, 탱고피플 등은 브라우저 세션 또는 수동 검증 대상이다. Instagram API 우회 수집은 하지 않는다.
4. 장소 지도: Tango Calendar venue 문자열을 Kakao Place 링크와 매칭하는 별도 테이블이 필요하다. 예: 탱고 클럽 오초, 탱고 엔빠스 스튜디오, 탱고 오나다.
5. 사용자 노출: 허브가 더 잘 정리하는 반복 밀롱가는 외부 링크/씬 지도 방식으로 소개하고, 공식 포스터가 있는 대회/페스티벌/워크샵만 행사 카드 후보로 올린다.

## Immediate Next Steps

- Kakao 장소 매칭: 상위 venue부터 place link, 주소, canonical name을 붙인다.
- Calendar deep-link: Tango Calendar 개별 event id가 공개 상세 URL을 갖는지 확인한다.
- 공식 포스터 축: TangotoCUP, Jeju SUMM, KTC, Seoul Tango Festival, Chuncheon을 개별 행사 후보로 수동 검증한다.
- Monthly refresh: 이 스크립트를 월 1회 돌려 venue/title 변화량을 비교한다.
