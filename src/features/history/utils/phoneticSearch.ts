/**
 * 🗣️ Phonetic Search Utility (발음 기반 검색)
 * 한글 검색어를 로마자로 변환하여 영문 텍스트와 발음 유사도를 비교하거나,
 * 그 반대의 경우를 처리하여 "사전 없이도" 한영 자동 검색을 지원합니다.
 */

// 초성/중성/종성 매핑 (Loose mapping for better matching)
const CHO = ['g', 'kk', 'n', 'd', 'tt', 'r', 'm', 'b', 'pp', 's', 'ss', '', 'j', 'jj', 'ch', 'k', 't', 'p', 'h'];
const JUNG = ['a', 'ae', 'ya', 'yae', 'eo', 'e', 'yeo', 'ye', 'o', 'wa', 'wae', 'oe', 'yo', 'u', 'wo', 'we', 'wi', 'yu', 'eu', 'ui', 'i'];
const JONG = ['', 'k', 'k', 'ks', 'n', 'nj', 'nh', 'd', 'l', 'lg', 'lm', 'lb', 'ls', 'lt', 'lp', 'lh', 'm', 'b', 'bs', 's', 'ss', 'ng', 'j', 'ch', 'k', 't', 'p', 'h'];

/**
 * 한글 문자열을 로마자(영어 발음)로 변환합니다.
 * 예: "사보이" -> "saboi", "린디" -> "lindi"
 */
export const romanize = (text: string): string => {
    let result = '';
    for (let i = 0; i < text.length; i++) {
        const char = text.charCodeAt(i);
        // 한글 유니코드 범위: 0xAC00 ~ 0xD7A3
        if (char >= 0xAC00 && char <= 0xD7A3) {
            const code = char - 0xAC00;
            const jong = code % 28;
            const jung = ((code - jong) / 28) % 21;
            const cho = Math.floor((code - jong) / 28 / 21);

            result += CHO[cho] + JUNG[jung] + JONG[jong];
        } else {
            // 한글이 아니면 그대로 유지 (영어, 숫자 등)
            result += text[i];
        }
    }
    return result.toLowerCase().replace(/[^a-z0-9]/g, '');
};

/**
 * Levenshtein Distance (편집 거리) 계산
 * 두 문자열이 얼마나 다른지 측정 (0이면 완전 일치)
 */
const levenshtein = (a: string, b: string): number => {
    if (a.length === 0) return b.length;
    if (b.length === 0) return a.length;

    const matrix = [];

    // increment along the first column of each row
    for (let i = 0; i <= b.length; i++) {
        matrix[i] = [i];
    }

    // increment each column in the first row
    for (let j = 0; j <= a.length; j++) {
        matrix[0][j] = j;
    }

    // Fill in the rest of the matrix
    for (let i = 1; i <= b.length; i++) {
        for (let j = 1; j <= a.length; j++) {
            if (b.charAt(i - 1) === a.charAt(j - 1)) {
                matrix[i][j] = matrix[i - 1][j - 1];
            } else {
                matrix[i][j] = Math.min(
                    matrix[i - 1][j - 1] + 1, // substitution
                    Math.min(
                        matrix[i][j - 1] + 1, // insertion
                        matrix[i - 1][j] + 1 // deletion
                    )
                );
            }
        }
    }

    return matrix[b.length][a.length];
};

/**
 * 발음 유사도 검사
 * source: 검색 대상 (예: "Savoy")
 * query: 검색어 (예: "사보이")
 */
export const isPhoneticMatch = (source: string, query: string): boolean => {
    if (!source || !query) return false;

    const normSource = source.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normQuery = query.toLowerCase().replace(/[^a-z0-9]/g, ''); // 영문 검색일 경우 대비
    const romanQuery = romanize(query); // 한글 검색일 경우 로마자 변환

    // [FIX] 빈 문자열 매칭 방지: query가 한글일 때 normQuery는 빈 문자열이 될 수 있음
    // 영문 쿼리가 존재할 때만 include 검사, 로마자 변환 쿼리는 최소 2글자 이상이어야 검사
    const matchesEnglish = normQuery.length > 0 && normSource.includes(normQuery);
    const matchesRoman = romanQuery.length > 1 && normSource.includes(romanQuery);

    if (matchesEnglish || matchesRoman) return true;

    // 2. Fuzzy Matching (유사도 검사)
    // 짧은 단어(3글자 이하)는 엄격하게, 긴 단어는 관대하게
    const target = normSource;
    const input = romanQuery;

    if (Math.abs(target.length - input.length) > 3) return false; // 길이 차이가 크면 스킵

    const dist = levenshtein(target, input);

    // 허용 오차: 길이의 30% 또는 최대 2글자
    const tolerance = Math.max(1, Math.min(2, Math.floor(target.length * 0.3)));

    // 예: saboi vs savoy (dist 1, v->b) -> match!
    return dist <= tolerance;
};
