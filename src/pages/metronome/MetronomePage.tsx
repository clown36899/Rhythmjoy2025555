import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Navigate } from 'react-router-dom';
import './metronome.css';
import { cafe24 } from '../../lib/cafe24Client';
import type { MetronomePreset } from '../../lib/cafe24Client';
import { useAuth } from '../../contexts/AuthContext';
import {
    isTempoToolItemHidden,
    useTempoToolVisibilitySettings,
} from '../../hooks/useTempoToolVisibilitySettings';

type SoundId = 'classic' | 'wood' | 'elec' | 'perc' | 'brush' | 'kick' | 'hat' | 'cowbell' | 'clave';
type BeatRole = 'downbeat' | 'backbeat' | 'primary' | 'offbeat' | 'triplet';

type RhythmConfig = {
    beats?: number;
    subdivision: 1 | 2 | 3 | 4;
    swingFactor: number;
    offbeat13Accent: number;
    offbeat24Accent: number;
    downbeat13Accent: number;
    backbeatAccent: number;
    triplet2ndAccent?: number;
    triplet3rdSwing?: number;
    beatVolumes?: readonly number[];
    soundId?: SoundId;
};

const MIN_BPM = 40;
const MAX_BPM = 250;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const clampBpm = (value: number) => Math.round(clamp(Number.isFinite(value) ? value : MIN_BPM, MIN_BPM, MAX_BPM));

const RHYTHM_LIBRARY = [
    {
        id: 'straight',
        name: 'Straight',
        info: '균등 분할 정박',
        config: {
            subdivision: 1,
            swingFactor: 0,
            offbeat13Accent: 50,
            offbeat24Accent: 50,
            downbeat13Accent: 100,
            backbeatAccent: 100,
        },
    },
    {
        id: 'light-swing',
        name: 'Light Swing',
        info: '가벼운 60:40 스윙',
        config: {
            subdivision: 2,
            swingFactor: 40,
            offbeat13Accent: 52,
            offbeat24Accent: 58,
            downbeat13Accent: 90,
            backbeatAccent: 82,
            soundId: 'wood',
        },
    },
    {
        id: 'swing',
        name: 'Triplet Swing',
        info: '2:1에 가까운 재즈 스윙',
        config: {
            subdivision: 2,
            swingFactor: 68,
            offbeat13Accent: 68,
            offbeat24Accent: 76,
            downbeat13Accent: 82,
            backbeatAccent: 100,
            soundId: 'classic',
        },
    },
    {
        id: 'heavy-swing',
        name: 'Heavy Swing',
        info: '느린 템포용 진한 스윙',
        config: {
            subdivision: 2,
            swingFactor: 88,
            offbeat13Accent: 76,
            offbeat24Accent: 84,
            downbeat13Accent: 78,
            backbeatAccent: 100,
            soundId: 'cowbell',
        },
    },
    {
        id: 'triplet-shuffle',
        name: 'Triplet Shuffle',
        info: '중간 3연음 고스트',
        config: {
            subdivision: 3,
            swingFactor: 0,
            offbeat13Accent: 58,
            offbeat24Accent: 68,
            downbeat13Accent: 100,
            backbeatAccent: 90,
            triplet2ndAccent: 0,
            soundId: 'perc',
        },
    },
    {
        id: 'hard-shuffle',
        name: 'Blues Shuffle',
        info: '블루스식 강한 셔플',
        config: {
            subdivision: 3,
            swingFactor: 0,
            offbeat13Accent: 72,
            offbeat24Accent: 72,
            downbeat13Accent: 100,
            backbeatAccent: 100,
            triplet2ndAccent: 0,
            soundId: 'clave',
        },
    },
    {
        id: 'backbeat-24',
        name: 'Backbeat 2&4',
        info: '2·4박 감각 훈련',
        config: {
            beats: 4,
            subdivision: 1,
            swingFactor: 0,
            offbeat13Accent: 0,
            offbeat24Accent: 0,
            downbeat13Accent: 28,
            backbeatAccent: 100,
            soundId: 'hat',
        },
    },
    {
        id: 'charleston',
        name: 'Charleston Pulse',
        info: '1 / 2& 액센트 패턴',
        config: {
            beats: 4,
            subdivision: 2,
            swingFactor: 56,
            offbeat13Accent: 96,
            offbeat24Accent: 38,
            downbeat13Accent: 100,
            backbeatAccent: 34,
            beatVolumes: [3, 0, 0, 3, 1, 0, 1, 0],
            soundId: 'wood',
        },
    },
] as const satisfies readonly { id: string; name: string; info: string; config: RhythmConfig }[];

const PRESET_NAME_ALIASES = {
    'Triplet Swing': ['Standard Swing'],
    'Blues Shuffle': ['Hard Shuffle'],
} as const;

const getPresetNameVariants = (name: string): string[] => {
    const legacyNames = PRESET_NAME_ALIASES[name as keyof typeof PRESET_NAME_ALIASES] ?? [];
    return [name, ...legacyNames];
};

const matchesPresetName = (candidateName: string, libraryName: string) => (
    getPresetNameVariants(libraryName).includes(candidateName)
);

const roleTone: Record<BeatRole, { gain: number; pitch: number }> = {
    downbeat: { gain: 1, pitch: 1.22 },
    backbeat: { gain: 0.96, pitch: 1.08 },
    primary: { gain: 0.9, pitch: 1 },
    offbeat: { gain: 0.82, pitch: 0.76 },
    triplet: { gain: 0.62, pitch: 0.62 },
};

