# 웹진 통계 리플렉션(Stats Reflection) 시스템 기술 문서

이 문서는 웹진 에디터에서 실시간 통계 데이터를 본문에 삽입하고 렌더링하는 '통계 리플렉션' 시스템의 아키텍처와 사용법을 설명합니다.

## 1. 개요

통계 리플렉션 시스템은 관리자가 웹진을 작성할 때, 동적인 통계 컴포넌트(차트, 요약 카드 등)를 원하는 위치에 삽입할 수 있게 해줍니다. 텍스트와 통계 데이터가 유기적으로 결합된 고유한 콘텐츠 제작을 지원합니다.

## 2. 주요 구성 요소

### 2.1 Tiptap 커스텀 노드: `StatsNode`
- **경로**: `src/pages/webzine/components/StatsNode.tsx`
- **역할**: 에디터 본문에 삽입되는 통계 블록을 정의합니다.
- **주요 속성(Attributes)**:
  - `type`: 통계 유형 (예: `scene-summary`, `my-impact-summary`, `top-contents` 등)
  - `label`: 에디터에서 표시될 이름
  - `config`: 컴포넌트 렌더링에 필요한 파라미터 (JSON 형태)

### 2.2 부문 렌더링 (Granular Rendering)
통계 컴포넌트들은 `section` prop을 통해 전체가 아닌 특정 부분만 렌더링할 수 있도록 설계되었습니다.
- **대상 컴포넌트**:
  - `MyImpactCard.tsx`: 내 활동 요약, 인기 게시글/행사 등
  - `SwingSceneStats.tsx`: 스윙씬 요약, 월별 추이, 요일별 분석, 리드타임 등
  - `MonthlyWebzine.tsx`: 월별 주요 지표, 패턴 분석, 랭킹 등

### 2.3 에디터 통합: `WebzineEditor`
- **경로**: `src/pages/admin/webzine/WebzineEditor.tsx`
- **기능**: 사이드바의 '삽입' 버튼을 통해 `StatsNode`를 에디터 커서 위치에 추가합니다.

### 2.4 뷰어 렌더링: `WebzineViewer`
- **경로**: `src/pages/webzine/WebzineViewer.tsx`
- **기능**: 저장된 HTML 내의 `data-type="stats-node"` 요소를 찾아 실제 React 컴포넌트로 치환(Hydration)하여 보여줍니다.

## 3. 데이터 흐름

### 3.1 통계 삽입 시
1. 사이드바 컴포넌트(예: `SwingSceneStats`)에서 **'본문에 삽입'** 버튼 클릭.
2. `onInsertItem` 콜백 실행 -> `editor.commands.insertContent` 호출.
3. `StatsNode` 형태의 JSON이 에디터 본문에 삽입됨.

### 3.2 저장 및 조회
1. 에디터는 본문 내용을 HTML로 직렬화하여 DB(`webzine.content`)에 저장합니다.
2. `StatsNode`는 HTML 상에서 `<div data-type="stats-node" data-stats-type="..." ...></div>` 형태로 인코딩됩니다.

### 3.3 렌더링 (Viewer)
1. `WebzineViewer`가 DB에서 HTML을 가져옵니다.
2. `StatsNode.renderHTML`에 정의된 형식을 기반으로 뷰어에서 각 노드를 실제 React 컴포넌트(`MyImpactCard` 등)로 렌더링합니다.

## 4. 새로운 통계 항목 추가 가이드

1. **컴포넌트 수정**: 해당 컴포넌트에 `section` prop을 추가하고, 특정 조건일 때만 원하는 UI를 반환하도록 처리합니다.
2. **StatsNode 업데이트**: `StatsNode.tsx`의 렌더링 로직(또는 뷰어의 치환 로직)에 새로운 `type`에 대한 케이스를 추가합니다.
3. **에디터 버튼 추가**: `WebzineEditor`의 사이드바 내 각 컴포넌트에 `onInsertItem` 호출 버튼을 배치합니다.

## 5. 주의 사항
- **CSS 충돌 방지**: 통계 컴포넌트들은 `.section-view` 클래스가 부여되었을 때 배경색이나 여백이 제거되도록 시멘틱 CSS로 관리되어야 합니다.
- **데이터 일관성**: 삽입 시점의 `config` 데이터가 뷰어 렌더링 시에도 유효해야 합니다. (예: `targetDate` 등)

---
*최종 갱신일: 2026-02-19*
