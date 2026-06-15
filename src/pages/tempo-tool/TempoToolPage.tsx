import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useTempoToolVisibilitySettings } from '../../hooks/useTempoToolVisibilitySettings';
import './tempo-tool.css';

const MIN_BPM = 40;
const MAX_BPM = 360;
const DEFAULT_BPM = 0;
const TAP_HISTORY_LIMIT = 12;
const TAP_RESET_MS = 3000;
const MIN_TAP_INTERVAL_MS = 120;
const SOUND_OUTPUT_GAIN = 2.35;
const MAX_SOUND_GAIN = 0.86;

type Subdivision = 1 | 2 | 3 | 4;
type SoundPresetId = 'classic' | 'wood' | 'clave' | 'cowbell' | 'hat' | 'rim' | 'kick' | 'brush' | 'synth' | 'deep';
type SoundRole = 'downbeat' | 'main' | 'sub' | 'tap';

type QueuedNote = {
    tick: number;
    time: number;
};

type SoundVoice = {
    gain: number;
    pitch: number;
    duration: number;
};

const clampBpm = (value: number) => Math.round(Math.min(MAX_BPM, Math.max(MIN_BPM, value)));

const normalizeBpm = (value: number) => {
    if (!Number.isFinite(value) || value <= DEFAULT_BPM) return DEFAULT_BPM;
    return clampBpm(value);
};

const trimIntervals = (intervals: number[]) => {
    if (intervals.length < 4) return intervals;
    return [...intervals].sort((a, b) => a - b).slice(1, -1);
};

const measureTapTempo = (tapTimes: number[]) => {
    if (tapTimes.length < 2) return null;

    const intervals = tapTimes.slice(1).map((tap, index) => tap - tapTimes[index]);
    const usableIntervals = trimIntervals(intervals);
    const average = usableIntervals.reduce((sum, interval) => sum + interval, 0) / usableIntervals.length;
    if (!Number.isFinite(average) || average <= 0) return null;

    const variance = usableIntervals.reduce((sum, interval) => {
        const delta = interval - average;
        return sum + delta * delta;
    }, 0) / usableIntervals.length;
    const consistency = Math.sqrt(variance) / average;
    const confidence = intervals.length >= 3
        ? Math.max(0, Math.min(100, Math.round(100 - consistency * 220)))
        : null;

    return {
        bpm: clampBpm(60000 / average),
        confidence
    };
};

const beatOptions = [
    { label: '2/4', value: 2 },
    { label: '3/4', value: 3 },
    { label: '4/4', value: 4 },
    { label: '6/8', value: 6 }
] as const;

const subdivisionOptions: { label: string; value: Subdivision }[] = [
    { label: '1/4', value: 1 },
    { label: '1/8', value: 2 },
    { label: '3연', value: 3 },
    { label: '1/16', value: 4 }
];

const soundPresets: { id: SoundPresetId; label: string }[] = [
    { id: 'classic', label: '기본' },
    { id: 'wood', label: '우드' },
    { id: 'clave', label: '클라베' },
    { id: 'cowbell', label: '카우벨' },
    { id: 'hat', label: '하이햇' },
    { id: 'rim', label: '림샷' },
    { id: 'kick', label: '킥' },
    { id: 'brush', label: '브러시' },
    { id: 'synth', label: '신스' },
    { id: 'deep', label: '딥' }
];

const soundRoleVoice: Record<SoundRole, SoundVoice> = {
    downbeat: { gain: 1, pitch: 1.18, duration: 1.08 },
    main: { gain: 0.72, pitch: 1, duration: 1 },
    sub: { gain: 0.42, pitch: 0.74, duration: 0.82 },
    tap: { gain: 0.5, pitch: 1.05, duration: 0.78 }
};

