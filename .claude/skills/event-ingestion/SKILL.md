---
name: event-ingestion
description: "Event Ingestion Recipe: 인스타그램 및 네이버를 통한 이벤트 포스터 정밀 수집 및 데이터 파싱. '수집 시작', '이벤트 긁어줘', '스윙 이벤트 수집해라' 요청 시 실행 (오늘 이후의 미래 데이터만 수집)."
---

# 이벤트 정밀 수집 스킬 (Event Ingestion Recipe)

이 스킬은 소셜 미디어(인스타그램, 네이버 등)에서 이벤트 정보를 고화질로 수집하고 정보를 구조화하여 `EventIngestor` 시스템에 전달하는 표준 절차를 정의합니다.

> [!CAUTION]
> **에이전트 실행 강제 수칙 (Enforcement Rules)**
> 0. **수집 대상 유형 필터 [최최우선]**: 수집 대상은 **DJ 소셜 파티**만 해당. (강습/워크숍, 공연, 후기 절대 수집 금지)
>    - **판별 기준**: 포스터/캡션에 "소셜", "Social", "파티", "Party", "DJ" 중 하나 이상 포함 시 수집.
> 1. **비로그인 원칙**: 로그인 팝업 발생 시 즉시 닫기. 조회가 안 되면 수집 포기 후 다음 단계로.
> 2. **"결과 없음 = 정상 완료"**: 게시물 미발견 시 실패가 아닌 정상으로 간주하고 즉시 다음 소스로 이동.
> 3. **데이터 갭 해석 금지**: "data gap", "누락 조사" 등으로 해석하는 것을 절대 금지한다.
> 4. **인스타그램 제한**: 최근 **6개 포스트**만 순서대로 클릭하여 확인. 7번째 이상 금지.
> 5. **타 프로필 방문 금지**: 지정된 계정 외 다른 사용자 프로필 방문 금지.
> 6. **지정 소스 및 경로 엄수 [중요]**: 제공된 인스타그램 URL/핸들이 있는 경우 반드시 해당 경로만 사용한다.
>    - **임의 확장 금지**: 수집 효율을 위해 임의로 다른 사이트로 전환하거나 검색 영역을 넓히는 행위를 절대 금지한다. (오수집 및 장소 왜곡 방지 목적)
7. **순차 작업 엄수**: 여러 이벤트를 한꺼번에 처리(Batch)하지 말고, 한 이벤트를 완벽히(다운로드->검증->JSON) 끝낸 후 다음으로 넘어간다.
8. **물리적 파일 확정**: 아티팩트로 생성된 모든 이미지/스크린샷은 반드시 `public/scraped/`로 `mv` 또는 `cp` 명령어를 통해 물리적으로 이동시킨 후 JSON에 경로를 기록해야 한다. (경로만 허위 기재 금지)

## 📂 스킬 패키지 구조
이 스킬은 독립적인 실행을 위해 아래와 같이 구성되어 있습니다:
- **`SKILL.md`**: 핵심 지침 및 수집 규칙
- **`scripts/`**: 수집 전용 엔진 및 유틸리티
- **`examples/`**: 데이터 수집 샘플 및 로그 예시
- **`resources/`**: 수집 대상 소스 목록 및 템플릿

## 0. 기존 이벤트 사전 확인 (Pre-check)
- 실행 명령: `node .claude/skills/event-ingestion/scripts/check-db-events.js [시작일] [종료일]`
- 이미 등록된 소스는 리서치 시 "이미 등록됨 → 스킵" 처리.

## 1. 수집 소스 및 진입 원칙

