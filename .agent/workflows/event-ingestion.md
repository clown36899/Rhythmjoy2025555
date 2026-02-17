# 이벤트 정밀 수집 가이드 v3 (Event Ingestion Recipe)

이 문서는 AI 에이전트가 소셜 미디어에서 DJ 소셜 이벤트 정보를 정확하게 수집하고, 할루시네이션(데이터 왜곡)을 방지하며 구조화된 데이터를 생성하는 표준 절차를 정의합니다.

---

> [!CAUTION]
> ## 절대 원칙 13계명 (위반 시 전체 수집 무효)
>
> ### 데이터 무결성
> 1. **Zero-Tolerance 날짜 검증**: 모든 날짜는 **2026년**이어야 하며, 해당 날짜의 **요일이 2026년 달력과 일치**해야 합니다. 불일치 시 즉시 폐기합니다.
> 2. **추론 절대 금지 (No Inference)**: 이미지/텍스트에 **직접 보이지 않는 정보는 절대 추가하지 마십시오**. 빈 필드 그대로 두는 것이 잘못된 정보를 채우는 것보다 100배 낫습니다. 부분 정보로 나머지를 "합리적으로" 추측하는 행위를 금지합니다.
> 3. **원문 전사 원칙 (Verbatim Only)**: 숫자, 이름, 시간 등 모든 데이터는 소스에 표기된 값을 **글자 그대로** 전사합니다. 단위 변환(KRW→원)만 허용되며, 숫자 자체를 변경하면 해당 항목 전체를 REJECT합니다.
>
> ### 검색 범위
> 4. **허용 목록 방식 (Allowlist Only)**: 아래 §1에 정의된 **8개 소스만** 검색합니다. 이 목록에 없는 소스에서 수집한 데이터는 삽입 자체가 불가합니다.
> 5. **확장 검색 절대 금지 (Strict Query Only)**: 검색어는 오직 **`"[타겟명]" "dj"`** 또는 **`"[타겟명]" "소셜"`**만 허용됩니다. 결과가 없으면 즉시 "결과 없음"으로 종료하십시오.
> 6. **비로그인(No Login) 원칙**: 로그인이 필요한 포스트는 즉시 스킵합니다.
>
> ### 수집 대상 필터
> 7. **DJ 소셜 이벤트만 수집**: DJ 이름이 명시적으로 포함된 소셜 파티/정모만 수집합니다. 다음은 **무조건 제외**: 강습, 워크샵, 클래스, 공연, 대회, 공지, 모집, 개강.
>
> ### 검증 안전장치
> 8. **시각적 증거 기반 추출 (Evidence-Based)**: 텍스트 추출 전, 이미지의 레이아웃과 주요 시각 요소를 먼저 기술합니다.
> 9. **교차 검증 필수**: `browser_subagent`가 수집한 정보를 메인 에이전트가 '비판적 검토자' 관점에서 재검증합니다.
> 10. **중단 보상 (Safe-Fail)**: "데이터가 불확실" 또는 "결과 없음"을 찾아내는 것은 **가장 높은 품질의 임무 수행**입니다. 억지로 데이터를 만들어내지 마십시오.
>
> ### 환각(Hallucination) 방지
> 11. **개별 게시물 URL만 source_url 허용**: `source_url`은 반드시 **개별 게시물 URL**(인스타 `/p/xxx/`, 네이버 카페 `/글번호`)이어야 합니다. 달력 URL, 프로필 페이지, 인덱스 URL은 source_url로 사용 금지입니다.
> 12. **빈 페이지에서 추측 생성 절대 금지**: 검색 결과가 없거나 빈 페이지(빈 달력 등)면 **즉시 종료**합니다. "보통 이렇게 운영하니까"식 추측으로 데이터를 만들어내는 행위는 최악의 위반입니다.
> 13. **이미지 파일 물리적 존재 필수**: `poster_url`에 지정된 파일이 `public/scraped/`에 **물리적으로 존재**하지 않으면 해당 이벤트를 즉시 REJECT합니다. 존재하지 않는 파일명을 참조하는 것은 데이터 날조입니다.

---

