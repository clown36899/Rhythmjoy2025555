export type GroovePresetId =
    | 'ride'
    | 'bass'
    | 'piano'
    | 'guitar'
    | 'shuffle'
    | 'shuffle-bass'
    | 'boogie-piano'
    | 'blues-guitar'
    | 'triplet'
    | 'slow-blues'
    | 'funk-drums'
    | 'funk-bass'
    | 'funk-guitar'
    | 'funk-clav'
    | 'bossa-guitar'
    | 'bossa-bass'
    | 'samba-surdo'
    | 'samba-pandeiro'
    | 'son-clave-32'
    | 'son-clave-23'
    | 'tumbao-bass'
    | 'conga-tumbao'
    | 'rock-drums'
    | 'rock-bass'
    | 'rock-guitar'
    | 'pop-syncopation'
    | 'blue-note-bend'
    | 'blue-note-piano';
export type GrooveFeel = 'adaptive' | 'triplet' | 'straight';
export type GrooveFamilyId =
    | 'swing'
    | 'shuffle'
    | 'compound'
    | 'funk'
    | 'brazilian'
    | 'afro-cuban'
    | 'backbeat'
    | 'blue-note';
export type GrooveVoice =
    | 'ride'
    | 'hat'
    | 'bass'
    | 'piano'
    | 'boogie'
    | 'guitar'
    | 'click'
    | 'snare'
    | 'kick'
    | 'blue-note'
    | 'blue-piano'
    | 'clav'
    | 'bossa-guitar'
    | 'surdo'
    | 'pandeiro'
    | 'clave'
    | 'conga';

export interface GrooveEvent {
    id: string;
    position: number;
    voice: GrooveVoice;
    gain: number;
    variant?: number;
    durationSeconds?: number;
}

export interface GroovePreset {
    id: GroovePresetId;
    family: GrooveFamilyId;
    instrument: string;
    name: string;
    shortName: string;
    icon: string;
    color: string;
    pattern: string;
    explanation: string;
    recommendedFeel: GrooveFeel;
    fixedTripletGrid?: boolean;
    timingLocked?: boolean;
    feelOptions?: readonly GrooveFeel[];
    beatsPerLoop?: 4 | 8;
    beatsPerBar?: 2 | 4;
    evidenceIds: readonly string[];
}

export const GROOVE_FAMILIES: readonly { id: GrooveFamilyId; label: string; description: string }[] = [
    { id: 'swing', label: '재즈 스윙', description: '템포에 따라 달라지는 롱–숏과 리듬 섹션 역할' },
    { id: 'shuffle', label: '셔플·부기', description: '셋잇단 첫째·셋째 칸을 중심으로 한 블루스 계열' },
    { id: 'compound', label: '3연·12/8', description: '세 칸을 모두 느끼는 균등 셋잇단·컴파운드 미터' },
    { id: 'funk', label: '펑크 16비트', description: '강한 1박과 악기 사이를 맞물리는 16분음표 싱코페이션' },
    { id: 'brazilian', label: '보사·삼바', description: '기타의 엄지·코드 분리와 브라질 타악기의 층별 패턴' },
    { id: 'afro-cuban', label: '아프로쿠반', description: '3-2·2-3 클라베를 기준으로 맞물리는 베이스와 콩가' },
    { id: 'backbeat', label: '록·팝', description: '2·4박 백비트와 스트레이트 8분음표 기반 리듬 섹션' },
    { id: 'blue-note', label: '블루 노트', description: '리듬이 아닌, 악기별 음높이 굴절과 건반 근사' },
] as const;

