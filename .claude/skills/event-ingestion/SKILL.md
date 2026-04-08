---
name: event-ingestion
description: "[DEPRECATED - 사용 금지] 구버전 수집 스킬. web-search-ingestion으로 대체됨. 절대 실행하지 말 것."
---

# 이벤트 정밀 수집 스킬 (Event Ingestion Recipe)

이 스킬은 소셜 미디어(인스타그램, 네이버 등)에서 정보를 고화질로 수집하고 정보를 구조화하여 `EventIngestor` 시스템에 전달하는 표준 절차를 정의합니다.

> [!CAUTION]
> **에이전트 실행 강제 수칙 (Enforcement Rules)**
> 0. **수집 대상 유형 필터 [최최우선]**: 수집 대상은 **DJ 소셜 파티**만 해당. (강습/워크숍, 공연, 후기 절대 수집 금지)
> 0-1. **[순서 1] 날짜 필터 [최최우선]**: **오늘(한국시간) 이전 날짜의 이벤트는 수집 대상이 아니다.** 수집 중 오늘 이전 날짜의 이벤트가 나오면 즉시 건너뛰며, 중복 체크를 수행하지 않는다.
> 0-2. **[순서 2] 중복 판정 [최우선]**: 오늘 이후의 이벤트에 대해서만 수행한다. **키워드(소스)와 날짜가 모두 동일할 때만 중복**으로 간주한다.
> 0-3. **[순서 3] 수집 전 청소 (Cleanup)**: 수집 시작 전 반드시 과거 데이터 청소 스크립트(`cleanup-scraped-events.cjs`)를 실행하여 소스별 앵커를 제외한 과거 데이터를 삭제한다.
> 1. **비로그인 원칙**: 로그인 팝업 발생 시 즉시 닫기.
> 2. **인제스터 표출 원칙 [중요]**: 모든 신규 수집 데이터는 **`is_collected: false`**로 저장해야 한다. (`true`로 저장 시 인제스터 대기 목록에서 사라짐)
> 3. **Fast-fail (중복 시 즉시 중단) [최우선]**: 앵커 혹은 탐색 중인 게시물이 **과거 날짜**이거나 **중복**임이 확인되면, 즉시 해당 소스 수집을 종료한다.
> 4. **서브에이전트 병렬 실행 제한 [안정성 보장]**: 브라우저 서브에이전트를 동시 다발적으로(3개 이상) 파견하지 마세요. 인스타그램 DOM 렌더링 병목 및 무한 로딩이 발생하므로 최대 1~2개씩만 직렬로 실행하세요.
> 5. **서브에이전트 파일 쓰기 금지 [오류 원천 차단]**: 서브에이전트 파견 시 작업 지시(Task) 내용에 **"분석 결과를 직접 파일에 쓰지 말고(Do not edit files) 텍스트로만 반환하라"**고 반드시 명시하세요. 복수의 에이전트가 동일한 로그 파일에 접근하려 할 경우 쓰기 권한 충돌 구멍(Deadlock)에 빠집니다.
> 10. **사용자 승인 없는 변경 금지 [절대 수칙]**: 사용자(USER)의 명시적인 지시 없이 **스킬의 규칙을 수정하거나 상세 템플릿(1~12번 소스 목록)을 삭제, 요약, 간소화하는 행위를 절대 금지한다.** 모든 템플릿은 원형 그대로 보존되어야 한다.
> 
> **※ 위 수칙을 어길 경우 에이전트의 심각한 오류로 간주함.**

## 📂 스킬 패키지 구조
- **`SKILL.md`**: 핵심 지침 및 수집 규칙
- **`scripts/`**: 수집 전용 엔진 및 유틸리티
- **`examples/`**: 데이터 수집 샘플 및 로그 예시

## 0. 기존 이벤트 사전 확인 (Pre-check)
- 실행 명령: `node .claude/skills/event-ingestion/scripts/check-db-events.js [시작일] [종료일]`
- 이미 등록된 소스는 리서치 시 "이미 등록됨 → 스킵" 처리.

## 2. 정밀 수집 공정 및 JSON 스키마

> [!IMPORTANT]
> **수집 로직 실행 순서**
> 1. **[앵커 스캔 (중요)]**: 사이트 진입 시 **무조건 첫 번째 게시물을 앵커로 단정짓지 마세요.** 인스타그램 등은 첫 1~3개 게시물이 영구 '고정된(Pinned)' 게시물일 수 있습니다. 따라서 처음 3~4개의 게시물을 스캔하여 **시간상 가장 최신 게시물**을 진정한 앵커 및 첫 수집 데이터로 삼아야 합니다. 과거의 고정 게시물 때문에 수집이 즉각 중단(오작동)되지 않도록 반드시 유의하세요.
> 2. **[날짜 필터]**: 실제 최신 이벤트의 날짜가 **오늘 이전**이면 -> 수집 제외 (단, 이 최신글이 강습/후기 등인 경우 `IGNORED` 앵커로 등록) 후 **Fast-fail 종료**.
> 3. **[중복 체크]**: 오늘 이후 날짜일 경우에만 `check-duplicate.js` 실행 (85점 이상 시 Duplicate).
> 4. **[Fast-fail 판정]**: 중복(`DUPLICATE`)일 경우 -> 즉시 **Fast-fail 종료**.

