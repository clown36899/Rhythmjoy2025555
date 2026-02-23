/**
 * Prefix가 포함된 다양한 형태의 ID 스트링에서 순수 숫자 ID를 추출합니다.
 * 예: "event-123-2024-01-01" -> 123
 *     "social-456" -> 456
 *     "789" -> 789
 *     "social-event-123" -> 123
 */
export const extractNumericId = (id: string | number | undefined | null): number | null => {
    if (id === undefined || id === null) return null;

    const idStr = String(id);
    // 숫자가 포함되어 있지 않으면 null 반환
    if (!/\d/.test(idStr)) return null;

    // 정규식 설명:
    // 1. 숫자가 아닌 문자로 시작하거나 ("social-", "event-")
    // 2. 숫자가 나오면 그 숫자 뭉치를 추출
    // 3. 특히 "event-123-2024..." 와 같은 경우 첫 번째 숫자 뭉치가 실제 ID임
    const match = idStr.match(/(\d+)/);
    if (match) {
        return parseInt(match[1], 10);
    }

    return null;
};
