# 살사 소셜 추가 수집·자동화 검토 — 2026-09-11

한국시간 2026-09-11 기준. 기존 후보 수집 API로 **신규 10건**, 이전 보니따 3건을 합쳐 **13건 검수 대기**다. 공개 캘린더 등록·자동 스케줄 활성화·배포는 하지 않았다. 이번 새 10건은 포스터가 없지만 등록 출처·미래 날짜·실제 장소·명시된 DJ 조건을 통과했다.

## 저장한 실제 일정

| 날짜 | 소셜 | 실제 원문 |
|---|---|---|
| 09-15 | 보니따 화보니 / DJ 헤이즐 | [주간 공지](https://pf.kakao.com/_RIMtM/114513323) |
| 09-17 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/316311389/) |
| 09-24 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/316416509/) |
| 10-01 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcnbcb/) |
| 10-08 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcnblb/) |
| 10-15 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcnbtb/) |
| 10-22 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcnbdc/) |
| 10-29 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcnbmc/) |
| 11-05 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcpbhb/) |
| 11-12 | DSN MAX NIGHT / 클럽 라틴 | [행사](https://www.meetup.com/dsn-crew/events/mmdjztyjcpbqb/) |

DSN은 [공식 Upcoming 목록](https://www.meetup.com/dsn-crew/events/)의 실제 카드에 표시된 날짜·링크·전체 설명을 근거로 저장했다. 반복 규칙을 펼쳐 미래 날짜를 만들어 넣지 않았다. 개별 상세 페이지 추가 대조는 첫 h1이 숨겨진 반응형 요소여서 대기 조건이 실패했다. 따라서 9회 전부 개별 상세 화면 검증이 완료됐다고 표현하지 않는다. 09-17 상세 원문은 앞선 조사에서 확인했다. 목록의 84개 표시는 전체 수집 완료 건수가 아니다. 이번 확보 범위는 첫 30개 카드(취소 1, 수요 소셜 10, 강습 10, 목요 소셜 9)이며 그 이후 미확보 항목이 남는다.

보니따는 날짜별 문단을 분리했다. 09-14 휴무는 생성하지 않았다. 09-15의 키좀바홀 DJ 아이린을 메인 살사/바차타 DJ로 합치지 않았고 coming soon 주년파티를 확정 행사명으로 쓰지 않았다. DSN의 부속 강습은 장소와 오래된 7월 마감 문구가 있으므로 목요 소셜 후보에서 제외했다.

## 출처별 실제 확인과 자동수집 가능성

| 고정 출처 | 확인 결과 | 자동화 판단 |
|---|---|---|
| [보니따 공식 카카오](https://pf.kakao.com/_RIMtM) | 09-09~15 주간 원문 공개, 날짜별 DJ·홀·휴무 확인 | 우선 대상. 목록→새 글→날짜별 분리→휴무/홀/DJ 충돌 검수 필요 |
| [DSN 공식 Meetup](https://www.meetup.com/dsn-crew/events/) | 로딩 후 일정 카드와 전체 설명 공개. 09-10은 Cancelled | 우선 대상. 로딩 완료·페이지 확장·취소 상태·일자별 게시물 식별 필요 |
| [강남턴 공식 Instagram](https://www.instagram.com/turn_latinclub_no.1/) | 목록 미리보기에서 09-11 DJ 꼰스, 09-12 DJ 탄, 주간 휴무 단서 발견. 가입 유도로 중단 | 개별 원문/원본 이미지 확인 전 저장 보류. 안정적인 공개 공지 채널 확보 필요 |
| [강남 라틴 공식 Instagram](https://www.instagram.com/latin_gangnam/) | 09-08·09 게시물 존재, 가입 유도로 중단 | 무인 브라우저만으로 안정 운영 보장 불가. DSN 원문과 같은 행사를 중복 생성하지 않아야 함 |
| [부에나 공식 Instagram](https://www.instagram.com/buenabar7/) | 09-08 게시물의 09-09 공지는 과거, 가입 유도로 중단 | 신규 원문 접근 경로 필요. 오래된 Topzone 공지로 대체하지 않음 |
| [기존 홍턴 계정](https://www.instagram.com/latinsnl2040/) | Profile unavailable | 계정 변경/접근 문제 미확정. 폐업으로 판정하지 않음 |
| [수원 돌체비타·쿠바 채널](https://pf.kakao.com/_xcsEgxb) | 공개 목록에 연도 불명 12월 공지와 2025년 공지 혼재 | 현시점 원문·운영 주체 재검증 필요. 2026 일정으로 전용하지 않음 |
| [부산 루에다 공식 카카오](https://pf.kakao.com/_tUgQT) | 확인한 공개 공지는 2020년 | 현행 수집원으로 부적합, 새 공식 출처 필요 |
| [Latin in Seoul](https://salsa.atoo.kr/) | 최근 확보 주간 공지는 09-02~06, 업데이트 지연 안내 | 발견용 허브. 현재 행사로 저장하지 않고 공식 원문 추적에만 사용 |

DSN 수요일은 강남턴 소셜이나 본문에 07-15 날짜가 남아 있고 출연 DJ는 명시되지 않았다. 주최자 DJ MAX를 출연 DJ로 추정하지 않았다. 포스터 없는 DJ 미상 소셜 검증은 통과하지 않아 10건 보류했다. 별도 강습의 지도 Artist Lab과 본문 SNEK 주소도 달라 장소 확인 전 등록하지 않는다.

## 기존 구현과 정확한 연결 누락

**판정: 일부 있음.** 기존 출처 레지스트리, 후보 정규화, 저장 API, 날짜/장소/DJ/이미지 검증을 재사용한다. 이번 변경은 검증된 고정 출처 2개를 레지스트리에 연결한 것뿐이다. 새 수집기·테이블·큐·상태값은 만들지 않았다. 다른 카카오 채널/Meetup 그룹과 그룹 첫 화면·캘린더는 행사 원문으로 허용하지 않는다.

증상 → 출처 레지스트리에 두 공식 출처가 없음 → `isImageOptionalNamedDjSocial`의 등록 출처 검증에서 포스터 없는 일정 탈락 → 후보 원장에 미저장. 근거는 공식 원문과 실제 `prepareCandidate` 결과다. `fe2b77c68`의 원래 보호 목적은 근거 없는 무이미지 소셜 차단이며 그대로 유지했다. 출처 등록만으로 자동 실행이 활성화되지는 않는다.

자동 실행의 별도 누락도 확인했다. `expanded-genre-native.mjs`의 `supportedWebsiteSources`는 dancecode/koreatango만 지원하고 실행 필터는 website/directory만 받으므로 Meetup은 실행 대상에도 들지 않는다. 보니따 원문 전체를 기존 `extractDatedDjSections`와 `extractExplicitClosureDates`에 입력한 읽기 전용 점검은 둘 다 빈 배열을 반환했다. 이모지에 바로 붙은 날짜, 주간 여러 홀 편성, 휴무를 실제 원문으로 검증하는 공통 파서 연결이 필요하다. 이번에는 검토 범위로 남겼고 날짜 하나 전용 예외를 넣지 않았다.

`1a6211406`에서 강화한 서버 자동등록 출처 허용 목록의 기존 스윙 경계와 두 신규 소스의 `autoRegistrationPolicy=manual`을 유지했다. 자동등록까지 켜려면 기존 확장 수집기에 위 2개 출처의 읽기 경로를 연결하고, 신규/수정/취소·반복 일정의 숫자/별칭 URL 중복·주간 DJ/장소 충돌을 통과시킨 뒤 기존 자동등록 정책에 연결해야 한다. 기존 캘린더 유지 정책을 지켜 읽기 실패를 삭제로 해석하지 않는다.

## 검증·운영 상태

기존 수집 표준 검사 통과. 인접 테스트를 확장해 2개 출처의 이미지 없는 DJ 소셜 허용, DJ 누락 거절, 타 출처·그룹/캘린더 첫 화면 거절, 자동등록 미활성화, 스윙 자동 실행 범위 불변을 확인했다. 운영 API 신규 저장 10·중복 0·제외 0; 대상 ID 읽기 재조회에서 이전 3건 포함 13건 모두 pending, 살사 scope, 공개등록 0을 확인했다. 기존 원본 포스터 3장은 유지했고 신규 10건에 임의 이미지를 넣지 않았다.

관리자 화면 접근은 Mac 잠금으로 불가하여 공개 등록을 진행하지 않았다. 임의 관리자 세션을 사용하지 않았다. UI/알림/운영 스케줄 변경이 없어 프런트 배포·알림 발송·전체 앱 테스트는 실행하지 않았다. 변경 전 대상 원장 백업과 저장 응답은 서버 임시 작업 경로에 보관했으며 토큰·쿠키·본문의 채널 비밀번호를 프로젝트 기록에 남기지 않았다. 수집 실행 지침의 전체 20분/소스 60초 제한을 적용했으므로 미확보 출처와 목록 후속 페이지까지 전수수집됐다고 주장하지 않는다.
