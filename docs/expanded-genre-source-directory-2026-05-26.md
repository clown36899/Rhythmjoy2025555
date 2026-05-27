# 확장 장르 소스 디렉터리 1차

**작성일**: 2026-05-26  
**범위**: 스윙 제외. 살사, 바차타, 탱고, 스트릿  
**목적**: 이벤트 저장 전 단계에서 “정보가 모이는 곳”을 먼저 찾고, 씬 구조 파악용 소스 지도를 만든다.  
**주의**: 이 문서는 수집 후보 저장 목록이 아니다. 운영 DB/Storage 삽입 금지. 원본 확인 전에는 인제스터 신규 후보로 넣지 않는다.

## 분류 기준

| 등급 | 의미 | 처리 |
|---|---|---|
| A | 일정/장소/이미지/신청 정보가 직접 모이는 허브 | 우선 모니터링 대상 |
| B | 커뮤니티/venue/학원 목록을 찾는 발견용 허브 | 원본 계정 역추적용 |
| C | 특정 행사/조직/개별 venue 원본 | 허브는 아니지만 씬 맵 증거로 보관 |
| Watch | 인스타/링크/개인 주최자 계정 후보 | 브라우저로 실제 게시 빈도 확인 후 승격 |
| Reject | 날짜 없는 상시 홍보, 장르 범위 밖, K-pop 커버 중심 | 저장 제외 |

## 1. 최우선 허브

| 등급 | 장르 | 소스 | URL | 확인된 역할 | 다음 확인 |
|---|---|---|---|---|---|
| A | street | DanceCode | https://dancecode.kr/ | 스트릿 배틀, 파티, 참가 신청, 명단/대진/미디어가 모이는 종합 플랫폼. 자체 소개에서도 댄서·기획자·팬을 잇는 커뮤니티 플랫폼이라고 설명한다. | 행사 목록 pagination, 이미지 원본, 모집중/마감 구분, organizer 인스타 추출 |
| A | street | FREEZE stage | https://www.freezekr.com/stage | 댄스 행사/배틀/퍼포먼스/기타 카테고리와 날짜·장소·시간을 제공. 개별 페이지에서 참가비/관람비/장르/주최/인스타 링크가 확인된다. | 진행중/종료 페이지 구조 파싱, 이미지 비크롭 추출 |
| A | salsa/bachata | Latin in Seoul | https://salsa.atoo.kr/ | 서울 라틴 소셜 주간 업데이트 허브. 홍대/강남 venue별 요일, 시간, DJ, Salsa/Bachata 비율, Instagram 링크를 제공한다. | venue Instagram 링크 실제 handle 추출, 매주 변경분 추적 |
| A | tango | Tango Calendar Korea | https://tangocalendar.kr/ | 서울 탱고 밀롱가/이벤트/DJ 공연 캘린더. 반복 이벤트와 iCal, 모바일/다국어를 지원한다고 설명한다. | JS 렌더링으로 event 목록 추출, 이미지 없는 일정 처리 원칙 정하기 |
| A | partner/street mixed | Flowdat | https://flowdat.co/ | 전 세계 댄스 클래스/워크샵/배틀/쇼/캠프/오디션 검색 플랫폼. 한국 라틴 이벤트도 Instagram 원본 링크와 함께 노출된다. | Korea 필터 검색, Instagram 원본 링크 안정성 |
| A- | social dance mixed | PlaceOcean | https://www.placeocean.kr/ | Salsa/Bachata/Tango/WCS 허브를 표방. 한국 소셜댄스 정보 진입점으로 보인다. | 내부 Link 버튼 목적지 추출, 실제 업데이트 빈도 |

## 2. 장르별 발견용 허브

