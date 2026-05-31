# 확장 장르 리서치 로그 2026-05-28

**범위**: 스윙 제외. 살사, 바차타, 탱고, 스트릿  
**모드**: `expanded-research`  
**운영 원칙**: 운영 DB 저장 없음. 인제스터 후보 삽입 없음. 허브는 원본 계정/포스터를 찾기 위한 지도 역할로만 사용.

> 보강 문서: `docs/expanded-genre-hub-discovery-2026-05-28.md`
> 타장르 리서치는 개별 이벤트 수집보다 “주기적으로 씬 동향을 모으는 허브”를 먼저 찾는 방식으로 전환한다. 허브에서 반복 venue/organizer를 뽑고, 공식 원본으로 역추적한 뒤에만 저장 후보로 승격한다.

## 오늘 확인한 핵심

### 살사/바차타

- `SalsaVida Seoul`은 2026년 6월 기준 서울 라틴 소셜을 날짜별로 촘촘하게 노출한다. 반복 venue는 Latin Official Gangnam, Hongdae Bonita, TURN Latin Club, Havana, Latin Club Sol, Club Bonita, La Bamba 등이다.
- `Latin in Seoul`은 주간 업데이트에서 홍대/강남 venue별 시간, DJ, Salsa/Bachata 비율, 무료 워크샵/퍼포먼스까지 제공한다. 특히 “공식 소스를 기준으로 일정/요금 변경을 반영한다”는 운영 정책이 있어 현황판 가치가 높다.
- `Flowdat`의 2026 AFTER JEJU LATIN CONEXION in Seoul은 2026-06-23~2026-06-26 서울 라틴 소셜/워크샵 이벤트를 노출한다. 신청 폼과 원본 공지 역추적이 필요하다.
- `SIDF`는 단발 대형 페스티벌 축이다. 상시 소셜 캘린더가 아니라 대형 행사/라인업/티켓/소셜 파티 구조 파악에 쓴다.

**판단**: 살사/바차타는 Rhythmjoy가 모든 반복 소셜을 직접 저장하기보다, Latin in Seoul/SalsaVida로 venue를 찾고 공식 venue Instagram 또는 공식 행사 페이지를 확인한 것만 선별 저장하는 방식이 맞다.

### 탱고

- `Korea Tango Cooperative`는 2026년 PTC/KTC 공지, 참가자 명단, 자원봉사자, 워크샵/개인레슨/관람료 관련 운영 문서를 제공한다.
- `Tango Calendar Korea`는 밀롱가/프랙티카 캘린더 허브로 유지하되, 이미지 없는 일정은 바로 저장하지 않는다.
- 검색에 잡히는 `tango.bien.ltd`는 예시성 데이터가 섞여 있어 실제 운영 소스로 승격하지 않는다.

**판단**: 탱고는 전문 캘린더가 이미 강하므로 Rhythmjoy는 허브 링크 소개 + 공식 포스터가 있는 대회/워크샵/모집만 선별 저장한다.

### 스트릿

- `DanceCode`는 “댄스 행사 라인업”을 전면에 두고 모집중/모집마감 상태를 함께 보여준다. 배틀, 참가 신청, 라인업, 명단/대진/미디어가 한 플랫폼에 모이는 구조다.
- `FREEZE` 개별 페이지는 날짜, 시간, 장소, MC/DJ/Judge, 참가비/관람비를 직접 노출한다. 배틀/행사 저장 후보로 승격 가능한 정보 밀도가 높다.

**판단**: 스트릿은 DanceCode/FREEZE가 이미 강한 플랫폼이다. Rhythmjoy는 전문 허브 카드로 연결하고, 공식 페이지가 포스터/날짜/장소/비용을 모두 가진 경우만 `event` 또는 `recruit`로 선별 저장한다.

## 레지스트리 반영

- 타장르 소스에 `sourceKind`, `sceneRole`, `promotionPolicy` 필드를 추가했다.
- `external_hub_only` 소스는 `expanded-ingestion`에서도 저장되지 않는다.
- `official_event_page_allowed`는 공식 행사 페이지가 날짜/장소/이미지까지 갖춘 경우에만 저장 가능하다.
- BAT SWING은 웹사이트뿐 아니라 `instagram.com/batswing2003`도 제외 규칙에 추가했다.

## 다음 조사 순서

1. Salsa/Bachata venue 공식 Instagram 10개를 실제 브라우저로 열어 최근 30일 예정 게시 수, 이미지 품질, Kakao 지도 매칭 가능 장소명을 확인한다.
2. DanceCode/FREEZE 예정 또는 모집중 20건을 `battle`, `workshop`, `recruit`, `performance`로 분류해 스트릿 씬의 활동 비중을 산출한다.
3. Tango Calendar 렌더링 결과에서 반복 밀롱가 venue를 뽑고, 각 venue/organizer 공식 계정으로 역추적한다.
4. `expanded-ingestion` 저장 승격은 장르별 최소 5개 verified original source가 확보된 뒤 시작한다.

## 확인한 출처

- DanceCode: https://dancecode.kr/
- FREEZE L:P BATTLE: https://www.freezekr.com/lpbattle
- SalsaVida Seoul socials: https://www.salsavida.com/guides/south-korea/seoul/socials/
- Latin in Seoul: https://salsa.atoo.kr/
- Flowdat AFTER JEJU LATIN CONEXION: https://flowdat.co/events/2026-after-jeju-latin-conexion-in-seoul-72f12bcabede
- SIDF: https://sidf.kr/
- LatinDanceHub Seoul guide: https://latindancehub.co/blog/where-to-dance-salsa-bachata-in-seoul
- Korea Tango Cooperative: https://www.koreatango.co.kr/
- Tango Calendar Korea: https://tangocalendar.kr/
