# 확장 장르 씬 맵 리서치 1차

**작성일**: 2026-05-26  
**범위**: 살사, 바차타, 탱고, 스트릿  
**수행 방식**: `expanded-research` 원칙. 운영 DB 저장/Storage 업로드/인제스터 후보 삽입 없음.

## 요약

이번 조사의 목적은 이벤트 후보를 많이 넣는 것이 아니라, 각 장르 씬이 어떤 구조로 움직이는지 설명할 증거를 모으는 것이다.

1차 결론은 다음과 같다.

- **살사/바차타**: 홍대·강남 소셜바를 중심으로 주중~주말 반복 소셜이 촘촘하다. 살사와 바차타는 독립 장르이지만 현장 운영은 한 venue/한 일정 안에서 비율로 섞이는 경우가 많다. 초보자 유입은 영어권/국제 커뮤니티 클래스와 국내 동호회형 클래스가 동시에 존재한다.
- **탱고**: 일반 소셜바보다 “밀롱가/프랙티카/캘린더/협동조합 대회” 구조가 강하다. 이미지 없는 일정 허브와 공식 대회/워크샵/개인레슨 공지가 분리되어 있어, 저장 후보로 승격하려면 원본 포스터 계정 역추적이 필요하다.
- **스트릿**: 소셜보다 배틀, 워크샵, 오디션/참가자 모집, 학원 정규 클래스가 중심이다. DanceCode/FREEZE 같은 플랫폼이 행사 신청·관람·대진/명단 확인·홍보 기능을 묶는다. 상시 학원 클래스는 이벤트 저장 대상이 아니고, 날짜 있는 배틀/워크샵/모집만 수집 후보가 된다.

### 2026-05-28 보강 결론

- **스윙 daily와 타장르 research/ingestion은 계속 분리**한다. 매일 자동 실행은 `swing-daily`만 사용하고, 타장르 허브는 씬 지도 작성과 원본 계정 역추적에만 쓴다.
- **살사/바차타는 venue 중심 반복 소셜 생태계**다. SalsaVida와 Latin in Seoul에서 매일 반복되는 venue 소셜이 확인되지만, 이들은 허브/현황판이므로 Rhythmjoy DB에는 공식 venue 포스터나 계정 확인 후만 승격한다.
- **탱고맵류 검색 결과는 검증이 필요**하다. `tango.bien.ltd`는 예시성 주소와 더미성 이름이 섞여 있어 실제 소스로 승격하지 않는다. Tango Calendar Korea와 Korea Tango Cooperative 중심으로 유지한다.
- **자동화 안정화 관점**에서는 summary 누락이 가장 큰 위험이다. 타임아웃/외부 종료가 발생해도 fallback summary와 실패 알림을 남기는 방향으로 래퍼를 보강했다.

## 신뢰도 기준

| 등급 | 의미 |
|---|---|
| verified-source | 공식/준공식 페이지에서 날짜·장소·참가/비용/이미지 단서를 확인 가능 |
| candidate-source | 유용하지만 로그인, JS 렌더링, 인스타 원본 확인 등이 추가 필요 |
| discovery-only | 원본을 찾기 위한 허브. 자체 정보만으로 저장하지 않음 |
| reject | 장르 범위 밖, 뉴스/관광/공공기관, 날짜 없는 상시 홍보 |

## 살사/바차타 씬

### 관찰한 구조

살사와 바차타는 한 장르씩 완전히 분리되기보다, 서울 라틴 소셜바 생태계 안에서 함께 운영되는 경우가 많다. `Latin in Seoul`은 홍대/강남 클럽의 주간 소셜 스케줄을 수요일~일요일 단위로 업데이트하고, venue별로 `S3 B3`, `B5 S2` 같은 살사/바차타 비율을 표시한다. 확인된 venue 축은 홍대의 Playground, Havana, Macondo, Feliz Club, 강남의 Sol Bar, ON2 Bar, TOP, Newyork 등이다.

`Jhonatan Dance Company / Seoul Latin Dance Meetup`은 회원 807명 규모로 보이며, 월·화·수·목·토 반복 클래스와 소셜댄스 흐름을 운영한다. 영어 수업, 외국인/한국인 혼합 커뮤니티, 카카오톡/페이스북/인스타 채널을 함께 쓰는 구조다. 비용은 단발 커버/클래스 20,000~40,000원, 월 단위 클래스 155,000원 이상으로 확인된다.

`AK Salsa`는 영어 기반 Salsa On2/Bachata 클래스와 Monday La Conexión 클래스를 강조한다. 이 축은 “외국인/영어권 입문자 친화 클래스 → 소셜로 연결” 경로를 보여준다.

### 씬 맵