| 등급 | 장르 | 소스 | URL | 확인된 역할 | 다음 확인 |
|---|---|---|---|---|---|
| B | salsa/bachata | Korea Latin Dance Hub | https://latindance.kr/clubs-en | 전국 Latin community directory. 서울/부산/대구 등 지역별 클럽과 커뮤니티 이름을 넓게 제공한다. | listed communities의 실제 SNS/웹 원본 찾기 |
| B | salsa/bachata | SA Latin Linktree | https://linktr.ee/sa.latin.official | SA Latin Salsa Dance Club의 링크 허브. Instagram/Facebook/TikTok/Daum Cafe/KakaoTalk/WhatsApp 진입점. | 링크별 실제 공지 주기, 신규회원/강습/소셜 분리 |
| B | salsa/bachata | SalsaVida | https://www.salsavida.com/ | Salsa/Bachata venue/event directory. Latin Club Sol 같은 서울 recurring social이 노출된다. | 서울/부산 등 Korea query 결과 수집, 원본 인스타 역추적 |
| B | salsa/bachata | Social Dance Today | https://social-dance.today/ | 글로벌 social dance party 검색 사이트. 서울 Club LATIN의 Bachata/Zouk weekly party가 노출된다. | “Event found via web search” 표기라 원본 확인 필수 |
| B | salsa/bachata | LatinDanceHub.co | https://latindancehub.co/ | 전 세계 Latin dance school/venue directory. Hong Turn, Rueda 등 한국 venue profile이 검색된다. | venue 원본 링크 추출, 업데이트 날짜 확인 |
| B | tango | Enjoy Tango | https://www.enjoytango.com/ | 글로벌 탱고 milonga directory. Seoul milonga 페이지에 시간/venue/organizer/연락처가 노출된다. | 서울 event 목록 검색, 중복/반복 일정 처리 |
| B | tango | Seoul Tango Community Meetup | https://www.meetup.com/ko-KR/secret-fancy-tango/ | 영어/한국어 탱고 클래스·프랙티카 커뮤니티 진입점. | Meetup 이벤트 원본성, Instagram/Facebook 링크 확인 |
| B | street/general | Event-us dance category | https://event-us.kr/ | 일반 행사 플랫폼이지만 WDF 같은 댄스대회/스트릿댄스쇼/브레이킹 항목이 노출된다. | dance/스트릿/힙합 태그 검색 자동화 가능성 |

## 3. 원본·조직 소스 후보

| 등급 | 장르 | 소스 | URL | 확인된 역할 | 다음 확인 |
|---|---|---|---|---|---|
| C | salsa/bachata | AK Salsa / La Conexión | https://www.aksalsa.com/about-1 | 영어권 Salsa On2/Bachata class와 Monday La Conexión 축. 입문자 유입 경로 파악용. | 실제 일정 페이지/인스타 원본 필요 |
| C | salsa/bachata | JDC Meetup | https://www.meetup.com/ko-KR/seoul-latin-dance-salsa-bachata/ | 회원 기반 라틴 클래스/소셜 커뮤니티. 반복 클래스와 비용 구조 파악에 유용. | Meetup 자체 정보와 원본 SNS 분리 |
| C | salsa/bachata | K-Latin | https://www.k-latin.net/ | 한국라틴문화협회. 자격증/교육/협회 축. | 이벤트성 공지 여부, SNS 링크 확인 |
| C | tango | Korea Tango Cooperative | https://koreatango.co.kr/main | 탱고 협동조합/대회/워크샵/개인레슨/자원봉사 모집 원본. | 공지 게시판 구조, 이미지/첨부 파일 추출 |
| C | tango | Seoul Tango Festival | https://seoultangofestival.com/ | 서울 탱고 페스티벌 공식 축. | 2026/2027 일정 업데이트 확인 |
| C | tango | K-TANGO | https://www.k-tango.net/ | 관광/공연/원데이/밀롱가 연계 탱고 공식성 소스. | 정기 일정인지 일회성 사업인지 분리 |
| C | tango | El Bulín Tango Studio | https://elbulintango.blogspot.com/ | 서울 탱고 스튜디오/워크샵/밀롱가 일정 블로그. | 최신성, 이미지 품질, venue 링크 |
| C | street | Street Force Seoul | https://www.instagram.com/streetforceseoul/ | DanceCode 행사에서 공식 Instagram으로 확인되는 Street Force 계정. | Chrome/Instagram으로 게시 주기와 원본 포스터 확인 |
| C | street | DanceCode Instagram | https://www.instagram.com/dancecode_world/ | DanceCode 안내/행사 접수 축. DanceCode 자유게시판과 RF JAM 행사 본문에서 `dancecode_world`로 확인. | 최근 게시물 구조와 개별 행사 원본 포스터 확인 |
| C | street | Toppin / STRIKER MOVE | https://toppin.info/STRIKER_MOVE | 스트릿댄스 배틀·플레이존·마켓 결합 행사성 페이지. | 플랫폼인지 단일 행사인지 판단 |

