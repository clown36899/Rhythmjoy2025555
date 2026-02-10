import React, { useState, useEffect, useRef, useCallback } from 'react';
import './metronome.css';

const MetronomePage: React.FC = () => {
    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
    const [subdivision, setSubdivision] = useState(1); // 1: Quarter, 2: 8th, 4: 16th
    const [swingFactor, setSwingFactor] = useState(0); // 0 to 100 (Timing Offset)
    const [swingAccent, setSwingAccent] = useState(50); // 0 to 100 (Volume of off-beat)
    const [visualBeat, setVisualBeat] = useState(-1);
    const [showInfo, setShowInfo] = useState(false);
    const [rhythmName, setRhythmName] = useState('Straight');
    const [showRhythmList, setShowRhythmList] = useState(false);
    const [soundId, setSoundId] = useState<'classic' | 'wood' | 'elec' | 'perc'>('classic');

    const sounds = [
        { id: 'classic', name: 'Classic', icon: 'ri-rhythm-line' },
        { id: 'wood', name: 'Wood', icon: 'ri-hammer-line' },
        { id: 'elec', name: 'Digital', icon: 'ri-broadcast-line' },
        { id: 'perc', name: 'Rimshot', icon: 'ri-focus-3-line' },
    ] as const;

    const presets = [
        { id: 'straight', name: 'Straight', info: '기본 정박 (50:50)', accentPattern: 'straight' as const },
        { id: 'light-swing', name: 'Light Swing', info: '부드러운 스윙 (58:42, 약-강)', accentPattern: 'swing' as const },
        { id: 'swing', name: 'Standard Swing', info: '표준 스윙 (67:33, 약-강)', accentPattern: 'swing' as const },
        { id: 'triplet-shuffle', name: 'Triplet Shuffle', info: '트리플렛 셔플 (67:33, 강-약)', accentPattern: 'shuffle' as const },
        { id: 'hard-shuffle', name: 'Hard Shuffle', info: '하드 셔플 (75:25, 강-약)', accentPattern: 'shuffle' as const },
    ] as const;

    // Real-time Update Refs
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beatsPerMeasure);
    const subRef = useRef(subdivision);
    const swingRef = useRef(swingFactor);
    const accentRef = useRef(swingAccent);
    const soundIdRef = useRef(soundId);
    const rhythmNameRef = useRef(rhythmName);

    // Sync Refs with State
    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
    useEffect(() => { subRef.current = subdivision; }, [subdivision]);
    useEffect(() => { swingRef.current = swingFactor; }, [swingFactor]);
    useEffect(() => { accentRef.current = swingAccent; }, [swingAccent]);
    useEffect(() => { soundIdRef.current = soundId; }, [soundId]);
    useEffect(() => { rhythmNameRef.current = rhythmName; }, [rhythmName]);

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

    // Oscillator Sounds with Sound Type Control (Real-time)
    const playClick = useCallback((time: number, volume: number = 1.0) => {
        if (!audioContextRef.current) return;

        const osc = audioContextRef.current.createOscillator();
        const envelope = audioContextRef.current.createGain();

        envelope.gain.setValueAtTime(volume, time);

        // Sound Synthesis Logic - using ref for real-time updates
        switch (soundIdRef.current) {
            case 'wood':
                osc.type = 'sine';
                osc.frequency.setValueAtTime(volume > 0.6 ? 1000 : 700, time);
                envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.05);
                break;
            case 'elec':
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(volume > 0.6 ? 800 : 400, time);
                osc.frequency.exponentialRampToValueAtTime(80, time + 0.05);
                envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.12);
                break;
            case 'perc':
                osc.type = 'square';
                osc.frequency.setValueAtTime(volume > 0.6 ? 1200 : 900, time);
                envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.03);
                break;
            default:
                osc.type = 'sine';
                osc.frequency.setValueAtTime(volume > 0.6 ? 1200 : 800, time);
                envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
                break;
        }

        osc.connect(envelope);
        envelope.connect(audioContextRef.current.destination);

        osc.start(time);
        osc.stop(time + 0.15);
    }, []);

    const scheduleNote = useCallback((beatIndex: number, time: number) => {
        notesInQueueRef.current.push({ beat: beatIndex, time: time });

        const isOffBeat = beatIndex % 2 !== 0;

        let volume = 0.7;

        // Check rhythm style
        const currentRhythm = rhythmNameRef.current;
        const isSwing = currentRhythm.includes('Swing');
        const isShuffle = currentRhythm.includes('Shuffle');

        if (subRef.current > 1) {
            // Apply accent pattern based on rhythm style
            if (isSwing) {
                // Swing: 약-강 패턴 (off-beat accent)
                if (isOffBeat) {
                    volume = 1.0; // 두 번째 음표 강하게
                } else {
                    volume = 0.25; // 첫 번째 음표 약하게 (ghost)
                }
            } else if (isShuffle) {
                // Shuffle: 강-약 패턴 (on-beat accent)
                if (isOffBeat) {
                    volume = 0.25; // 두 번째 음표 약하게 (ghost)
                } else {
                    volume = 1.0; // 첫 번째 음표 강하게
                }
            } else {
                // Manual mode: slider controls accent pattern
                // 0% = 강-약 (Shuffle style), 100% = 약-강 (Swing style)
                const accentFactor = accentRef.current / 100; // 0.0 to 1.0

                if (isOffBeat) {
                    // Off-beat: 0.25 (at 0%) to 1.0 (at 100%)
                    volume = 0.25 + (accentFactor * 0.75);
                } else {
                    // On-beat: 1.0 (at 0%) to 0.25 (at 100%)
                    volume = 1.0 - (accentFactor * 0.75);
                }
            }
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

            // Swing/Shuffle Timing Logic (Corrected)
            if (subRef.current > 1 && swingRef.current > 0) {
                const isFirstOfPair = currentSubBeatRef.current % 2 === 0;

                // Calculate swing ratio: 0.5 (straight) to 0.75 (hard shuffle)
                const swingRatio = 0.5 + (swingRef.current / 100) * 0.25;
                const pairTime = subdivisionTime * 2;

                if (isFirstOfPair) {
                    // First note of pair: longer
                    actualDelay = pairTime * swingRatio;
                } else {
                    // Second note of pair: shorter
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

    // Play/Stop Control with explicit engine cleanup
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
        if (timerIDRef.current) return; // Prevent double start

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
        setRhythmName('Manual (수동)');
    }, []);

    // UI Handlers
    const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBpm(parseInt(e.target.value));
        releasePreset();
    };

    // Listen for Global Header Info Button
    useEffect(() => {
        const handleOpenInfo = () => setShowInfo(true);
        window.addEventListener('openMetronomeInfo', handleOpenInfo);
        return () => window.removeEventListener('openMetronomeInfo', handleOpenInfo);
    }, []);

    // Auto-stop metronome when leaving the route
    useEffect(() => {
        return () => {
            // Cleanup on component unmount (route change)
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
        stopEngine(); // Physically stop first

        let newSub = 2;
        let newSwing = 0;
        let newAccent = 70;
        let name = 'Straight';

        switch (type) {
            case 'straight':
                newSub = 1; newSwing = 0; newAccent = 50; name = 'Straight';
                break;
            case 'light-swing':
                newSub = 2; newSwing = 32; newAccent = 100; name = 'Light Swing';
                break;
            case 'swing':
                newSub = 2; newSwing = 67; newAccent = 100; name = 'Standard Swing';
                break;
            case 'triplet-shuffle':
                newSub = 2; newSwing = 67; newAccent = 0; name = 'Triplet Shuffle';
                break;
            case 'hard-shuffle':
                newSub = 2; newSwing = 100; newAccent = 0; name = 'Hard Shuffle';
                break;
        }

        setSubdivision(newSub);
        setSwingFactor(newSwing);
        setSwingAccent(newAccent);
        setRhythmName(name);

        subRef.current = newSub;
        swingRef.current = newSwing;
        accentRef.current = newAccent;

        setShowInfo(false);
        setShowRhythmList(false);

        setTimeout(() => {
            startEngine();
        }, 50);
    }, [stopEngine, startEngine]);


    return (
        <div className="metronome-container" onClick={() => setShowRhythmList(false)}>
            <div className="metronome-content">
                {showInfo && (
                    <div className="metronome-modal-overlay" onClick={() => setShowInfo(false)}>
                        <div className="metronome-info-modal" onClick={e => e.stopPropagation()}>
                            <div className="modal-header">
                                <h3>리듬 프리셋 & 가이드</h3>
                                <button className="modal-close-btn" onClick={() => setShowInfo(false)}>
                                    <i className="ri-close-line"></i>
                                </button>
                            </div>
                            <div className="modal-body">
                                <div className="info-item">
                                    <i className="ri-pulse-line"></i>
                                    <p><strong>박자:</strong> 마디 당 맥박 수를 조절하여 곡의 성격에 맞는 리듬을 설정합니다.</p>
                                </div>
                                <div className="info-item">
                                    <i className="ri-scissors-2-line"></i>
                                    <p><strong>분할:</strong> 한 박자를 8분, 16분 음표로 쪼개어 더 정밀한 연습을 돕습니다.</p>
                                </div>
                                <div className="info-item">
                                    <i className="ri-magic-line"></i>
                                    <p><strong>셔플:</strong> 분할 모드에서 '바운스' 감각을 더해 현대적인 리듬감을 연습할 수 있습니다.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="metronome-display-area">
                    {/* Visual Indicators */}
                    <div className="metronome-visualizer">
                        {Array.from({ length: beatsPerMeasure }).map((_, i) => {
                            // Calculate if this quarter beat is active
                            const isCurrent = Math.floor(visualBeat / subdivision) === i;
                            return (
                                <div
                                    key={i}
                                    className={`beat-indicator ${isCurrent ? 'is-active' : ''} ${i === 0 ? 'is-accent' : ''}`}
                                />
                            );
                        })}
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
                            {/* Sound Selector Bar */}
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

                            {/* Rhythm Selector Dropdown */}
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
                                                className={`dropdown-item ${rhythmName.includes(p.name) ? 'active' : ''}`}
                                                onClick={() => applyPreset(p.id)}
                                            >
                                                {p.name}
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
                                        currentSubBeatRef.current = 0; // Reset counter on change
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
                            <div className="setting-group">
                                <label className="setting-label">분할 (Subdivision)</label>
                                <select
                                    className="setting-select"
                                    value={subdivision}
                                    onChange={(e) => {
                                        setSubdivision(parseInt(e.target.value));
                                        setSwingFactor(0);
                                        currentSubBeatRef.current = 0;
                                        releasePreset();
                                    }}
                                >
                                    <option value="1">4분 음표 (Quarter)</option>
                                    <option value="2">8분 음표 (8th)</option>
                                    <option value="4">16분 음표 (16th)</option>
                                </select>
                            </div>
                        </div>

                        {subdivision > 1 && (
                            <div className="swing-control-area">
                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">Swing Ratio (타이밍 비율)</label>
                                        <span className="swing-value">{Math.round(50 + (swingFactor * 0.25))}%</span>
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

                                <div className="swing-group">
                                    <div className="swing-header">
                                        <label className="setting-label">Accent Pattern (강약 패턴)</label>
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
                                <p className="swing-hint">Ratio는 타이밍 비율을, Pattern은 강약 순서를 조정합니다. (0%=강약, 100%=약강)</p>
                            </div>
                        )}
                    </div>
                </div>

                <footer className="metronome-footer">
                    <button
                        className={`play-btn ${isPlaying ? 'is-playing' : ''}`}
                        onClick={togglePlay}
                    >
                        <i className={isPlaying ? 'ri-stop-mini-fill' : 'ri-play-mini-fill'}></i>
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default MetronomePage;