| 축 | 현재 판단 |
|---|---|
| activity_mix | 소셜 비중이 높고, 클래스가 유입 장치다. 파티/퍼포먼스도 소셜 안에 섞인다. |
| activity_level | 홍대/강남에서 주중~주말 반복 운영. JDC는 Meetup 기준 예정 이벤트가 매우 많고 반복 클래스 구조가 강하다. |
| entry_path | 영어권 입문 클래스, 국내 동호회형 강습, 소셜바 입장. 초보자는 JDC/AK Salsa 같은 클래스 경로가 명확하다. |
| organizer_model | venue/bar 중심 + 강사/커뮤니티 중심 혼합. 라틴바, 동호회, 외국인 강사 커뮤니티가 공존한다. |
| revenue_model | 클래스 수강료, 소셜 커버차지, 바 매출, 파티 이벤트. |
| venue_map | 홍대/강남 집중. venue 이름과 Google/Instagram 링크는 확보 가능하지만 Kakao 지도 매칭은 별도 정제 필요. |
| source_reliability | Latin in Seoul은 discovery/weekly hub, JDC/AK Salsa는 class/community source. 각 venue 인스타는 다음 패스에서 확인 필요. |

### 수집 전략

- 살사/바차타는 처음부터 분리 저장하지 말고, 한 소스에서 본문 비율과 제목을 읽어 `dance_scope`를 재판정한다.
- Latin in Seoul은 “허브”로 보고, 저장 후보는 각 venue 인스타/공식 포스터로 역추적한다.
- JDC/AK Salsa는 클래스·입문 경로 파악용으로 우선 수집하고, 포스터 이미지가 안정적일 때만 이벤트 후보로 승격한다.

## 탱고 씬

### 관찰한 구조

탱고는 일반 소셜댄스바보다 “밀롱가/프랙티카/캘린더/대회/협동조합” 구조가 더 뚜렷하다. `Tango Calendar Korea`는 서울의 밀롱가, 탱고 이벤트, DJ 공연을 찾아보고 공유하는 캘린더이며 iCal 구독, 반복 이벤트, 다국어/모바일 지원을 내세운다. 다만 JS 렌더링 기반이라 서버 텍스트만으로는 개별 일정과 이미지를 안정 추출하기 어렵다.

`Korea Tango Cooperative`는 Pacific Tango Championship & Korea Tango Championship 중심의 공식 조직으로 보인다. 2026년 참가자 명단, 심사위원, 자원봉사자 모집, 타임테이블, 참가비/관람료/워크샵/개인레슨 환불 규정 등 운영 문서가 확인된다.

### 씬 맵

| 축 | 현재 판단 |
|---|---|
| activity_mix | 밀롱가/프랙티카/워크샵/대회가 핵심. 일반 파티보다 캘린더형 일정과 공식 대회 구조가 강하다. |
| activity_level | 캘린더가 반복 밀롱가를 지원하고, KTC는 대회·워크샵·개인레슨까지 운영한다. |
| entry_path | 입문반/프랙티카/밀롱가 경로가 있을 가능성이 높지만, 1차 조사에서는 개별 학원/입문반 원본 확인이 부족하다. |
| organizer_model | 캘린더 허브 + 협동조합/대회 조직 + 개별 밀롱가 호스트. |
| revenue_model | 대회 참가비, 관람료, 워크샵, 개인레슨비, 밀롱가 입장료로 추정된다. KTC 환불 규정에서 참가비/워크샵/개인레슨비 항목이 확인된다. |
| venue_map | KTC 주소는 확인되나, 밀롱가 venue는 JS 캘린더와 원본 계정 확인이 더 필요하다. |
| source_reliability | Tango Calendar는 discovery/candidate hub, KTC는 verified official source. |

### 수집 전략

- Tango Calendar는 Playwright 렌더링으로 일정 텍스트를 읽되, 이미지가 없으면 바로 저장하지 않는다.
- 밀롱가 개별 원본 포스터 계정, venue 지도 링크, DJ/호스트 정보까지 역추적해야 한다.
- KTC는 대회/워크샵/개인레슨/자원봉사 모집 등 `event`, `class`, `recruit` 분류에 유용하다.

## 스트릿 씬

### 관찰한 구조

스트릿은 “정기 소셜”보다 배틀, 워크샵, 퍼포먼스 대회, 오디션/참가자 모집이 중심이다. `DanceCode`는 댄서·기획자·팬을 연결하는 종합 커뮤니티 플랫폼을 표방하며, 행사 등록, 행사 리스트, 참가자/관람 허브, 명단/대진표, 미디어 기록을 제공한다. 행사 등록은 무료지만 참가·관람 신청을 댄스코드에서 받아야 하는 구조로 보인다.

예시로 `RF JAM2026`은 Breaking/Waacking/Kidz 대표 선발전 구조이며, 참가비, 정원, DJ/MC/Judge, 국제 파이널 시드권까지 포함한다. `ACE HEART X 82GARAGE 2026 POPPING BATTLE`은 팝핑 배틀로 예선/본선 방식, U-24/All Age side, 관람/참가 비용, organizer 계정이 확인된다. `FREEZE`의 L:P BATTLE은 팝핑/락킹 참가비, 관람비, 정원, 선착순 마감, DJ/MC/Judge, venue까지 구조화되어 있다.

