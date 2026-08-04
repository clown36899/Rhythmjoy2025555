import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './groove-lab.css';
import {
    buildGrooveBar,
    getFeelLabel,
    getGroovePreset,
    getSwingRatio,
    GROOVE_FAMILIES,
    GROOVE_PRESETS,
    type GrooveEvent,
    type GrooveFamilyId,
    type GrooveFeel,
    type GroovePresetId,
} from './grooveEngine';

const MIN_BPM = 50;
const MAX_BPM = 260;
const LOOK_AHEAD_SECONDS = 0.14;
const SCHEDULER_INTERVAL_MS = 25;

const clampBpm = (value: number) => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, value)));

type QueuedVisualEvent = { id: string; time: number };

const EVIDENCE = {
    friberg: {
        title: 'Friberg & Sundström (2002)',
        summary: '라이드의 스윙 비율은 템포에 따라 대략 선형으로 감소하며, 느린 템포에서는 3–3.5:1, 약 200 BPM에서 2:1, 매우 빠른 템포에서는 1:1에 접근했습니다.',
        href: 'https://doi.org/10.1525/mp.2002.19.3.333',
    },
    butterfield: {
        title: 'Butterfield (2010), Music Theory Online',
        summary: '표준 라이드 패턴은 네 박의 라이드, 2·4박 하이햇, 그리고 2·4박 뒤의 짧은 라이드 탭으로 분석됩니다.',
        href: 'https://mtosmt.org/issues/mto.10.16.4/mto.10.16.4.butterfield.pdf',
    },
    columbia: {
        title: 'Columbia Center for Jazz Studies',
        summary: '워킹은 특히 베이스가 화음을 따라 한 마디에 강한 네 박을 만드는 연주 방식으로 정의됩니다.',
        href: 'https://ccnmtl.columbia.edu/projects/jazzglossary/w/walk_or_walking.html',
    },
    comping: {
        title: 'An Approach to Comping: The Essentials',
        summary: 'Charleston 리듬은 다운비트와 업비트를 번갈아 놓는 재즈 컴핑의 기본 어휘로 제시됩니다.',
        href: 'https://www.jazzbooks.com/mm5/samples/D-AATC.pdf',
    },
    freddie: {
        title: 'Freddie Green: Birth of a Style',
        summary: 'Freddie Green 스타일은 작은 코드를 한 마디에 네 번 스트럼하는 four-to-the-bar 방식으로 설명됩니다.',
        href: 'https://freddiegreen.com/technique/ness.html',
    },
    musicxml: {
        title: 'W3C MusicXML 4.0 swing 표준',
        summary: '스윙 재생은 두 연속 음의 first:second 비율로 표현하며, 2:1은 4분음표–8분음표 셋잇단음 재생을 뜻합니다.',
        href: 'https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/swing/',
    },
    'triplet-definition': {
        title: '셋잇단음·셔플 구분',
        summary: '셋잇단음은 한 박을 같은 세 값으로 나눕니다. 이 실험실의 셔플은 그 격자의 첫째·셋째만 내고 가운데는 쉼으로 처리합니다.',
        href: 'https://www.w3.org/2021/06/musicxml40/musicxml-reference/elements/swing/',
    },
    'shuffle-definition': {
        title: 'Alfred Music, Shuffle Rhythm',
        summary: '셔플은 8분음표 셋잇단음의 첫 음과 마지막 음을 사용하는 패턴으로 설명됩니다. 가운데 칸은 쉬는 것이 핵심입니다.',
        href: 'https://content.alfred.com/catpages/00-UBSBK103R.pdf',
    },
    'boogie-study': {
        title: 'The Twentieth Century Jazz Piano Trio',
        summary: '부기우기는 왼손 오스티나토가 4/4 한 마디의 여덟 하위 박을 지속하는 eight-to-the-bar 어법으로 기술됩니다.',
        href: 'https://files.core.ac.uk/download/62475602.pdf',
    },
    'boogie-riff': {
        title: 'Boogie Shuffle 5도–6도 패턴',
        summary: '대표적인 기타 부기 셔플은 근음을 유지하며 5도와 6도를 교대합니다. 같은 골격이 베이스형 리프에도 쓰입니다.',
        href: 'https://www.guitarworld.com/lessons/artist-lessons/jim-oblon-inverted-boogie-riffing',
    },
    'slow-blues': {
        title: 'Slow Blues 12/8 연주 분석',
        summary: '12/8 슬로 블루스는 네 개의 큰 박 각각에 세 하위 박이 있으며, 드럼 하이햇이 그 세 칸을 모두 드러낼 수 있습니다.',
        href: 'https://www.guitarworld.com/lessons/techniques/if-you-learn-one-thing-from-buddy-guy-it-should-be-this',
    },
    'funk-microtiming': {
        title: 'Microtiming in Early Funk (peer-reviewed)',
        summary: '초기 펑크 분석은 16분음표 밀도, 싱코페이션, 대체 펄스와 곡별 미세타이밍을 핵심 특징으로 확인합니다.',
        href: 'https://www.gmth.de/zeitschrift/artikel/1224.aspx',
    },
    'funk-one': {
        title: 'James Brown rhythm-section analysis',
        summary: 'James Brown식 펑크에서는 매 마디 첫 다운비트인 “the one”을 베이스와 리듬 섹션이 강하게 공유하는 원리가 강조됩니다.',
        href: 'https://files.core.ac.uk/download/346448664.pdf',
    },
    'funk-syncopation': {
        title: 'Music Perception — Syncopation and Groove',
        summary: '16분음표 층의 싱코페이션과 악기 사이 교차 리듬은 펑크·R&B·살사 등 높은 그루브 유발 음악에서 반복적으로 나타납니다.',
        href: 'https://online.ucpress.edu/mp/article/39/5/503/182325/Syncopation-and-Groove-in-Polyphonic-MusicPatterns',
    },
    'berklee-rock-funk': {
        title: 'Berklee — Funk and Rock Drum Rhythms',
        summary: '같은 백비트에서도 드라이빙 8분 베이스는 록, 가볍고 싱코페이트된 16분 층은 펑크 성격을 만든다고 구분합니다.',
        href: 'https://online.berklee.edu/takenote/basic-funk-for-drums/',
    },
    'bossa-pattern-study': {
        title: 'ISMIR — Bossa Nova guitar pattern extraction',
        summary: 'MIDI 기타 실연에서 보사노바 반주 패턴을 추출해 연주자별 반복 어휘와 변형을 분석한 연구입니다.',
        href: 'https://ismir2008.ismir.net/papers/ISMIR2008_238.pdf',
    },
    'bossa-accompaniment': {
        title: 'SBCM — Generating Bossa Nova guitar accompaniment',
        summary: 'João Gilberto 계열 반주를 엄지 베이스와 손가락 코드 블록의 두 사건으로 구분하고, 2마디 패턴과 선행 싱코페이션을 핵심으로 설명합니다.',
        href: 'https://compmus.ime.usp.br/sbcm/2003/researchpapers/sbcm-researchpaper-2003-9.pdf',
    },
    'samba-microtiming': {
        title: 'Rhythmical structures in samba performance',
        summary: '삼바 타악 실연은 16분음표를 단순 균등 분할하지 않고 중–짧–중–긴에 가까운 체계적 길이·강세 구조를 보입니다.',
        href: 'https://www.researchgate.net/publication/268219833_Rhythmical_structures_in_music_and_body_movement_in_samba_performance',
    },
    'samba-tempo-study': {
        title: 'Journal of New Music Research — Samba tempo study',
        summary: '판데이루 실연 분석은 템포에 따라 16분 하위 음가의 상대 길이가 달라짐을 조사해 고정 격자만으로 실연을 단정할 수 없음을 보여줍니다.',
        href: 'https://www.tandfonline.com/doi/abs/10.1080/09298215.2020.1767655',
    },
    'clave-analysis': {
        title: 'ISMIR — Rotation-aware Afro-Cuban clave analysis',
        summary: '아프로쿠반 리듬의 핵심 타임라인을 son clave와 rumba clave로 구분하고 회전·방향성을 분석합니다.',
        href: 'https://web.uvic.ca/~aschloss/publications/ISMIR08_Analyzing%20Afro-Cuban%20Rhythm.pdf',
    },
    'clave-grammar': {
        title: 'Current Musicology — Afro-Latin temporal grammar',
        summary: '클라베는 단독 타악 패턴을 넘어 베이스·콩가·기타 등 다른 악기의 프레이즈를 조직하는 시간적 기준으로 설명됩니다.',
        href: 'https://journals.library.columbia.edu/index.php/currentmusicology/article/view/5234',
    },
    'pop-syncopation-study': {
        title: 'Open Music Theory — Pop/Rock Syncopation',
        summary: '팝·록에서는 연속된 음을 약한 8분·16분 위치로 앞당기는 anticipation이 대표적인 싱코페이션 어휘로 제시됩니다.',
        href: 'https://openmusictheory.github.io/syncopation.html',
    },
    'blue-note-grove': {
        title: 'Grove Music, Blue note (Kubik)',
        summary: '블루 노트는 서양 온음계에서 벗어나는 음높이 값이며, 3·7도와 때로 5도를 낮추되 미분음적으로 흔들리는 현상으로 설명됩니다.',
        href: 'https://doi.org/10.1093/gmo/9781561592630.article.A2234425',
    },
    'blue-note-research': {
        title: 'Eastman School of Music, Blue-note research',
        summary: '실제 보컬 분석에서는 장3도와 단3도 사이 같은 연속적인 피치 영역이 관찰됩니다. 따라서 단순한 고정 ♭3 하나와 같지 않습니다.',
        href: 'https://www.esm.rochester.edu/news/2017/04/unlocking-the-secrets-of-blue-notes/',
    },
    'blue-note-piano': {
        title: 'Jazz: The Basics — 악기별 한계',
        summary: '블루 노트는 흔히 움직이는 음높이라 고정 건반의 피아노가 그대로 낼 수 없습니다. 피아노 프리셋은 인접 건반 병치라는 근사임을 명시합니다.',
        href: 'https://api.pageplace.de/preview/DT0400.9781135887131_A24421853/preview-9781135887131_A24421853.pdf',
    },
} as const;

