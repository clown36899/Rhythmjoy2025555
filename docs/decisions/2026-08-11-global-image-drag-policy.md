# 사이트 전역 이미지 드래그 기본 차단

- 날짜: 2026-08-11
- 상태: 채택

## 배경

스크롤 카드·게시글·모달의 이미지는 조작 대상이 아닌데도 모바일 브라우저의 기본 이미지 드래그와 전역 드래그 폴리필 대상이 됐다. 화면별 `draggable=false`와 CSS를 반복 추가하면 새 이미지 컴포넌트나 동적 HTML에서 같은 문제가 재발한다.

## 결정

1. 사이트의 모든 `<img>`는 네이티브 드래그 불가가 기본이다. 클릭, 링크 이동, 확대, 세로 스크롤은 유지한다.
2. 앱 시작 시 기존 이미지에 `draggable=false`를 적용하고, DOM 변경 감시로 이후 추가되거나 속성이 바뀐 이미지에도 같은 정책을 적용한다.
3. 캡처 단계의 `dragstart`를 함께 차단해 브라우저·폴리필 구현 차이에도 반투명 드래그 미리보기가 시작되지 않게 한다.
4. 모바일 드래그 폴리필은 이미지에서 시작한 터치를 상위 링크·카드 드래그로 승격하지 않는다. 이미지 자체만 `draggable=false`여도 상위 링크가 선택되는 폴리필 우회를 진입 단계에서 차단한다.
5. 저장 HTML에서는 `data-image-drag`를 제거하고 모든 `draggable` 값을 `false`로 정규화한다. 게시물 내용이 전역 정책의 허용 경계를 만들 수 없다.
6. 네이티브 이미지 드래그가 실제 기능 요구사항인 도구만 이미지 또는 조상에 `data-image-drag="allow"`를 표시하고 `draggable="true"`를 명시한다. 현재 허용 범위는 게시물 UniversalEditor와 관리자 WebzineEditor뿐이다. 예외는 암묵적으로 만들지 않는다.

## 결과

새 화면과 서버 렌더 HTML을 포함한 일반 이미지는 추가 작업 없이 스크롤 대상으로 동작한다. 향후 드래그 기능은 명시적인 예외이므로 코드 검색과 회귀 검증이 가능하다.

## 관련 파일

- `src/utils/imageDragPolicy.ts`
- `src/utils/imageDragPolicy.test.ts`
- `src/utils/sanitizeHtml.ts`
- `src/index.css`
- `src/main.tsx`
- `src/components/UniversalEditor/Core/UniversalEditor.tsx`
- `src/pages/admin/webzine/WebzineEditor.tsx`
