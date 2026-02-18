---
description: 스윙패밀리 네이버 카페 '외강&행사&연습실' 게시판에서 강습/행사/워크숍 정보 수집 가이드
---

# 네이버 카페 강습·행사 수집 워크플로우 (Cafe Lesson Ingestion)

이 워크플로우의 목적은 스윙패밀리 네이버 카페의 **외강&행사&연습실** 게시판 첫 페이지에서 모든 이벤트(강습, 워크숍, 행사, 소셜 등)를 수집하는 것이다.

**이 문서는 사용자의 명시적 동의 하에 수정할 수 있다**

**오늘 = 한국시간으로 지금이다**

## 수집 대상

| 항목 | 값 |
|:--|:--|
| 소스 | 스윙패밀리 네이버 카페 |
| 게시판 | 외강&행사&연습실 |
| URL | https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L |
| 범위 | **첫 페이지에 보이는 모든 게시물** (15개) |
| 수집 유형 | 강습, 워크숍, 행사, 소셜, 연습실 — **모든 유형** |

## 강제 수칙 (Enforcement Rules)

> [!CAUTION]
> 1. **로그인 금지**: 로그인하지 않는다. 로그인 없이 조회 불가 시 해당 게시물을 스킵한다.
> 2. **첫 페이지만 확인**: 2페이지 이상 탐색, 스크롤 다운으로 추가 게시물 로드, 페이지네이션 클릭 **금지**.
> 3. **검색/필터 금지**: 게시판 내 검색, 말머리 필터 변경, 정렬 변경 **금지**. 기본 상태 그대로 확인한다.
> 4. **이미지 수집 — 다운로드 우선 원칙**:
>    1. **(1순위)** JavaScript로 포스터 `img` 요소의 `src` URL(CDN 주소)을 추출한 뒤, `curl -o` 명령으로 원본 이미지를 직접 다운로드한다.
>    2. **(2순위)** CDN 다운로드 실패 시에만 `CaptureByElementIndex`로 정밀 크롭 캡처한다.
>    - ⛔ **금지**: 전체 화면 스크린샷을 먼저 찍는 행위.
> 5. **task.md 체크리스트 관리**: 각 게시물 처리 시 즉시 task.md 체크를 업데이트한다.
> 6. **이미 수집된 이벤트 중복 확인**: `scraped_events.json`에 동일 ID가 이미 존재하면 스킵한다.

## 수집 절차

### Step 1. 목록 확보

1. `https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L` 접속
2. 오른쪽 게시물 리스트에서 **모든 게시물의 제목, 번호, 작성일**을 추출
3. task.md에 게시물 목록을 체크리스트로 기록

### Step 2. 개별 게시물 진입 및 데이터 수집

각 게시물에 대해 아래를 수행:

> [!IMPORTANT]
> **1 게시물 = 1 데이터 원칙**: 한 게시물에 여러 날짜(예: 4주 강습, 2일 워크숍)가 적혀 있어도, **가장 빠른 시작일(Start Date)을 기준으로 단 1개의 데이터만 생성**한다. 데이터를 날짜별로 쪼개서 여러 개 만들지 않는다.

1. **게시물 클릭** → 상세 페이지 진입
2. **이미지 수집** (다운로드 우선 원칙 적용):
   - 게시물 내 포스터/이미지가 있으면 CDN URL 추출 후 `curl -o`로 다운로드
   - 이미지 없으면 `poster_url: null`로 기록
3. **텍스트 파싱** — 아래 정보를 구조화하여 추출:
   - **제목**: 게시물 제목
   - **유형**: 강습 / 워크숍 / 소셜 / 행사 / 연습실 등
   - **일정**: **시작 날짜(YYYY-MM-DD)** 및 요일, 시간 (다일 강습의 경우 시작일 기준)
   - **장소**: 연습실/스튜디오/홀 이름 및 위치
   - **강사/DJ**: 이름
   - **비용**: 수강료/입장료
   - **신청 링크**: Google Form 등 신청 URL (있는 경우)
   - **특이사항**: 모집 마감, 레벨 제한 등
4. **이미지 저장 경로**: `public/scraped/[id].jpg` 또는 `.png`

### Step 3. 데이터 기록

`src/data/scraped_lessons.json`에 아래 형식으로 추가:

```json
{
  "id": "[카페약어]_[날짜]_[유형]",
  "keyword": "[출처 키워드]",
  "source_url": "[네이버 카페 게시물 URL]",
  "poster_url": "/scraped/[파일명]" 또는 null,
  "extracted_text": "[원문 텍스트]",
  "structured_data": {
    "date": "YYYY-MM-DD",
    "day": "요일",
    "title": "제목",
    "status": "정상운영",
    "type": "강습|워크숍|소셜|행사|연습실",
    "djs": [],
    "instructor": "강사명 (DJ가 아닌 경우)",
    "times": ["시작 ~ 종료"],
    "location": "장소",
    "fee": "비용",
    "registration_url": "신청 링크",
    "note": "비고"
  },
  "evidence": {
    "screenshot_path": "/scraped/[파일명]" 또는 null,
    "ocr_raw": "원문 또는 '수동 텍스트 입력'",
    "extraction_mapping": { ... }
  },
  "created_at": "ISO8601",
  "updated_at": "ISO8601"
}
```

### ID 규칙

| 출처 | 접두사 |
|:--|:--|
| 스윙패밀리 카페 | `swf_` |
| 기타 외부 홍보 | 원래 출처 접두사 사용 |

형식: `swf_YYMMDD_[유형약어]` (예: `swf_260220_workshop`, `swf_260221_social`)

### Step 4. 동기화

1. `scraped_lessons.json` 저장 (직접 수동 편집 시)
2. **Post API 사용 시**: `POST /.netlify/functions/scraped-events?type=lessons` 호출하여 저장
3. 이미지 파일이 `public/scraped/`에 정상 저장되었는지 확인
4. **결과 보고**: 수집 완료 후 사용자에게 아래 관리자 페이지 주소를 제공하여 확인을 요청한다.
   - **주소**: [http://localhost:8888/admin/ingestor](http://localhost:8888/admin/ingestor) (**🎓 강습/워크숍** 탭 확인 필수)

---

## 필수 task.md 템플릿

> [!IMPORTANT]
> 강습 수집 시 아래 템플릿을 **반드시 그대로 복사**하여 task.md를 작성해야 합니다.

```markdown
# 강습/행사 수집 (스윙패밀리 카페)

## 수집 진행
- [ ] 카페 접속 및 목록 확보: https://cafe.naver.com/f-e/cafes/10342583/menus/13?viewType=L
- [ ] 첫 페이지 게시물(15개) 인덱싱 및 task.md 업데이트
- [ ] 개별 게시물 수집 수행 (이미지 다운로드 + 텍스트 파싱)
    - [ ] 게시물 1: [제목]
    - [ ] 게시물 2: [제목]
    - ... (목록에 따라 추가)
- [ ] 데이터 동기화 (`scraped_lessons.json`)
- [ ] 관리자 페이지 확인 안내 ([http://localhost:8888/admin/ingestor](http://localhost:8888/admin/ingestor))
```

---
// turbo
**실행 가이드**: 사용자가 "Cafe Lesson Ingestion 가이드에 따라서 스윙패밀리 카페 강습 수집해줘"라고 말하면 이 워크플로우를 즉시 로드하여 1단계부터 수행합니다. 수집된 결과는 `scraped_lessons.json`에 저장하고 관리자 페이지 주소를 안내하십시오.
