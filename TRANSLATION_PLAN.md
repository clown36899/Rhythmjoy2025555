# 웹사이트 번역 마스터 플랜 (Website Translation Master Plan)

## 1. 개요 (Overview)
본 문서는 리듬조이(RhythmJoy) 플랫폼의 **모든 콘텐츠(UI 정적 텍스트 및 사용자 생성 이벤트/연습실 정보)**를 완벽하게 다국어로 지원하기 위한 종합 기획서입니다.
단순히 UI만 번역하는 것이 아니라, 사용자가 입력하는 제목, 설명, 장소 등의 동적 데이터까지 포함하여 "최선"의 사용자 경험을 제공하는 것을 목표로 합니다.

## 2. 핵심 전략: AI 하이브리드 번역 시스템
사용자가 모든 언어를 직접 입력하는 것은 불가능하므로, **AI 자동 번역과 수동 검수**를 결합한 하이브리드 방식을 채택합니다.

### 2.1 UI 정적 텍스트 (Static UI)
- **대상**: 메뉴, 버튼, 안내 문구, 고정된 장르명 등.
- **해결책**: 현재 설치된 `i18next` 라이브러리를 전면 활용.
- **관리**: 언어별 리소스 파일(`ko.json`, `en.json`, `jp.json`, `cn.json`)로 관리.

### 2.2 동적 데이터 (Dynamic Data: 이벤트, 연습실)
- **대상**: 사용자가 입력하는 글의 제목, 내용, 위치, 주최자 정보 등.
- **해결책**: **"작성 즉시 자동 번역 + 저장" (Translate-on-Save)** 모델.
    1. 사용자가 한국어로 이벤트 등록.
    2. 저장 시점에 Supabase Edge Function이 트리거됨.
    3. AI(DeepL 또는 OpenAI)가 영어/일본어/중국어 등으로 자동 번역.
    4. 원본 데이터와 함께 `translations` 컬럼에 번역본 저장.
    5. 클라이언트에서는 사용자의 언어 설정에 맞는 텍스트를 우선 표시.

## 3. 데이터베이스 구조 설계 (Database Schema)

기존 테이블 구조를 크게 변경하지 않으면서 확장성을 갖도독 `JSONB` 타입을 활용합니다.

### 3.1 Events 테이블 확장
`events` 테이블에 `translations` 컬럼을 추가합니다.

```sql
ALTER TABLE events ADD COLUMN translations JSONB DEFAULT '{}'::jsonb;
```

**데이터 구조 예시:**
```json
{
  "en": {
    "title": "Gangnam Swing Social Party",
    "description": "Come and enjoy the swing dance...",
    "location": "Gangnam Studio",
    "organizer": "Swing Friends"
  },
  "ja": {
    "title": "江南スイングソーシャルパーティー",
    "description": "...",
    "location": "...",
    "organizer": "..."
  }
}
```

### 3.2 Venues (연습실) 테이블 확장
`venues` 테이블에도 동일하게 적용합니다. 연습실 이름, 설명, 주소 등이 번역 대상입니다.

## 4. 구현 단계 (Implementation Steps)

### 단계 1: UI 다국어화 고도화 (Frontend)
- **목표**: 하드코딩된 한글 텍스트를 모두 `i18next` 키로 치환.
- **Actions**:
    - `src/i18n` 구조 재정비 (공통, 이벤트, 연습실, 에러 메시지 등으로 분리 권장).
    - `useTranslation` 훅을 모든 주요 페이지 컴포넌트에 적용.
    - 설정 페이지 또는 헤더에 "언어 변경 (Language Switcher)" 기능 추가.