const MetronomePageInner: React.FC = () => {
    const { user, isAdmin } = useAuth();

    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
    const [subdivision, setSubdivision] = useState(1); // 1: Quarter, 2: 8th, 3: Triplet, 4: 16th
    const [swingFactor, setSwingFactor] = useState(0); // 0~100 (Timing ratio for pairs)
    const [offbeat13Accent, setOffbeat13Accent] = useState(50); // 0~100 (1& 3& volume: 0=ghost, 100=accent)
    const [offbeat24Accent, setOffbeat24Accent] = useState(50); // 0~100 (2& 4& volume: 0=ghost, 100=accent)
    const [downbeat13Accent, setDownbeat13Accent] = useState(100); // 0~100 (1, 3 on-beat emphasis: Default 100%)
    const [backbeatAccent, setBackbeatAccent] = useState(50); // 0~100 (Backbeat 2&4 emphasis: 0=weak, 100=strong)
    const [triplet2ndAccent, setTriplet2ndAccent] = useState(50); // [NEW] 3연음 2번째 음 강도
    const [triplet3rdSwing, setTriplet3rdSwing] = useState(0);   // [NEW] 3연음 3번째 음 뒤로 밀기 (0~100)
    const [visualBeat, setVisualBeat] = useState(-1);
    const [showInfo, setShowInfo] = useState(false);
    const [rhythmName, setRhythmName] = useState('Straight');
    const [showRhythmList, setShowRhythmList] = useState(false);

    // [New] Dynamic Preset Management
    const [userPresets, setUserPresets] = useState<MetronomePreset[]>([]);
    const [activeUserPreset, setActiveUserPreset] = useState<MetronomePreset | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [soundId, setSoundId] = useState<SoundId>('classic');
    const [beatVolumes, setBeatVolumes] = useState<number[]>(() => Array(4).fill(3));
    const [masterVolume, setMasterVolume] = useState(82);
    const [trainerEnabled, setTrainerEnabled] = useState(false);
    const [trainerTargetBpm, setTrainerTargetBpm] = useState(150);
    const [trainerStep, setTrainerStep] = useState(2);
    const [trainerBars, setTrainerBars] = useState(8);
    const [barCount, setBarCount] = useState(0);
    const [tapCount, setTapCount] = useState(0);

    const sounds = [
        { id: 'classic', name: 'Classic', icon: 'ri-rhythm-line' },
        { id: 'wood', name: 'Wood', icon: 'ri-square-line' },
        { id: 'elec', name: 'Synth', icon: 'ri-sparkling-line' },
        { id: 'perc', name: 'Rimshot', icon: 'ri-focus-3-line' },
        { id: 'brush', name: 'Brush', icon: 'ri-sketching' },
        { id: 'kick', name: 'Kick', icon: 'ri-checkbox-blank-circle-fill' },
        { id: 'hat', name: 'Hi-Hat', icon: 'ri-shining-line' },
        { id: 'cowbell', name: 'Cowbell', icon: 'ri-bell-line' },
        { id: 'clave', name: 'Clave', icon: 'ri-heavy-showers-line' },
    ] as const;

    const presets = RHYTHM_LIBRARY;

    // Real-time Update Refs
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beatsPerMeasure);
    const subRef = useRef(subdivision);
    const swingRef = useRef(swingFactor);
    const offbeat13Ref = useRef(offbeat13Accent);
    const offbeat24Ref = useRef(offbeat24Accent);
    const downbeat13Ref = useRef(downbeat13Accent);
    const backbeatRef = useRef(backbeatAccent);
    const triplet2ndRef = useRef(triplet2ndAccent);
    const triplet3rdSwingRef = useRef(triplet3rdSwing);
    const soundIdRef = useRef(soundId);
    const beatVolumesRef = useRef<number[]>(Array(4).fill(3));
    const masterVolumeRef = useRef(masterVolume);
    const trainerEnabledRef = useRef(trainerEnabled);
    const trainerTargetBpmRef = useRef(trainerTargetBpm);
    const trainerStepRef = useRef(trainerStep);
    const trainerBarsRef = useRef(trainerBars);
    const barCountRef = useRef(0);
    const tapTimesRef = useRef<number[]>([]);
    const tapResetTimerRef = useRef<number | null>(null);
    const rhythmNameRef = useRef(rhythmName);
    const initialPresetAppliedRef = useRef(false);

    // Sync Refs with State
    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
    useEffect(() => { subRef.current = subdivision; }, [subdivision]);
    useEffect(() => { swingRef.current = swingFactor; }, [swingFactor]);
    useEffect(() => { offbeat13Ref.current = offbeat13Accent; }, [offbeat13Accent]);
    useEffect(() => { offbeat24Ref.current = offbeat24Accent; }, [offbeat24Accent]);
    useEffect(() => { downbeat13Ref.current = downbeat13Accent; }, [downbeat13Accent]);
    useEffect(() => { backbeatRef.current = backbeatAccent; }, [backbeatAccent]);
    useEffect(() => { triplet2ndRef.current = triplet2ndAccent; }, [triplet2ndAccent]);
    useEffect(() => { triplet3rdSwingRef.current = triplet3rdSwing; }, [triplet3rdSwing]);
    useEffect(() => { soundIdRef.current = soundId; }, [soundId]);
    useEffect(() => { trainerEnabledRef.current = trainerEnabled; }, [trainerEnabled]);
    useEffect(() => { trainerTargetBpmRef.current = trainerTargetBpm; }, [trainerTargetBpm]);
    useEffect(() => { trainerStepRef.current = trainerStep; }, [trainerStep]);
    useEffect(() => { trainerBarsRef.current = trainerBars; }, [trainerBars]);
    useEffect(() => { rhythmNameRef.current = rhythmName; }, [rhythmName]);
    useEffect(() => {
        beatVolumesRef.current = beatVolumes;
    }, [beatVolumes]);

    // [Fix] Subdivision 또는 Beats 변경 시 볼륨 배열 길이 자동 동기화
    useEffect(() => {
        const requiredLength = beatsPerMeasure * subdivision;
        if (beatVolumes.length !== requiredLength) {
            setBeatVolumes(prev => {
                const next = Array(requiredLength).fill(3);
                // 기존 데이터 보존 시도
                for (let i = 0; i < Math.min(prev.length, requiredLength); i++) {
                    next[i] = prev[i];
                }
                beatVolumesRef.current = next;
                return next;
            });
        }
    }, [beatVolumes.length, beatsPerMeasure, subdivision]);

    // Web Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const masterGainRef = useRef<GainNode | null>(null);
    const noiseBufferCacheRef = useRef<Record<string, AudioBuffer>>({});
    const nextNoteTimeRef = useRef(0);
    const timerIDRef = useRef<number | null>(null);
    const notesInQueueRef = useRef<{ beat: number, time: number }[]>([]);

    // Internal beat counting for scheduling
    const currentSubBeatRef = useRef(0);

    // Look-ahead parameters
    const lookahead = 25.0;
    const scheduleAheadTime = 0.1;

    const ensureAudioContext = useCallback(() => {
        if (audioContextRef.current) return audioContextRef.current;

        const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return null;

        const ctx = new AudioContextClass();
        const masterGain = ctx.createGain();
        const compressor = ctx.createDynamicsCompressor();

        masterGain.gain.setValueAtTime(masterVolumeRef.current / 100, ctx.currentTime);
        compressor.threshold.setValueAtTime(-14, ctx.currentTime);
        compressor.knee.setValueAtTime(18, ctx.currentTime);
        compressor.ratio.setValueAtTime(4, ctx.currentTime);
        compressor.attack.setValueAtTime(0.003, ctx.currentTime);
        compressor.release.setValueAtTime(0.08, ctx.currentTime);

        masterGain.connect(compressor);
        compressor.connect(ctx.destination);

        audioContextRef.current = ctx;
        masterGainRef.current = masterGain;

        return ctx;
    }, []);

    useEffect(() => {
        masterVolumeRef.current = masterVolume;
        const ctx = audioContextRef.current;
        const masterGain = masterGainRef.current;
        if (!ctx || !masterGain) return;

        masterGain.gain.cancelScheduledValues(ctx.currentTime);
        masterGain.gain.setTargetAtTime(masterVolume / 100, ctx.currentTime, 0.012);
    }, [masterVolume]);

    const updateBpm = useCallback((nextBpm: number) => {
        const normalized = clampBpm(nextBpm);
        setBpm(normalized);
        bpmRef.current = normalized;
    }, []);

    const resetTrainerProgress = useCallback(() => {
        barCountRef.current = 0;
        setBarCount(0);
    }, []);

    const advancePracticeBar = useCallback(() => {
        const nextBar = barCountRef.current + 1;
        barCountRef.current = nextBar;
        setBarCount(nextBar);

        if (!trainerEnabledRef.current) return;
        if (nextBar % trainerBarsRef.current !== 0) return;

        const currentBpm = bpmRef.current;
        const targetBpm = trainerTargetBpmRef.current;
        if (currentBpm >= targetBpm) return;

        updateBpm(Math.min(currentBpm + trainerStepRef.current, targetBpm));
    }, [updateBpm]);

    const getNoiseBuffer = useCallback((ctx: AudioContext, duration: number) => {
        const key = `${ctx.sampleRate}:${duration}`;
        const cached = noiseBufferCacheRef.current[key];
        if (cached) return cached;

        const bufferSize = Math.floor(ctx.sampleRate * duration);
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < bufferSize; i++) {
            data[i] = Math.random() * 2 - 1;
        }
        noiseBufferCacheRef.current[key] = buffer;
        return buffer;
    }, []);

    // Sound synthesis with role-based tone shaping for downbeats, backbeats and subdivisions.
    const playClick = useCallback((time: number, volume: number = 1.0, role: BeatRole = 'primary') => {
        if (!audioContextRef.current || volume <= 0) return;

        const tone = roleTone[role];
        volume = Math.max(0, Math.min(1.0, volume * tone.gain));

        const ctx = audioContextRef.current;
        const output = masterGainRef.current ?? ctx.destination;
        const envelope = ctx.createGain();

        envelope.gain.setValueAtTime(0, time);

        if (soundIdRef.current === 'brush') {
            // Professional snare drum synthesis (based on Web Audio API best practices)
            // Layer 1: Snare body (tonal component) - Triangle oscillators
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(185 * tone.pitch, time);
            osc2.frequency.setValueAtTime(349 * tone.pitch, time);

            const bodyGain = ctx.createGain();
            bodyGain.gain.setValueAtTime(0, time);
            bodyGain.gain.linearRampToValueAtTime(volume * 0.3, time + 0.001);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

            osc1.connect(bodyGain);
            osc2.connect(bodyGain);
            bodyGain.connect(output);

            // Layer 2: Snare rattle (noise component) - Highpass filtered noise
            const duration = 0.15;
            const noise = ctx.createBufferSource();
            noise.buffer = getNoiseBuffer(ctx, duration);

            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.setValueAtTime(1600 + (tone.pitch * 900), time);
            highpass.Q.setValueAtTime(1.0, time);

            const snareGain = ctx.createGain();
            snareGain.gain.setValueAtTime(0, time);
            snareGain.gain.linearRampToValueAtTime(volume * 0.7, time + 0.002);
            snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

            noise.connect(highpass);
            highpass.connect(snareGain);
            snareGain.connect(output);

            // Start all components
            osc1.start(time);
            osc1.stop(time + 0.1);
            osc2.start(time);
            osc2.stop(time + 0.1);
            noise.start(time);
            noise.stop(time + duration);
            return;
        }

        // Noise generators for Hi-Hat
        if (soundIdRef.current === 'hat') {
            const duration = role === 'triplet' || role === 'offbeat' ? 0.035 : 0.055;

            const noise = ctx.createBufferSource();
            noise.buffer = getNoiseBuffer(ctx, duration);

            const filter = ctx.createBiquadFilter();
            filter.type = 'highpass';
            filter.frequency.setValueAtTime(6500 + (tone.pitch * 2200), time);

            const hatGain = ctx.createGain();
            hatGain.gain.setValueAtTime(0, time);
            hatGain.gain.linearRampToValueAtTime(volume * 0.4, time + 0.001);
            hatGain.gain.exponentialRampToValueAtTime(0.001, time + duration);

            noise.connect(filter);
            filter.connect(hatGain);
            hatGain.connect(output);

            noise.start(time);
            noise.stop(time + duration);
            return;
        }

        // Oscillator-based sounds
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator(); // Extra for complex sounds like Cowbell
        let attackTime = 0.002;
        let releaseTime = 0.05;
        let useOsc2 = false;

        switch (soundIdRef.current) {
            case 'kick':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(130 * tone.pitch, time);
                osc.frequency.exponentialRampToValueAtTime(36, time + 0.1);
                attackTime = 0.005;
                releaseTime = 0.15;
                break;
            case 'cowbell':
                osc.type = 'square';
                osc.frequency.setValueAtTime(560 * tone.pitch, time);
                osc2.type = 'square';
                osc2.frequency.setValueAtTime(845 * tone.pitch, time);
                attackTime = 0.001;
                releaseTime = 0.1;
                useOsc2 = true;
                break;
            case 'clave':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(2100 * tone.pitch, time);
                attackTime = 0.001;
                releaseTime = 0.045;
                break;
            case 'wood':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(820 * tone.pitch, time);
                attackTime = 0.004;
                releaseTime = 0.13;
                break;
            case 'elec':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(880 * tone.pitch, time);
                osc.frequency.exponentialRampToValueAtTime(90, time + 0.05);
                attackTime = 0.005;
                releaseTime = 0.12;
                break;
            case 'perc':
                osc.type = 'square';
                osc.frequency.setValueAtTime(980 * tone.pitch, time);
                attackTime = 0.001;
                releaseTime = 0.03;
                break;
            default: // classic
                osc.type = 'sine';
                osc.frequency.setValueAtTime(860 * tone.pitch, time);
                releaseTime = 0.08;
                break;
        }

        envelope.gain.linearRampToValueAtTime(volume, time + attackTime);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + attackTime + releaseTime);

        osc.connect(envelope);
        if (useOsc2) osc2.connect(envelope);

        envelope.connect(output);

        osc.start(time);
        osc.stop(time + attackTime + releaseTime + 0.05);
        if (useOsc2) {
            osc2.start(time);
            osc2.stop(time + attackTime + releaseTime + 0.05);
        }
    }, [getNoiseBuffer]);

    /**
     * P0 + P1 + P2: Unified volume resolver
     * - All volumes clamped to 0.0~1.0
     * - Accent slider (swingAccent) actively controls off-beat volume in ALL modes
     * - Triplet subdivision (sub=3) supported with proper 3-note accent pattern
     */
    const scheduleNote = useCallback((beatIndex: number, time: number) => {
        notesInQueueRef.current.push({ beat: beatIndex, time: time });

        const sub = subRef.current;
        const beats = beatsRef.current;
        const offbeat13Factor = offbeat13Ref.current / 100; // 1& 3& accent
        const offbeat24Factor = offbeat24Ref.current / 100; // 2& 4& accent
        const downbeat13Factor = downbeat13Ref.current / 100; // 1, 3 on-beat accent (0~1.0)
        const backbeatFactor = backbeatRef.current / 100; // 2, 4 on-beat accent (0~1.0)
        const triplet2ndFactor = triplet2ndRef.current / 100; // [NEW] 3연음 2번째 음 강도
        const triplet3rdSwingValue = triplet3rdSwingRef.current / 100; // [NEW] 3연음 3번째 음 오프셋 (0~1.0)

        let adjustedTime = time;
        let volume = 0;
        let beatRole: BeatRole = 'primary';

        if (sub === 1) {
            // No subdivision
            const quarterBeatIdx = beatIndex % beats;
            const is13 = quarterBeatIdx % 2 === 0;
            const factor = is13 ? downbeat13Factor : backbeatFactor;
            volume = factor;
            beatRole = quarterBeatIdx === 0 ? 'downbeat' : quarterBeatIdx % 2 === 1 ? 'backbeat' : 'primary';
        } else if (sub === 3) {
            // Triplet subdivision — 3-note accent pattern
            const posInTriplet = beatIndex % 3;
            const quarterBeatIdx = Math.floor(beatIndex / 3) % beats;

            if (posInTriplet === 0) {
                // 1st note: On-beat
                const is13 = quarterBeatIdx % 2 === 0;
                const factor = is13 ? downbeat13Factor : backbeatFactor;
                volume = factor;
                beatRole = quarterBeatIdx === 0 ? 'downbeat' : quarterBeatIdx % 2 === 1 ? 'backbeat' : 'primary';
            } else if (posInTriplet === 1) {
                // 2nd note: User controlled volume
                volume = triplet2ndFactor;
                beatRole = 'triplet';
            } else {
                // 3rd note: Pickup (Off-beat)
                const is13Offbeat = quarterBeatIdx % 2 === 0;
                const factor = is13Offbeat ? offbeat13Factor : offbeat24Factor;
                volume = factor;
                beatRole = 'offbeat';

                // [NEW] Push 3rd note back (Swing/Offset)
                // Max offset is half of the triplet gap
                const secondsPerTriplet = (60.0 / bpmRef.current) / 3.0;
                adjustedTime += triplet3rdSwingValue * secondsPerTriplet * 0.8;
            }
        } else {
            // sub=2 or sub=4 — pair-based accent (volume only)
            const posInSubBeat = beatIndex % sub;
            const quarterBeatIdx = Math.floor(beatIndex / sub) % beats;

            if (posInSubBeat === 0) {
                // Main beat (1, 2, 3, 4...)
                const is13 = quarterBeatIdx % 2 === 0;
                const factor = is13 ? downbeat13Factor : backbeatFactor;
                volume = factor;
                beatRole = quarterBeatIdx === 0 ? 'downbeat' : quarterBeatIdx % 2 === 1 ? 'backbeat' : 'primary';
            } else {
                // Sub-beats (Off-beats)
                const is13Offbeat = quarterBeatIdx % 2 === 0;
                const factor = is13Offbeat ? offbeat13Factor : offbeat24Factor;
                volume = factor;
                beatRole = 'offbeat';
            }
        }

        volume = Math.max(0, Math.min(1.0, volume));

        // Apply custom beat volume multiplier (click-to-adjust)
        const beatLevel = beatVolumesRef.current[beatIndex];
        if (beatLevel !== undefined && beatLevel < 3) {
            volume *= beatLevel / 3; // 3=100%, 2=67%, 1=33%, 0=mute
        }

        // Final safety check: Absolute silence for 0
        if (volume < 0.001) {
            volume = 0;
        }

        playClick(adjustedTime, volume, beatRole);
    }, [playClick]);

    const scheduler = useCallback(() => {
        if (!audioContextRef.current) return;

        while (nextNoteTimeRef.current < audioContextRef.current.currentTime + scheduleAheadTime) {
            scheduleNote(currentSubBeatRef.current, nextNoteTimeRef.current);

            const secondsPerBeat = 60.0 / bpmRef.current;
            const subdivisionTime = secondsPerBeat / subRef.current;

            let actualDelay = subdivisionTime;

            if (subRef.current === 3) {
                // P2: Triplets — always even spacing (no swing timing)
                actualDelay = subdivisionTime;
            } else if (subRef.current > 1 && swingRef.current > 0) {
                // Swing pair timing for sub=2, sub=4
                const isFirstOfPair = currentSubBeatRef.current % 2 === 0;
                // swingRatio: 0.5 (straight) → 0.75 (hard shuffle)
                const swingRatio = 0.5 + (swingRef.current / 100) * 0.25;
                const pairTime = subdivisionTime * 2;

                if (isFirstOfPair) {
                    actualDelay = pairTime * swingRatio;
                } else {
                    actualDelay = pairTime * (1 - swingRatio);
                }
            }

            nextNoteTimeRef.current += actualDelay;

            const totalSubBeats = beatsRef.current * subRef.current;
            const nextSubBeat = (currentSubBeatRef.current + 1) % totalSubBeats;
            if (nextSubBeat === 0) {
                advancePracticeBar();
            }
            currentSubBeatRef.current = nextSubBeat;
        }
    }, [advancePracticeBar, scheduleNote]);

    // Animation frame for visual update sync
    const requestAnimationFrameRef = useRef<number | null>(null);

    const updateVisuals = useCallback(() => {
        if (!audioContextRef.current) return;

        const currentTime = audioContextRef.current.currentTime;
        // Compensate for display/React rendering latency by checking slightly ahead
        const visualOffset = 0.025; // 25ms lookahead

        while (notesInQueueRef.current.length > 0 && notesInQueueRef.current[0].time < currentTime + visualOffset) {
            setVisualBeat(notesInQueueRef.current[0].beat);
            notesInQueueRef.current.shift();
        }
        requestAnimationFrameRef.current = requestAnimationFrame(updateVisuals);
    }, []);

    // Play/Stop Control
    const stopEngine = useCallback(() => {
        if (timerIDRef.current) {
            window.clearInterval(timerIDRef.current);
            timerIDRef.current = null;
        }
        if (requestAnimationFrameRef.current) {
            cancelAnimationFrame(requestAnimationFrameRef.current);
            requestAnimationFrameRef.current = null;
        }
        setIsPlaying(false);
        currentSubBeatRef.current = 0;
        resetTrainerProgress();
        setVisualBeat(-1);
        notesInQueueRef.current = [];
    }, [resetTrainerProgress]);

    const startEngine = useCallback(() => {
        if (timerIDRef.current) return;

        const ctx = ensureAudioContext();
        if (!ctx) return;

        if (ctx.state === 'suspended') {
            void ctx.resume();
        }

        nextNoteTimeRef.current = ctx.currentTime + 0.05;
        currentSubBeatRef.current = 0;
        resetTrainerProgress();
        timerIDRef.current = window.setInterval(scheduler, lookahead);
        requestAnimationFrameRef.current = requestAnimationFrame(updateVisuals);
        setIsPlaying(true);
    }, [ensureAudioContext, resetTrainerProgress, scheduler, updateVisuals]);

    const togglePlay = useCallback(() => {
        if (isPlaying) {
            stopEngine();
        } else {
            startEngine();
        }
    }, [isPlaying, startEngine, stopEngine]);


    // Click beat indicator to cycle volume: 3(loud)→2(mid)→1(ghost)→0(mute)→3
    const cycleBeatVolume = useCallback((index: number, e: React.MouseEvent) => {
        e.stopPropagation();
        setBeatVolumes(prev => {
            const next = [...prev];
            next[index] = next[index] === 0 ? 3 : next[index] - 1;
            beatVolumesRef.current = next;
            return next;
        });
    }, []);

    // UI Handlers
    const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        updateBpm(Number(e.target.value));
    };

    const nudgeBpm = useCallback((amount: number) => {
        updateBpm(bpmRef.current + amount);
    }, [updateBpm]);

    const handleTapTempo = useCallback(() => {
        const now = performance.now();
        const recentTaps = tapTimesRef.current.filter(time => now - time < 2200);
        recentTaps.push(now);
        tapTimesRef.current = recentTaps.slice(-6);
        setTapCount(tapTimesRef.current.length);

        if (tapResetTimerRef.current) {
            window.clearTimeout(tapResetTimerRef.current);
        }
        tapResetTimerRef.current = window.setTimeout(() => {
            tapTimesRef.current = [];
            setTapCount(0);
        }, 2400);

        if (tapTimesRef.current.length < 2) return;

        const intervals = tapTimesRef.current.slice(1).map((time, index) => time - tapTimesRef.current[index]);
        const averageInterval = intervals.reduce((sum, interval) => sum + interval, 0) / intervals.length;
        updateBpm(60000 / averageInterval);
    }, [updateBpm]);

    const selectSound = useCallback((nextSoundId: SoundId) => {
        setSoundId(nextSoundId);
        soundIdRef.current = nextSoundId;

        const ctx = ensureAudioContext();
        if (!ctx) return;
        if (ctx.state === 'suspended') {
            void ctx.resume();
        }
        playClick(ctx.currentTime + 0.025, 0.8, 'downbeat');
    }, [ensureAudioContext, playClick]);

    const updateTrainerTarget = useCallback((value: number) => {
        const nextTarget = clampBpm(value);
        setTrainerTargetBpm(nextTarget);
        trainerTargetBpmRef.current = nextTarget;
    }, []);

    const updateTrainerStep = useCallback((value: number) => {
        const nextStep = Math.round(clamp(value, 1, 12));
        setTrainerStep(nextStep);
        trainerStepRef.current = nextStep;
    }, []);

    const updateTrainerBars = useCallback((value: number) => {
        const nextBars = Math.round(clamp(value, 1, 64));
        setTrainerBars(nextBars);
        trainerBarsRef.current = nextBars;
        resetTrainerProgress();
    }, [resetTrainerProgress]);

    const toggleTrainer = useCallback((checked: boolean) => {
        setTrainerEnabled(checked);
        trainerEnabledRef.current = checked;
        if (checked && trainerTargetBpmRef.current < bpmRef.current) {
            updateTrainerTarget(bpmRef.current);
        }
        resetTrainerProgress();
    }, [resetTrainerProgress, updateTrainerTarget]);

    // Listen for Global Header Info Button
    useEffect(() => {
        const handleOpenInfo = () => setShowInfo(true);
        window.addEventListener('openMetronomeInfo', handleOpenInfo);
        return () => window.removeEventListener('openMetronomeInfo', handleOpenInfo);
    }, []);

    const applyUserPreset = useCallback((preset: MetronomePreset, preventStart: boolean = false) => {
        stopEngine();

        setBpm(preset.bpm);
        bpmRef.current = preset.bpm;
        setBeatsPerMeasure(preset.beats);
        beatsRef.current = preset.beats;
        setSubdivision(preset.subdivision);
        subRef.current = preset.subdivision;
        setSwingFactor(preset.swing_factor);
        swingRef.current = preset.swing_factor;
        setOffbeat13Accent(preset.offbeat_13_accent);
        offbeat13Ref.current = preset.offbeat_13_accent;
        setOffbeat24Accent(preset.offbeat_24_accent);
        offbeat24Ref.current = preset.offbeat_24_accent;
        setDownbeat13Accent(preset.downbeat_13_accent);
        downbeat13Ref.current = preset.downbeat_13_accent;
        setBackbeatAccent(preset.backbeat_accent);
        backbeatRef.current = preset.backbeat_accent;
        const safeSoundId = preset.sound_id as SoundId;
        setSoundId(safeSoundId);
        soundIdRef.current = safeSoundId;
        setRhythmName(preset.name);

        if (preset.beat_volumes) {
            setBeatVolumes(preset.beat_volumes);
            beatVolumesRef.current = preset.beat_volumes;
        }
        setTriplet2ndAccent(preset.triplet_2nd_accent ?? 50);
        triplet2ndRef.current = preset.triplet_2nd_accent ?? 50;
        setTriplet3rdSwing(preset.triplet_3rd_swing ?? 0);
        triplet3rdSwingRef.current = preset.triplet_3rd_swing ?? 0;

        setActiveUserPreset(preset); // Track active preset for updates

        setShowRhythmList(false);
        if (!preventStart) {
            setTimeout(() => startEngine(), 50);
        }
    }, [stopEngine, startEngine]);

    const fetchAllPresets = useCallback(async (applyCurrentPreset = false) => {
        const { data, error } = await cafe24
            .from('metronome_presets')
            .select('*')
            .order('created_at', { ascending: false });

        if (data && !error) {
            setUserPresets(data);

            if (applyCurrentPreset && !initialPresetAppliedRef.current) {
                initialPresetAppliedRef.current = true;
                const savedDefault = data.find(p => p.name === rhythmNameRef.current);
                if (savedDefault) {
                    applyUserPreset(savedDefault, true); // true: do not auto-start
                }
            }
        }
    }, [applyUserPreset]);

    // [Fix] 관리자가 저장한 프리셋을 모든 사용자가 볼 수 있도록 전체 조회
    useEffect(() => {
        void fetchAllPresets(true);
    }, [fetchAllPresets]);

    const saveCurrentPreset = async () => {
        if (!user || !isAdmin || isSaving) return;

        const nameToSave = activeUserPreset?.name || rhythmName.trim() || 'My Preset';

        setIsSaving(true);
        try {
            const { data, error } = await cafe24
                .from('metronome_presets')
                .upsert({
                    user_id: user.id,
                    name: nameToSave,
                    bpm,
                    beats: beatsPerMeasure,
                    subdivision,
                    swing_factor: swingFactor,
                    offbeat_13_accent: offbeat13Accent,
                    offbeat_24_accent: offbeat24Accent,
                    downbeat_13_accent: downbeat13Accent,
                    backbeat_accent: backbeatAccent,
                    triplet_2nd_accent: triplet2ndAccent,
                    triplet_3rd_swing: triplet3rdSwing,
                    sound_id: soundId,
                    beat_volumes: beatVolumes
                }, { onConflict: 'user_id,name' })
                .select()
                .single();

            if (error) throw error;

            await fetchAllPresets();
            if (data) {
                setActiveUserPreset(data);
                setRhythmName(data.name);
            }
        } catch (err: unknown) {
            const message = err instanceof Error ? err.message : '알 수 없는 오류';
            console.error('[MetronomeSave] Error:', err);
            alert('저장 실패: ' + message);
        } finally {
            setIsSaving(false);
        }
    };

    const deletePreset = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || !isAdmin) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;

        const { error } = await cafe24
            .from('metronome_presets')
            .delete()
            .eq('id', id);

        if (error) {
            alert('삭제 중 오류가 발생했습니다: ' + error.message);
        } else {
            fetchAllPresets();
            if (activeUserPreset?.id === id) setActiveUserPreset(null);
        }
    };

    // Auto-stop on unmount
    useEffect(() => {
        return () => {
            if (timerIDRef.current) {
                window.clearInterval(timerIDRef.current);
                timerIDRef.current = null;
            }
            if (requestAnimationFrameRef.current) {
                cancelAnimationFrame(requestAnimationFrameRef.current);
                requestAnimationFrameRef.current = null;
            }
            if (tapResetTimerRef.current) {
                window.clearTimeout(tapResetTimerRef.current);
                tapResetTimerRef.current = null;
            }
        };
    }, []);

    // Preset Application Logic
    const applyPreset = useCallback((type: typeof presets[number]['id']) => {
        stopEngine();

        const preset = presets.find(item => item.id === type);
        if (!preset) return;

        const config = preset.config;
        const nextBeats = config.beats ?? beatsRef.current;
        const nextTriplet2nd = config.triplet2ndAccent ?? 50;
        const nextTriplet3rd = config.triplet3rdSwing ?? 0;
        const nextSoundId = config.soundId ?? soundIdRef.current;
        const nextBeatVolumes = config.beatVolumes
            ? [...config.beatVolumes]
            : Array(nextBeats * config.subdivision).fill(3);

        setBeatsPerMeasure(nextBeats);
        beatsRef.current = nextBeats;
        setSubdivision(config.subdivision);
        subRef.current = config.subdivision;
        setSwingFactor(config.swingFactor);
        swingRef.current = config.swingFactor;
        setOffbeat13Accent(config.offbeat13Accent);
        offbeat13Ref.current = config.offbeat13Accent;
        setOffbeat24Accent(config.offbeat24Accent);
        offbeat24Ref.current = config.offbeat24Accent;
        setDownbeat13Accent(config.downbeat13Accent);
        downbeat13Ref.current = config.downbeat13Accent;
        setBackbeatAccent(config.backbeatAccent);
        backbeatRef.current = config.backbeatAccent;
        setTriplet2ndAccent(nextTriplet2nd);
        triplet2ndRef.current = nextTriplet2nd;
        setTriplet3rdSwing(nextTriplet3rd);
        triplet3rdSwingRef.current = nextTriplet3rd;
        setSoundId(nextSoundId);
        soundIdRef.current = nextSoundId;
        setBeatVolumes(nextBeatVolumes);
        beatVolumesRef.current = nextBeatVolumes;
        setRhythmName(preset.name);
        setActiveUserPreset(null);

        // [Note] beatVolumes scaling is now handled by the useEffect(…, [beatsPerMeasure, subdivision])

        setShowInfo(false);
        setShowRhythmList(false);

        setTimeout(() => {
            startEngine();
        }, 50);
    }, [stopEngine, presets, startEngine]);

    // Swing ratio display helper
    const swingRatioLong = Math.round(50 + (swingFactor * 0.25));
    const swingRatioShort = Math.round(50 - (swingFactor * 0.25));
    const subdivisionLabel = subdivision === 1 ? 'Quarter' : subdivision === 2 ? '8th' : subdivision === 3 ? 'Triplet' : '16th';
    const currentBeatLabel = visualBeat >= 0 ? Math.floor(visualBeat / subdivision) + 1 : 1;
    const currentSubLabel = visualBeat >= 0 ? (visualBeat % subdivision) + 1 : 1;
    const barsUntilRamp = barCount % trainerBars === 0 ? trainerBars : trainerBars - (barCount % trainerBars);
    const nextRampAmount = Math.min(trainerStep, Math.max(0, trainerTargetBpm - bpm));
    const trainerStatus = !trainerEnabled
        ? '트레이너 꺼짐'
        : bpm >= trainerTargetBpm
            ? '목표 도달'
            : `${barsUntilRamp}마디 후 +${nextRampAmount}`;

    return (
        <div className="metronome-container" onClick={() => setShowRhythmList(false)}>
            <div className="metronome-content">
                {/* P4: Enhanced Info Modal */}
                {showInfo && (
                    <div className="metronome-modal-overlay" onClick={() => setShowInfo(false)}>
                        <div className="metronome-info-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>리듬 가이드</h3>
                                <button className="modal-close-btn" onClick={() => setShowInfo(false)}>
                                    <i className="ri-close-line"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="info-item">
                                    <i className="ri-pulse-line"></i>
                                    <p><strong>박자 (Time Sig.)</strong> 마디 당 맥박 수를 조절합니다.</p>
                                </div>
                                <div className="info-item">
                                    <i className="ri-scissors-2-line"></i>
                                    <p><strong>분할 (Subdivision)</strong> 한 박을 8분, 3연음, 16분 음표로 세분화합니다.</p>
                                </div>

                                <div className="info-section-title">스윙 vs 셔플</div>

                                <div className="rhythm-compare-card">
                                    <div className="compare-row">
                                        <div className="compare-label swing-label">Swing</div>
                                        <div className="compare-detail">재즈 / 보사노바</div>
                                    </div>
                                    <div className="compare-pattern">
                                        <span className="note-soft">둥</span>
                                        <span className="note-dash">──</span>
                                        <span className="note-loud">다!</span>
                                        <span className="note-gap"></span>
                                        <span className="note-soft">둥</span>
                                        <span className="note-dash">──</span>
                                        <span className="note-loud">다!</span>
                                    </div>
                                    <p className="compare-desc">오프비트(&) 강조, 2·4박 백비트</p>
                                </div>

                                <div className="rhythm-compare-card shuffle-card">
                                    <div className="compare-row">
                                        <div className="compare-label shuffle-label">Shuffle</div>
                                        <div className="compare-detail">블루스 / 록</div>
                                    </div>
                                    <div className="compare-pattern">
                                        <span className="note-loud">쿵</span>
                                        <span className="note-dash">──</span>
                                        <span className="note-ghost">·</span>
                                        <span className="note-gap"></span>
                                        <span className="note-loud">딱</span>
                                        <span className="note-dash">──</span>
                                        <span className="note-ghost">·</span>
                                    </div>
                                    <p className="compare-desc">다운비트 강조, 오프비트 고스트</p>
                                </div>

                                <div className="info-item">
                                    <i className="ri-lightbulb-line"></i>
                                    <p><strong>핵심</strong> 2:1은 기준점입니다. 실제 스윙은 템포가 빠를수록 더 곧게, 느릴수록 더 길게 느껴질 수 있습니다.</p>
                                </div>

                                <div className="info-item">
                                    <i className="ri-folder-music-line"></i>
                                    <p><strong>라이브러리 기준</strong> 프리셋은 Straight, Swing, Shuffle, Backbeat 2&4처럼 교육·연습 현장에서 널리 쓰이는 감각을 모델링합니다. 장르의 유일한 정답이 아니라 출발점입니다.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="metronome-display-area">
                    {/* P3: Sub-beat visualization */}
                    <div className="metronome-visualizer">
                        {Array.from({ length: beatsPerMeasure }).map((_, beatIdx) => (
                            <div key={beatIdx} className="beat-group">
                                {Array.from({ length: subdivision }).map((_, subIdx) => {
                                    const totalIdx = beatIdx * subdivision + subIdx;
                                    const isCurrent = visualBeat === totalIdx;
                                    const isMainBeat = subIdx === 0;

                                    // Calculate visual scale (0.0 ~ 1.0) for 100% synchronization
                                    let visualScale = 1.0;

                                    let accentValue = 100;
                                    if (isMainBeat) {
                                        const quarterBeatIdx = beatIdx % beatsPerMeasure;
                                        const is13 = quarterBeatIdx % 2 === 0;
                                        accentValue = is13 ? downbeat13Accent : backbeatAccent;
                                    } else if (subdivision === 3) {
                                        if (subIdx === 1) {
                                            accentValue = triplet2ndAccent;
                                        } else {
                                            const is13Offbeat = beatIdx % 2 === 0;
                                            accentValue = is13Offbeat ? offbeat13Accent : offbeat24Accent;
                                        }
                                    } else if (subdivision > 1) {
                                        const is13Offbeat = beatIdx % 2 === 0;
                                        accentValue = is13Offbeat ? offbeat13Accent : offbeat24Accent;
                                    }

                                    // Base scale from accent slider (0~100)
                                    visualScale = accentValue / 100;

                                    // Apply manual volume multiplier (beatVolumes: 0~3)
                                    const bVol = beatVolumes[totalIdx] ?? 3;
                                    visualScale *= (bVol / 3);

                                    // Clamp to absolute 0
                                    if (visualScale < 0.01) visualScale = 0;

                                    const isLastInGroup = subIdx === subdivision - 1;

                                    // Calculate dynamic spacing based on swing ratio or triplet offset
                                    let marginRight = '0px';
                                    if (!isLastInGroup) {
                                        if (subdivision === 3) {
                                            // [NEW] Triplet offset visualization
                                            const base = 10;
                                            marginRight = subIdx === 0
                                                ? `${base}px`
                                                : `${base + (triplet3rdSwing * 0.25)}px`; // Push 3rd note back
                                        } else if (subdivision > 1 && swingFactor > 0) {
                                            const isFirstOfPair = subIdx % 2 === 0;
                                            const base = subdivision === 2 ? 14 : 10;
                                            marginRight = isFirstOfPair
                                                ? `${base + (swingFactor * 0.2)}px`
                                                : `${base - (swingFactor * 0.15)}px`;
                                        } else if (subdivision > 1) {
                                            marginRight = subdivision === 2 ? '14px' : '10px';
                                        }
                                    } else if (subdivision === 3 && triplet3rdSwing > 0) {
                                        // Triplet 3rd note: Reduce gap to next group to show it's "late"
                                        marginRight = `${-(triplet3rdSwing * 0.1)}px`;
                                    }

                                    return (
                                        <button
                                            type="button"
                                            key={subIdx}
                                            className={`beat-indicator ${visualScale === 0 ? 'vol-0' : ''} ${isCurrent ? 'is-active' : ''} ${!isMainBeat ? 'is-offbeat' : ''}`}
                                            onClick={(e) => {
                                                cycleBeatVolume(totalIdx, e);
                                            }}
                                            aria-label={`${beatIdx + 1}박 ${subIdx + 1}분할 볼륨 단계 ${bVol}`}
                                            style={{
                                                marginRight,
                                                transform: isCurrent && visualScale > 0
                                                    ? `scale(${0.65 + visualScale * 1.3})` // Max scale 1.95 (Active, 100%)
                                                    : `scale(${0.45 + visualScale * 0.95})`, // Max scale 1.4 (Idle, 100%)
                                                opacity: isCurrent && visualScale > 0
                                                    ? 0.5 + visualScale * 0.5
                                                    : 0.15 + visualScale * 0.65,
                                                background: visualScale === 0 ? 'transparent' : undefined,
                                                transition: isCurrent ? 'none' : 'transform 0.1s ease, opacity 0.1s ease'
                                            }}
                                        />
                                    );
                                })}
                            </div>
                        ))}
                    </div>

                    <div className="tempo-control-card">
                        <div className="tempo-status-bar" aria-live="polite">
                            <span><i className="ri-bar-chart-box-line"></i>{isPlaying ? `Bar ${barCount + 1}` : '대기'}</span>
                            <span>{currentBeatLabel}.{currentSubLabel}</span>
                            <span>{beatsPerMeasure}/4</span>
                            <span>{subdivisionLabel}</span>
                            <span className={trainerEnabled ? 'is-live' : ''}>{trainerStatus}</span>
                        </div>

                        <div className="tempo-value-display">
                            <input
                                type="number"
                                className="tempo-number-input"
                                min={MIN_BPM}
                                max={MAX_BPM}
                                inputMode="numeric"
                                value={bpm}
                                onChange={handleBpmChange}
                                aria-label="BPM 직접 입력"
                            />
                            <span className="tempo-label">BPM</span>
                        </div>

                        <div className="tempo-stepper-row">
                            <button type="button" className="tempo-step-btn" onClick={() => nudgeBpm(-5)} aria-label="BPM 5 낮추기">-5</button>
                            <button type="button" className="tempo-step-btn" onClick={() => nudgeBpm(-1)} aria-label="BPM 1 낮추기">-1</button>
                            <button type="button" className="tempo-tap-btn" onClick={handleTapTempo} aria-label="탭 템포 입력">
                                <i className="ri-fingerprint-line"></i>
                                <span>Tap{tapCount > 1 ? ` ${tapCount}` : ''}</span>
                            </button>
                            <button type="button" className="tempo-step-btn" onClick={() => nudgeBpm(1)} aria-label="BPM 1 올리기">+1</button>
                            <button type="button" className="tempo-step-btn" onClick={() => nudgeBpm(5)} aria-label="BPM 5 올리기">+5</button>
                        </div>

                        <input
                            type="range"
                            className="tempo-slider"
                            min={MIN_BPM}
                            max={MAX_BPM}
                            value={bpm}
                            onChange={handleBpmChange}
                            aria-label="BPM 슬라이더"
                        />

                        {/* Sound & Rhythm Selector Row */}
                        <div className="selector-row">
                            <div className="sound-selector-bar">
                                {sounds.map(s => (
                                    <button
                                        type="button"
                                        key={s.id}
                                        className={`sound-btn ${soundId === s.id ? 'active' : ''}`}
                                        onClick={() => selectSound(s.id)}
                                        data-tooltip={s.name}
                                        title={s.name}
                                        aria-label={`${s.name} 소리 선택`}
                                        aria-pressed={soundId === s.id}
                                    >
                                        <i className={s.icon}></i>
                                    </button>
                                ))}
                            </div>

                            <div className="rhythm-selector-container">
                                <button
                                    type="button"
                                    className={`rhythm-selector-main ${showRhythmList ? 'is-open' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRhythmList(!showRhythmList);
                                    }}
                                    aria-expanded={showRhythmList}
                                >
                                    <span className="selected-name">{rhythmName}</span>
                                    <i className="ri-arrow-down-s-line"></i>
                                </button>

                                {showRhythmList && (
                                    <div className="rhythm-dropdown-list">
                                        {presets.map(p => {
                                            const saved = userPresets.find(up => matchesPresetName(up.name, p.name));
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={`dropdown-item ${matchesPresetName(rhythmName, p.name) ? 'active' : ''}`}
                                                    onClick={() => saved ? applyUserPreset(saved) : applyPreset(p.id)}
                                                >
                                                    <div className="dropdown-item-content">
                                                        <span className="dropdown-item-name">{p.name}</span>
                                                        <span className="dropdown-item-info">
                                                            {saved ? `${saved.bpm} BPM / ${saved.beats}박 (수정됨)` : p.info}
                                                        </span>
                                                    </div>
                                                    {isAdmin && saved && (
                                                        <button
                                                            type="button"
                                                            className="preset-delete-btn"
                                                            onClick={(e) => deletePreset(saved.id, e)}
                                                            title="기본값으로 초기화"
                                                        >
                                                            <i className="ri-close-line"></i>
                                                        </button>
                                                    )}
                                                </div>
                                            );
                                        })}

                                        {userPresets.filter(up => !presets.some(p => matchesPresetName(up.name, p.name))).length > 0 && (
                                            <>
                                                <div className="dropdown-divider" />
                                                {userPresets.filter(up => !presets.some(preset => matchesPresetName(up.name, preset.name))).map(p => (
                                                    <div
                                                        key={p.id}
                                                        className={`dropdown-item ${rhythmName === p.name ? 'active' : ''}`}
                                                        onClick={() => applyUserPreset(p)}
                                                    >
                                                        <div className="dropdown-item-content">
                                                            <span className="dropdown-item-name">{p.name}</span>
                                                            <span className="dropdown-item-info">{p.bpm} BPM / {p.beats}박</span>
                                                        </div>
                                                        {isAdmin && (
                                                            <button
                                                                type="button"
                                                                className="preset-delete-btn"
                                                                onClick={(e) => deletePreset(p.id, e)}
                                                                title="삭제"
                                                            >
                                                                <i className="ri-close-line"></i>
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                            </>
                                        )}

                                        {isAdmin && (
                                            <>
                                                <div className="dropdown-divider" />
                                                <button
                                                    type="button"
                                                    className="dropdown-item save-btn"
                                                    onClick={saveCurrentPreset}
                                                    disabled={isSaving}
                                                >
                                                    <i className={isSaving ? "ri-loader-4-line spin" : "ri-save-line"}></i>
                                                    <span>{isSaving ? '저장 중...' : '현재 설정 저장'}</span>
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="rhythm-settings">
                            <div className="setting-group">
                                <label className="setting-label">박자 (Time Signature)</label>
                                <select
                                    className="setting-select"
                                    value={beatsPerMeasure}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        setBeatsPerMeasure(val);
                                        beatsRef.current = val; // Direct sync
                                        currentSubBeatRef.current = 0;
                                    }}
                                >
                                    <option value="2">2/4</option>
                                    <option value="3">3/4</option>
                                    <option value="4">4/4</option>
                                    <option value="5">5/4</option>
                                    <option value="6">6/8 (2 group)</option>
                                </select>
                            </div>

                            <button
                                type="button"
                                className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
                                onClick={togglePlay}
                                aria-label={isPlaying ? '메트로놈 정지' : '메트로놈 시작'}
                            >
                                <i className={isPlaying ? 'ri-stop-mini-fill' : 'ri-play-mini-fill'}></i>
                            </button>

                            <div className="setting-group">
                                <label className="setting-label">분할 (Subdivision)</label>
                                <select
                                    className="setting-select"
                                    value={subdivision}
                                    onChange={(e) => {
                                        const newSub = parseInt(e.target.value);
                                        setSubdivision(newSub);
                                        subRef.current = newSub; // Direct sync
                                        currentSubBeatRef.current = 0;
                                    }}
                                >
                                    <option value="1">4분 음표 (Quarter)</option>
                                    <option value="2">8분 음표 (8th)</option>
                                    <option value="3">3연음 (Triplet)</option>
                                    <option value="4">16분 음표 (16th)</option>
                                </select>
                            </div>
                        </div>

                        <div className="utility-control-area">
                            <div className="utility-control">
                                <div className="utility-header">
                                    <label className="setting-label" htmlFor="metronome-master-volume">Master Volume</label>
                                    <span className="utility-value">{masterVolume}%</span>
                                </div>
                                <input
                                    id="metronome-master-volume"
                                    type="range"
                                    className="tempo-slider volume"
                                    min="0"
                                    max="100"
                                    value={masterVolume}
                                    onChange={(e) => setMasterVolume(Number(e.target.value))}
                                />
                            </div>

                            <div className="trainer-toggle-row">
                                <div>
                                    <span className="trainer-title">Tempo Trainer</span>
                                    <span className="trainer-subtitle">{trainerStatus}</span>
                                </div>
                                <label className="trainer-switch">
                                    <input
                                        type="checkbox"
                                        checked={trainerEnabled}
                                        onChange={(e) => toggleTrainer(e.target.checked)}
                                        aria-label="템포 트레이너 켜기"
                                    />
                                    <span></span>
                                </label>
                            </div>

                            {trainerEnabled && (
                                <div className="trainer-panel">
                                    <label className="trainer-field">
                                        <span>Target</span>
                                        <input
                                            type="number"
                                            min={MIN_BPM}
                                            max={MAX_BPM}
                                            value={trainerTargetBpm}
                                            onChange={(e) => updateTrainerTarget(Number(e.target.value))}
                                            aria-label="템포 트레이너 목표 BPM"
                                        />
                                    </label>
                                    <label className="trainer-field">
                                        <span>Step</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="12"
                                            value={trainerStep}
                                            onChange={(e) => updateTrainerStep(Number(e.target.value))}
                                            aria-label="템포 트레이너 증가 BPM"
                                        />
                                    </label>
                                    <label className="trainer-field">
                                        <span>Bars</span>
                                        <input
                                            type="number"
                                            min="1"
                                            max="64"
                                            value={trainerBars}
                                            onChange={(e) => updateTrainerBars(Number(e.target.value))}
                                            aria-label="템포 트레이너 증가 마디 수"
                                        />
                                    </label>
                                </div>
                            )}
                        </div>

                        {/* Swing/Accent controls — visible when subdivision > 1 */}
                        {subdivision > 1 && (
                            <div className="swing-control-area">
                                {/* Swing Ratio — hidden for triplets (always even spacing) */}
                                {subdivision !== 3 && (
                                    <div className="swing-group">
                                        <div className="swing-header">
                                            <label className="setting-label">Swing Ratio (타이밍 비율)</label>
                                            <span className="swing-value">{swingRatioLong}:{swingRatioShort}</span>
                                        </div>
                                        <input
                                            type="range"
                                            className="tempo-slider swing"
                                            min="0"
                                            max="100"
                                            step="1"
                                            value={swingFactor}
                                            onChange={(e) => {
                                                const val = parseInt(e.target.value);
                                                setSwingFactor(val);
                                                swingRef.current = val; // Direct sync
                                            }}
                                        />
                                    </div>
                                )}

                                {/* 1& 3& Accent */}
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">1& 3& Accent (Off-beat)</label>
                                        <span className="swing-value intensity">{offbeat13Accent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        className="tempo-slider accent"
                                        min="0"
                                        max="100"
                                        value={offbeat13Accent}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setOffbeat13Accent(val);
                                            offbeat13Ref.current = val; // Immediate sync for sound
                                        }}
                                    />
                                </div>

                                {/* 2& 4& Accent */}
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">2& 4& Accent (Off-beat)</label>
                                        <span className="swing-value intensity">{offbeat24Accent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        className="tempo-slider accent"
                                        min="0"
                                        max="100"
                                        value={offbeat24Accent}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setOffbeat24Accent(val);
                                            offbeat24Ref.current = val; // Immediate sync for sound
                                        }}
                                    />
                                </div>

                                {/* 1 & 3 Accent (On-beat) */}
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">1 & 3 Accent (On-beat)</label>
                                        <span className="swing-value intensity">{downbeat13Accent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        className="tempo-slider accent downbeat"
                                        min="0"
                                        max="100"
                                        step="1"
                                        value={downbeat13Accent}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setDownbeat13Accent(val);
                                            downbeat13Ref.current = val; // Immediate sync for sound
                                        }}
                                    />
                                </div>

                                {/* Backbeat Accent */}
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">Backbeat Accent (2박, 4박)</label>
                                        <span className="swing-value intensity">{backbeatAccent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        className="tempo-slider accent"
                                        min="0"
                                        max="100"
                                        value={backbeatAccent}
                                        onChange={(e) => {
                                            const val = parseInt(e.target.value);
                                            setBackbeatAccent(val);
                                            backbeatRef.current = val; // Immediate sync for sound
                                        }}
                                    />
                                </div>

                                {/* [NEW] Triplet Specific Controls (Only show when subdivision is 3) */}
                                {subdivision === 3 && (
                                    <>
                                        <div className="swing-group triplet-extra">
                                            <div className="swing-header">
                                                <label className="setting-label">Triplet 2nd Note Vol</label>
                                                <span className="swing-value intensity">{triplet2ndAccent}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                className="tempo-slider accent triplet-2nd"
                                                min="0"
                                                max="100"
                                                step="1"
                                                value={triplet2ndAccent}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setTriplet2ndAccent(val);
                                                    triplet2ndRef.current = val;
                                                }}
                                            />
                                        </div>

                                        <div className="swing-group triplet-extra">
                                            <div className="swing-header">
                                                <label className="setting-label">Triplet 3rd Note Offset</label>
                                                <span className="swing-value intensity">{triplet3rdSwing}%</span>
                                            </div>
                                            <input
                                                type="range"
                                                className="tempo-slider accent triplet-3rd"
                                                min="0"
                                                max="100"
                                                step="1"
                                                value={triplet3rdSwing}
                                                onChange={(e) => {
                                                    const val = parseInt(e.target.value);
                                                    setTriplet3rdSwing(val);
                                                    triplet3rdSwingRef.current = val;
                                                }}
                                            />
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

const MetronomePage: React.FC = () => {
    const { isAdmin, isAuthCheckComplete } = useAuth();
    const {
        settings: tempoToolVisibilitySettings,
        isLoading: isTempoToolVisibilityLoading,
    } = useTempoToolVisibilitySettings();
    const isAccessCheckPending = isTempoToolVisibilityLoading || !isAuthCheckComplete;
    const isAccessBlocked = isTempoToolItemHidden(tempoToolVisibilitySettings, 'metronome') && !isAdmin;

    if (isAccessCheckPending) return null;
    if (isAccessBlocked) return <Navigate to="/" replace />;

    return <MetronomePageInner />;
};

export default MetronomePage;