export const GROOVE_PRESETS: readonly GroovePreset[] = [
    {
        id: 'ride',
        family: 'swing',
        instrument: '드럼',
        name: '재즈 라이드 + 하이햇',
        shortName: 'Jazz Ride',
        icon: 'ri-disc-line',
        color: '#f59e0b',
        pattern: '딩 · 딩—가 · 딩 · 딩—가',
        explanation: '라이드는 네 박을 유지하고 2·4박 뒤에 짧은 스킵 노트, 하이햇은 2·4박에 둡니다.',
        recommendedFeel: 'adaptive',
        feelOptions: ['adaptive', 'triplet', 'straight'],
        evidenceIds: ['friberg', 'butterfield'],
    },
    {
        id: 'bass',
        family: 'swing',
        instrument: '콘트라베이스',
        name: '워킹 베이스',
        shortName: 'Walking Bass',
        icon: 'ri-music-2-line',
        color: '#38bdf8',
        pattern: '둠 · 둠 · 둠 · 둠',
        explanation: '한 마디의 네 박을 모두 짚는 four-to-the-bar 워킹 펄스입니다. 스윙 비율로 박 자체를 찌그러뜨리지 않습니다.',
        recommendedFeel: 'straight',
        evidenceIds: ['columbia'],
    },
    {
        id: 'piano',
        family: 'swing',
        instrument: '피아노',
        name: 'Charleston 컴핑',
        shortName: 'Charleston',
        icon: 'ri-keyboard-box-line',
        color: '#c084fc',
        pattern: '1 · · · 2 · & ·',
        explanation: '1박과 2박 뒤 업비트에 짧은 코드를 놓는 기본 컴핑 어휘입니다. 업비트 위치는 선택한 스윙 표현을 따릅니다.',
        recommendedFeel: 'triplet',
        feelOptions: ['triplet', 'straight'],
        evidenceIds: ['comping', 'musicxml'],
    },
    {
        id: 'guitar',
        family: 'swing',
        instrument: '리듬 기타',
        name: 'Freddie Green 4비트',
        shortName: 'Four-to-bar',
        icon: 'ri-guitar-line',
        color: '#34d399',
        pattern: '착 · 착 · 착 · 착',
        explanation: '매 박의 안정된 펄스 위에 한 음 중심의 보이스 리딩과 뮤트된 현의 짧은 타격감을 겹치는 빅밴드 리듬 기타 축약형입니다.',
        recommendedFeel: 'straight',
        evidenceIds: ['freddie'],
    },
    {
        id: 'triplet',
        family: 'compound',
        instrument: '연습 가이드',
        name: '균등 셋잇단음',
        shortName: '3연음 전체',
        icon: 'ri-number-3',
        color: '#fb7185',
        pattern: '1-trip-let · 2-trip-let',
        explanation: '한 박을 정확히 같은 길이의 세 칸으로 나눠 세 음을 모두 냅니다. 스윙이 아니라 셋잇단음 기준선입니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['triplet-definition'],
    },
    {
        id: 'shuffle',
        family: 'shuffle',
        instrument: '드럼',
        name: '트리플릿 셔플',
        shortName: 'Shuffle',
        icon: 'ri-rhythm-line',
        color: '#fb923c',
        pattern: '타 · (쉼) · 카',
        explanation: '균등 셋잇단음의 첫째와 셋째 칸을 연주하고 가운데 칸은 비웁니다. 2·4박에는 스네어를 더합니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['triplet-definition'],
    },
    {
        id: 'shuffle-bass',
        family: 'shuffle',
        instrument: '블루스 베이스',
        name: '5도–6도 셔플 베이스',
        shortName: 'Bass Shuffle',
        icon: 'ri-music-2-line',
        color: '#22d3ee',
        pattern: '근음—5도 · 근음—6도',
        explanation: '각 박의 첫째·셋째 셋잇단 칸에서 근음과 5·6도를 교대해 블루스 셔플의 추진력을 만듭니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['triplet-definition', 'shuffle-definition', 'boogie-riff'],
    },
    {
        id: 'boogie-piano',
        family: 'shuffle',
        instrument: '피아노 왼손',
        name: 'Boogie-Woogie 8-to-bar',
        shortName: 'Boogie Piano',
        icon: 'ri-keyboard-box-line',
        color: '#a78bfa',
        pattern: '둠-바 · 둠-바 · 둠-바 · 둠-바',
        explanation: '왼손 오스티나토가 한 마디에 여덟 번 움직이는 eight-to-the-bar 부기우기 기본형을 셔플 격자로 반복합니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['boogie-study', 'shuffle-definition'],
    },
    {
        id: 'blues-guitar',
        family: 'shuffle',
        instrument: '블루스 기타',
        name: 'Boogie Shuffle 기타',
        shortName: 'Guitar Shuffle',
        icon: 'ri-guitar-line',
        color: '#4ade80',
        pattern: '척—카 · 척—카 · 척—카 · 척—카',
        explanation: '파워 코드의 5도와 6도를 교대하며 각 박의 첫째·셋째 칸을 짧게 스트럼하는 대표적인 부기 셔플 반주입니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['triplet-definition', 'shuffle-definition', 'boogie-riff'],
    },
    {
        id: 'slow-blues',
        family: 'compound',
        instrument: '드럼',
        name: 'Slow Blues 12/8',
        shortName: '12/8 Blues',
        icon: 'ri-rhythm-line',
        color: '#60a5fa',
        pattern: '1-&-a · 2-&-a · 3-&-a · 4-&-a',
        explanation: '네 개의 큰 박마다 세 하위 박을 모두 하이햇으로 들려주고, 스네어는 2·4박에 둡니다. 가운데를 비우는 셔플과 비교할 수 있습니다.',
        recommendedFeel: 'triplet',
        fixedTripletGrid: true,
        evidenceIds: ['slow-blues', 'triplet-definition'],
    },
    {
        id: 'funk-drums',
        family: 'funk',
        instrument: '드럼',
        name: '16비트 Funk Pocket',
        shortName: 'Funk Drums',
        icon: 'ri-rhythm-line',
        color: '#f97316',
        pattern: '1-e-&-a · 2-e-&-a · 3-e-&-a · 4-e-&-a',
        explanation: '하이햇은 16분음표 격자를 만들고, 스네어 2·4박과 고스트 노트 사이에 킥을 싱코페이션으로 배치합니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['funk-microtiming', 'berklee-rock-funk'],
    },
    {
        id: 'funk-bass',
        family: 'funk',
        instrument: '일렉트릭 베이스',
        name: 'Funk Bass — The One',
        shortName: 'Bass on One',
        icon: 'ri-music-2-line',
        color: '#22d3ee',
        pattern: 'ONE! · a · & · e-a',
        explanation: '매 마디 1박을 가장 강하게 고정하고, 나머지 음은 16분음표 약박에서 짧게 응답합니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['funk-one', 'funk-microtiming'],
    },
    {
        id: 'funk-guitar',
        family: 'funk',
        instrument: '뮤트 기타',
        name: '16비트 Scratch Guitar',
        shortName: 'Muted Scratch',
        icon: 'ri-guitar-line',
        color: '#4ade80',
        pattern: 'x-x-X-x · x-X-x-X',
        explanation: '왼손 뮤트의 짧은 16분 스트로크를 유지하면서 약박의 일부만 음정 있는 코드로 강조하는 연습형입니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['funk-microtiming'],
    },
    {
        id: 'funk-clav',
        family: 'funk',
        instrument: '클라비넷',
        name: 'Syncopated Clavinet',
        shortName: 'Clavinet',
        icon: 'ri-keyboard-box-line',
        color: '#c084fc',
        pattern: 'e · a · & · e-a',
        explanation: '드럼의 빈 16분음표 칸에 짧은 건반 스탭을 넣어 리듬 섹션이 서로 맞물리는 구조를 들려줍니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['funk-syncopation', 'funk-microtiming'],
    },
    {
        id: 'bossa-guitar',
        family: 'brazilian',
        instrument: '나일론 기타',
        name: 'Bossa Nova Batida',
        shortName: 'Bossa Guitar',
        icon: 'ri-guitar-line',
        color: '#34d399',
        pattern: '엄지 Bass + 손가락 Chord Syncopation',
        explanation: '엄지는 낮은 베이스를 박에 두고, 손가락 코드는 독립된 싱코페이션으로 응답하는 2마디형 기타 반주를 한 루프로 단순화했습니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        beatsPerBar: 2,
        evidenceIds: ['bossa-pattern-study', 'bossa-accompaniment'],
    },
    {
        id: 'bossa-bass',
        family: 'brazilian',
        instrument: '어쿠스틱 베이스',
        name: 'Bossa Root–Fifth Bass',
        shortName: 'Bossa Bass',
        icon: 'ri-music-2-line',
        color: '#38bdf8',
        pattern: '근음 · 5도 · 근음 · 5도',
        explanation: '기타 엄지와 같은 낮은 층에서 근음과 5도를 번갈아 두어 싱코페이션 코드 아래의 안정된 기준을 만듭니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['bossa-accompaniment'],
    },
    {
        id: 'samba-surdo',
        family: 'brazilian',
        instrument: '수르두',
        name: 'Samba Surdo Pulse',
        shortName: 'Surdo',
        icon: 'ri-disc-line',
        color: '#fb7185',
        pattern: '둠 · DUM · 둠 · DUM',
        explanation: '낮은 북이 큰 박의 골격을 만들고 두 번째 펄스를 더 강하게 두는 삼바 앙상블의 저역 역할을 단순화했습니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['samba-microtiming'],
    },
    {
        id: 'samba-pandeiro',
        family: 'brazilian',
        instrument: '판데이루',
        name: 'Samba 16분 타임라인',
        shortName: 'Pandeiro',
        icon: 'ri-rhythm-line',
        color: '#fbbf24',
        pattern: '중–짧–중–긴 16분 흐름',
        explanation: '한 박의 네 하위 칸을 모두 내되 강세와 길이를 다르게 둡니다. 실제 삼바 미세타이밍은 템포·연주자에 따라 달라져 기준 패턴으로만 사용합니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['samba-microtiming', 'samba-tempo-study'],
    },
    {
        id: 'son-clave-32',
        family: 'afro-cuban',
        instrument: '클라베',
        name: '3–2 Son Clave',
        shortName: 'Clave 3–2',
        icon: 'ri-subtract-line',
        color: '#f59e0b',
        pattern: 'X · · X · · X | · · X · X · ·',
        explanation: '앞쪽의 세 타와 뒤쪽의 두 타가 두 마디 방향성을 만들며 다른 악기 패턴의 기준선이 됩니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        beatsPerLoop: 8,
        evidenceIds: ['clave-analysis', 'clave-grammar'],
    },
    {
        id: 'son-clave-23',
        family: 'afro-cuban',
        instrument: '클라베',
        name: '2–3 Son Clave',
        shortName: 'Clave 2–3',
        icon: 'ri-subtract-line',
        color: '#fb923c',
        pattern: '· · X · X · · | X · · X · · X',
        explanation: '3–2의 두 마디 순서를 뒤집은 방향입니다. 단순히 같은 한 마디를 회전한 것이 아니라 앙상블 프레이즈의 기준이 바뀝니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        beatsPerLoop: 8,
        evidenceIds: ['clave-analysis', 'clave-grammar'],
    },
    {
        id: 'tumbao-bass',
        family: 'afro-cuban',
        instrument: '베이스',
        name: 'Anticipated Tumbao Bass',
        shortName: 'Tumbao Bass',
        icon: 'ri-music-2-line',
        color: '#2dd4bf',
        pattern: '&2 · 4~(다음 1)',
        explanation: '원형 bajo anticipado의 2&와 4 두 음을 반복합니다. 4박 음은 다음 마디 1박의 화성 변화를 미리 당겨 이어지는 핵심 anticipation입니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['clave-grammar', 'conga-tumbao-study'],
    },
    {
        id: 'conga-tumbao',
        family: 'afro-cuban',
        instrument: '콩가',
        name: 'Conga Tumbao',
        shortName: 'Conga',
        icon: 'ri-rhythm-line',
        color: '#a78bfa',
        pattern: 'heel–toe–slap–toe–heel–toe–open–open',
        explanation: '연속 8분 heel–toe 속에서 2박 슬랩과 4박·4&의 두 오픈톤을 강조하는 기본 한 북 툼바오입니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['clave-grammar', 'conga-tumbao-study'],
    },
    {
        id: 'rock-drums',
        family: 'backbeat',
        instrument: '드럼',
        name: 'Straight 8th Backbeat',
        shortName: 'Rock Drums',
        icon: 'ri-rhythm-line',
        color: '#ef4444',
        pattern: '킥 1·3 / 스네어 2·4 / 8분 하이햇',
        explanation: '균등 8분 하이햇 위에서 킥은 1·3박, 스네어는 2·4박을 강조하는 기본 백비트입니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['berklee-rock-funk'],
    },
    {
        id: 'rock-bass',
        family: 'backbeat',
        instrument: '일렉트릭 베이스',
        name: 'Driving 8th Bass',
        shortName: '8th Bass',
        icon: 'ri-music-2-line',
        color: '#06b6d4',
        pattern: '1-& · 2-& · 3-& · 4-&',
        explanation: '모든 8분음표를 짚는 베이스가 드럼 백비트 아래에 일정한 추진력을 만듭니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['berklee-rock-funk'],
    },
    {
        id: 'rock-guitar',
        family: 'backbeat',
        instrument: '리듬 기타',
        name: 'Quarter-note Power Chords',
        shortName: 'Rock Guitar',
        icon: 'ri-guitar-line',
        color: '#84cc16',
        pattern: 'DOWN · DOWN · DOWN · DOWN',
        explanation: '짧은 파워코드 다운스트로크를 네 박에 배치해 베이스의 8분 추진력과 대비합니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['berklee-rock-funk'],
    },
    {
        id: 'pop-syncopation',
        family: 'backbeat',
        instrument: '키보드',
        name: 'Pop Keyboard Anticipation',
        shortName: 'Pop Syncopation',
        icon: 'ri-keyboard-box-line',
        color: '#60a5fa',
        pattern: '1-& · (&)2 · a3 · &4',
        explanation: '강박 직전의 약박으로 코드 시작을 당기는 팝·록의 anticipation을 백비트 위에서 반복합니다.',
        recommendedFeel: 'straight',
        timingLocked: true,
        evidenceIds: ['pop-syncopation-study'],
    },
    {
        id: 'blue-note-bend',
        family: 'blue-note',
        instrument: '기타형 벤드',
        name: '플럭 현 가변 Blue Note',
        shortName: 'Blue Bend',
        icon: 'ri-sound-module-line',
        color: '#818cf8',
        pattern: '1 · ♭3↗3 · 4 · ♭5↘4 · 1',
        explanation: '플럭 현 버퍼의 재생률을 연속 이동해 3·5·7도 주변의 굴절을 비교합니다. 보컬·관악기 재현이 아니라 벤딩 가능한 기타형 기준음입니다.',
        recommendedFeel: 'triplet',
        feelOptions: ['triplet', 'straight'],
        evidenceIds: ['blue-note-grove', 'blue-note-research'],
    },
    {
        id: 'blue-note-piano',
        family: 'blue-note',
        instrument: '피아노',
        name: '건반식 Blue Note 근사',
        shortName: 'Piano Blue',
        icon: 'ri-keyboard-box-line',
        color: '#f472b6',
        pattern: '1 · ♭3→3 · 4 · ♭5→5 · ♭7',
        explanation: '피아노는 한 음 안에서 피치를 구부릴 수 없어 ♭3/3, ♭5/5, ♭7 같은 고정 건반을 빠르게 병치해 블루 노트를 근사합니다.',
        recommendedFeel: 'triplet',
        feelOptions: ['triplet', 'straight'],
        evidenceIds: ['blue-note-grove', 'blue-note-piano'],
    },
] as const;