### 단계 2: 백엔드 자동 번역 파이프라인 구축 (Backend)
- **목표**: 데이터 생성/수정 시 1~2초 내에 자동 번역 수행.
- **Actions**:
    - **Supabase Edge Function (`translate-content`) 개발**:
        - OpenAI API 또는 DeepL API 연동.
        - 입력된 텍스트(제목, 내용)를 타겟 언어들로 번역 요청.
        - 결과를 DB `translations` 컬럼에 업데이트.
    - **Database Webhook 설정**:
        - `events`, `venues` 테이블의 `INSERT`, `UPDATE` 발생 시 Edge Function 호출.
        - *최적화*: 내용이 변경되었을 때만 번역 API 호출하여 비용 절감.

### 단계 3: 프론트엔드 데이터 표시 로직 (UI Logic)
- **목표**: 사용자가 선택한 언어에 맞춰 번역된 데이터 노출.
- **Actions**:
    - `getEventDisplayInfo(event, language)` 유틸리티 함수 작성.
        - 현재 언어가 'ko'이면 원본 표시.
        - 현재 언어가 'en'이고 `translations['en']`이 존재하면 번역본 표시, 없으면 원본(Fallback) 표시.
    - 검색 기능에서 영문 검색 시에도 한글 원본 매칭이 가능하도록 검색 로직 개선 필요.

### 단계 4: 수정 시 동기화 (Handling Updates)
- **질문**: 사용자가 내용을 수정하면 어떻게 되나요?
- **해결책**:
    - `UPDATE` 이벤트가 발생할 때도 동일한 Edge Function이 동작합니다.
    - **스마트 감지**: 기존 원본 텍스트와 새로운 텍스트를 비교하여 **변경된 경우에만** 재번역을 수행합니다.
    - 이를 통해 불필요한 API 비용을 방지하면서도, 항상 최신 번역 상태를 유지합니다.

## 5. 세부 번역 대상 상세 (Details)

| 구분 | 항목 | 처리 방식 | 비고 |
| :--- | :--- | :--- | :--- |
| **이벤트 (Events)** | 제목 (title) | AI 자동 번역 | 필수 |
| | 설명 (description) | AI 자동 번역 | HTML 태그 유지 필요 |
| | 장소 (location) | AI 자동 번역 | 지도 API 검색과의 연동 고려 필요 |
| | 주최자 (organizer) | AI 자동 번역 | 고유명사 처리 주의 |
| **연습실 (Venues)** | 이름 (name) | AI 자동 번역 | |
| | 소개 (description) | AI 자동 번역 | |
| | 주소 (address) | AI 자동 번역 | |
| **장르 (Genre)** | 장르명 (Lindy Hop 등) | 매핑 테이블 (Static) | '린디합' <-> 'Lindy Hop' 1:1 매핑 상수 사용 |
| **UI 공통** | 메뉴, 버튼, 알림 | i18n JSON 파일 | 개발자가 직접 번역 관리 |

## 6. 예상 비용 및 기술적 고려사항

- **번역 API 비용**: 
    - DeepL API Pro 또는 OpenAI gpt-4o-mini 사용 권장.
    - 이벤트 1개당(제목+설명) 약 $0.001 미만 비용 발생. (매우 저렴)
- **속도 (Latency)**:
    - Webhook 방식(비동기)이므로 사용자 저장 대기 시간 없음.
    - 저장 후 1~3초 뒤 새로고침하면 번역 반영됨.
- **검색 (Search)**:
    - 영문 UI 사용자가 "Gangnam" 검색 시 "강남" 이벤트가 나와야 하는가?
    - -> Supabase의 `Full Text Search` 기능을 활용하여 `translations` 컬럼도 인덱싱하면 가능.

## 7. 결론 및 추천
사용자 경험과 개발 효율성, 유지보수성을 모두 고려했을 때 **Supabase Edge Function을 활용한 비동기 AI 자동 번역 시스템**이 가장 강력하고 현실적인 해결책입니다.

이 계획대로 진행하신다면 글로벌 사용자가 접속했을 때도 한국어 콘텐츠를 즉시 자국어로 이해할 수 있는 **최고 수준의 글로벌 플랫폼**이 될 것입니다.