const makeNoiseBuffer = (context: AudioContext, duration: number) => {
    const length = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const channel = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) {
        channel[index] = (Math.random() * 2 - 1) * (1 - index / length);
    }
    return buffer;
};

const scheduleOscillator = (
    context: AudioContext,
    time: number,
    destination: AudioNode,
    options: {
        frequency: number;
        endFrequency?: number;
        gain: number;
        duration: number;
        type?: OscillatorType;
        attack?: number;
    },
) => {
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    const attack = Math.min(options.attack ?? 0.003, options.duration / 2);
    oscillator.type = options.type ?? 'triangle';
    oscillator.frequency.setValueAtTime(options.frequency, time);
    if (options.endFrequency) {
        oscillator.frequency.exponentialRampToValueAtTime(options.endFrequency, time + options.duration);
    }
    envelope.gain.setValueAtTime(0.0001, time);
    envelope.gain.exponentialRampToValueAtTime(Math.max(0.0002, options.gain), time + attack);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + options.duration);
    oscillator.connect(envelope);
    envelope.connect(destination);
    oscillator.start(time);
    oscillator.stop(time + options.duration + 0.025);
};

const scheduleNoise = (
    context: AudioContext,
    time: number,
    destination: AudioNode,
    options: { frequency: number; gain: number; duration: number; type?: BiquadFilterType; q?: number },
) => {
    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const envelope = context.createGain();
    source.buffer = makeNoiseBuffer(context, options.duration);
    filter.type = options.type ?? 'highpass';
    filter.frequency.setValueAtTime(options.frequency, time);
    filter.Q.setValueAtTime(options.q ?? 0.8, time);
    envelope.gain.setValueAtTime(Math.max(0.0002, options.gain), time);
    envelope.gain.exponentialRampToValueAtTime(0.0001, time + options.duration);
    source.connect(filter);
    filter.connect(envelope);
    envelope.connect(destination);
    source.start(time);
    source.stop(time + options.duration + 0.02);
};