const TempoToolPage: React.FC = () => {
    const { isAdmin, isAuthCheckComplete } = useAuth();
    const {
        settings: tempoToolVisibilitySettings,
        isLoading: isTempoToolVisibilityLoading,
    } = useTempoToolVisibilitySettings();
    const [bpm, setBpm] = useState(DEFAULT_BPM);
    const [isPlaying, setIsPlaying] = useState(false);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
    const [subdivision, setSubdivision] = useState<Subdivision>(1);
    const [soundPreset, setSoundPreset] = useState<SoundPresetId>('classic');
    const [tapTimes, setTapTimes] = useState<number[]>([]);
    const [confidence, setConfidence] = useState<number | null>(null);
    const [tapPulse, setTapPulse] = useState(false);
    const [visualTick, setVisualTick] = useState(-1);

    const audioContextRef = useRef<AudioContext | null>(null);
    const timerRef = useRef<number | null>(null);
    const animationRef = useRef<number | null>(null);
    const nextNoteTimeRef = useRef(0);
    const currentTickRef = useRef(0);
    const queuedNotesRef = useRef<QueuedNote[]>([]);
    const tapTimesRef = useRef<number[]>([]);
    const tapPulseTimerRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);

    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beatsPerMeasure);
    const subdivisionRef = useRef<Subdivision>(subdivision);
    const soundPresetRef = useRef<SoundPresetId>(soundPreset);

    const totalTicks = beatsPerMeasure * subdivision;
    const canPlay = bpm > DEFAULT_BPM;
    const isAccessCheckPending = isTempoToolVisibilityLoading || !isAuthCheckComplete;
    const isAccessBlocked = tempoToolVisibilitySettings.hidden && !isAdmin;

    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
    useEffect(() => { subdivisionRef.current = subdivision; }, [subdivision]);
    useEffect(() => { soundPresetRef.current = soundPreset; }, [soundPreset]);

    const confidenceLabel = useMemo(() => {
        if (confidence === null) return tapTimes.length >= 3 ? '측정중' : '--';
        if (confidence >= 82) return '안정';
        if (confidence >= 62) return '보통';
        return '흔들림';
    }, [confidence, tapTimes.length]);

    const setTempo = useCallback((nextBpm: number) => {
        setBpm(normalizeBpm(nextBpm));
    }, []);

    const ensureAudioContext = useCallback(() => {
        if (audioContextRef.current) return audioContextRef.current;

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return null;

        const context = new AudioContextClass();
        audioContextRef.current = context;
        return context;
    }, []);

    const playTone = useCallback((
        context: AudioContext,
        time: number,
        voice: SoundVoice,
        options: {
            frequency: number;
            endFrequency?: number;
            secondFrequency?: number;
            type?: OscillatorType;
            filterType?: BiquadFilterType;
            filterFrequency?: number;
            filterQ?: number;
            gain?: number;
            attack?: number;
            release?: number;
            duration?: number;
        }
    ) => {
        const duration = (options.duration ?? 0.055) * voice.duration;
        const attack = options.attack ?? 0.003;
        const release = options.release ?? duration;
        const gainValue = Math.min(MAX_SOUND_GAIN, Math.max(0.001, (options.gain ?? 0.42) * voice.gain * SOUND_OUTPUT_GAIN));
        const oscillator = context.createOscillator();
        const envelope = context.createGain();
        const filter = context.createBiquadFilter();

        oscillator.type = options.type ?? 'triangle';
        oscillator.frequency.setValueAtTime(options.frequency * voice.pitch, time);
        if (options.endFrequency) {
            oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, options.endFrequency * voice.pitch), time + duration);
        }

        filter.type = options.filterType ?? 'bandpass';
        filter.frequency.setValueAtTime((options.filterFrequency ?? options.frequency * 1.45) * voice.pitch, time);
        filter.Q.setValueAtTime(options.filterQ ?? 7, time);

        envelope.gain.setValueAtTime(0.0001, time);
        envelope.gain.exponentialRampToValueAtTime(gainValue, time + attack);
        envelope.gain.exponentialRampToValueAtTime(0.0001, time + release);

        oscillator.connect(filter);

        if (options.secondFrequency) {
            const secondOscillator = context.createOscillator();
            secondOscillator.type = options.type ?? 'triangle';
            secondOscillator.frequency.setValueAtTime(options.secondFrequency * voice.pitch, time);
            secondOscillator.connect(filter);
            secondOscillator.start(time);
            secondOscillator.stop(time + release + 0.03);
        }

        filter.connect(envelope);
        envelope.connect(context.destination);
        oscillator.start(time);
        oscillator.stop(time + release + 0.03);
    }, []);

    const playNoise = useCallback((
        context: AudioContext,
        time: number,
        voice: SoundVoice,
        options: {
            filterType: BiquadFilterType;
            filterFrequency: number;
            filterQ?: number;
            gain: number;
            duration: number;
            attack?: number;
        }
    ) => {
        const duration = options.duration * voice.duration;
        const sampleCount = Math.max(1, Math.floor(context.sampleRate * duration));
        const buffer = context.createBuffer(1, sampleCount, context.sampleRate);
        const data = buffer.getChannelData(0);

        for (let index = 0; index < sampleCount; index += 1) {
            const envelope = 1 - index / sampleCount;
            data[index] = (Math.random() * 2 - 1) * envelope;
        }

        const source = context.createBufferSource();
        const filter = context.createBiquadFilter();
        const gain = context.createGain();

        source.buffer = buffer;
        filter.type = options.filterType;
        filter.frequency.setValueAtTime(options.filterFrequency * voice.pitch, time);
        filter.Q.setValueAtTime(options.filterQ ?? 1.2, time);
        gain.gain.setValueAtTime(0.0001, time);
        const gainValue = Math.min(MAX_SOUND_GAIN, Math.max(0.001, options.gain * voice.gain * SOUND_OUTPUT_GAIN));
        gain.gain.exponentialRampToValueAtTime(gainValue, time + (options.attack ?? 0.002));
        gain.gain.exponentialRampToValueAtTime(0.0001, time + duration);

        source.connect(filter);
        filter.connect(gain);
        gain.connect(context.destination);
        source.start(time);
        source.stop(time + duration + 0.02);
    }, []);

    const playPresetSound = useCallback((time: number, role: SoundRole) => {
        const context = audioContextRef.current;
        if (!context) return;

        const voice = soundRoleVoice[role];
        const preset = soundPresetRef.current;

        try {
            switch (preset) {
                case 'wood':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 1180 : 920,
                        endFrequency: role === 'sub' ? 680 : 760,
                        type: 'square',
                        filterFrequency: 1240,
                        filterQ: 12,
                        gain: 0.34,
                        duration: 0.04
                    });
                    return;
                case 'clave':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 1760 : 1480,
                        endFrequency: 1260,
                        type: 'triangle',
                        filterFrequency: 2200,
                        filterQ: 10,
                        gain: 0.32,
                        duration: 0.036
                    });
                    return;
                case 'cowbell':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 620 : 540,
                        secondFrequency: role === 'downbeat' ? 940 : 810,
                        type: 'square',
                        filterFrequency: 1180,
                        filterQ: 9,
                        gain: 0.24,
                        duration: 0.072,
                        release: 0.092
                    });
                    return;
                case 'hat':
                    playNoise(context, time, voice, {
                        filterType: 'highpass',
                        filterFrequency: role === 'downbeat' ? 5400 : 6800,
                        filterQ: 1.8,
                        gain: 0.22,
                        duration: role === 'sub' ? 0.028 : 0.042
                    });
                    return;
                case 'rim':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 720 : 620,
                        secondFrequency: role === 'downbeat' ? 1920 : 1580,
                        type: 'triangle',
                        filterFrequency: 1400,
                        filterQ: 8,
                        gain: 0.24,
                        duration: 0.048
                    });
                    playNoise(context, time + 0.001, voice, {
                        filterType: 'bandpass',
                        filterFrequency: 2400,
                        filterQ: 2.4,
                        gain: 0.12,
                        duration: 0.035
                    });
                    return;
                case 'kick':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 156 : 130,
                        endFrequency: role === 'downbeat' ? 54 : 64,
                        type: 'sine',
                        filterType: 'lowpass',
                        filterFrequency: 360,
                        filterQ: 0.8,
                        gain: 0.56,
                        duration: 0.12,
                        release: 0.14
                    });
                    return;
                case 'brush':
                    playNoise(context, time, voice, {
                        filterType: 'bandpass',
                        filterFrequency: role === 'downbeat' ? 2700 : 3300,
                        filterQ: 0.9,
                        gain: 0.18,
                        duration: role === 'sub' ? 0.055 : 0.085
                    });
                    return;
                case 'synth':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 1180 : 880,
                        endFrequency: role === 'sub' ? 540 : 620,
                        secondFrequency: role === 'downbeat' ? 1770 : 1320,
                        type: 'sawtooth',
                        filterType: 'bandpass',
                        filterFrequency: role === 'downbeat' ? 2100 : 1680,
                        filterQ: 5,
                        gain: 0.2,
                        duration: 0.064
                    });
                    return;
                case 'deep':
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 240 : 190,
                        endFrequency: role === 'sub' ? 110 : 96,
                        type: 'sine',
                        filterType: 'lowpass',
                        filterFrequency: 520,
                        filterQ: 1.2,
                        gain: 0.38,
                        duration: 0.092
                    });
                    return;
                case 'classic':
                default:
                    playTone(context, time, voice, {
                        frequency: role === 'downbeat' ? 1320 : role === 'main' ? 980 : 720,
                        endFrequency: role === 'sub' ? 560 : 780,
                        type: 'triangle',
                        filterFrequency: role === 'downbeat' ? 1900 : 1500,
                        filterQ: 8,
                        gain: 0.32,
                        duration: role === 'downbeat' ? 0.052 : 0.042
                    });
            }
        } catch {
            // Audio feedback is optional; the tempo tool must keep working if synthesis fails.
        }
    }, [playNoise, playTone]);

    const playClick = useCallback((time: number, tick: number) => {
        const sub = subdivisionRef.current;
        const beatIndex = Math.floor(tick / sub);
        const subIndex = tick % sub;
        const isDownbeat = beatIndex === 0 && subIndex === 0;
        const isMainBeat = subIndex === 0;
        playPresetSound(time, isDownbeat ? 'downbeat' : isMainBeat ? 'main' : 'sub');
    }, [playPresetSound]);

    const playTapFeedback = useCallback(() => {
        try {
            const context = ensureAudioContext();
            if (!context) return;

            if (context.state === 'suspended') {
                void context.resume();
            }

            playPresetSound(context.currentTime + 0.002, 'tap');
        } catch {
            // Audio feedback is optional; tap measurement must continue even if Web Audio is blocked.
        }
    }, [ensureAudioContext, playPresetSound]);

    const handleSoundPresetChange = useCallback((event: React.ChangeEvent<HTMLSelectElement>) => {
        const nextSoundPreset = event.target.value as SoundPresetId;
        setSoundPreset(nextSoundPreset);
        soundPresetRef.current = nextSoundPreset;

        try {
            const context = ensureAudioContext();
            if (!context) return;

            if (context.state === 'suspended') {
                void context.resume();
            }

            playPresetSound(context.currentTime + 0.002, 'tap');
        } catch {
            // Keep selection usable even when autoplay or audio setup is blocked.
        }
    }, [ensureAudioContext, playPresetSound]);

    const scheduleNote = useCallback((tick: number, time: number) => {
        queuedNotesRef.current.push({ tick, time });
        playClick(time, tick);
    }, [playClick]);

    const scheduler = useCallback(() => {
        const context = audioContextRef.current;
        if (!context) return;
        if (bpmRef.current <= DEFAULT_BPM) return;

        while (nextNoteTimeRef.current < context.currentTime + 0.1) {
            scheduleNote(currentTickRef.current, nextNoteTimeRef.current);

            const secondsPerBeat = 60 / bpmRef.current;
            nextNoteTimeRef.current += secondsPerBeat / subdivisionRef.current;
            currentTickRef.current = (currentTickRef.current + 1) % (beatsRef.current * subdivisionRef.current);
        }
    }, [scheduleNote]);

    const updateVisuals = useCallback(() => {
        const context = audioContextRef.current;
        if (!context) return;

        while (queuedNotesRef.current.length && queuedNotesRef.current[0].time < context.currentTime) {
            const nextNote = queuedNotesRef.current.shift();
            if (nextNote) setVisualTick(nextNote.tick);
        }

        animationRef.current = requestAnimationFrame(updateVisuals);
    }, []);

    const stopMetronome = useCallback(() => {
        if (timerRef.current !== null) {
            window.clearInterval(timerRef.current);
            timerRef.current = null;
        }
        if (animationRef.current !== null) {
            cancelAnimationFrame(animationRef.current);
            animationRef.current = null;
        }

        queuedNotesRef.current = [];
        currentTickRef.current = 0;
        setVisualTick(-1);
        setIsPlaying(false);
    }, []);

    const startMetronome = useCallback(() => {
        if (timerRef.current !== null) return;
        if (bpmRef.current <= DEFAULT_BPM) return;

        const context = ensureAudioContext();
        if (!context) return;

        if (context.state === 'suspended') {
            void context.resume();
        }

        currentTickRef.current = 0;
        queuedNotesRef.current = [];
        nextNoteTimeRef.current = context.currentTime + 0.05;
        scheduler();
        timerRef.current = window.setInterval(scheduler, 25);
        animationRef.current = requestAnimationFrame(updateVisuals);
        setIsPlaying(true);
    }, [ensureAudioContext, scheduler, updateVisuals]);

    const togglePlay = useCallback(() => {
        if (!canPlay) return;
        if (isPlaying) {
            stopMetronome();
            return;
        }
        startMetronome();
    }, [canPlay, isPlaying, startMetronome, stopMetronome]);

    const handleTapTempo = useCallback(() => {
        const now = performance.now();
        const previousTaps = tapTimesRef.current;
        const previousTap = previousTaps[previousTaps.length - 1];
        const intervalFromLastTap = previousTap !== undefined ? now - previousTap : null;

        setTapPulse(true);
        playTapFeedback();
        if (tapPulseTimerRef.current) clearTimeout(tapPulseTimerRef.current);
        tapPulseTimerRef.current = setTimeout(() => setTapPulse(false), 120);

        if (intervalFromLastTap !== null && intervalFromLastTap < MIN_TAP_INTERVAL_MS) return;

        const nextTaps = intervalFromLastTap !== null && intervalFromLastTap > TAP_RESET_MS
            ? [now]
            : [...previousTaps, now].slice(-TAP_HISTORY_LIMIT);
        const measurement = measureTapTempo(nextTaps);

        tapTimesRef.current = nextTaps;
        setTapTimes(nextTaps);
        setConfidence(measurement?.confidence ?? null);

        if (measurement) setTempo(measurement.bpm);
    }, [playTapFeedback, setTempo]);

    const resetTapTempo = useCallback(() => {
        stopMetronome();
        tapTimesRef.current = [];
        setTapTimes([]);
        setConfidence(null);
        setTempo(DEFAULT_BPM);
    }, [setTempo, stopMetronome]);

    useEffect(() => {
        if (isAccessCheckPending || isAccessBlocked) return undefined;

        document.documentElement.classList.add('tempo-tool-page-active');
        return () => document.documentElement.classList.remove('tempo-tool-page-active');
    }, [isAccessBlocked, isAccessCheckPending]);

    useEffect(() => {
        return () => {
            stopMetronome();
            if (tapPulseTimerRef.current) clearTimeout(tapPulseTimerRef.current);
            void audioContextRef.current?.close();
        };
    }, [stopMetronome]);

    if (isAccessCheckPending) return null;
    if (isAccessBlocked) return <Navigate to="/" replace />;

    return (
        <div className="tempo-tool-container">
            <div className="tempo-tool-content">
                <header className="tempo-tool-header tempo-tool-topbar">
                    <h2 aria-label="BPM 측정기/메트로놈">
                        <span className="tempo-tool-title-line">BPM 측정기</span>
                        <span className="tempo-tool-title-separator" aria-hidden="true">/</span>
                        <span className="tempo-tool-title-line">메트로놈</span>
                    </h2>
                    <div className="tempo-tool-status-row" aria-label="측정 상태">
                        <span>
                            <b>{tapTimes.length}</b>
                            taps
                        </span>
                        <span>
                            <b>{confidenceLabel}</b>
                            steady
                        </span>
                    </div>
                </header>

                <section className="tempo-tool-main tempo-tool-core">
                    <button
                        type="button"
                        className={`tempo-tool-tap-pad ${tapPulse ? 'is-tapping' : ''}`}
                        onClick={handleTapTempo}
                        aria-label="탭 템포 입력"
                    >
                        <span className="tempo-tool-tap-label">TAP</span>
                        <span className="tempo-tool-bpm" aria-live="polite">{bpm}</span>
                        <span className="tempo-tool-bpm-label">BPM</span>
                    </button>

                    <div className="tempo-tool-command-strip">
                        <button
                            type="button"
                            className={`tempo-tool-play-btn ${isPlaying ? 'is-playing' : ''}`}
                            onClick={togglePlay}
                            disabled={!canPlay}
                        >
                            <i className={isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} aria-hidden="true" />
                            <span>{isPlaying ? '정지' : '시작'}</span>
                        </button>

                        <div className="tempo-tool-stepper" aria-label="BPM 조절">
                            {[-5, -1, 1, 5].map((step) => (
                                <button
                                    key={step}
                                    type="button"
                                    onClick={() => setTempo(bpm + step)}
                                >
                                    {step > 0 ? `+${step}` : step}
                                </button>
                            ))}
                        </div>
                    </div>
                </section>

                <section className="tempo-tool-controls">
                    <div className="tempo-tool-meter-line">
                        <label className="tempo-tool-slider">
                            <span>BPM</span>
                            <input
                                type="range"
                                min={DEFAULT_BPM}
                                max={MAX_BPM}
                                value={bpm}
                                onChange={(event) => setTempo(Number(event.target.value))}
                            />
                        </label>

                        <label className="tempo-tool-sound-select">
                            <span>소리</span>
                            <select
                                value={soundPreset}
                                onChange={handleSoundPresetChange}
                                aria-label="소리 프리셋 선택"
                            >
                                {soundPresets.map((sound) => (
                                    <option key={sound.id} value={sound.id}>
                                        {sound.label}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <button type="button" className="tempo-tool-reset-btn" onClick={resetTapTempo}>
                            <i className="ri-refresh-line" aria-hidden="true" />
                            <span>초기화</span>
                        </button>
                    </div>

                    <div className="tempo-tool-options">
                        <div className="tempo-tool-control-group">
                            <span className="tempo-tool-group-label">박자</span>
                            <div className="tempo-tool-segmented">
                                {beatOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={beatsPerMeasure === option.value ? 'is-active' : ''}
                                        onClick={() => {
                                            setBeatsPerMeasure(option.value);
                                            currentTickRef.current = 0;
                                            setVisualTick(-1);
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="tempo-tool-control-group">
                            <span className="tempo-tool-group-label">분할</span>
                            <div className="tempo-tool-segmented tempo-tool-segmented--subdivision">
                                {subdivisionOptions.map((option) => (
                                    <button
                                        key={option.value}
                                        type="button"
                                        className={subdivision === option.value ? 'is-active' : ''}
                                        onClick={() => {
                                            setSubdivision(option.value);
                                            currentTickRef.current = 0;
                                            setVisualTick(-1);
                                        }}
                                    >
                                        {option.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div
                        className="tempo-tool-beat-grid"
                        aria-label="박자 표시"
                        style={{ '--tempo-grid-cols': String(totalTicks) } as React.CSSProperties}
                    >
                        {Array.from({ length: totalTicks }).map((_, tick) => {
                            const isMainBeat = tick % subdivision === 0;
                            const isDownbeat = tick === 0;
                            return (
                                <span
                                    key={tick}
                                    className={[
                                        'tempo-tool-beat',
                                        isMainBeat ? 'is-main' : 'is-sub',
                                        isDownbeat ? 'is-downbeat' : '',
                                        visualTick === tick ? 'is-active' : ''
                                    ].join(' ')}
                                />
                            );
                        })}
                    </div>
                </section>
            </div>
        </div>
    );
};

export default TempoToolPage;