| 소스 | 진입 경로 / 검색어 |
|:---|:---|
| **스윙스캔들** | [네이버 카페](https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I) (오른쪽 리스트만) |
| **스윙프렌즈** | (주소 미지정 시 스킵) |
| **해피홀** | [인스타그램](https://www.instagram.com/happyhall2004/) |
| **스윙타임** | [인스타그램](https://www.instagram.com/swingtimebar/) |
| **경성홀** | [인스타그램](https://www.instagram.com/kyungsunghall/) |
| **박쥐스윙** | [인스타그램](https://www.instagram.com/batswing2003/) |
| **대전스윙피버** | [인스타그램](https://www.instagram.com/daejeon.swingfever/) |
| **스윙홀릭** | [인스타그램](https://www.instagram.com/swingholic/) |
| **네오스윙** | [인스타그램](https://www.instagram.com/neo_swing/) |

## 2. 정밀 수집 5단계 공정 (Per-Source)
1.  **게시물 진입 및 1단계 검증 (스크린샷)**:
    *   게시물 클릭 후 상세 화면 전체를 캡처 (`verify_[keyword]_[date].png`).
    *   캡처된 화면의 텍스트와 이미지를 파싱하여 **수집 대상(DJ 소셜 파티) 여부를 선제적으로 판별**.
    *   수집 대상이 아니거나 강습/워크숍인 경우 즉시 닫고 다음 게시물로 이동.
2.  **2단계 고화질 원본 확보 (확정 시에만)**:
    *   1단계에서 수집 대상으로 확정된 경우에만 이미지를 클릭하여 상세 뷰어를 오픈.
    *   **이미지 원본(CDN) URL을 추출하여 반드시 `public/scraped/` 디렉토리에 직접 다운로드 (`public/scraped/poster_[keyword]_[date].png`)**.
    *   CDN 다운로드 실패 시에만 뷰어 화면의 이미지를 정밀 크롭하여 저장(백업).
3.  **데이터 최종화 및 경로 연결**:
    *   추출된 정보(날짜, DJ, 장소 등)와 다운로드된 고화질 파일 경로(`/scraped/poster_...`)를 시스템에 연결.
    *   **[중요] 데이터는 반드시 `src/data/scraped_events.json` 파일에 추가해야 하며, `parsed_data`와 `structured_data`를 모두 포함한 아래의 JSON 스키마를 완벽히 준수해야 합니다:**
        ```json
        {
          "id": "고유ID (예: hh_260401_insta)",
          "keyword": "소스 키워드 (예: 해피홀)",
          "source_url": "이벤트 출처 URL",
          "poster_url": "/scraped/포스터파일명.jpg",
          "extracted_text": "추출한 원래 텍스트 전문",
          "structured_data": {
            "date": "2026-04-01",
            "day": "수",
            "title": "이벤트명",
            "status": "정상운영",
            "djs": ["DJ이름"],
            "times": ["19:30 ~ 23:00"],
            "location": "장소명",
            "fee": "가격정보",
            "note": "기타 참고사항"
          },
          "parsed_data": {
            "date": "2026-04-01",
            "title": "이벤트명"
          },
          "created_at": "생성 시간 (ISO 포맷)",
          "updated_at": "수정 시간 (ISO 포맷)"
        }
        ```
        *위 스키마를 어기면 `/admin/ingestor`에서 이벤트를 렌더링하지 못하고 에러가 발생합니다.*
4.  **중복 확인 및 무결성 검사**:
    *   `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행.
    *   **[중복 대응 룰]**: 
        - `[DUPLICATE]` (85점 이상): 수집을 즉시 중단하고 해당 이벤트 스킵.
        - `[SIMILAR]` (60~84점): 기존 데이터보다 현재 수집 데이터의 정보(포스터 고화질 여부, 상세 텍스트 등)가 더 많을 경우에만 선택적으로 업데이트.
        - `[NEW]` (60점 미만): 신규 이벤트로 간주하고 수집 진행.
    *   `ls -lh [파일명]` 실행하여 파일 크기가 1KB 이상인지, 실제 `public/scraped/`에 존재하는지 최종 확인.
5.  **인스타그램 본문(Caption) 정밀 수집 전략**:
    *   비로그인 팝업에 가려지지 않는 `meta[property="og:description"]` 등을 최우선 수집.
    *   **[스크롤 장애 대처]**: 상세 오버레이 페이지에서 장문 캡션을 읽으려 할 때 JS스크롤(`scrollTop`) 오류가 자주 발생한다. 이 경우 텍스트 좌우 빈 공간을 한 번 클릭해 포커스를 맞춘 후, **키보드 단축키(`ArrowDown` 또는 `PageDown`)**를 입력하여 화면을 내리는 방식으로 스크롤 오류를 우회하라.
    *   전체 텍스트를 누락 없이 보존.
7. **이미지 기반 날짜/DJ 보완**: 수집 후 `⚠️ 날짜 미확인` 항목이 있으면:
    - 해당 항목의 포스터 이미지를 직접 열어(`view_file`) 날짜/DJ 정보를 읽음.
    - 확인된 정보를 `src/data/scraped_events.json`에 직접 반영하여 '미확인' 상태를 해소.
8. **DJ 성함 정규화**: 중복 검사 정확도를 위해 `check-duplicate.js` 인자로 넘길 때는 "DJ " 등 접두사를 제거한 순수 활동명만 사용한다.

---

## 🤖 browser_subagent 탈선 방지 지시문 (필수)
하위 에이전트 작업 지시 시 반드시 아래 문구를 Task에 포함할 것:
```
[탈선 방지 규칙]
1. 지정 결과에서 관련 게시물 없으면 즉시 종료. "결과 없음 = 정상"임.
2. 절대 하지 말 것: 다른 검색어 시도, 2페이지 탐색, 로그인 시도, "왜 없는지" 분석.
3. [인스타그램] 최근 포스트 6개만 클릭 확인. 7번째 이상 금지. 계정 접속 불가 시 즉시 스킵.
4. [필터] DJ 소셜 파티만 수집. 강습, 워크숍, 공연, 후기 발견 시 "관련 게시물 없음" 판정.
```

---

## 📋 필수 task.md 템플릿

```markdown
# 이벤트 수집 (YYYY-MM-DD 기준)

> ⚠️ "결과 없음 = 정상 완료". "data gap" 해석 금지.
> ⚠️ DJ 소셜 파티만 수집 (강습/워크숍 제외).
> 🚨 **[에이전트 행동 강령 - 비동기/병렬 작업 절대 금지]**: 에이전트는 하나의 소스에 대한 모든 체크리스트(원본 직접 다운로드 -> 무결성 검사 -> json 업데이트 -> 중복 테스트)를 **동기적(순차적)**으로 완벽히 마무리하기 전에, 다음 소스로 넘어가거나 브라우저/CLI 작업을 병렬로 시도해서는 안 된다.

## 0. 기존 DB 사전 조회
- [ ] `node .claude/skills/event-ingestion/scripts/check-db-events.js YYYY-MM-DD YYYY-MM-DD` 실행

### 소스 1. 스윙스캔들
- [ ] 네이버 접속: https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I (오른쪽 리스트만)
- [ ] 최근 6개 게시물 순차 확인 및 게시물 진입
- [ ] **[검증]** 상세 화면 전체 캡처 (`verify_...`) 및 수집 대상(DJ 소셜) 여부 판별
- [ ] **[수집]** (확정 시에만) 이미지 뷰어 오픈 및 **원본(CDN) URL 추출/직접 다운로드 (`public/scraped/poster_...`)**
- [ ] 상세 정보 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE여부만 확인)

### 소스 2. 스윙프렌즈
- [ ] (주소 미지정 시 스킵)

### 소스 3. 해피홀
- [ ] 인스타그램 접속: https://www.instagram.com/happyhall2004/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 4. 스윙타임
- [ ] 인스타그램 접속: https://www.instagram.com/swingtimebar/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 5. 경성홀
- [ ] 인스타그램 접속: https://www.instagram.com/kyungsunghall/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 6. 박쥐스윙
- [ ] 인스타그램 접속: https://www.instagram.com/batswing2003/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 7. 대전스윙피버
- [ ] 인스타그램 접속: https://www.instagram.com/daejeon.swingfever/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 8. 스윙홀릭
- [ ] 인스타그램 접속: https://www.instagram.com/swingholic/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

### 소스 9. 네오스윙
- [ ] 인스타그램 접속: https://www.instagram.com/neo_swing/ (최근 6개 순차 클릭)
- [ ] 로그인 팝업(가입 모달) 발생 시 즉시 닫기 (비로그인 유지)
- [ ] **[검증]** 게시물 진입 후 전체 화면 캡처 (`verify_...`) 및 캡션 확인하여 수집 대상(DJ 소셜) 판별
- [ ] **[수집]** (확정 시에만) 원본 CDN 이미지 찾아 직접 다운로드 (`public/scraped/poster_...`)
- [ ] 상세 정보(날짜/시간/DJ/장소/가격 등) 파싱
- [ ] 파일 무결성 검사 (`ls -lh`) - 0바이트/1KB 미만 여부 확인
- [ ] `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행 (DUPLICATE 여부 확인)

## 마무리
- [ ] `src/data/scraped_events.json` 업데이트 (반드시 ScrapedEvent 스키마 준수 및 `/scraped/poster_...` 원본 경로 사용)
- [ ] /admin/ingestor 최종 확인
```
