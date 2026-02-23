/**
 * 안전한 Web Storage 래퍼
 * Safari 프라이빗 모드, 저장 공간 부족 등의 에러를 처리하여 크래시 방지
 */

export const safeLocalStorage = {
    /**
     * localStorage에서 값을 가져옵니다
     * @param key 저장소 키
     * @param fallback 에러 시 반환할 기본값
     * @returns 저장된 값 또는 fallback
     */
    getItem: (key: string, fallback: string | null = null): string | null => {
        try {
            return localStorage.getItem(key);
        } catch (error) {
            console.warn(`localStorage.getItem failed for key "${key}":`, error);
            return fallback;
        }
    },

    /**
     * localStorage에 값을 저장합니다
     * @param key 저장소 키
     * @param value 저장할 값
     * @returns 성공 여부
     */
    setItem: (key: string, value: string): boolean => {
        try {
            localStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error(`localStorage.setItem failed for key "${key}":`, error);
            return false;
        }
    },

    /**
     * localStorage에서 값을 제거합니다
     * @param key 저장소 키
     * @returns 성공 여부
     */
    removeItem: (key: string): boolean => {
        try {
            localStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn(`localStorage.removeItem failed for key "${key}":`, error);
            return false;
        }
    },

    /**
     * localStorage를 모두 지웁니다
     * @returns 성공 여부
     */
    clear: (): boolean => {
        try {
            localStorage.clear();
            return true;
        } catch (error) {
            console.error('localStorage.clear failed:', error);
            return false;
        }
    },

    /**
     * localStorage에 키가 존재하는지 확인합니다
     * @param key 저장소 키
     * @returns 존재 여부
     */
    hasItem: (key: string): boolean => {
        try {
            return localStorage.getItem(key) !== null;
        } catch (error) {
            console.warn(`localStorage.hasItem failed for key "${key}":`, error);
            return false;
        }
    },
};

export const safeSessionStorage = {
    getItem: (key: string, fallback: string | null = null): string | null => {
        try {
            return sessionStorage.getItem(key);
        } catch (error) {
            console.warn(`sessionStorage.getItem failed for key "${key}":`, error);
            return fallback;
        }
    },

    setItem: (key: string, value: string): boolean => {
        try {
            sessionStorage.setItem(key, value);
            return true;
        } catch (error) {
            console.error(`sessionStorage.setItem failed for key "${key}":`, error);
            return false;
        }
    },

    removeItem: (key: string): boolean => {
        try {
            sessionStorage.removeItem(key);
            return true;
        } catch (error) {
            console.warn(`sessionStorage.removeItem failed for key "${key}":`, error);
            return false;
        }
    },

    clear: (): boolean => {
        try {
            sessionStorage.clear();
            return true;
        } catch (error) {
            console.error('sessionStorage.clear failed:', error);
            return false;
        }
    },
};
