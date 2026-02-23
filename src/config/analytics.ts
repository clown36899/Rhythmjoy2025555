/**
 * 사이트 통합 분석 트래킹 설정
 */
export const SITE_ANALYTICS_CONFIG = {
    // [CRITICAL] 전체 트래킹 활성화 여부 (킬-스위치)
    // 문제 발생 시 false로 변경하면 모든 트래킹 로직이 즉시 중단됩니다.
    ENABLED: true,

    // 환경 설정
    ENV: {
        IS_PRODUCTION: import.meta.env.PROD,
        LOG_TO_CONSOLE: !import.meta.env.PROD, // 개발 환경에서만 콘솔 출력
    },

    // 데이터 수집 최적화
    OPTIMIZATION: {
        DEBOUNCE_TIME: 1000,    // 동일 타겟 연속 클릭 무시 시간 (ms)
        USE_IDLE_CALLBACK: true, // 브라우저 유휴 시점에 전송 여부
        USE_BEACON: true,       // 페이지 이탈 시 sendBeacon 사용 여부
    },

    // 비로그인 유저 식별자 키
    STORAGE_KEYS: {
        FINGERPRINT: 'rj_analytics_fp',
    }
};
