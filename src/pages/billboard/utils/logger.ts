// ✅ 빌보드 로그 제어 (APK 인스펙터 테스트용 활성화)
const ENABLE_BILLBOARD_LOGS = true;

// 로그 래퍼 함수 (프로덕션에서는 자동으로 비활성화)
export const log = (...args: any[]) => {
  if (ENABLE_BILLBOARD_LOGS) {
    console.log(...args);
  }
};

export const warn = (...args: any[]) => {
  if (ENABLE_BILLBOARD_LOGS) {
    console.warn(...args);
  }
};

export const error = (...args: any[]) => {
  if (ENABLE_BILLBOARD_LOGS) {
    console.error(...args);
  }
};
