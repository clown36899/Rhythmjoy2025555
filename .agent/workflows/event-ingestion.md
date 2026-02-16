---
description: 인스타그램 및 네이버를 통한 이벤트 포스터 정밀 수집 및 데이터 파싱 절차
---

# 이벤트 정밀 수집 워크플로우 (Event Ingestion Recipe)

이 워크플로우는 소셜 미디어(인스타그램, 네이버 등)에서 이벤트 정보를 고화질로 수집하고 정보를 구조화하여 `EventIngestor` 시스템에 전달하는 표준 절차를 정의합니다.

## 1. 수집 준비 (Preparation)
- **키워드 명단**: `src/data/scraped_events.json`의 기존 키워드를 참고하거나 사용자가 제공하는 새로운 카테고리 명단을 확인합니다.
- **필터링 규칙**: 검색 시 "지난 1주일(Past Week)" 필터를 기본으로 사용하며, 검색 엔진은 구글(`site:instagram.com`)과 네이버를 혼합 사용합니다.
- **주의사항**: `src/data/scraped_keywords.json` 등의 키워드 정의 문서는 **사용자의 명시적 동의 없이 절대 편집하거나 수정할 수 없습니다.**

## 2. 정밀 수집 5단계 공정 (Precise Scraping Process)
단순 검색 결과 썸네일 수집 대신 아래의 정밀 공정을 준수해야 합니다.

1. **URL 직접 접속**: 구글 썸네일 캡처를 금지하고, 실제 게시물 URL(`instagram.com/p/...`)로 직접 진입합니다.
2. **환경 정돈**: 진입 후 나타나는 로그인 권유 팝업이나 모달을 즉시 제거(Click x:659, y:250 등)하여 시야를 확보합니다.
3. **요소(Element) 기반 캡처**: 전체 화면 캡처가 아닌, 포스터 이미지가 담긴 `div`나 `img` 요소를 식별하여 정밀하게 크롭(CaptureByElementIndex)합니다.
4. **상세 정보 파싱**: 우측 캡션 영역에서 아래 데이터를 구조화하여 추출합니다.
    - **행사 일자**: YYYY-MM-DD 형식 및 요일
    - **DJ 명단**: 출연 DJ들을 배열 형식으로 추출
    - **운영 시간**: 시작 및 종료 시간
    - **상태 및 가격**: 정상 운영 여부(Social Open, CLOSED 등) 및 입장료
    - **특이사항**: 설 연휴 휴무, 장소 변경 등 비고 항목
5. **파일 동기화**: 크롭된 이미지는 `public/scraped/[keyword]_poster.png`로 저장하고, 이미지 경로는 웹 경로(`/scraped/...`)로 기록합니다.

## 3. 데이터 업데이트 및 저장 (Data Sync)
- 수집된 정보를 `src/data/scraped_events.json` 형식에 맞춰 업데이트합니다.
- **필수 필드**: `id`, `keyword`, `poster_url`, `structured_data`, `source_url`.
- **중복 검사**: 수집된 데이터의 날짜와 제목이 기존 DB(`useEvents` 훅 참조)에 있는지 대조합니다.

## 4. 최종 검증 (Verification)
- 관리자 페이지 `http://localhost:5173/admin/ingestor`를 열어 아래 사항을 확인합니다.
    - 포스터 이미지가 찌그러짐 없이(`object-fit: contain`) 표시되는지.
    - 'CLOSED' 상태인 항목이 빨간색으로 시각화되는지.
    - 중복 항목에 'DUPLICATE' 배지가 정상 노출되는지.

---
// turbo
**실행 가이드**: 사용자가 "Event Ingestion Recipe  가이드에 따라서 3주치 이벤트 수집 시작해" 또는 "Event Ingestion Recipe 가이드에 따라서 수집 명단대로 긁어줘"라고 말하면 이 워크플로우를 즉시 로드하여 1단계부터 수행합니다.