const scheduleGrooveVoice = (
    context: AudioContext,
    time: number,
    event: GrooveEvent,
    masterVolume: number,
    destination: AudioNode,
) => {
    const master = context.createGain();
    const level = Math.max(0, Math.min(1, masterVolume / 100));
    master.gain.setValueAtTime(level * event.gain, time);
    master.connect(destination);

    switch (event.voice) {
        case 'ride':
            scheduleNoise(context, time, master, { frequency: 4100, gain: 0.19, duration: 0.18, type: 'highpass' });
            scheduleOscillator(context, time, master, { frequency: event.variant === 4 ? 760 : 610, gain: 0.035, duration: 0.11, type: 'triangle' });
            break;
        case 'hat':
            scheduleNoise(context, time, master, { frequency: 6800, gain: 0.22, duration: 0.052, type: 'highpass' });
            break;
        case 'snare':
            scheduleNoise(context, time, master, { frequency: 1550, gain: 0.29, duration: 0.095, type: 'bandpass', q: 0.7 });
            scheduleOscillator(context, time, master, { frequency: 185, endFrequency: 125, gain: 0.08, duration: 0.065, type: 'triangle' });
            break;
        case 'kick':
            scheduleOscillator(context, time, master, { frequency: 118, endFrequency: 48, gain: 0.45, duration: 0.12, type: 'sine' });
            break;
        case 'bass': {
            const walkingBassFrequencies = [82.41, 98, 110, 123.47];
            const shuffleBassFrequencies = [65.41, 98, 110];
            const extendedBassFrequencies = [65.41, 73.42, 82.41, 98, 110, 123.47];
            const variant = event.variant ?? 0;
            const frequency = variant >= 20
                ? extendedBassFrequencies[variant % extendedBassFrequencies.length]
                : variant >= 10
                    ? shuffleBassFrequencies[variant - 10] ?? shuffleBassFrequencies[0]
                    : walkingBassFrequencies[variant] ?? walkingBassFrequencies[0];
            const duration = variant >= 20 && variant < 30 ? 0.105 : 0.2;
            scheduleOscillator(context, time, master, { frequency, endFrequency: frequency * 0.985, gain: 0.28, duration, type: 'triangle', attack: 0.008 });
            scheduleOscillator(context, time, master, { frequency: frequency * 2, gain: 0.055, duration: 0.075, type: 'sine' });
            break;
        }
        case 'piano': {
            const chord = event.variant === 1 ? [196, 246.94, 293.66] : [174.61, 220, 261.63];
            chord.forEach((frequency, index) => {
                scheduleOscillator(context, time, master, { frequency, gain: 0.075 - index * 0.008, duration: 0.18, type: 'triangle', attack: 0.004 });
            });
            break;
        }
        case 'guitar': {
            const roots = [146.83, 164.81, 174.61, 130.81];
            const variant = event.variant ?? 0;
            const isFunk = variant >= 20 && variant < 30;
            const isRock = variant >= 30;
            const isBluesShuffle = variant >= 10 && variant < 20;
            const root = isBluesShuffle ? 110 : isFunk ? 146.83 : isRock ? 98 : roots[variant] ?? roots[0];
            const chordMultiples = isBluesShuffle
                ? [1, 1.5, event.variant === 11 ? (5 / 3) : 2]
                : isFunk
                    ? [1, 1.25, 1.5]
                    : isRock
                        ? [1, 1.5, 2]
                : [1, 1.25, 1.5];
            chordMultiples.forEach((multiple, index) => {
                scheduleOscillator(context, time + index * 0.004, master, { frequency: root * multiple, gain: isFunk ? 0.035 : 0.06, duration: isFunk ? 0.042 : isRock ? 0.12 : 0.085, type: 'sawtooth', attack: 0.002 });
            });
            scheduleNoise(context, time, master, { frequency: isFunk ? 2600 : 1800, gain: isFunk ? 0.07 : 0.045, duration: isFunk ? 0.032 : 0.045, type: 'bandpass', q: 1.3 });
            break;
        }
        case 'boogie': {
            const boogieFrequencies = [65.41, 98, 110, 116.54];
            const frequency = boogieFrequencies[event.variant ?? 0] ?? boogieFrequencies[0];
            scheduleOscillator(context, time, master, { frequency, endFrequency: frequency * 0.99, gain: 0.24, duration: 0.13, type: 'triangle', attack: 0.004 });
            scheduleOscillator(context, time, master, { frequency: frequency * 2, gain: 0.07, duration: 0.075, type: 'sine' });
            break;
        }
        case 'blue-note': {
            const bends = [
                [261.63, 261.63],
                [311.13, 320],
                [349.23, 349.23],
                [369.99, 349.23],
                [392, 392],
            ];
            const [frequency, endFrequency] = bends[event.variant ?? 0] ?? bends[0];
            scheduleOscillator(context, time, master, { frequency, endFrequency, gain: 0.14, duration: 0.25, type: 'sawtooth', attack: 0.018 });
            scheduleOscillator(context, time, master, { frequency: frequency / 2, endFrequency: endFrequency / 2, gain: 0.055, duration: 0.25, type: 'triangle', attack: 0.018 });
            break;
        }
        case 'blue-piano': {
            const pianoBluesFrequencies = [261.63, 311.13, 329.63, 349.23, 369.99, 392, 466.16];
            const frequency = pianoBluesFrequencies[event.variant ?? 0] ?? pianoBluesFrequencies[0];
            scheduleOscillator(context, time, master, { frequency, gain: 0.14, duration: 0.17, type: 'triangle', attack: 0.003 });
            scheduleOscillator(context, time, master, { frequency: frequency * 2, gain: 0.035, duration: 0.09, type: 'sine' });
            break;
        }
        case 'clav': {
            const roots = [146.83, 174.61, 196];
            const root = roots[event.variant ?? 0] ?? roots[0];
            [1, 1.25, 1.5].forEach((multiple, index) => {
                scheduleOscillator(context, time + index * 0.002, master, { frequency: root * multiple, endFrequency: root * multiple * 0.985, gain: 0.07, duration: 0.075, type: 'square', attack: 0.002 });
            });
            break;
        }
        case 'bossa-guitar': {
            const variant = event.variant ?? 0;
            if (variant < 10) {
                const frequency = variant === 0 ? 82.41 : 123.47;
                scheduleOscillator(context, time, master, { frequency, endFrequency: frequency * 0.99, gain: 0.2, duration: 0.24, type: 'triangle', attack: 0.008 });
            } else {
                const chord = variant === 10 ? [196, 246.94, 329.63] : [174.61, 220, 293.66];
                chord.forEach((frequency, index) => scheduleOscillator(context, time + index * 0.005, master, { frequency, gain: 0.055, duration: 0.19, type: 'triangle', attack: 0.004 }));
            }
            break;
        }
        case 'surdo':
            scheduleOscillator(context, time, master, { frequency: event.variant === 1 ? 82 : 68, endFrequency: event.variant === 1 ? 48 : 43, gain: event.variant === 1 ? 0.52 : 0.34, duration: 0.2, type: 'sine', attack: 0.004 });
            break;
        case 'pandeiro':
            scheduleNoise(context, time, master, { frequency: event.variant === 3 ? 4300 : 6200, gain: event.variant === 3 ? 0.2 : 0.12, duration: event.variant === 3 ? 0.08 : 0.04, type: 'bandpass', q: 0.9 });
            if (event.variant === 0 || event.variant === 3) {
                scheduleOscillator(context, time, master, { frequency: event.variant === 0 ? 170 : 220, endFrequency: 120, gain: 0.1, duration: 0.06, type: 'triangle' });
            }
            break;
        case 'clave':
            scheduleOscillator(context, time, master, { frequency: 1850, endFrequency: 1320, gain: 0.16, duration: 0.045, type: 'square', attack: 0.001 });
            scheduleOscillator(context, time, master, { frequency: 2440, gain: 0.055, duration: 0.028, type: 'sine', attack: 0.001 });
            break;
        case 'conga': {
            const openTone = event.variant === 1;
            scheduleOscillator(context, time, master, { frequency: openTone ? 230 : 175, endFrequency: openTone ? 180 : 130, gain: openTone ? 0.3 : 0.17, duration: openTone ? 0.16 : 0.075, type: 'triangle', attack: 0.003 });
            scheduleNoise(context, time, master, { frequency: openTone ? 1400 : 920, gain: 0.055, duration: 0.035, type: 'bandpass', q: 1.1 });
            break;
        }
        case 'click':
            scheduleOscillator(context, time, master, { frequency: event.variant === 0 ? 1120 : 780, endFrequency: 610, gain: 0.18, duration: 0.035, type: 'square' });
            break;
    }
};

