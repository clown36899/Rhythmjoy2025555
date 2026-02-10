import React, { useState, useEffect, useRef, useCallback } from 'react';
import './metronome.css';

const MetronomePage: React.FC = () => {
    // State
    const [isPlaying, setIsPlaying] = useState(false);
    const [bpm, setBpm] = useState(120);
    const [beatsPerMeasure, setBeatsPerMeasure] = useState(4);
    const [subdivision, setSubdivision] = useState(1); // 1: Quarter, 2: 8th, 4: 16th
    const [swingFactor, setSwingFactor] = useState(0); // 0 (Straight) to 100 (Hard Swing)
    const [visualBeat, setVisualBeat] = useState(-1);
    const [showInfo, setShowInfo] = useState(false);

    // Real-time Update Refs (Allows scheduler to see latest values without interval restart)
    const bpmRef = useRef(bpm);
    const beatsRef = useRef(beatsPerMeasure);
    const subRef = useRef(subdivision);
    const swingRef = useRef(swingFactor);

    // Sync Refs with State
    useEffect(() => { bpmRef.current = bpm; }, [bpm]);
    useEffect(() => { beatsRef.current = beatsPerMeasure; }, [beatsPerMeasure]);
    useEffect(() => { subRef.current = subdivision; }, [subdivision]);
    useEffect(() => { swingRef.current = swingFactor; }, [swingFactor]);

    // Web Audio Refs
    const audioContextRef = useRef<AudioContext | null>(null);
    const nextNoteTimeRef = useRef(0);
    const timerIDRef = useRef<number | null>(null);
    const notesInQueueRef = useRef<{ beat: number, time: number }[]>([]);

    // Internal beat counting for scheduling
    const currentSubBeatRef = useRef(0);

    // Look-ahead parameters
    const lookahead = 25.0; // How frequently to call scheduler (ms)
    const scheduleAheadTime = 0.1; // How far ahead to schedule audio (sec)

    // Oscillator Sounds
    const playClick = useCallback((time: number, isAccent: boolean) => {
        if (!audioContextRef.current) return;

        const osc = audioContextRef.current.createOscillator();
        const envelope = audioContextRef.current.createGain();

        // High pitch for accent, lower for normal beats
        osc.frequency.setValueAtTime(isAccent ? 1200 : 800, time);

        envelope.gain.setValueAtTime(1, time);
        envelope.gain.exponentialRampToValueAtTime(0.001, time + 0.08);

        osc.connect(envelope);
        envelope.connect(audioContextRef.current.destination);

        osc.start(time);
        osc.stop(time + 0.1);
    }, []);

    const scheduleNote = useCallback((beatIndex: number, time: number) => {
        // Track for visual sync
        notesInQueueRef.current.push({ beat: beatIndex, time: time });

        // Beat Index 0 is the start of the measure
        const isAccent = beatIndex === 0;
        playClick(time, isAccent);
    }, [playClick]);

    const scheduler = useCallback(() => {
        if (!audioContextRef.current) return;

        // Use REFs to allow real-time changes without stopping the engine
        while (nextNoteTimeRef.current < audioContextRef.current.currentTime + scheduleAheadTime) {
            // Schedule the current note
            scheduleNote(currentSubBeatRef.current, nextNoteTimeRef.current);

            // Calculate timing for the NEXT note using LATEST values from Ref
            const secondsPerBeat = 60.0 / bpmRef.current;
            const subdivisionTime = secondsPerBeat / subRef.current;

            let actualDelay = subdivisionTime;

            // Swing/Shuffle Logic (Applies to even-numbered sub-beats in 8th/16th mode)
            if (subRef.current > 1 && swingRef.current > 0) {
                const isFirstOfPair = currentSubBeatRef.current % 2 === 0;

                if (isFirstOfPair) {
                    const swingOffset = (subdivisionTime * (swingRef.current / 100)) * 0.33;
                    actualDelay += swingOffset;
                } else {
                    const swingOffset = (subdivisionTime * (swingRef.current / 100)) * 0.33;
                    actualDelay -= swingOffset;
                }
            }

            nextNoteTimeRef.current += actualDelay;

            // Advance the beat counter using latest measure size
            currentSubBeatRef.current = (currentSubBeatRef.current + 1) % (beatsRef.current * subRef.current);
        }
    }, [scheduleNote]); // scheduler now only depends on scheduleNote

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
    const togglePlay = () => {
        if (!audioContextRef.current) {
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }

        if (isPlaying) {
            if (timerIDRef.current) window.clearInterval(timerIDRef.current);
            if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
            setIsPlaying(false);
            currentSubBeatRef.current = 0;
            setVisualBeat(-1);
            notesInQueueRef.current = [];
        } else {
            // Chrome/Safari AudioContext resume policy
            if (audioContextRef.current.state === 'suspended') {
                audioContextRef.current.resume();
            }

            nextNoteTimeRef.current = audioContextRef.current.currentTime + 0.05;
            currentSubBeatRef.current = 0;
            timerIDRef.current = window.setInterval(scheduler, lookahead);
            requestAnimationFrameRef.current = requestAnimationFrame(updateVisuals);
            setIsPlaying(true);
        }
    };

    // UI Handlers
    const handleBpmChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setBpm(parseInt(e.target.value));
    };

    useEffect(() => {
        return () => {
            if (timerIDRef.current) window.clearInterval(timerIDRef.current);
            if (requestAnimationFrameRef.current) cancelAnimationFrame(requestAnimationFrameRef.current);
        };
    }, []);

    return (
        <div className="metronome-container">
            <div className="metronome-content">
                <header className="metronome-header">
                    <div className="metronome-header-top">
                        <div className="title-group">
                            <h2 className="metronome-title">메트로놈</h2>
                            <p className="metronome-subtitle">정교한 리듬 엔진</p>
                        </div>
                        <button
                            className={`info-toggle-btn ${showInfo ? 'is-active' : ''}`}
                            onClick={() => setShowInfo(!showInfo)}
                            aria-label="도움말 토글"
                        >
                            <i className={showInfo ? 'ri-close-line' : 'ri-question-line'}></i>
                        </button>
                    </div>

                    {showInfo && (
                        <div className="metronome-guide-badge info-panel">
                            <i className="ri-information-line"></i>
                            <div className="info-text">
                                <p><strong>박자:</strong> 마디 당 맥박 수를 조절합니다.</p>
                                <p><strong>분할:</strong> 한 박자를 8분, 16분 음표로 쪼갭니다.</p>
                                <p><strong>셔플:</strong> 분할 모드에서 '바운스' 감각을 더합니다.</p>
                            </div>
                        </div>
                    )}
                </header>

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

                        <div className="rhythm-settings">
                            <div className="setting-group">
                                <label className="setting-label">박자 (Time Signature)</label>
                                <select
                                    className="setting-select"
                                    value={beatsPerMeasure}
                                    onChange={(e) => {
                                        setBeatsPerMeasure(parseInt(e.target.value));
                                        currentSubBeatRef.current = 0; // Reset counter on change
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
                                    }}
                                >
                                    <option value="1">4분 음표 (Quarter)</option>
                                    <option value="2">8분 음표 (8th)</option>
                                    <option value="4">16분 음표 (16th)</option>
                                </select>
                            </div>
                        </div>

                        {subdivision > 1 && (
                            <div className="swing-control">
                                <div className="swing-header">
                                    <label className="setting-label">셔플/스윙 강도</label>
                                    <span className="swing-value">{swingFactor}%</span>
                                </div>
                                <div className="swing-desc">리듬에 탄력을 주어 '바운스'를 조절합니다</div>
                                <input
                                    type="range"
                                    className="tempo-slider swing"
                                    min="0"
                                    max="100"
                                    value={swingFactor}
                                    onChange={(e) => setSwingFactor(parseInt(e.target.value))}
                                />
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
