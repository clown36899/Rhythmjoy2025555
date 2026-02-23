# 종합 사이트 리뷰 보고서 (v5)

## 1. 개요
현재 코드베이스의 전반적인 품질, 스타일 가이드 준수 여부, 그리고 잠재적인 위험 요소를 분석한 보고서입니다. 사용자의 `git reset --hard` 이후 상태를 기준으로 작성되었습니다.

## 2. 린트(Lint) 점검 결과
- **총 에러 수:** 0개
- **총 경고(Warning) 수:** 1,781개
- **주요 경고 항목:**
    - `no-console`: 디버깅용 콘솔 로그가 다수 잔존함.
    - `@typescript-eslint/no-unused-vars`: 정의되었으나 사용되지 않는 변수가 많음.
    - `@typescript-eslint/no-explicit-any`: `any` 타입 사용이 빈번함.
    - `react-hooks/exhaustive-deps`: `useEffect` 등의 의존성 배열 누락 가능성.

## 3. 스타일링 가이드 위반 사항 (중요)
사용자 규칙(Tailwind 금지, 인라인 스타일 금지, 시멘틱 CSS 사용)에 따른 위반 사례입니다.

### 3.1. 인라인 스타일 (`style={{...}}`) 사용 사례
다수의 파일에서 인라인 스타일이 발견되었습니다. 특히 관리자 및 데모 페이지에서 빈도가 높습니다.
- `src/pages/DebugLogPage.tsx`: 거의 모든 엘리먼트에 인라인 스타일 적용.
- `src/pages/billboard/preview/CatalogPage.tsx`: 레이아웃 및 간격 조절에 인라인 스타일 대거 사용.
- `src/pages/billboard/page.tsx`: 배경 이미지 및 동적 위치 계산 이외의 정적 스타일도 인라인으로 적용됨.
- `src/pages/v2/components/EventCard.tsx`: 이미지 및 배경 설정부에서 인라인 스타일 확인.

### 3.2. Tailwind 스타일 유틸리티 클래스 사용 사례
시멘틱 전용 CSS 대신 Tailwind 스타일의 유틸리티 클래스가 사용된 사례입니다.
- **폰트 크기:** `text-xl`, `text-2xl`, `text-sm`, `text-xs` (예: `StatsModal.tsx`, `MonthlyWebzine.tsx`)
- **색상:** `text-blue-400`, `text-blue-300`, `text-rose-400`, `text-gray-500` (예: `MonthlyWebzine.tsx`)
- **간격/레이아웃:** `mt-6`, `mb-1`, `flex-1`, `no-margin-top`, `margin-bottom-24` (예: `MyActivitiesPage.tsx`, `MonthlyWebzine.tsx`)
- **기타:** `cursor-pointer`, `overflow-x-auto` 등.

## 4. 인프라 및 DB 분석
- **환경 변수:** Netlify를 통해 관리되고 있으며, 주요 변수는 다음과 같습니다.
    - `VITE_PUBLIC_SUPABASE_URL`: Supabase URL 확인됨.
    - `VITE_PUBLIC_SUPABASE_ANON_KEY`: Supabase Anon Key 확인됨.
    - `SUPABASE_SERVICE_KEY`: 서비스 롤 키(관리자용) 확인됨.
    - `VITE_KAKAO_...`: 카카오 인증 관련 키 확인됨.
- **특이사항:** `SUPABASE_SERVICE_KEY`가 클라이언트 환경 변수 목록에 노출되어 있을 수 있으므로 보안 점검이 필요함.

## 5. 종합 의견 및 제안
1. **스타일 정리:** 인라인 스타일과 유틸리티 클래스를 제거하고, 각 컴포넌트 전용 `.css` 파일로 분리하여 시멘틱하게 네이밍해야 합니다.
2. **린트 수정:** 1781개의 경고는 코드 가독성과 유지보수성을 저해하므로 단계적인 수정이 필요합니다.
3. **타입 안전성 확보:** `any` 타입을 구체적인 인터페이스나 타입으로 교체하여 런타임 에러 가능성을 줄여야 합니다.