## 4. Instagram 우선 확인 큐

Instagram은 검색 결과만으로는 정보가 부정확할 수 있으므로, 다음 단계에서 Chrome 또는 Playwright로 실제 게시물 목록을 확인한다.

| 우선순위 | 장르 | 계정/링크 | 근거 | 확인할 것 |
|---|---|---|---|---|
| 1 | salsa/bachata | https://www.instagram.com/latin_in_seoul/ | 여러 검색 결과와 커뮤니티 언급에서 daily/weekly 라틴 소셜 요약 계정으로 반복 확인 | 게시 빈도, venue 링크, 원본 포스터 유무 |
| 1 | salsa/bachata | Latin in Seoul의 venue Instagram 링크 묶음 | Latin in Seoul weekly page가 Bonita/Hongturn/Buena/Comeyeya/Turn/Latin 등 링크를 제공 | 각 handle 추출, 공식성, 소셜 포스터 품질 |
| 1 | street | https://www.instagram.com/dancecode_world/ | DanceCode 자유게시판/행사 본문에서 공식 접수 축으로 확인. `instagram.com/dancecode/`는 한국 DanceCode가 아니므로 사용 금지 | 행사 원본 포스터, 스토리 의존 여부 |
| 1 | street | https://www.instagram.com/streetforceseoul/ | DanceCode의 Street Force Seoul 행사에서 공식 Instagram으로 명시 | 서울콘/배틀/커버 퍼포먼스 모집 흐름 |
| 2 | salsa/bachata | https://www.instagram.com/sa.latin.official/ | SA Latin Linktree의 공식 계정 후보 | 강습/소셜/신규모집 게시 구분 |
| 2 | salsa/bachata | https://www.instagram.com/jessica_latinclub_bonita/ | Latin Seoul 여행/venue 정보에서 Club Bonita 공식/운영 계정 후보로 확인 | 매일 소셜/클래스 게시 여부 |
| 2 | salsa/bachata | https://www.instagram.com/neonsalsaitaewon/ | Seoul Latin guide에서 Itaewon social 계정 후보로 확인 | 현재 운영 여부 |
| 2 | tango | Tango Calendar Korea가 공유하는 SNS 대상 | 사이트가 소셜 공유 기능을 제공하나 handle은 미확인 | 공유 URL/원본 계정 추출 |
| 3 | street | FREEZE 개별 행사 본문의 DJ/MC/Judge/주최자 Instagram 링크 | FREEZE event page에서 다수 Instagram 링크 확인 | organizer 계정 중 반복 주최자만 선별 |

## 5. 현재 판단

### 2026-05-26 실제 확인 메모

