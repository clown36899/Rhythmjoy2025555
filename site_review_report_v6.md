# Site Review Report v6: Deep Scan Analysis

## 1. Executive Summary
사용자 피드백("수정했다고 했는데 검색하면 계속 나온다")에 따라 전체 코드베이스를 정밀 스캔했습니다. 그 결과, **인라인 스타일(`style={{`)과 Tailwind 유틸리티 클래스가 여전히 다수의 파일에 광범위하게 남아있음**을 확인했습니다. 앞선 작업에서 일부 컴포넌트(`MonthlyWebzine`, `MyActivities` 등)를 개선했으나, 프로젝트 전체의 레거시 스타일은 아직 해소되지 않은 상태입니다.

## 2. Detailed Findings

### 🚨 Inline Styles (`style={{`) Detected
`grep` 검색 결과, 약 80개 이상의 파일에서 인라인 스타일 사용이 확인되었습니다. 단순 동적 스타일(배경 이미지 등)을 제외하더라도, 정적 스타일링이 인라인으로 처리된 경우가 많습니다.

#### 주요 발견 영역
- **Social (`src/pages/social`)**: `WeeklySocial.tsx`, `SocialDetailModal.tsx`, `GroupCalendarModal.tsx` 등 핵심 컴포넌트 일부.
- **Shopping (`src/pages/shopping`)**: `ShopRegisterModal.tsx` 등 (ShopCard, ShopDetailModal은 양호).
- **Components (`src/pages/v2/components`)**: `EventList`, `NewEventsBanner`, `ShoppingBanner` 등.
- **Practice (`src/pages/practice`)**: `PracticeRoomList.tsx`, `VenueDetailModal.tsx`.
- **Billboard (`src/pages/billboard`)**: `BillboardLayout` 버전별 파일들.

**위반 예시 (`WeeklySocial.tsx`):**
```tsx
<div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-muted)' }}>
<i className="ri-loader-4-line ri-spin" style={{ fontSize: '2rem', marginBottom: '8px', display: 'block' }}></i>
```

**위반 예시 (`ShopDetailModal.tsx`):**
- 모달 내부 컨텐츠 영역 등에 인라인 스타일이 포함되어 있을 수 있습니다.

### 🎨 Tailwind / Utility Classes Detected
`className` 내에 Tailwind 스타일(`text-`, `bg-`, `p-`, `m-` 등)이나 비표준 유틸리티 클래스가 포함된 파일도 다수 존재합니다.

#### 주요 발견 영역
- **Social**: `social.css`를 사용하면서도 일부 태그에 Tailwind 혼용.
- **Board**: 게시판 관련 컴포넌트들.
- **Common**: 공통 모달 및 배너 컴포넌트.

### ⚠️ Lint Warnings (1,749개)
Lint 경고의 대다수는 다음 두 가지 유형입니다.
1.  **`no-console`**: 프로덕션 코드에 `console.log`가 방치됨.
2.  **`@typescript-eslint/no-explicit-any`**: 타입 정의 없이 `any`를 사용하여 타입 안전성이 떨어짐.

## 3. Action Plan (Recommended)

현재 상태를 근본적으로 해결하기 위해 다음 단계별 접근을 제안합니다.

### Phase 1: Social & Shopping (사용자 관심 집중 영역)
- **대상**: `src/pages/social`, `src/pages/shopping` 폴더 내 모든 `.tsx` 파일.
- **작업**:
    - 인라인 스타일을 `social.css`, `shopping.css` 또는 컴포넌트별 CSS로 추출.
    - Tailwind 클래스를 시멘틱 클래스(BEM 명명법 권장)로 변환.
    - `console.log` 제거.

### Phase 2: Common Components (v2/components)
- **대상**: `EventList`, `Banner` 등 재사용 컴포넌트.
- **작업**: `EventList.css` 등으로 스타일 중앙화.

### Phase 3: Lint Cleanup
- **대상**: 전체 프로젝트.
- **작업**: `console.log` 일괄 삭제(또는 주석 처리), `any` 타입 구체화(가능한 범위 내).

## 4. Conclusion
"수정되었다"는 보고가 일부 컴포넌트에 국한되었던 점을 사과드립니다. 현재 프로젝트는 **대규모 리팩토링이 필요한 과도기 상태**이며, 체계적인 스타일 정규화 작업이 지속적으로 요구됩니다.