> [!WARNING]
> ## ❌ 잘못된 예시 (이런 행동은 즉시 REJECT)
>
> | 상황 | 잘못된 행동 | 올바른 행동 |
> |------|-----------|-----------|
> | 포스터에 도로명 주소 `2036, 남부순환로` 표기 | 연도를 2036으로 파싱 | 주소와 연도를 구분하여 date 필드에는 2026년 기반으로만 기록. 연도 확인 불가 시 폐기 |
> | 입장료가 `2,400원`으로 보이는데 비현실적이라 판단 | `24,000원`으로 "보정" | `2,400원` 그대로 전사. note에 "가격 확인 필요" 기록 |
> | 가이드에 없는 '소셜클럽'에서 이벤트 발견 | 유용하니까 수집 | 허용 목록(8개소)에 없으므로 즉시 스킵 |
> | 포스터에 DJ 이름 없이 "정기모임" | DJ를 추측하여 기입 | DJ 소셜이 아니므로 수집 제외 |
> | 이미지가 흐려서 글자가 불확실 | 문맥에서 유추하여 기입 | null로 두고 note에 "이미지 불선명으로 확인 불가" 기록 |
> | "102기 린디합 개강" 발견 | 교육 이벤트도 수집 | "개강"은 강습이므로 무조건 제외 |
> | Google Calendar가 빈 페이지 | "보통 목/토에 소셜을 하니까" 추측으로 데이터 생성 | 빈 페이지 = 결과 없음, 즉시 종료 |
> | 소스 URL이 프로필 페이지(`/username/`) | 프로필을 source_url로 등록 | 개별 게시물 URL(`/p/xxx/`)만 허용 |
> | 이미지 파일 다운로드 실패 | 존재하지 않는 파일명으로 poster_url 등록 | 이미지 없으면 REJECT |

---

## §1. 허용 소스 목록 (Allowlist — 8개소만 허용)