export const getGroovePreset = (id: GroovePresetId): GroovePreset => (
    GROOVE_PRESETS.find((preset) => preset.id === id) ?? GROOVE_PRESETS[0]
);

export const getGrooveLoopBeats = (id: GroovePresetId): number => getGroovePreset(id).beatsPerLoop ?? 4;

export const getGrooveBeatsPerBar = (id: GroovePresetId): number => getGroovePreset(id).beatsPerBar ?? 4;

export const getGrooveLoopBars = (id: GroovePresetId): number => (
    getGrooveLoopBeats(id) / getGrooveBeatsPerBar(id)
);

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

/**
 * Educational interpolation of the ride-cymbal trend reported by Friberg & Sundström.
 * The paper reports an approximately linear decrease, ~2:1 around 200 BPM,
 * up to 3–3.5:1 at slow tempi, and near 1:1 at the fastest tempi.
 */
export const getAdaptiveSwingRatio = (bpm: number): number => {
    const safeBpm = clamp(Number.isFinite(bpm) ? bpm : 120, 40, 320);
    return Number(clamp((11 / 3) - (safeBpm / 120), 1, 3.5).toFixed(2));
};

export const getSwingRatio = (feel: GrooveFeel, bpm: number): number => {
    if (feel === 'straight') return 1;
    if (feel === 'triplet') return 2;
    return getAdaptiveSwingRatio(bpm);
};

