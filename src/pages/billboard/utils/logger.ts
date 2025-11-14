// ✅ 빌보드 로그 제어 (프로덕션: false, 디버깅: true)
const ENABLE_BILLBOARD_LOGS = false;

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