### [중요] 신규 수집 데이터 JSON 스키마 (src/data/scraped_events.json)
모든 신규 수집 항목은 아래 스키마를 완벽히 준수해야 하며, 특히 **`is_collected`는 항상 `false`**여야 관리자 확인이 가능합니다.

```json
{
  "id": "hh_260403_insta",
  "keyword": "해피홀",
  "source_url": "URL",
  "poster_url": "/scraped/poster_hh_20260403.png",
  "extracted_text": "텍스트 전문",
  "structured_data": {
    "date": "2026-04-03",
    "day": "금",
    "title": "이벤트명",
    "status": "정상운영",
    "djs": ["DJ명"],
    "times": ["19:00 ~ 23:00"],
    "location": "장소명"
  },
  "parsed_data": {
    "date": "2026-04-03",
    "title": "이벤트명"
  },
  "is_collected": false,
  "created_at": "ISO_TIMESTAMP",
  "updated_at": "ISO_TIMESTAMP"
}
```

---

## 📋 필수 task.md 템플릿

```markdown
# 이벤트 수집 (YYYY-MM-DD 기준)

> ⚠️ [순서 엄수] 1.날짜 필터(과거 제외) -> 2.중복 체크 -> 3.Fast-fail 판정.
> ⚠️ **신규 수집 시 `"is_collected": false` 설정을 절대 잊지 말 것.**
> 🚨 **주의: 이 템플릿의 주소와 내용을 절대 요약, 삭제, 임의 창작(Hallucination)하지 마세요.**

## 0. 시작 전 청소 및 기존 DB 조회
- [ ] 과거 데이터 청소(앵커 보존): `node .claude/skills/event-ingestion/scripts/cleanup-scraped-events.cjs` 실행
- [ ] `node .claude/skills/event-ingestion/scripts/check-db-events.js YYYY-MM-DD YYYY-MM-DD` 실행

### 소스 1. 네오스윙
- [ ] 인스타그램 접속: https://www.instagram.com/neo_swing/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 2. 스윙스캔들
- [ ] 인스타그램 접속: https://www.instagram.com/swingscandal/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 3. 경성홀
- [ ] 인스타그램 접속: https://www.instagram.com/kyungsunghall/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 4. 해피홀
- [ ] 인스타그램 접속: https://www.instagram.com/happyhall2004/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 5. 피에스타
- [ ] 인스타그램 접속: https://www.instagram.com/fiesta_swingdance/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 6. 스윙타임
- [ ] 인스타그램 접속: https://www.instagram.com/swingtimebar/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 7. 박쥐스윙
- [ ] 인스타그램 접속: https://www.instagram.com/batswing2003/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 8. 대전스윙피버
- [ ] 인스타그램 접속: https://www.instagram.com/daejeon.swingfever/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 9. 스윙홀릭
- [ ] 인스타그램 접속: https://www.instagram.com/swingholic/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 10. 스윙키즈
- [ ] 인스타그램 접속: https://www.instagram.com/swingkids_/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 11. 올어바웃스윙
- [ ] 인스타그램 접속: https://www.instagram.com/allaboutswing_official/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

### 소스 12. 스윙팩토리
- [ ] 인스타그램 접속: https://www.instagram.com/swingfactory_2010/
- [ ] **[Anchor 확인]** 첫 1~3개 고정글(Pinned) 판별 및 패스 -> 실제 최신글 파싱 (강습이면 IGNORED 앵커 등록 후 종료)
- [ ] **[순서 1: 날짜 필터]** 오늘 이전 날짜인가? ⬜ 예(종료) / ⬜ 아니오(계속)
- [ ] **[순서 2: 중복 체크]** `node .claude/skills/event-ingestion/scripts/check-duplicate.js` 실행
- [ ] **[Fast-fail 판정]** DUPLICATE면 즉시 종료. NEW면 수집 후 계속.
- [ ] **[수집 완료]** `"is_collected": false`로 `scraped_events.json` 업데이트.

## 마무리
- [ ] `src/data/scraped_events.json` 업데이트 최종 확인
- [ ] /admin/ingestor 최종 확인 및 등록
```
