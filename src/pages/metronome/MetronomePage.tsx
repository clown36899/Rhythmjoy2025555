import React, { useState, useEffect, useRef, useCallback } from 'react';
import './metronome.css';
import { supabase } from '../../lib/supabase';
import type { MetronomePreset } from '../../lib/supabase';
import { useAuth } from '../../contexts/AuthContext';

const MetronomePage: React.FC = () => {
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
    const [soundId, setSoundId] = useState<'classic' | 'wood' | 'elec' | 'perc' | 'brush'>('brush');
    const [beatVolumes, setBeatVolumes] = useState<number[]>(() => Array(4).fill(3));

    const sounds = [
        { id: 'classic', name: 'Classic', icon: 'ri-rhythm-line' },
        { id: 'perc', name: 'Rimshot', icon: 'ri-focus-3-line' },
        { id: 'brush', name: 'Brush', icon: 'ri-sketching' },
    ] as const;

    const presets = [
        { id: 'straight', name: 'Straight', info: '기본 정박 (50:50)' },
        { id: 'light-swing', name: 'Light Swing', info: '부드러운 스윙 (60:40)' },
        { id: 'swing', name: 'Standard Swing', info: '표준 재즈 스윙 (67:33)' },
        { id: 'triplet-shuffle', name: 'Triplet Shuffle', info: '3연음 셔플 (강-약-중)' },
        { id: 'hard-shuffle', name: 'Hard Shuffle', info: '하드 셔플 (67:33)' },
    ] as const;

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
    }, [beatsPerMeasure, subdivision]);

    // Web Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextNoteTimeRef = useRef(0);
    const timerIDRef = useRef<number | null>(null);
    const notesInQueueRef = useRef<{ beat: number, time: number }[]>([]);

    // Internal beat counting for scheduling
    const currentSubBeatRef = useRef(0);

    // Look-ahead parameters
    const lookahead = 25.0;
    const scheduleAheadTime = 0.1;

    // Sound synthesis — fixed pitch for all beats, volume-only dynamics
    const playClick = useCallback((time: number, volume: number = 1.0) => {
        if (!audioContextRef.current || volume <= 0) return;

        volume = Math.max(0, Math.min(1.0, volume));

        const ctx = audioContextRef.current;
        const envelope = ctx.createGain();

        envelope.gain.setValueAtTime(0, time);

        if (soundIdRef.current === 'brush') {
            // Professional snare drum synthesis (based on Web Audio API best practices)
            // Layer 1: Snare body (tonal component) - Triangle oscillators
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(185, time); // Lower fundamental
            osc2.frequency.setValueAtTime(349, time); // Higher harmonic

            const bodyGain = ctx.createGain();
            bodyGain.gain.setValueAtTime(0, time);
            bodyGain.gain.linearRampToValueAtTime(volume * 0.3, time + 0.001);
            bodyGain.gain.exponentialRampToValueAtTime(0.001, time + 0.1);

            osc1.connect(bodyGain);
            osc2.connect(bodyGain);
            bodyGain.connect(ctx.destination);

            // Layer 2: Snare rattle (noise component) - Highpass filtered noise
            const duration = 0.15;
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }

            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;

            const highpass = ctx.createBiquadFilter();
            highpass.type = 'highpass';
            highpass.frequency.setValueAtTime(2000, time); // Remove low frequencies
            highpass.Q.setValueAtTime(1.0, time);

            const snareGain = ctx.createGain();
            snareGain.gain.setValueAtTime(0, time);
            snareGain.gain.linearRampToValueAtTime(volume * 0.7, time + 0.002);
            snareGain.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

            noise.connect(highpass);
            highpass.connect(snareGain);
            snareGain.connect(ctx.destination);

            // Start all components
            osc1.start(time);
            osc1.stop(time + 0.1);
            osc2.start(time);
            osc2.stop(time + 0.1);
            noise.start(time);
            noise.stop(time + duration);
            return;
        }

        // Oscillator-based sounds — same frequency for every beat
        const osc = ctx.createOscillator();
        let attackTime = 0.002;
        let releaseTime = 0.05;

        switch (soundIdRef.current) {
            case 'wood':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(900, time);
                attackTime = 0.008;
                releaseTime = 0.2;
                break;
            case 'elec':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(900, time);
                osc.frequency.exponentialRampToValueAtTime(80, time + 0.05);
                attackTime = 0.005;
                releaseTime = 0.12;
                break;
            case 'perc':
                osc.type = 'square';
                osc.frequency.setValueAtTime(1080, time);
                attackTime = 0.001;
                releaseTime = 0.03;
                break;
            default: // classic
                osc.type = 'sine';
                osc.frequency.setValueAtTime(900, time);
                releaseTime = 0.08;
                break;
        }

        envelope.gain.linearRampToValueAtTime(volume, time + attackTime);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + attackTime + releaseTime);

        osc.connect(envelope);
        envelope.connect(ctx.destination);

        osc.start(time);
        osc.stop(time + attackTime + releaseTime + 0.05);
    }, []);

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

        if (sub === 1) {
            // No subdivision
            const quarterBeatIdx = beatIndex % beats;
            const is13 = quarterBeatIdx % 2 === 0;
            const factor = is13 ? downbeat13Factor : backbeatFactor;
            volume = factor;
        } else if (sub === 3) {
            // Triplet subdivision — 3-note accent pattern
            const posInTriplet = beatIndex % 3;
            const quarterBeatIdx = Math.floor(beatIndex / 3) % beats;

            if (posInTriplet === 0) {
                // 1st note: On-beat
                const is13 = quarterBeatIdx % 2 === 0;
                const factor = is13 ? downbeat13Factor : backbeatFactor;
                volume = factor;
            } else if (posInTriplet === 1) {
                // 2nd note: User controlled volume
                volume = triplet2ndFactor;
            } else {
                // 3rd note: Pickup (Off-beat)
                const is13Offbeat = quarterBeatIdx % 2 === 0;
                const factor = is13Offbeat ? offbeat13Factor : offbeat24Factor;
                volume = factor;

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
            } else {
                // Sub-beats (Off-beats)
                const is13Offbeat = quarterBeatIdx % 2 === 0;
                const factor = is13Offbeat ? offbeat13Factor : offbeat24Factor;
                volume = factor;
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

        playClick(adjustedTime, volume);
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
            currentSubBeatRef.current = (currentSubBeatRef.current + 1) % (beatsRef.current * subRef.current);
        }
    }, [scheduleNote]);

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
        setVisualBeat(-1);
        notesInQueueRef.current = [];
    }, []);

    const startEngine = useCallback(() => {
        if (timerIDRef.current) return;

        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioContextRef.current.state === 'suspended') {
            audioContextRef.current.resume();
        }

        nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.05;
        currentSubBeatRef.current = 0;
        timerIDRef.current = window.setInterval(scheduler, lookahead);
        requestAnimationFrameRef.current = requestAnimationFrame(updateVisuals);
        setIsPlaying(true);
    }, [scheduler, updateVisuals]);

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
        const val = parseInt(e.target.value);
        setBpm(val);
        bpmRef.current = val; // Direct sync for immediate response
    };

    // Listen for Global Header Info Button
    useEffect(() => {
        const handleOpenInfo = () => setShowInfo(true);
        window.addEventListener('openMetronomeInfo', handleOpenInfo);
        return () => window.removeEventListener('openMetronomeInfo', handleOpenInfo);
    }, []);

    // [Fix] 관리자가 저장한 프리셋을 모든 사용자가 볼 수 있도록 전체 조회
    useEffect(() => {
        fetchAllPresets();
    }, []);

    const fetchAllPresets = async () => {
        const { data, error } = await supabase
            .from('metronome_presets')
            .select('*')
            .order('created_at', { ascending: false });

        if (data && !error) {
            setUserPresets(data);

            // [Fix] 초기 로드 시 현재 'rhythmName' (Straight)과 일치하는 저장된 데이터가 있으면 자동 적용
            const savedDefault = data.find(p => p.name === rhythmName);
            if (savedDefault) {
                console.log('[Metronome] Auto-applying saved preset:', savedDefault.name);
                applyUserPreset(savedDefault, true); // true: do not auto-start
            }
        }
    };

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
        const safeSoundId = preset.sound_id as 'classic' | 'wood' | 'elec' | 'perc' | 'brush';
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

        // isSaving is used in the save action UI to prevent double click
        console.log('[Preset] Applied:', preset.name, isSaving ? '(saving...)' : '');

        setShowRhythmList(false);
        if (!preventStart) {
            setTimeout(() => startEngine(), 50);
        }
    }, [stopEngine, startEngine, isSaving]);

    const saveCurrentPreset = async () => {
        if (!user || !isAdmin || isSaving) return;

        const nameToSave = activeUserPreset?.name || rhythmName.trim() || 'My Preset';

        setIsSaving(true);
        try {
            const { data, error } = await supabase
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
        } catch (err: any) {
            console.error('[MetronomeSave] Error:', err);
            alert('저장 실패: ' + err.message);
        } finally {
            setIsSaving(false);
        }
    };

    const deletePreset = async (id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!user || !isAdmin) return;
        if (!confirm('정말 삭제하시겠습니까?')) return;

        const { error } = await supabase
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
        };
    }, []);

    // Preset Application Logic
    const applyPreset = useCallback((type: typeof presets[number]['id']) => {
        stopEngine();

        let newSub = 1;
        let newSwing = 0;
        let newAccent = 50;
        let newDownbeat = 100;
        let newBackbeat = 50;
        let name = 'Straight';

        switch (type) {
            case 'straight':
                newSub = 1; newSwing = 0; newAccent = 50; newDownbeat = 100; newBackbeat = 100; name = 'Straight';
                break;
            case 'light-swing':
                newSub = 2; newSwing = 60; newAccent = 50; newDownbeat = 100; newBackbeat = 50; name = 'Light Swing';
                break;
            case 'swing':
                newSub = 2; newSwing = 67; newAccent = 85; newDownbeat = 100; newBackbeat = 50; name = 'Standard Swing';
                break;
            case 'triplet-shuffle':
                newSub = 3; newSwing = 0; newAccent = 15; newDownbeat = 100; newBackbeat = 50; name = 'Triplet Shuffle';
                break;
            case 'hard-shuffle':
                newSub = 2; newSwing = 67; newAccent = 10; newDownbeat = 100; newBackbeat = 50; name = 'Hard Shuffle';
                break;
        }

        setSubdivision(newSub);
        setSwingFactor(newSwing);
        setOffbeat13Accent(newAccent);
        setOffbeat24Accent(newAccent);
        setDownbeat13Accent(newDownbeat);
        setBackbeatAccent(newBackbeat);
        setTriplet2ndAccent(50);
        setTriplet3rdSwing(0);
        setRhythmName(name);
        setActiveUserPreset(null);

        triplet2ndRef.current = 50;
        triplet3rdSwingRef.current = 0;

        // [Note] beatVolumes scaling is now handled by the useEffect(…, [beatsPerMeasure, subdivision])

        setShowInfo(false);
        setShowRhythmList(false);

        setTimeout(() => {
            startEngine();
        }, 50);
    }, [stopEngine, startEngine, beatsPerMeasure]);

    // Swing ratio display helper
    const swingRatioLong = Math.round(50 + (swingFactor * 0.25));
    const swingRatioShort = Math.round(50 - (swingFactor * 0.25));

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
                                    <p><strong>핵심</strong> 둘 다 긴─짧 타이밍(2:1)을 사용합니다. 차이는 <em>어느 음을 강조</em>하느냐입니다. Accent 슬라이더로 전환해 보세요.</p>
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
                                        <div
                                            key={subIdx}
                                            className={`beat-indicator ${visualScale === 0 ? 'vol-0' : ''} ${isCurrent ? 'is-active' : ''} ${!isMainBeat ? 'is-offbeat' : ''}`}
                                            onClick={(e) => {
                                                cycleBeatVolume(totalIdx, e);
                                            }}
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
                        <div className="tempo-value-display">
                            <span className="tempo-number">{bpm}</span>
                            <span className="tempo-label">BPM</span>
                        </div>

                        <input
                            type="range"
                            className="tempo-slider"
                            min="40"
                            max="250"
                            value={bpm}
                            onChange={handleBpmChange}
                        />

                        {/* Sound & Rhythm Selector Row */}
                        <div className="selector-row">
                            <div className="sound-selector-bar">
                                {sounds.map(s => (
                                    <button
                                        key={s.id}
                                        className={`sound-btn ${soundId === s.id ? 'active' : ''}`}
                                        onClick={() => setSoundId(s.id)}
                                        title={s.name}
                                    >
                                        <i className={s.icon}></i>
                                    </button>
                                ))}
                            </div>

                            <div className="rhythm-selector-container">
                                <button
                                    className={`rhythm-selector-main ${showRhythmList ? 'is-open' : ''}`}
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        setShowRhythmList(!showRhythmList);
                                    }}
                                >
                                    <span className="selected-name">{rhythmName}</span>
                                    <i className="ri-arrow-down-s-line"></i>
                                </button>

                                {showRhythmList && (
                                    <div className="rhythm-dropdown-list">
                                        {presets.map(p => {
                                            const saved = userPresets.find(up => up.name === p.name);
                                            return (
                                                <div
                                                    key={p.id}
                                                    className={`dropdown-item ${rhythmName === p.name ? 'active' : ''}`}
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

                                        {userPresets.filter(up => !presets.some(p => p.name === up.name)).length > 0 && (
                                            <>
                                                <div className="dropdown-divider" />
                                                {userPresets.filter(up => !presets.some(p => p.name === up.name)).map(p => (
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
                                className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
                                onClick={togglePlay}
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

export default MetronomePage;
