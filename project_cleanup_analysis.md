# 프로젝트 파일 정리 분석 리포트

프로젝트 전체 구조를 스캔하여 불필요하거나 정리가 필요한 파일들을 분석했습니다.
수정/삭제 전 확인 단계입니다.

## 1. Src 폴더 (소스코드)
소스코드는 비교적 구조화되어 있으나, 개발/테스트 흔적들이 남아있습니다.

### 🗑️ 삭제/아카이빙 추천 (Test & Backup)
*   `src/components/EventRegistrationModal.css.broken` (명백한 쓰레기 파일)
*   `src/hooks/useModal.local.ts.backup` (백업 파일)
*   `src/pages/TestDeletePage.tsx` (테스트용 페이지)
*   `src/pages/PushNotificationTestPage.tsx`
*   `src/components/PushNotificationTest.tsx` & `.css`
*   `src/pages/test/` (이 폴더 내부 확인 필요)
*   `src/pages/DebugLogPage.tsx` (개발용 로그 페이지라면 prod에서 제외 추천)

## 2. Public 폴더 (정적 자원)
이미지 자원 중 중복되거나 버전 관리가 안 된 파일들이 있습니다.

### ⚠️ 중복 자산 (Assets Cleanup)
*   `public/icons/` 내부에 동일한 아이콘의 여러 버전이 혼재됨.
    *   `guest_class_icon.jpg`
    *   `guest_class_icon_v2.jpg`, `_v3.jpg`, `_v4.png`, `_v4_raw.jpg`
    *   **제안**: 현재 실제로 쓰이는 하나(`v4.png` 추정)만 남기고 정리 필요.

## 3. Scripts 폴더 (유틸리티)
`scripts/` 폴더 내에 일회성 점검을 위해 만들었던 스크립트가 다수 존재합니다.

### 📦 아카이빙 추천 (Maintenance Scripts)
이 파일들은 실행에 필수적이지 않으며, 과거 DB 점검용으로 보입니다. `_archive/scripts`로 이동 추천.
*   `check_*.js`, `check_*.sql` (점검용)
*   `inspect_*.js`
*   `analyze_*.js`
*   `find_*.js`

## 4. 결론 및 제안
현재 프로젝트는 기능 구현 과정에서 생성된 **"건설 비계(Scaffolding)"**들이 그대로 남아있는 상태입니다.
기능에는 영향이 없으나, 유지보수를 위해 다음 3단계 청소를 제안합니다.

1.  **[즉시] 명백한 쓰레기 파일 삭제**: `*.broken`, `*.backup`
2.  **[정리] Scripts 폴더 대청소**: `notify-deploy.js` 같은 배포용 스크립트 외에는 모두 아카이브로 이동.
3.  **[확인 후 삭제] Test 페이지 제거**: `TestDeletePage` 등은 유저가 접근할 일 없는 페이지이므로 제거.