| # | 소스명 | 검색 방법 |
|---|--------|----------|
| 1 | 스윙스캔들 | 구글(`사보이볼룸 소셜 dj 인스타그램`), [네이버 카페](https://cafe.naver.com/f-e/cafes/14933600/menus/501?viewType=I) |
| 2 | 스윙프렌즈 | 구글(`스윙프렌즈 소셜 인스타그램`) |
| 3 | 해피홀 | [인스타그램](https://www.instagram.com/happyhall2004/) |
| 4 | 스윙타임 | [인스타그램](https://www.instagram.com/swingtimebar/) |
| 5 | 경성홀 | [인스타그램](https://www.instagram.com/kyungsunghall/) |
| 6 | 박쥐스윙 | [인스타그램](https://www.instagram.com/batswing2003/) |
| 7 | 대전스윙피버 | [인스타그램](https://www.instagram.com/daejeon.swingfever/) |
| 8 | 스윙홀릭 | [인스타그램](https://www.instagram.com/swingholic/) |

- **필터링**: 검색 엔진의 도구/옵션에서 '지난 1주일' 필터를 사용합니다.
- **위 8개 외의 소스에서 발견된 데이터는 아무리 유용해도 수집하지 않습니다.**

---

## §2. 3단계 수집 프로세스

### Phase 0: 기존 수집 데이터 확인 (중복 방지)

수집을 시작하기 전에, 로컬 JSON에 이미 저장된 `source_url` 목록을 조회하여 중복 방문을 방지합니다.

1. **기존 URL 목록 로드**: 로컬 Netlify Function API에서 수집 데이터를 조회합니다.
   ```bash
   curl -s http://localhost:8888/.netlify/functions/scraped-events | python3 -c "import sys,json; [print(e['source_url']) for e in json.load(sys.stdin)]"
   ```
2. **스킵 판정 규칙**:
   - Phase 1에서 게시물에 접근할 때, 해당 게시물의 URL이 기존 목록에 **완전히 일치(Exact Match)**하는 경우에만 스킵합니다.
   - **부분 일치, 도메인 일치, prefix 일치로는 절대 스킵하지 않습니다.**
   - 예: DB에 `instagram.com/p/ABC123/`이 있을 때, `instagram.com/p/XYZ789/`는 스킵하지 않습니다.
   - 예: DB에 `instagram.com/p/ABC123/`이 있을 때, `instagram.com/`은 스킵하지 않습니다.
3. **스킵 시 보고**: 스킵한 URL 수와 새로 수집 대상이 되는 URL 수를 요약 보고합니다.

---

### Phase 1: 수집 (browser_subagent + 메인 에이전트)

> [!CAUTION]
> **스크린샷으로 포스터를 수집하지 마십시오.** 페이지 전체 캡처는 포스터가 아닙니다.
> 반드시 아래 절차를 따라 **원본 이미지 URL을 추출하여 다운로드**해야 합니다.

1. **목록(Index) 확보**: 허용 소스에서 게시물 목록을 확인하고, 전체 건수와 날짜 범위를 요약 보고 후 사용자 승인을 획득합니다.
2. **URL 직접 접속 및 시각 분석**: 실제 게시물 접속 후, 포스터의 전체적인 특징(예: "노란 배경에 검정색으로 DJ 이름이 상단에 적힘")을 먼저 기술합니다.
3. **이미지 원본 URL 추출** (browser_subagent가 수행):
   - 게시물 페이지에서 JavaScript를 실행하여 포스터 이미지의 **원본 URL(`src` 속성)**을 추출합니다.
   - 인스타그램 예시: `document.querySelector('article img')?.src`
   - 네이버 카페 예시: `document.querySelector('.se-image-resource')?.src`
   - 추출한 URL을 **반드시 리턴값으로 보고**합니다. (스크린샷을 찍지 마십시오)
4. **이미지 직접 다운로드** (메인 에이전트가 `run_command`로 수행):
   - browser_subagent가 리턴한 이미지 URL을 `curl`로 직접 `public/scraped/`에 다운로드합니다.
   - 실행 예시:
   ```bash
   curl -L -o /Users/inteyeo/Rhythmjoy2025555-5/public/scraped/{keyword}_{yymmdd}_{설명}.png "{이미지_URL}"
   ```
   - `curl`이 실패하면(인스타그램 핫링크 차단 등), browser_subagent가 해당 `<img>` 요소만 캡처(`screenshot_element`)한 뒤, 메인 에이전트가 `cp` 명령으로 `public/scraped/`로 즉시 복사합니다.
   - **파일명 규칙**: `{keyword}_{yymmdd}_{설명}.png` (예: `ss_260218_livnight.png`)
5. **파일 존재 확인** (메인 에이전트가 수행):
   - `ls -la public/scraped/{파일명}` 으로 파일이 실제 존재하는지 확인합니다.
   - 파일이 없으면 해당 이벤트는 REJECT 처리합니다.
6. **OCR 원문 추출**: 저장된 이미지에서 보이는 텍스트를 **글자 그대로** 전사합니다. 추측/보정/윤문하지 않습니다.

### Phase 2: 검증 및 구조화 (메인 에이전트)

메인 에이전트는 **비판적 검토자**의 관점에서 Phase 1의 결과물을 검증합니다.

5. **교차 검증 체크리스트** (모든 항목 통과 필수):
   - [ ] `date`가 **2026년** 범위인가?
   - [ ] `date`의 요일이 `day` 필드와 **2026년 달력 기준으로 일치**하는가?
   - [ ] `keyword`가 허용 목록 **8개 중 하나**인가?
   - [ ] `fee`의 숫자가 `extracted_text` 안에 **그대로 존재**하는가?
   - [ ] `djs` 배열의 각 이름이 `extracted_text` 안에 **정확히 존재**하는가?
   - [ ] 이벤트 유형이 **DJ 소셜**인가? (강습/워크샵/개강/대회 아닌가?)
   - [ ] `poster_url` 경로의 파일이 **`public/scraped/`에 실제 존재**하는가? (`ls`로 확인)
   - [ ] 해당 이미지가 **포스터 원본**인가? (페이지 스크린샷이 아닌 포스터 이미지만 포함)

6. **구조화 데이터 생성**: 검증을 통과한 항목만 아래 스키마로 구조화합니다.

---

## §3. 데이터 스키마

```json
{
    "id": "{keyword_prefix}_{yymmdd}_{dayofweek}",
    "keyword": "허용 목록 소스명",
    "source_url": "원본 게시물 URL",
    "poster_url": "/scraped/{파일명}.png",
    "extracted_text": "이미지에서 읽은 OCR 원문 그대로 (보정 없이)",
    "structured_data": {
        "date": "2026-MM-DD",
        "day": "요일(한글 1자)",
        "title": "이벤트 제목",
        "status": "정상운영",
        "djs": ["DJ 이름 배열 — extracted_text에 있는 것만"],
        "times": ["HH:MM ~ HH:MM"],
        "location": "장소명",
        "fee": "금액원 — extracted_text의 숫자 그대로",
        "note": "검증 결과 및 불확실 사항 기록"
    },
    "evidence": {
        "screenshot_path": "/scraped/{파일명}.png",
        "ocr_raw": "OCR 원문 (extracted_text와 동일해야 함)",
        "extraction_mapping": {
            "date": "이미지의 어디에서 추출했는지 (예: 상단 2번째 줄)",
            "djs": "이미지의 어디에서 추출했는지",
            "fee": "이미지의 어디에서 추출했는지"
        }
    },
    "created_at": "ISO 8601 타임스탬프"
}
```

> [!IMPORTANT]
> **필드 규칙**:
> - `extracted_text`에 없는 정보는 `structured_data`에 넣지 않습니다 → `null`로 둡니다
> - `fee` 숫자는 절대 변경하지 않습니다. 단위만 정규화합니다 (KRW → 원)
> - `djs`가 이미지에 표기되지 않은 경우 빈 배열 `[]`로 둡니다
> - `evidence.extraction_mapping`은 각 핵심 필드가 이미지의 어느 위치에서 추출되었는지 기술합니다

---

## §4. 데이터 저장 및 품질 관리

### 저장 방식 (로컬 JSON + Netlify Function API)
- 수집된 데이터는 로컬 개발 서버의 **Netlify Function API**를 통해 `src/data/scraped_events.json`에 저장합니다.
- 저장 명령 예시:
  ```bash
  curl -X POST http://localhost:8888/.netlify/functions/scraped-events \
    -H "Content-Type: application/json" \
    -d '[{"id": "ss_260218_wed", "keyword": "스윙스캔들", ...}]'
  ```
- 삽입 전, **`keyword + date` 조합**으로 기존 `events` 테이블과 대조하여 이미 등록된 이벤트인지 이중 확인합니다 (사후 보험).
- **삭제 시 이미지 자동 삭제**: DELETE 요청 시 `poster_url`에 해당하는 `public/scraped/` 이미지 파일도 함께 삭제됩니다.
  ```bash
  curl -X DELETE http://localhost:8888/.netlify/functions/scraped-events \
    -H "Content-Type: application/json" \
    -d '{"ids": ["ss_260219_thu", "ss_260305_thu"]}'
  ```

### 품질 관리
- 실물 이미지와 데이터의 일치성을 `/admin/ingestor`에서 최종 육안 확인
- **2026년이 아닌 날짜, 허용 목록 외 소스, DJ 미명시 이벤트가 하나라도 포함되면 전체 배치를 재검증합니다**

### 이미지 파일 관리 규칙
- 이미지 파일은 반드시 **`public/scraped/`** 디렉토리에 직접 저장합니다.
- `browser_subagent`가 캡처한 이미지가 다른 경로(예: `~/.gemini/brain/`)에 있으면, 메인 에이전트가 즉시 `cp` 명령으로 `public/scraped/`에 복사합니다.
- `poster_url`에 기록된 경로(`/scraped/파일명.png`)와 실제 `public/scraped/` 내 파일 존재 여부를 Phase 2에서 반드시 검증합니다.
- 파일이 존재하지 않으면 해당 이벤트 데이터를 REJECT 처리합니다.

---
// turbo
**실행 가이드**: 사용자가 수집 업무를 지시하면 이 워크플로우 v3를 즉시 로드합니다. 모든 보고에는 "2026년 요일 검증 완료" 및 "허용 목록 검증 완료" 문구가 포함되어야 합니다.