- `latin_in_seoul` Instagram은 Playwright로 실제 프로필/게시물 alt를 확인했다. 게시물 2,070개, 팔로워 3,811명 규모이며, 2026년 5월 20~25일 일자별 살사/바차타 소셜 요약과 클래스 홍보가 반복 노출된다. 라틴 씬 “일일 현황판” 역할이 강하다.
- `instagram.com/dancecode/`는 한국 DanceCode가 아니라 러시아권 계정으로 확인되어 사용하지 않는다. 한국 DanceCode 공식 축은 `@dancecode_world`로 정정한다.
- FREEZE stage는 진행중 행사 목록에서 배틀/퍼포먼스/기타 카테고리, 장소, 날짜, 시간을 직접 노출한다. 스트릿 쪽은 우선 FREEZE/DanceCode를 허브로 쓰고, 반복 organizer 계정을 역추적한다.
- Latin in Seoul 웹 weekly page는 “Every Wednesday to Sunday”, 홍대/강남 클럽, 음악 비율/파티 시간 확인 용도로 소개되어 허브로 쓸 수 있다. 단 운영 DB 저장은 venue 공식 인스타나 원본 포스터를 확인한 뒤 한다.

### 스트릿

가장 좋은 시작점은 **DanceCode + FREEZE**다. 둘 다 날짜, 장소, 신청, 비용, 장르, 포스터가 비교적 구조화되어 있다. 다만 DanceCode/FREEZE에 이미 올라온 것은 “허브 수집”이고, 씬 지도를 만들려면 반복 주최자 계정과 특정 장르별 organizer를 역추적해야 한다.

### 살사/바차타

가장 좋은 시작점은 **Latin in Seoul + venue Instagram 묶음**이다. Latin in Seoul은 직접 저장 원본이라기보다 “이번 주 어디서 무슨 소셜이 열리는지”를 보여주는 상위 허브다. 저장은 각 venue 공식 인스타 또는 개별 포스터 원본으로 승격하는 방식이 맞다.

### 탱고

가장 좋은 시작점은 **Tango Calendar Korea + Korea Tango Cooperative + Enjoy Tango**다. Tango Calendar는 밀롱가 반복 구조를 파악하기 좋지만 이미지가 없을 가능성이 높다. 저장 후보는 개별 milonga/academy/organizer 원본 포스터를 찾아야 한다.

## 6. 다음 작업 순서

1. Instagram 확인 큐 1순위부터 실제 게시물 20개씩 훑는다.
2. 각 소스에 `source_kind`를 붙인다.
   - `hub`: 여러 주최자의 일정이 모이는 곳
   - `venue`: 특정 장소 중심
   - `organizer`: 특정 주최자/크루/동호회 중심
   - `platform`: 신청/결제/대진/명단까지 가진 플랫폼
3. 각 소스별로 최근 30일/60일 예정 게시 수를 기록한다.
4. 저장 후보 승격은 `A 등급 + 최근 예정 일정 + 이미지 + 장소 + 원본 URL`이 모두 확인된 경우만 한다.
5. 운영 인제스터에는 아직 넣지 말고, `expanded-research` 리포트로 누적한다.

## 참고 출처

- DanceCode: https://dancecode.kr/
- DanceCode official Instagram: https://www.instagram.com/dancecode_world/
- FREEZE stage: https://www.freezekr.com/stage
- FREEZE ended event sample: https://www.freezekr.com/ended_stage/?bmode=view&idx=168225455
- Latin in Seoul: https://salsa.atoo.kr/
- Korea Latin Dance Hub: https://latindance.kr/clubs-en
- SA Latin Linktree: https://linktr.ee/sa.latin.official
- PlaceOcean: https://www.placeocean.kr/
- Tango Calendar Korea: https://tangocalendar.kr/
- Enjoy Tango Seoul sample: https://www.enjoytango.com/en/app/show.php?aid=1070
- Korea Tango Cooperative: https://koreatango.co.kr/main
- Social Dance Today sample: https://social-dance.today/party/bachazouknight-club-latin-d7/2026-04-10
- Flowdat sample: https://flowdat.co/events/2026-after-jeju-latin-conexion-in-seoul-72f12bcabede
- Event-us sample: https://event-us.kr/dance/event/103218
- DanceCode Street Force sample: https://www.dancecode.kr/dance/view/229