export const getOffbeatPosition = (ratio: number): number => {
    const safeRatio = clamp(Number.isFinite(ratio) ? ratio : 1, 1, 4);
    return safeRatio / (safeRatio + 1);
};

/**
 * One measured samba-performance reference reported by Haugen & Godøy:
 * 23.0%, 23.6%, 22.8%, 30.7% of a beat. The values are normalized because
 * the rounded percentages total 100.1%. This is an educational reference,
 * not a claim that every samba performer uses one fixed grid.
 */
export const getSambaSubdivisionOffsets = (): readonly number[] => {
    const durations = [23, 23.6, 22.8, 30.7];
    const total = durations.reduce((sum, duration) => sum + duration, 0);
    let elapsed = 0;
    return durations.map((duration) => {
        const position = elapsed / total;
        elapsed += duration;
        return position;
    });
};

const event = (
    id: string,
    position: number,
    voice: GrooveVoice,
    gain: number,
    variant?: number,
    durationSeconds?: number,
): GrooveEvent => ({ id, position, voice, gain, variant, durationSeconds });

export const buildGrooveBar = (
    presetId: GroovePresetId,
    feel: GrooveFeel,
    bpm: number,
): GrooveEvent[] => {
    const preset = getGroovePreset(presetId);
    const lockedFeel = preset.fixedTripletGrid ? 'triplet' : preset.timingLocked ? preset.recommendedFeel : feel;
    const ratio = getSwingRatio(lockedFeel, bpm);
    const offbeat = getOffbeatPosition(ratio);
    const events: GrooveEvent[] = [];

    switch (presetId) {
        case 'ride':
            for (let beat = 0; beat < 4; beat += 1) {
                events.push(event(`ride-${beat}`, beat, 'ride', beat === 0 ? 1 : 0.82, beat));
            }
            events.push(event('ride-skip-2', 1 + offbeat, 'ride', 0.58, 4));
            events.push(event('ride-skip-4', 3 + offbeat, 'ride', 0.62, 4));
            events.push(event('hat-2', 1, 'hat', 0.72));
            events.push(event('hat-4', 3, 'hat', 0.76));
            break;
        case 'bass':
            [0, 1, 2, 3].forEach((beat, index) => {
                events.push(event(`bass-${beat}`, beat, 'bass', beat === 0 ? 1 : 0.84, index));
            });
            break;
        case 'piano':
            events.push(event('piano-1', 0, 'piano', 0.88, 0));
            events.push(event('piano-and-2', 1 + offbeat, 'piano', 0.72, 1));
            break;
        case 'guitar':
            [0, 1, 2, 3].forEach((beat, index) => {
                events.push(event(`guitar-${beat}`, beat, 'guitar', index % 2 === 1 ? 0.82 : 0.72, index));
            });
            break;
        case 'triplet':
            for (let beat = 0; beat < 4; beat += 1) {
                for (let partial = 0; partial < 3; partial += 1) {
                    events.push(event(
                        `triplet-${beat}-${partial}`,
                        beat + (partial / 3),
                        'click',
                        partial === 0 ? (beat === 0 ? 1 : 0.8) : 0.46,
                        partial,
                    ));
                }
            }
            break;
        case 'shuffle':
            for (let beat = 0; beat < 4; beat += 1) {
                events.push(event(`shuffle-main-${beat}`, beat, 'hat', beat === 0 ? 0.9 : 0.72, 0));
                events.push(event(`shuffle-third-${beat}`, beat + (2 / 3), 'hat', 0.46, 2));
            }
            events.push(event('shuffle-kick-1', 0, 'kick', 0.8));
            events.push(event('shuffle-kick-3', 2, 'kick', 0.66));
            events.push(event('shuffle-snare-2', 1, 'snare', 0.88));
            events.push(event('shuffle-snare-4', 3, 'snare', 0.92));
            break;
        case 'shuffle-bass': {
            const notes = [10, 11, 10, 12, 10, 11, 10, 12];
            for (let beat = 0; beat < 4; beat += 1) {
                events.push(event(`shuffle-bass-${beat}-0`, beat, 'bass', beat === 0 ? 1 : 0.82, notes[beat * 2]));
                events.push(event(`shuffle-bass-${beat}-2`, beat + (2 / 3), 'bass', 0.68, notes[beat * 2 + 1]));
            }
            break;
        }
        case 'boogie-piano':
            for (let beat = 0; beat < 4; beat += 1) {
                events.push(event(`boogie-${beat}-0`, beat, 'boogie', beat === 0 ? 1 : 0.84, beat % 2));
                events.push(event(`boogie-${beat}-2`, beat + (2 / 3), 'boogie', 0.72, (beat % 2) + 2));
            }
            break;
        case 'blues-guitar':
            for (let beat = 0; beat < 4; beat += 1) {
                events.push(event(`blues-guitar-${beat}-0`, beat, 'guitar', beat === 0 ? 0.9 : 0.76, 10));
                events.push(event(`blues-guitar-${beat}-2`, beat + (2 / 3), 'guitar', 0.62, 11));
            }
            break;
        case 'slow-blues':
            for (let beat = 0; beat < 4; beat += 1) {
                for (let partial = 0; partial < 3; partial += 1) {
                    events.push(event(
                        `slow-blues-hat-${beat}-${partial}`,
                        beat + (partial / 3),
                        'hat',
                        partial === 0 ? (beat === 0 ? 0.9 : 0.7) : 0.38,
                        partial,
                    ));
                }
            }
            events.push(event('slow-blues-kick-1', 0, 'kick', 0.72));
            events.push(event('slow-blues-kick-3', 2, 'kick', 0.54));
            events.push(event('slow-blues-snare-2', 1, 'snare', 0.82));
            events.push(event('slow-blues-snare-4', 3, 'snare', 0.88));
            break;
        case 'funk-drums':
            for (let partial = 0; partial < 16; partial += 1) {
                events.push(event(`funk-hat-${partial}`, partial / 4, 'hat', partial % 4 === 0 ? 0.62 : 0.32, partial % 4));
            }
            [0, 0.75, 2, 2.5, 3.75].forEach((position, index) => {
                events.push(event(`funk-kick-${index}`, position, 'kick', index === 0 ? 1 : 0.66));
            });
            [1, 3].forEach((position, index) => events.push(event(`funk-snare-${index}`, position, 'snare', 0.9)));
            [1.75, 3.5].forEach((position, index) => events.push(event(`funk-ghost-${index}`, position, 'snare', 0.25, 1)));
            break;
        case 'funk-bass':
            [0, 0.75, 1.5, 2.25, 2.75, 3.5].forEach((position, index) => {
                events.push(event(`funk-bass-${index}`, position, 'bass', index === 0 ? 1 : 0.66, 20 + (index % 4)));
            });
            break;
        case 'funk-guitar':
            for (let partial = 0; partial < 16; partial += 1) {
                const accented = [2, 7, 10, 15].includes(partial);
                events.push(event(`funk-guitar-${partial}`, partial / 4, 'guitar', accented ? 0.74 : 0.28, 20 + (accented ? 1 : 0)));
            }
            break;
        case 'funk-clav':
            [0.25, 0.75, 1.5, 2.25, 2.75, 3.5].forEach((position, index) => {
                events.push(event(`funk-clav-${index}`, position, 'clav', index % 2 === 0 ? 0.72 : 0.58, index % 3));
            });
            break;
        case 'bossa-guitar':
            [0, 1, 2, 3].forEach((position, index) => {
                events.push(event(`bossa-thumb-${index}`, position, 'bossa-guitar', index === 0 ? 0.9 : 0.7, index % 2));
            });
            [0, 0.75, 1.5, 2.5, 3.25, 3.75].forEach((position, index) => {
                events.push(event(`bossa-chord-${index}`, position, 'bossa-guitar', index === 0 ? 0.7 : 0.56, 10 + (index % 2)));
            });
            break;
        case 'bossa-bass':
            [0, 1, 2, 3].forEach((position, index) => {
                events.push(event(`bossa-bass-${index}`, position, 'bass', index === 0 ? 0.88 : 0.68, 30 + (index % 2)));
            });
            break;
        case 'samba-surdo':
            [0, 1, 2, 3].forEach((position, index) => {
                events.push(event(`surdo-${index}`, position, 'surdo', index % 2 === 1 ? 0.96 : 0.62, index % 2));
            });
            break;
        case 'samba-pandeiro':
            for (let beat = 0; beat < 4; beat += 1) {
                getSambaSubdivisionOffsets().forEach((offset, withinBeat) => {
                    const partial = beat * 4 + withinBeat;
                    events.push(event(`pandeiro-${partial}`, beat + offset, 'pandeiro', [0.64, 0.34, 0.48, 0.72][withinBeat], withinBeat));
                });
            }
            break;
        case 'son-clave-32':
            [0, 1.5, 3, 5, 6].forEach((position, index) => {
                events.push(event(`clave-32-${index}`, position, 'clave', index < 3 ? 0.9 : 0.72, index));
            });
            break;
        case 'son-clave-23':
            [1, 2, 4, 5.5, 7].forEach((position, index) => {
                events.push(event(`clave-23-${index}`, position, 'clave', index < 2 ? 0.72 : 0.9, index));
            });
            break;
        case 'tumbao-bass':
            [1.5, 3].forEach((position, index) => {
                events.push(event(
                    `tumbao-bass-${index}`,
                    position,
                    'bass',
                    index === 1 ? 0.9 : 0.72,
                    40 + index,
                    index === 1 ? 60 / Math.max(1, bpm) : undefined,
                ));
            });
            break;
        case 'conga-tumbao':
            [0, 1, 2, 1, 0, 1, 3, 3].forEach((tone, partial) => {
                events.push(event(`conga-${partial}`, partial / 2, 'conga', tone === 3 ? 0.9 : tone === 2 ? 0.68 : 0.32, tone));
            });
            break;
        case 'rock-drums':
            for (let partial = 0; partial < 8; partial += 1) {
                events.push(event(`rock-hat-${partial}`, partial / 2, 'hat', partial % 2 === 0 ? 0.62 : 0.42, partial % 2));
            }
            [0, 2].forEach((position, index) => events.push(event(`rock-kick-${index}`, position, 'kick', index === 0 ? 0.9 : 0.74)));
            [1, 3].forEach((position, index) => events.push(event(`rock-snare-${index}`, position, 'snare', 0.94)));
            break;
        case 'rock-bass':
            for (let partial = 0; partial < 8; partial += 1) {
                events.push(event(`rock-bass-${partial}`, partial / 2, 'bass', partial === 0 ? 0.92 : 0.66, 50 + (partial % 2)));
            }
            break;
        case 'rock-guitar':
            [0, 1, 2, 3].forEach((position, index) => {
                events.push(event(`rock-guitar-${index}`, position, 'guitar', index === 0 ? 0.88 : 0.72, 30 + (index % 2)));
            });
            break;
        case 'pop-syncopation':
            [0, 0.5, 1.5, 2, 2.75, 3.5].forEach((position, index) => {
                events.push(event(`pop-sync-${index}`, position, 'piano', index === 0 ? 0.86 : 0.66, index % 2));
            });
            break;
        case 'blue-note-bend':
            [
                [0, 0],
                [offbeat, 1],
                [1, 2],
                [1 + offbeat, 3],
                [2, 4],
                [2 + offbeat, 1],
                [3, 0],
            ].forEach(([position, variant], index) => {
                events.push(event(`blue-note-${index}`, position, 'blue-note', index === 0 ? 0.9 : 0.7, variant));
            });
            break;
        case 'blue-note-piano':
            [
                [0, 0],
                [offbeat, 1],
                [1, 2],
                [1 + offbeat, 3],
                [2, 4],
                [2 + offbeat, 5],
                [3, 6],
            ].forEach(([position, variant], index) => {
                events.push(event(`blue-piano-${index}`, position, 'blue-piano', index === 0 ? 0.9 : 0.7, variant));
            });
            break;
    }

    return events.sort((left, right) => left.position - right.position || left.id.localeCompare(right.id));
};

export const getFeelLabel = (feel: GrooveFeel) => {
    if (feel === 'adaptive') return '라이드 스윙';
    if (feel === 'triplet') return '2:1 3연';
    return '스트레이트';
};
