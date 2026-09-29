import type { GrooveEvent } from '../groove-lab/grooveEngine';

export type StemId = 'drums' | 'bass' | 'piano' | 'guitar';

export interface StemDefinition {
    id: StemId;
    label: string;
    role: string;
    description: string;
    icon: string;
    color: string;
    defaultVolume: number;
    events: readonly GrooveEvent[];
}

export interface StemMixState {
    enabled: boolean;
    volume: number;
}

export const STEM_DEMO_BPM = 128;
export const STEM_DEMO_BEATS = 16;
export const STEM_DEMO_SECONDS = (STEM_DEMO_BEATS * 60) / STEM_DEMO_BPM;

const buildDrumEvents = (): GrooveEvent[] => {
    const events: GrooveEvent[] = [];
    for (let beat = 0; beat < STEM_DEMO_BEATS; beat += 1) {
        const beatInBar = beat % 4;
        events.push({
            id: `stem-drums-ride-${beat}`,
            position: beat,
            voice: 'ride',
            gain: beatInBar === 0 ? 0.78 : 0.63,
            variant: 0,
        });
        if (beatInBar === 1 || beatInBar === 3) {
            events.push({
                id: `stem-drums-skip-${beat}`,
                position: beat + (2 / 3),
                voice: 'ride',
                gain: 0.48,
                variant: 4,
            });
            events.push({
                id: `stem-drums-hat-${beat}`,
                position: beat,
                voice: 'hat',
                gain: 0.72,
                variant: 3,
            });
        }
        if (beatInBar === 0 || beatInBar === 2) {
            events.push({
                id: `stem-drums-kick-${beat}`,
                position: beat,
                voice: 'kick',
                gain: beatInBar === 0 ? 0.42 : 0.28,
            });
        }
    }
    return events;
};

const BASS_WALK = [0, 1, 2, 3, 2, 1, 0, 3, 0, 2, 3, 1, 2, 1, 3, 0] as const;

const buildBassEvents = (): GrooveEvent[] => BASS_WALK.map((variant, beat) => ({
    id: `stem-bass-${beat}`,
    position: beat,
    voice: 'bass',
    gain: beat % 4 === 0 ? 0.9 : 0.76,
    variant,
    durationSeconds: 0.41,
}));

const buildPianoEvents = (): GrooveEvent[] => [
    [0, 0], [1 + (2 / 3), 1],
    [4, 1], [5 + (2 / 3), 0],
    [8, 0], [9 + (2 / 3), 1], [11 + (2 / 3), 0],
    [12, 1], [13 + (2 / 3), 0],
].map(([position, variant], index) => ({
    id: `stem-piano-${index}`,
    position,
    voice: 'piano' as const,
    gain: position % 4 === 0 ? 0.78 : 0.65,
    variant,
}));

const buildGuitarEvents = (): GrooveEvent[] => [
    [0 + (2 / 3), 0], [2, 1], [3 + (2 / 3), 2],
    [4 + (2 / 3), 3], [6, 4], [7 + (2 / 3), 2],
    [8 + (2 / 3), 1], [10, 3], [11 + (2 / 3), 4],
    [12 + (2 / 3), 2], [14, 1], [15, 0],
].map(([position, variant], index) => ({
    id: `stem-guitar-${index}`,
    position,
    voice: 'blue-note' as const,
    gain: 0.7,
    variant,
    durationSeconds: 0.34,
}));

export const STEM_DEFINITIONS: readonly StemDefinition[] = [
    {
        id: 'drums',
        label: '드럼',
        role: 'DRUMS',
        description: '라이드 · 하이햇 · 킥',
        icon: 'ri-disc-line',
        color: '#f59e0b',
        defaultVolume: 78,
        events: buildDrumEvents(),
    },
    {
        id: 'bass',
        label: '콘트라베이스',
        role: 'BASS',
        description: '피치카토 워킹 베이스',
        icon: 'ri-music-2-line',
        color: '#38bdf8',
        defaultVolume: 84,
        events: buildBassEvents(),
    },
    {
        id: 'piano',
        label: '피아노',
        role: 'OTHER · PIANO',
        description: '짧은 스윙 컴핑',
        icon: 'ri-keyboard-box-line',
        color: '#c084fc',
        defaultVolume: 66,
        events: buildPianoEvents(),
    },
    {
        id: 'guitar',
        label: '멜로디 기타',
        role: 'OTHER · LEAD',
        description: '반주가 아닌 단선율 예시',
        icon: 'ri-guitar-line',
        color: '#4ade80',
        defaultVolume: 62,
        events: buildGuitarEvents(),
    },
] as const;

export const createInitialStemMix = (): Record<StemId, StemMixState> => STEM_DEFINITIONS.reduce(
    (mix, stem) => ({
        ...mix,
        [stem.id]: { enabled: true, volume: stem.defaultVolume },
    }),
    {} as Record<StemId, StemMixState>,
);

export const getStemGain = (
    stemId: StemId,
    mix: Record<StemId, StemMixState>,
    soloStemId: StemId | null,
): number => {
    const stem = mix[stemId];
    if (!stem.enabled) return 0;
    if (soloStemId !== null && soloStemId !== stemId) return 0;
    return Math.min(1, Math.max(0, stem.volume / 100));
};

export const getLoopPositionSeconds = (
    audioTime: number,
    playbackAnchor: number,
    loopSeconds = STEM_DEMO_SECONDS,
): number => {
    if (audioTime <= playbackAnchor) return 0;
    const elapsed = audioTime - playbackAnchor;
    return ((elapsed % loopSeconds) + loopSeconds) % loopSeconds;
};

export const formatStemTime = (seconds: number): string => {
    const safeSeconds = Math.max(0, Math.floor(seconds));
    return `${Math.floor(safeSeconds / 60)}:${String(safeSeconds % 60).padStart(2, '0')}`;
};
