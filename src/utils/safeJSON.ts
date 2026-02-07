/**
 * 안전한 JSON 파싱 유틸리티
 * JSON.parse 에러를 처리하여 크래시 방지
 */

export const safeJSONParse = <T = unknown>(
    jsonString: string | null | undefined,
    fallback: T = [] as T
): T => {
    if (!jsonString || typeof jsonString !== 'string') {
        return fallback;
    }

    try {
        return JSON.parse(jsonString) as T;
    } catch (error) {
        console.warn('JSON parse failed:', {
            input: jsonString.substring(0, 100),
            error: error instanceof Error ? error.message : 'Unknown error'
        });
        return fallback;
    }
};

/**
 * 배열 JSON 파싱 (타입 안전)
 */
export const parseJSONArray = <T = unknown>(
    jsonString: string | null | undefined
): T[] => {
    return safeJSONParse<T[]>(jsonString, []);
};

/**
 * 객체 JSON 파싱 (타입 안전)
 */
export const parseJSONObject = <T = Record<string, unknown>>(
    jsonString: string | null | undefined,
    fallback: T = {} as T
): T => {
    return safeJSONParse<T>(jsonString, fallback);
};
