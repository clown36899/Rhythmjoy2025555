import React, { useState, useEffect, useRef, useCallback } from 'react';
import './metronome.css';

const MetronomePage: React.FC = () => {
    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
    const [subdivision, setSubdivision] = useState(1); // 1: Quarter, 2: 8th, 3: Triplet, 4: 16th
    const [swingFactor, setSwingFactor] = useState(0); // 0~100 (Timing ratio for pairs)
    const [swingAccent, setSwingAccent] = useState(50); // 0~100 (Off-beat volume: 0=ghost, 100=accent)
    const [visualBeat, setVisualBeat] = useState(-1);
    const [showInfo, setShowInfo] = useState(false);
    const [rhythmName, setRhythmName] = useState('Straight');
    const [showRhythmList, setShowRhythmList] = useState(false);
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
        { id: 'hard-shuffle', name: 'Hard Shuffle', info: '하드 셔플 (100% 스윙)' },
    ] as const;

    // Real-time Update Refs
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beatsPerMeasure);
    const subRef = useRef(subdivision);
    const swingRef = useRef(swingFactor);
    const accentRef = useRef(swingAccent);
    const soundIdRef = useRef(soundId);
    const beatVolumesRef = useRef<number[]>(Array(4).fill(3));

    // Sync Refs with State
    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
    useEffect(() => { subRef.current = subdivision; }, [subdivision]);
    useEffect(() => { swingRef.current = swingFactor; }, [swingFactor]);
    useEffect(() => { accentRef.current = swingAccent; }, [swingAccent]);
    useEffect(() => { soundIdRef.current = soundId; }, [soundId]);
    useEffect(() => { beatVolumesRef.current = beatVolumes; }, [beatVolumes]);

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
        if (!audioContextRef.current || volume < 0.01) return;

        volume = Math.max(0, Math.min(1.0, volume));

        const ctx = audioContextRef.current;
        const envelope = ctx.createGain();

        envelope.gain.setValueAtTime(0, time);

        if (soundIdRef.current === 'brush') {
            // Drum brush: filtered white noise for "cha" swish sound
            const duration = 0.12;
            const bufferSize = Math.floor(ctx.sampleRate * duration);
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = noiseBuffer.getChannelData(0);
            for (let i = 0; i < bufferSize; i++) {
                data[i] = Math.random() * 2 - 1;
            }
            const noise = ctx.createBufferSource();
            noise.buffer = noiseBuffer;

            const filter = ctx.createBiquadFilter();
            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(3500, time);
            filter.Q.setValueAtTime(0.8, time);

            envelope.gain.linearRampToValueAtTime(volume * 0.7, time + 0.004);
            envelope.gain.exponentialRampToValueAtTime(0.001, time + duration);

            noise.connect(filter);
            filter.connect(envelope);
            envelope.connect(ctx.destination);

            noise.start(time);
            noise.stop(time + duration + 0.02);
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
        const accentFactor = accentRef.current / 100; // 0 (on-beat strong) → 1 (off-beat strong)

        let volume = 0.8;

        if (sub === 1) {
            // No subdivision — all beats equal
            volume = 0.8;
        } else if (sub === 3) {
            // Triplet subdivision — 3-note accent pattern (volume only)
            const posInTriplet = beatIndex % 3;
            const quarterBeatIdx = Math.floor(beatIndex / 3) % beats;
            const isBackbeat = beats >= 4 && quarterBeatIdx % 2 !== 0;

            if (posInTriplet === 0) {
                // 1st note: Downbeat
                const base = 0.45 + (1 - accentFactor) * 0.45;
                volume = isBackbeat ? Math.min(1.0, base * 1.15) : base;
            } else if (posInTriplet === 1) {
                // 2nd note: Middle (ghost in shuffle, medium in swing)
                volume = 0.05 + accentFactor * 0.45;
            } else {
                // 3rd note: Pickup
                volume = 0.15 + accentFactor * 0.55;
            }
        } else {
            // sub=2 or sub=4 — pair-based accent (volume only)
            const isOffBeat = beatIndex % 2 !== 0;
            const quarterBeatIdx = Math.floor(beatIndex / sub) % beats;
            const isBackbeat = beats >= 4 && quarterBeatIdx % 2 !== 0;

            if (isOffBeat) {
                volume = 0.08 + accentFactor * 0.72;
            } else {
                const base = 0.4 + (1 - accentFactor) * 0.5;
                volume = base;
                if (isBackbeat) {
                    volume = Math.min(1.0, volume * (1.0 + accentFactor * 0.3));
                }
            }
        }

        volume = Math.max(0, Math.min(1.0, volume));

        // Apply custom beat volume multiplier (click-to-adjust)
        const beatLevel = beatVolumesRef.current[beatIndex];
        if (beatLevel !== undefined && beatLevel < 3) {
            volume *= beatLevel / 3; // 3=100%, 2=67%, 1=33%, 0=mute
        }

        playClick(time, volume);
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
        while (notesInQueueRef.current.length > 0 && notesInQueueRef.current[0].time < currentTime) {
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

    // Helper to release preset on manual change
    const releasePreset = useCallback(() => {
        setRhythmName('Manual');
    }, []);

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
        setBpm(parseInt(e.target.value));
    };

    // Listen for Global Header Info Button
    useEffect(() => {
        const handleOpenInfo = () => setShowInfo(true);
        window.addEventListener('openMetronomeInfo', handleOpenInfo);
        return () => window.removeEventListener('openMetronomeInfo', handleOpenInfo);
    }, []);

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
        let name = 'Straight';

        switch (type) {
            case 'straight':
                newSub = 1; newSwing = 0; newAccent = 50; name = 'Straight';
                break;
            case 'light-swing':
                newSub = 2; newSwing = 60; newAccent = 50; name = 'Light Swing';
                break;
            case 'swing':
                newSub = 2; newSwing = 67; newAccent = 85; name = 'Standard Swing';
                break;
            case 'triplet-shuffle':
                newSub = 3; newSwing = 0; newAccent = 15; name = 'Triplet Shuffle';
                break;
            case 'hard-shuffle':
                newSub = 2; newSwing = 100; newAccent = 10; name = 'Hard Shuffle';
                break;
        }

        setSubdivision(newSub);
        setSwingFactor(newSwing);
        setSwingAccent(newAccent);
        setRhythmName(name);

        // Reset manual volume adjustments to default (3)
        const totalBeats = beatsPerMeasure * newSub;
        const newVolumes = Array(totalBeats).fill(3);

        // Light Swing, Standard Swing & Hard Shuffle: soften off-beats after 1st and 3rd beats (4/4 time)
        // This creates the classic swing feel with ghost notes on weak off-beats
        if ((type === 'light-swing' || type === 'swing' || type === 'hard-shuffle') && beatsPerMeasure === 4 && newSub === 2) {
            newVolumes[1] = 1; // & after beat 1 (ghost note)
            newVolumes[5] = 1; // & after beat 3 (ghost note)
        }

        setBeatVolumes(newVolumes);
        beatVolumesRef.current = newVolumes;

        // Immediate Sync for the Audio Engine
        subRef.current = newSub;
        swingRef.current = newSwing;
        accentRef.current = newAccent;

        setShowInfo(false);
        setShowRhythmList(false);

        setTimeout(() => {
            startEngine();
        }, 50);
    }, [stopEngine, startEngine]);

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
                                    const volLevel = beatVolumes[totalIdx] ?? 3;
                                    const isLastInGroup = subIdx === subdivision - 1;

                                    // Calculate dynamic spacing based on swing ratio
                                    let marginRight = '0px';
                                    if (!isLastInGroup) {
                                        if (subdivision > 1 && subdivision !== 3 && swingFactor > 0) {
                                            const isFirstOfPair = subIdx % 2 === 0;
                                            const baseGap = 6;
                                            const maxSwingGap = 20;
                                            const swingRatio = swingFactor / 100;

                                            if (isFirstOfPair) {
                                                const extraGap = maxSwingGap * swingRatio;
                                                marginRight = `${baseGap + extraGap}px`;
                                            } else {
                                                const reducedGap = maxSwingGap * swingRatio * 0.7;
                                                marginRight = `${Math.max(2, baseGap - reducedGap)}px`;
                                            }
                                        } else {
                                            marginRight = '6px';
                                        }
                                    }

                                    return (
                                        <div
                                            key={subIdx}
                                            className={`beat-indicator vol-${volLevel} ${isCurrent ? 'is-active' : ''} ${!isMainBeat ? 'is-sub' : ''}`}
                                            onClick={(e) => cycleBeatVolume(totalIdx, e)}
                                            style={{ marginRight }}
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
                                        {presets.map(p => (
                                            <button
                                                key={p.id}
                                                className={`dropdown-item ${rhythmName === p.name ? 'active' : ''}`}
                                                onClick={() => applyPreset(p.id)}
                                            >
                                                <span className="dropdown-item-name">{p.name}</span>
                                                <span className="dropdown-item-info">{p.info}</span>
                                            </button>
                                        ))}
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
                                        setBeatsPerMeasure(parseInt(e.target.value));
                                        currentSubBeatRef.current = 0;
                                        releasePreset();
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
                                        setSwingFactor(0);
                                        currentSubBeatRef.current = 0;
                                        releasePreset();
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
                                            value={swingFactor}
                                            onChange={(e) => {
                                                setSwingFactor(parseInt(e.target.value));
                                                releasePreset();
                                            }}
                                        />
                                    </div>
                                )}

                                {/* Off-beat Accent — always shown when sub > 1 */}
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">Off-beat Accent (오프비트 강도)</label>
                                        <span className="swing-value intensity">{swingAccent}%</span>
                                    </div>
                                    <input
                                        type="range"
                                        className="tempo-slider accent"
                                        min="0"
                                        max="100"
                                        value={swingAccent}
                                        onChange={(e) => {
                                            setSwingAccent(parseInt(e.target.value));
                                            releasePreset();
                                        }}
                                    />
                                </div>

                                <p className="swing-hint">
                                    {subdivision === 3
                                        ? '3연음 강약: 0%=중간 음 고스트(셔플 느낌), 100%=오프비트 강조(스윙 느낌)'
                                        : `Swing: 긴-짧 비율 (50:50=균등, 67:33=트리플렛). Accent: 0%=셔플(고스트) ↔ 100%=스윙(강조)`}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MetronomePage;
