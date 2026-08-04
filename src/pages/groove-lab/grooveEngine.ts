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
    | 'blue-note-bend'
    | 'blue-note-piano';
export type GrooveFeel = 'adaptive' | 'triplet' | 'straight';
export type GrooveFamilyId = 'swing' | 'shuffle' | 'compound' | 'blue-note';
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
    | 'blue-piano';

export interface GrooveEvent {
    id: string;
    position: number;
    voice: GrooveVoice;
    gain: number;
    variant?: number;
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
    evidenceIds: readonly string[];
}

export const GROOVE_FAMILIES: readonly { id: GrooveFamilyId; label: string; description: string }[] = [
    { id: 'swing', label: '재즈 스윙', description: '템포에 따라 달라지는 롱–숏과 리듬 섹션 역할' },
    { id: 'shuffle', label: '셔플·부기', description: '셋잇단 첫째·셋째 칸을 중심으로 한 블루스 계열' },
    { id: 'compound', label: '3연·12/8', description: '세 칸을 모두 느끼는 균등 셋잇단·컴파운드 미터' },
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
        recommendedFeel: 'adaptive',
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
        explanation: '짧고 가벼운 코드를 매 박에 한 번씩 연주하는 빅밴드 리듬 기타의 기본형입니다.',
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
        evidenceIds: ['shuffle-definition', 'boogie-riff'],
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
        evidenceIds: ['shuffle-definition', 'boogie-riff'],
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
        id: 'blue-note-bend',
        family: 'blue-note',
        instrument: '보컬·관악·기타',
        name: '가변 음높이 Blue Note',
        shortName: 'Blue Bend',
        icon: 'ri-sound-module-line',
        color: '#818cf8',
        pattern: '1 · ♭3↗3 · 4 · ♭5↘4 · 1',
        explanation: '3·5·7도 주변을 고정 반음이 아니라 연속적으로 굴절하는 표현입니다. 실제 보컬·관악·벤딩 가능한 기타의 성격을 단순화했습니다.',
        recommendedFeel: 'adaptive',
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
        recommendedFeel: 'adaptive',
        evidenceIds: ['blue-note-grove', 'blue-note-piano'],
    },
] as const;

export const getGroovePreset = (id: GroovePresetId): GroovePreset => (
    GROOVE_PRESETS.find((preset) => preset.id === id) ?? GROOVE_PRESETS[0]
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

const event = (
    id: string,
    position: number,
    voice: GrooveVoice,
    gain: number,
    variant?: number,
): GrooveEvent => ({ id, position, voice, gain, variant });

export const buildGrooveBar = (
    presetId: GroovePresetId,
    feel: GrooveFeel,
    bpm: number,
): GrooveEvent[] => {
    const preset = getGroovePreset(presetId);
    const ratio = getSwingRatio(preset.fixedTripletGrid ? 'triplet' : feel, bpm);
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
    if (feel === 'adaptive') return '실연 스윙';
    if (feel === 'triplet') return '2:1 3연';
    return '스트레이트';
};
