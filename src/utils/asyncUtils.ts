/**
 * 비동기 작업을 재시도하는 유틸리티 함수
 * @param operation 실행할 비동기 함수
 * @param retries 최대 재시도 횟수 (기본값: 3)
 * @param delay 재시도 간격 (ms, 기본값: 1000)
 * @returns 작업 결과
 */
export async function retryOperation<T>(
    operation: () => Promise<T>,
    retries: number = 3,
    delay: number = 1000
): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (retries <= 0) {
            throw error;
        }
        console.warn(`Operation failed, retrying... (${retries} attempts left)`, error);
        await new Promise((resolve) => setTimeout(resolve, delay));
        return retryOperation(operation, retries - 1, delay);
    }
}