const GrooveLabPage: React.FC = () => {
    const [presetId, setPresetId] = useState<GroovePresetId>('ride');
    const [feel, setFeel] = useState<GrooveFeel>('adaptive');
    const [bpm, setBpm] = useState(140);
    const [volume, setVolume] = useState(72);
    const [isPlaying, setIsPlaying] = useState(false);
    const [activeEventId, setActiveEventId] = useState<string | null>(null);
    const [tapTimes, setTapTimes] = useState<number[]>([]);

    const audioContextRef = useRef<AudioContext | null>(null);
    const nextBarTimeRef = useRef(0);
    const queuedEventsRef = useRef<QueuedVisualEvent[]>([]);
    const volumeRef = useRef(volume);
    const tapResetTimerRef = useRef<number | null>(null);

    const preset = getGroovePreset(presetId);
    const effectiveFeel = preset.fixedTripletGrid ? 'triplet' : preset.timingLocked ? preset.recommendedFeel : feel;
    const swingRatio = getSwingRatio(effectiveFeel, bpm);
    const barEvents = useMemo(() => buildGrooveBar(presetId, feel, bpm), [bpm, feel, presetId]);
    const timelinePoints = useMemo(() => {
        const groups = new Map<string, GrooveEvent[]>();
        barEvents.forEach((item) => {
            const key = item.position.toFixed(4);
            groups.set(key, [...(groups.get(key) ?? []), item]);
        });
        return Array.from(groups.values());
    }, [barEvents]);
    const selectedEvidence = useMemo(() => (
        preset.evidenceIds.map((id) => EVIDENCE[id as keyof typeof EVIDENCE]).filter(Boolean)
    ), [preset.evidenceIds]);
    const familyPresets = useMemo(() => (
        GROOVE_PRESETS.filter((item) => item.family === preset.family)
    ), [preset.family]);

    useEffect(() => {
        volumeRef.current = volume;
    }, [volume]);

    const ensureAudioContext = useCallback(async () => {
        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return null;
            audioContextRef.current = new AudioContextClass();
        }
        if (audioContextRef.current.state === 'suspended') {
            await audioContextRef.current.resume();
        }
        return audioContextRef.current;
    }, []);

    const handlePlay = useCallback(async () => {
        if (isPlaying) {
            setIsPlaying(false);
            return;
        }
        const context = await ensureAudioContext();
        if (!context) return;
        nextBarTimeRef.current = context.currentTime + 0.07;
        queuedEventsRef.current = [];
        setIsPlaying(true);
    }, [ensureAudioContext, isPlaying]);

    useEffect(() => {
        if (!isPlaying) {
            queuedEventsRef.current = [];
            setActiveEventId(null);
            return undefined;
        }

        const context = audioContextRef.current;
        if (!context) return undefined;
        nextBarTimeRef.current = Math.max(context.currentTime + 0.07, nextBarTimeRef.current);
        let animationFrame = 0;
        const runOutput = context.createGain();
        runOutput.gain.setValueAtTime(1, context.currentTime);
        runOutput.connect(context.destination);

        const schedule = () => {
            while (nextBarTimeRef.current < context.currentTime + LOOK_AHEAD_SECONDS) {
                const secondsPerBeat = 60 / bpm;
                barEvents.forEach((item) => {
                    const eventTime = nextBarTimeRef.current + item.position * secondsPerBeat;
                    scheduleGrooveVoice(context, eventTime, item, volumeRef.current, runOutput);
                    queuedEventsRef.current.push({ id: item.id, time: eventTime });
                });
                nextBarTimeRef.current += secondsPerBeat * 4;
            }
        };

        const animate = () => {
            const now = context.currentTime;
            queuedEventsRef.current = queuedEventsRef.current.filter((item) => item.time > now - 0.08);
            const current = queuedEventsRef.current.find((item) => Math.abs(item.time - now) < 0.055);
            setActiveEventId(current?.id ?? null);
            animationFrame = window.requestAnimationFrame(animate);
        };

        schedule();
        const scheduler = window.setInterval(schedule, SCHEDULER_INTERVAL_MS);
        animationFrame = window.requestAnimationFrame(animate);

        return () => {
            window.clearInterval(scheduler);
            window.cancelAnimationFrame(animationFrame);
            queuedEventsRef.current = [];
            nextBarTimeRef.current = context.currentTime + 0.07;
            runOutput.gain.cancelScheduledValues(context.currentTime);
            runOutput.gain.setValueAtTime(0, context.currentTime);
            window.setTimeout(() => runOutput.disconnect(), 180);
        };
    }, [barEvents, bpm, isPlaying]);

    useEffect(() => () => {
        if (tapResetTimerRef.current !== null) window.clearTimeout(tapResetTimerRef.current);
        void audioContextRef.current?.close();
    }, []);

    const updateBpm = (next: number) => setBpm(clampBpm(next));

    const selectPreset = (nextPresetId: GroovePresetId) => {
        const nextPreset = getGroovePreset(nextPresetId);
        setPresetId(nextPresetId);
        setFeel(nextPreset.recommendedFeel);
    };

    const selectFamily = (familyId: GrooveFamilyId) => {
        const firstPreset = GROOVE_PRESETS.find((item) => item.family === familyId);
        if (firstPreset) selectPreset(firstPreset.id);
    };

    const handleTap = () => {
        const now = performance.now();
        const recent = tapTimes.filter((time) => now - time < 2400);
        const next = [...recent, now].slice(-6);
        setTapTimes(next);
        if (next.length >= 2) {
            const intervals = next.slice(1).map((time, index) => time - next[index]);
            const average = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
            updateBpm(60000 / average);
        }
        if (tapResetTimerRef.current !== null) window.clearTimeout(tapResetTimerRef.current);
        tapResetTimerRef.current = window.setTimeout(() => setTapTimes([]), 2500);
    };

    return (
        <main className="groove-lab-page" onDragStart={(event) => event.preventDefault()}>
            <div className="groove-lab-content">
                <section className="groove-lab-intro" aria-labelledby="groove-lab-title">
                    <div>
                        <span className="groove-lab-beta">개발중 · 8 RHYTHMS · {GROOVE_PRESETS.length} PRESETS</span>
                        <h1 id="groove-lab-title">악기별 리듬 그루브 랩</h1>
                        <p>박자만 세지 않고, 리듬 계열마다 악기가 맡는 위치·강세·음높이 표현을 반복합니다.</p>
                    </div>
                    <div className="groove-lab-ratio" aria-label={`현재 타이밍 비율 ${swingRatio} 대 1`}>
                        <span>TIME FEEL · 1 BAR LOOP</span>
                        <strong>{swingRatio.toFixed(2)}:1</strong>
                        <small>{preset.fixedTripletGrid ? '고정 셋잇단 격자' : preset.timingLocked ? '프리셋 고정 타이밍' : getFeelLabel(feel)}</small>
                    </div>
                </section>

                <section className="groove-lab-transport" aria-label="재생 및 템포">
                    <button className="groove-lab-tap" type="button" onClick={handleTap} aria-label="탭으로 BPM 측정">
                        <span>TAP</span>
                        <strong>{bpm}</strong>
                        <small>BPM</small>
                    </button>
                    <div className="groove-lab-play-column">
                        <button
                            type="button"
                            className={`groove-lab-play ${isPlaying ? 'is-playing' : ''}`}
                            onClick={() => void handlePlay()}
                            aria-label={isPlaying ? '그루브 정지' : '그루브 재생'}
                        >
                            <i className={isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} aria-hidden="true" />
                            <span>{isPlaying ? '정지' : '듣기'}</span>
                        </button>
                        <div className="groove-lab-steps" aria-label="BPM 미세 조정">
                            {[-5, -1, 1, 5].map((step) => (
                                <button key={step} type="button" onClick={() => updateBpm(bpm + step)}>
                                    {step > 0 ? `+${step}` : step}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="groove-lab-control-card" aria-label="스윙 표현 설정">
                    <div className="groove-lab-control-head">
                        <div>
                            <span>표현 방식</span>
                            <strong>{preset.fixedTripletGrid || preset.timingLocked ? '프리셋 고정' : '비율을 직접 비교해 보세요'}</strong>
                        </div>
                        <label>
                            음량 {volume}%
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={volume}
                                onChange={(event) => setVolume(Number(event.target.value))}
                                aria-label="음량"
                            />
                        </label>
                    </div>
                    <div className="groove-lab-feels" role="group" aria-label="스윙 표현">
                        {(['adaptive', 'triplet', 'straight'] as const).map((option) => (
                            <button
                                key={option}
                                type="button"
                                className={effectiveFeel === option ? 'active' : ''}
                                onClick={() => setFeel(option)}
                                disabled={preset.fixedTripletGrid || preset.timingLocked}
                            >
                                {getFeelLabel(option)}
                            </button>
                        ))}
                    </div>
                    <p className="groove-lab-feel-note">
                        {preset.fixedTripletGrid
                            ? '이 프리셋은 세 칸이 같은 정확한 셋잇단음 격자를 사용합니다.'
                            : preset.timingLocked
                                ? '연구된 대표 패턴의 기준 격자를 고정해 악기 사이의 맞물림을 비교합니다.'
                            : feel === 'adaptive'
                                ? `논문 관찰 경향을 교육용으로 보간해 ${bpm} BPM에서 ${swingRatio.toFixed(2)}:1로 재생합니다.`
                                : feel === 'triplet'
                                    ? '첫 음 2칸 + 둘째 음 1칸의 정확한 2:1 해석입니다.'
                                    : '두 8분음표를 같은 길이로 재생합니다.'}
                    </p>
                </section>

                <section className="groove-lab-timeline" aria-label={`${preset.name} 한 마디 패턴`}>
                    <div className="groove-lab-section-heading">
                        <div>
                            <span>{preset.instrument}</span>
                            <h2>{preset.name}</h2>
                        </div>
                        <code>{preset.pattern}</code>
                    </div>
                    <div className="groove-lab-track" aria-hidden="true">
                        {[0, 1, 2, 3].map((beat) => (
                            <span key={beat} className="groove-lab-beat-line" style={{ left: `${beat * 25}%` }}>
                                <b>{beat + 1}</b>
                            </span>
                        ))}
                        {timelinePoints.map((group) => {
                            const first = group[0];
                            const isActive = group.some((item) => item.id === activeEventId);
                            return (
                                <span
                                    key={first.position}
                                    className={`groove-lab-hit groove-lab-hit--${first.voice} ${isActive ? 'active' : ''}`}
                                    style={{ left: `${(first.position / 4) * 100}%`, '--hit-color': preset.color } as React.CSSProperties}
                                >
                                    {group.length > 1 && <small>{group.length}</small>}
                                </span>
                            );
                        })}
                    </div>
                    <p>{preset.explanation}</p>
                </section>

                <section className="groove-lab-presets" aria-labelledby="groove-preset-title">
                    <div className="groove-lab-section-heading">
                        <div>
                            <span>INSTRUMENT ROLE</span>
                            <h2 id="groove-preset-title">악기 프리셋</h2>
                        </div>
                        <small>총 {GROOVE_PRESETS.length}개 · 리듬 × 악기</small>
                    </div>
                    <div className="groove-lab-family-tabs" role="tablist" aria-label="리듬 계열">
                        {GROOVE_FAMILIES.map((family) => (
                            <button
                                key={family.id}
                                type="button"
                                role="tab"
                                aria-selected={family.id === preset.family}
                                className={family.id === preset.family ? 'active' : ''}
                                onClick={() => selectFamily(family.id)}
                            >
                                {family.label}
                            </button>
                        ))}
                    </div>
                    <p className="groove-lab-family-description">
                        {GROOVE_FAMILIES.find((family) => family.id === preset.family)?.description}
                    </p>
                    {preset.family === 'blue-note' && (
                        <p className="groove-lab-concept-note">
                            <i className="ri-information-line" aria-hidden="true" />
                            <span><strong>블루 노트는 리듬 이름이 아닙니다.</strong> 선택한 타이밍 위에 악기별 음높이 표현을 얹어 비교합니다.</span>
                        </p>
                    )}
                    <div className="groove-lab-preset-grid">
                        {familyPresets.map((item) => (
                            <button
                                key={item.id}
                                type="button"
                                className={item.id === presetId ? 'active' : ''}
                                onClick={() => selectPreset(item.id)}
                                aria-pressed={item.id === presetId}
                                style={{ '--preset-color': item.color } as React.CSSProperties}
                            >
                                <i className={item.icon} aria-hidden="true" />
                                <span>
                                    <small>{item.instrument}</small>
                                    <strong>{item.shortName}</strong>
                                </span>
                                {item.id === presetId && <i className="ri-check-line groove-lab-check" aria-hidden="true" />}
                            </button>
                        ))}
                    </div>
                </section>

                <details className="groove-lab-evidence">
                    <summary>
                        <span><i className="ri-book-open-line" aria-hidden="true" /> 현재 프리셋의 조사 근거</span>
                        <i className="ri-arrow-down-s-line" aria-hidden="true" />
                    </summary>
                    <div>
                        {selectedEvidence.map((source) => (
                            <a key={source.href} href={source.href} target="_blank" rel="noreferrer">
                                <strong>{source.title}</strong>
                                <p>{source.summary}</p>
                                <span>원문 보기 <i className="ri-external-link-line" aria-hidden="true" /></span>
                            </a>
                        ))}
                        <p className="groove-lab-caveat">
                            프리셋은 연구된 공통 골격을 연습용 한 마디로 단순화한 것입니다. 실제 연주자는 곡·앙상블·개인 스타일에 따라 변주합니다.
                        </p>
                    </div>
                </details>
            </div>
        </main>
    );
};

export default GrooveLabPage;