### 씬 맵

| 축 | 현재 판단 |
|---|---|
| activity_mix | 배틀/워크샵/모집/대회 비중이 높다. 소셜보다는 경쟁·교육·네트워킹형 이벤트가 중심이다. |
| activity_level | 플랫폼에 다수 모집중/마감 이벤트가 노출된다. DanceCode/FREEZE가 행사 정보와 신청 흐름을 모은다. |
| entry_path | 학원 상시 클래스, 워크샵, 배틀 참가, 청소년/루키/연령대 side, 프로필 등록/커뮤니티 참여. |
| organizer_model | 플랫폼 + 개별 organizer/crew + 학원/스튜디오 + 지자체/협회 혼합. |
| revenue_model | 참가비, 관람비, 워크샵비, 플랫폼 신청, 대회 운영 대행, 후원/상금 구조. |
| venue_map | Fuple Studio, 고릴라크루 본점, 지역 체육센터 등 event마다 venue가 달라진다. 고정 venue보다 순회형이다. |
| source_reliability | DanceCode/FREEZE는 verified/candidate hub. 각 행사 원본 인스타 계정은 다음 패스에서 검증 필요. |

### 수집 전략

- 스트릿은 학원 상시 클래스 페이지를 이벤트로 넣지 않는다.
- 날짜 있는 배틀, 워크샵, 오디션, 참가자 모집만 `activity_type: event` 또는 `recruit`로 후보화한다.
- DanceCode/FREEZE의 자체 페이지는 구조화가 좋지만, 참가비용 “무료”처럼 플랫폼 표기와 본문 실제 비용이 충돌할 수 있으므로 본문 우선으로 파싱한다.

## 출처별 분류

| 소스 | 장르 | 분류 | 비고 |
|---|---|---|---|
| Latin in Seoul | salsa/bachata | discovery-only 또는 candidate-source | 주간 허브. 저장은 venue 원본 포스터 역추적 후. |
| PlaceOcean | salsa/bachata/tango/WCS | discovery-only | hub 성격. JS/렌더링 확인 필요. |
| JDC Meetup | salsa/bachata | candidate-source | 반복 클래스/소셜/영어 커뮤니티 구조 확인. Meetup 자체 이미지/원본성은 검증 필요. |
| AK Salsa | salsa/bachata | candidate-source | 영어 클래스/입문 경로 확인. |
| Tango Calendar Korea | tango | discovery-only | 캘린더 허브. 이미지/원본 포스터 역추적 필요. |
| Korea Tango Cooperative | tango | verified-source | 대회/워크샵/개인레슨/모집 공식 조직. |
| DanceCode | street | verified-source/candidate-source | 배틀·워크샵·모집 플랫폼. 본문 비용 우선. |
| FREEZE | street | verified-source/candidate-source | 배틀/행사 예약 플랫폼. 포스터/정원/비용/venue 확인 가능. |

## 다음 리서치 패스

1. 살사/바차타 venue별 인스타 원본 확인
   - 홍대: Playground, Havana, Macondo, Feliz Club, Bonita, Hongturn, Buena
   - 강남: Latin, Turn, Sol Bar, ON2 Bar, TOP, Newyork
   - 목표: 실제 포스터 이미지, Kakao 지도 매칭 가능한 장소명, 소셜 비율, DJ/입장료 확인

2. 탱고 렌더링 수집
   - Tango Calendar를 Playwright로 읽고, 반복 밀롱가 venue와 원본 계정 목록 작성
   - KTC 외 입문반/프랙티카 운영 주체 확인

3. 스트릿 플랫폼 샘플링
   - DanceCode/FREEZE 최근/예정 20건을 activity_type으로 분류
   - 배틀/워크샵/모집/퍼포먼스대회 비율 산출
   - 참가비/관람비/상금/정원/venue를 표준 필드화

4. 저장 승격 전제
   - 장르별 최소 5개 verified-source 확보
   - 이미지 비크롭 추출 가능성 확인
   - 운영 DB `events`와 인제스터 중복 판정 정상 확인

## 참고 출처

- Latin in Seoul weekly update, 2026-05-20: https://salsa.atoo.kr/category/weekly-info/
- AK Salsa community/classes: https://www.aksalsa.com/about-1
- JDC Meetup: https://www.meetup.com/ko-kr/seoul-latin-dance-salsa-bachata/
- PlaceOcean: https://www.placeocean.kr/
- Tango Calendar Korea: https://tangocalendar.kr/
- Korea Tango Cooperative: https://www.koreatango.co.kr/
- DanceCode: https://www.dancecode.kr/
- DanceCode RF JAM2026: https://dancecode.kr/dance/view/231
- DanceCode ACE HEART X 82GARAGE 2026 POPPING BATTLE: https://www.dancecode.kr/dance/view/225
- FREEZE L:P BATTLE: https://www.freezekr.com/lpbattle
