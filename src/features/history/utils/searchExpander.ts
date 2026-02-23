/**
 * 🕺 Swing History Search Expander
 * 스윙 댄스 역사 관련 주요 용어의 한글/영어 매핑 사전입니다.
 * 사용자가 한 쪽 언어로 검색해도 반대쪽 언어의 데이터를 찾을 수 있도록 돕습니다.
 */

const RAW_DICTIONARY = [
    // 장소
    ['savoy', 'savoy ballroom', '사보이', '사보이 볼룸', '사보이볼룸'],
    ['cotton club', '코튼 클럽', '코튼클럽'],
    ['apollo', 'apollo theater', '아폴로', '아폴로 극장'],
    ['alhambra', '알함브라'],
    ['roseland', 'roseland ballroom', '로즈랜드', '로즈랜드 볼룸'],
    ['harvest moon ball', 'harvest', '하베스트 문 볼', '하베스트'],

    // 춤 장르
    ['lindy', 'lindy hop', '린디', '린디합', '린디 홉'],
    ['charleston', '찰스턴', '찰스톤'],
    ['jazz', 'solo jazz', 'authentic jazz', '재즈', '솔로 재즈', '어센틱 재즈'],
    ['tap', 'tap dance', '탭', '탭댄스', '탭 댄스'],
    ['balboa', 'bal', '발보아'],
    ['shag', 'collegiate shag', 'shag', '섁', '쉐그', '컬리지에이트 섁'],
    ['blues', '블루스'],
    ['swing', 'swing dance', '스윙', '스윙 댄스', '스윙댄스'],
    ['cakewalk', '케이크워크', '케이크 워크'],
    ['black bottom', '블랙 바텀', '블랙바텀'],
    ['big apple', '빅 애플', '빅애플'],
    ['shim sham', 'shim sham shimmy', '심샴', '심 샴', '심샴 쉬미'],

    // 인물 / 그룹 / 밴드
    ['frankie', 'frankie manning', '프랭키', '프랭키 매닝'],
    ['norma', 'norma miller', '노마', '노마 밀러'],
    ['shorty', 'shorty george', '쇼티', '쇼티 조지'],
    ['big bea', '빅 비'],
    ['whitey', 'whitey\'s lindy hoppers', 'wlh', '와이티', '와이티스 린디 호퍼스', '와이티즈'],
    ['duke', 'duke ellington', '듀크', '듀크 엘링턴'],
    ['count basie', 'basie', '카운트 베이시', '베이시'],
    ['chick webb', 'chick', '칙 웹', '칙웹'],
    ['benny goodman', 'benny', '베니 굿맨', '베니'],
    ['ella', 'ella fitzgerald', '엘라', '엘라 피츠제럴드'],
    ['cab calloway', 'cab', '캡 캘러웨이'],
    ['louis armstrong', 'pops', '루이 암스트롱', '루이'],
    ['billie holiday', 'lady day', '빌리 홀리데이'],

    // 기타 용어
    ['air step', 'aerial', '에어 스텝', '에어리얼', '공중 동작'],
    ['jam', 'jam circle', '잼', '잼 서클'],
    ['contest', 'competition', 'comp', '대회', '컴티', '컨테스트', '배틀'],
    ['performance', 'gig', '공연'],
];

// 검색어 확장을 위한 맵 생성
// key: 'savoy' -> value: ['savoy', 'savoy ballroom', '사보이', ...]
const EXPANSION_MAP = new Map<string, string[]>();

RAW_DICTIONARY.forEach(group => {
    group.forEach(term => {
        // 1. Original
        const lowerTerm = term.toLowerCase();
        if (!EXPANSION_MAP.has(lowerTerm)) {
            EXPANSION_MAP.set(lowerTerm, group);
        }

        // 2. No Space version (e.g., 'savoyballroom')
        const noSpace = lowerTerm.replace(/\s+/g, '');
        if (noSpace !== lowerTerm && !EXPANSION_MAP.has(noSpace)) {
            EXPANSION_MAP.set(noSpace, group);
        }
    });
});

/**
 * 입력된 검색어를 바탕으로 연관된 동의어/번역어 리스트를 반환합니다.
 */
export const expandSearchQuery = (query: string): string[] => {
    if (!query) return [];

    const normalizedQuery = query.toLowerCase().trim();

    // 1. 직접 매칭 확인
    const directMatch = EXPANSION_MAP.get(normalizedQuery);
    if (directMatch) {
        return directMatch; // 전체 그룹 반환
    }

    // 2. 부분 일치 확인 (조금 더 느릴 수 있지만 유용함)
    // 예: "사보" 입력 시 -> "사보이" 그룹 찾기? (너무 과할 수 있음, 일단 단어 단위 매칭 시도)
    // "사보이" 입력 시 -> EXPANSION_MAP에 있음.

    // 만약 사전에 없는 단어라면 원본만 반환
    return [query];
};

/**
 * 쿼리가 데이터에 포함되는지 확인 (확장된 쿼리 목록 사용)
 */
export const smartSearch = (text: string | null | undefined, queries: string[]): boolean => {
    if (!text) return false;
    const normalizedText = text.toLowerCase();

    // queries 중 하나라도 포함되면 true
    return queries.some(q => normalizedText.includes(q.toLowerCase()));
};
