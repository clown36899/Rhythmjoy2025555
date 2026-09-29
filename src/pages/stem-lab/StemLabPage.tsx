import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { createGrooveMasterOutput, type GrooveMasterOutput } from '../groove-lab/grooveAudio';
import {
    createInitialStemMix,
    formatStemTime,
    getLoopPositionSeconds,
    getStemGain,
    STEM_DEFINITIONS,
    STEM_DEMO_BEATS,
    STEM_DEMO_BPM,
    STEM_DEMO_SECONDS,
    type StemId,
    type StemMixState,
} from './stemDemo';
import { renderStemDemo } from './stemDemoAudio';
import './stem-lab.css';

type PrepareState = 'loading' | 'ready' | 'error';

const FALLBACK_WAVEFORMS = STEM_DEFINITIONS.reduce((result, stem, stemIndex) => ({
    ...result,
    [stem.id]: Array.from({ length: 52 }, (_, index) => (
        0.18 + (((index * 17) + (stemIndex * 11)) % 16) / 22
    )),
}), {} as Record<StemId, number[]>);

const StemLabPage: React.FC = () => {
    const [prepareState, setPrepareState] = useState<PrepareState>('loading');
    const [prepareError, setPrepareError] = useState('');
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentSeconds, setCurrentSeconds] = useState(0);
    const [masterVolume, setMasterVolume] = useState(82);
    const [soloStemId, setSoloStemId] = useState<StemId | null>(null);
    const [stemMix, setStemMix] = useState<Record<StemId, StemMixState>>(createInitialStemMix);
    const [waveforms, setWaveforms] = useState<Record<StemId, number[]>>(FALLBACK_WAVEFORMS);

    const audioContextRef = useRef<AudioContext | null>(null);
    const masterOutputRef = useRef<GrooveMasterOutput | null>(null);
    const stemBuffersRef = useRef<Record<StemId, AudioBuffer> | null>(null);
    const stemSourcesRef = useRef<Map<StemId, AudioBufferSourceNode>>(new Map());
    const stemGainNodesRef = useRef<Map<StemId, GainNode>>(new Map());
    const preparePromiseRef = useRef<Promise<void> | null>(null);
    const playbackAnchorRef = useRef(0);
    const pausedPositionRef = useRef(0);
    const animationFrameRef = useRef<number | null>(null);

    const audibleStemCount = useMemo(() => STEM_DEFINITIONS.filter((stem) => (
        getStemGain(stem.id, stemMix, soloStemId) > 0
    )).length, [soloStemId, stemMix]);

    const prepareStems = useCallback(async () => {
        if (stemBuffersRef.current) return;
        if (!preparePromiseRef.current) {
            setPrepareState('loading');
            setPrepareError('');
            preparePromiseRef.current = renderStemDemo()
                .then((rendered) => {
                    stemBuffersRef.current = rendered.buffers;
                    setWaveforms(rendered.waveforms);
                    setPrepareState('ready');
                })
                .catch((error) => {
                    console.error('[StemLab] Failed to render demo stems', error);
                    preparePromiseRef.current = null;
                    setPrepareState('error');
                    setPrepareError('샘플 소리를 준비하지 못했습니다. 다시 시도해 주세요.');
                    throw error;
                });
        }
        await preparePromiseRef.current;
    }, []);

    const ensureAudioGraph = useCallback(async () => {
        if (!audioContextRef.current) {
            const AudioContextClass = window.AudioContext
                || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) throw new Error('이 브라우저는 오디오 재생을 지원하지 않습니다.');
            const context = new AudioContextClass();
            audioContextRef.current = context;
            masterOutputRef.current = createGrooveMasterOutput(context, context.destination);
            STEM_DEFINITIONS.forEach((stem) => {
                const gain = context.createGain();
                gain.connect(masterOutputRef.current!.input);
                stemGainNodesRef.current.set(stem.id, gain);
            });
        }
        if (audioContextRef.current.state === 'suspended') await audioContextRef.current.resume();
        return audioContextRef.current;
    }, []);

    const stopSources = useCallback(() => {
        stemSourcesRef.current.forEach((source) => {
            try {
                source.stop();
            } catch {
                // A source may already have ended during an interrupted browser session.
            }
            source.disconnect();
        });
        stemSourcesRef.current.clear();
    }, []);

    const applyMix = useCallback((context: AudioContext) => {
        STEM_DEFINITIONS.forEach((stem) => {
            const node = stemGainNodesRef.current.get(stem.id);
            if (!node) return;
            const gain = getStemGain(stem.id, stemMix, soloStemId);
            node.gain.cancelScheduledValues(context.currentTime);
            node.gain.setTargetAtTime(gain, context.currentTime, 0.012);
        });
        const master = masterOutputRef.current;
        if (master) {
            master.input.gain.cancelScheduledValues(context.currentTime);
            master.input.gain.setTargetAtTime(masterVolume / 100, context.currentTime, 0.012);
        }
    }, [masterVolume, soloStemId, stemMix]);

    const startSources = useCallback((context: AudioContext, offsetSeconds: number) => {
        const buffers = stemBuffersRef.current;
        if (!buffers) return false;
        stopSources();
        const safeOffset = Math.min(STEM_DEMO_SECONDS - 0.001, Math.max(0, offsetSeconds));
        const startAt = context.currentTime + 0.055;
        STEM_DEFINITIONS.forEach((stem) => {
            const source = context.createBufferSource();
            source.buffer = buffers[stem.id];
            source.loop = true;
            source.loopStart = 0;
            source.loopEnd = buffers[stem.id].duration;
            source.connect(stemGainNodesRef.current.get(stem.id)!);
            source.start(startAt, safeOffset);
            stemSourcesRef.current.set(stem.id, source);
        });
        playbackAnchorRef.current = startAt - safeOffset;
        return true;
    }, [stopSources]);

    const handlePlayPause = useCallback(async () => {
        if (isPlaying) {
            const context = audioContextRef.current;
            if (context) {
                const position = getLoopPositionSeconds(context.currentTime, playbackAnchorRef.current);
                pausedPositionRef.current = position;
                setCurrentSeconds(position);
            }
            stopSources();
            setIsPlaying(false);
            return;
        }

        try {
            await prepareStems();
            const context = await ensureAudioGraph();
            applyMix(context);
            if (startSources(context, pausedPositionRef.current)) setIsPlaying(true);
        } catch (error) {
            setPrepareState('error');
            setPrepareError(error instanceof Error ? error.message : '오디오를 시작하지 못했습니다.');
        }
    }, [applyMix, ensureAudioGraph, isPlaying, prepareStems, startSources, stopSources]);

    const handleRestart = useCallback(async () => {
        pausedPositionRef.current = 0;
        setCurrentSeconds(0);
        if (!isPlaying) return;
        const context = audioContextRef.current;
        if (context) startSources(context, 0);
    }, [isPlaying, startSources]);

    const enableFullMix = () => {
        setSoloStemId(null);
        setStemMix((current) => STEM_DEFINITIONS.reduce((next, stem) => ({
            ...next,
            [stem.id]: { ...current[stem.id], enabled: true },
        }), current));
    };

    const muteAll = () => {
        setSoloStemId(null);
        setStemMix((current) => STEM_DEFINITIONS.reduce((next, stem) => ({
            ...next,
            [stem.id]: { ...current[stem.id], enabled: false },
        }), current));
    };

    const toggleStem = (stemId: StemId) => {
        setStemMix((current) => ({
            ...current,
            [stemId]: { ...current[stemId], enabled: !current[stemId].enabled },
        }));
        if (soloStemId === stemId) setSoloStemId(null);
    };

    const toggleSolo = (stemId: StemId) => {
        const nextSolo = soloStemId === stemId ? null : stemId;
        setSoloStemId(nextSolo);
        if (nextSolo) {
            setStemMix((current) => ({
                ...current,
                [stemId]: { ...current[stemId], enabled: true },
            }));
        }
    };

    const updateStemVolume = (stemId: StemId, volume: number) => {
        setStemMix((current) => ({
            ...current,
            [stemId]: { ...current[stemId], volume },
        }));
    };

    useEffect(() => {
        void prepareStems().catch(() => undefined);
    }, [prepareStems]);

    useEffect(() => {
        const context = audioContextRef.current;
        if (context) applyMix(context);
    }, [applyMix]);

    useEffect(() => {
        if (!isPlaying) {
            if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
            return undefined;
        }
        const animate = () => {
            const context = audioContextRef.current;
            if (context) {
                const position = getLoopPositionSeconds(context.currentTime, playbackAnchorRef.current);
                pausedPositionRef.current = position;
                setCurrentSeconds(position);
            }
            animationFrameRef.current = window.requestAnimationFrame(animate);
        };
        animationFrameRef.current = window.requestAnimationFrame(animate);
        return () => {
            if (animationFrameRef.current !== null) window.cancelAnimationFrame(animationFrameRef.current);
            animationFrameRef.current = null;
        };
    }, [isPlaying]);

    useEffect(() => () => {
        stopSources();
        masterOutputRef.current?.dispose();
        stemGainNodesRef.current.forEach((gain) => gain.disconnect());
        stemGainNodesRef.current.clear();
        void audioContextRef.current?.close();
    }, [stopSources]);

    const progress = (currentSeconds / STEM_DEMO_SECONDS) * 100;
    const fullMixOn = audibleStemCount === STEM_DEFINITIONS.length && soloStemId === null;

    return (
        <main className="stem-lab-page" onDragStart={(event) => event.preventDefault()}>
            <div className="stem-lab-content">
                <header className="stem-lab-header">
                    <div>
                        <span className="stem-lab-eyebrow">STEM PLAYER · FUNCTION SAMPLE</span>
                        <h1>악기 분리 플레이어</h1>
                        <p>분리 완료된 네 악기를 한 시간축에서 켜고 끄는 독립 샘플입니다.</p>
                    </div>
                    <span className={`stem-lab-ready stem-lab-ready--${prepareState}`}>
                        <i className={prepareState === 'ready' ? 'ri-checkbox-circle-fill' : prepareState === 'error' ? 'ri-error-warning-fill' : 'ri-loader-4-line'} aria-hidden="true" />
                        {prepareState === 'ready' ? '4 STEMS READY' : prepareState === 'error' ? 'LOAD ERROR' : 'RENDERING'}
                    </span>
                </header>

                <section className="stem-lab-notice" aria-label="샘플 범위">
                    <i className="ri-flask-line" aria-hidden="true" />
                    <p>
                        <strong>AI 분리 품질 테스트가 아니라 플레이어 기능 샘플입니다.</strong>
                        현재는 처음부터 분리해 만든 합성 악기 루프를 사용하며, 실제 음원 업로드·AI 분석은 아직 연결하지 않았습니다.
                    </p>
                </section>

                <section className="stem-lab-player" aria-labelledby="stem-demo-title">
                    <div className="stem-lab-song">
                        <div className="stem-lab-cover" aria-hidden="true">
                            <i className="ri-sound-module-line" />
                        </div>
                        <div>
                            <span>DEMO LOOP · {STEM_DEMO_BPM} BPM</span>
                            <h2 id="stem-demo-title">Midnight Four</h2>
                            <p>드럼 · 콘트라베이스 · 피아노 · 멜로디 기타</p>
                        </div>
                        <span className="stem-lab-loop-badge">4마디 반복</span>
                    </div>

                    <div className="stem-lab-overview-wave" aria-label={`재생 위치 ${formatStemTime(currentSeconds)} / ${formatStemTime(STEM_DEMO_SECONDS)}`}>
                        <div className="stem-lab-overview-bars" aria-hidden="true">
                            {FALLBACK_WAVEFORMS.drums.map((height, index) => (
                                <span key={index} style={{ height: `${22 + (height * 70)}%` }} />
                            ))}
                        </div>
                        <span className="stem-lab-playhead" style={{ left: `${progress}%` }} aria-hidden="true" />
                        <div className="stem-lab-beat-scale" aria-hidden="true">
                            {Array.from({ length: STEM_DEMO_BEATS }, (_, beat) => (
                                <i key={beat} className={beat % 4 === 0 ? 'is-bar' : ''} style={{ left: `${(beat / STEM_DEMO_BEATS) * 100}%` }} />
                            ))}
                        </div>
                    </div>

                    <div className="stem-lab-time-row">
                        <span>{formatStemTime(currentSeconds)}</span>
                        <strong aria-live="polite">{audibleStemCount}개 악기 {isPlaying ? '재생 중' : '선택됨'}</strong>
                        <span>{formatStemTime(STEM_DEMO_SECONDS)}</span>
                    </div>

                    {prepareState === 'error' && (
                        <p className="stem-lab-error" role="alert">{prepareError}</p>
                    )}

                    <div className="stem-lab-transport">
                        <button type="button" className="stem-lab-restart" onClick={handleRestart} aria-label="처음부터 다시 듣기">
                            <i className="ri-restart-line" aria-hidden="true" />
                        </button>
                        <button
                            type="button"
                            className={`stem-lab-play ${isPlaying ? 'is-playing' : ''}`}
                            onClick={handlePlayPause}
                            disabled={prepareState === 'loading'}
                            aria-label={isPlaying ? '일시 정지' : '재생'}
                        >
                            <i className={isPlaying ? 'ri-pause-fill' : 'ri-play-fill'} aria-hidden="true" />
                            <span>{prepareState === 'loading' ? '준비 중' : isPlaying ? '일시 정지' : '전체 재생'}</span>
                        </button>
                        <label className="stem-lab-master-volume">
                            <span><i className="ri-volume-up-line" aria-hidden="true" /> 전체 {masterVolume}%</span>
                            <input
                                type="range"
                                min="0"
                                max="100"
                                value={masterVolume}
                                onChange={(event) => setMasterVolume(Number(event.target.value))}
                                aria-label="전체 음량"
                            />
                        </label>
                    </div>
                </section>

                <section className="stem-lab-mixer" aria-labelledby="stem-mixer-title">
                    <div className="stem-lab-section-title">
                        <div>
                            <span>SEPARATED TRACKS</span>
                            <h2 id="stem-mixer-title">악기별로 듣기</h2>
                        </div>
                        <div className="stem-lab-mix-actions">
                            <button type="button" className={fullMixOn ? 'active' : ''} onClick={enableFullMix}>
                                <i className="ri-group-fill" aria-hidden="true" /> 전체
                            </button>
                            <button type="button" onClick={muteAll}>
                                <i className="ri-volume-mute-line" aria-hidden="true" /> 모두 끄기
                            </button>
                        </div>
                    </div>

                    <div className="stem-lab-track-list">
                        {STEM_DEFINITIONS.map((stem) => {
                            const state = stemMix[stem.id];
                            const isSolo = soloStemId === stem.id;
                            const isAudible = getStemGain(stem.id, stemMix, soloStemId) > 0;
                            return (
                                <article
                                    key={stem.id}
                                    className={`stem-lab-track ${isAudible ? 'is-audible' : 'is-muted'} ${isSolo ? 'is-solo' : ''}`}
                                    style={{ '--stem-color': stem.color } as React.CSSProperties}
                                >
                                    <div className="stem-lab-track-head">
                                        <span className="stem-lab-track-icon"><i className={stem.icon} aria-hidden="true" /></span>
                                        <div>
                                            <span>{stem.role}</span>
                                            <h3>{stem.label}</h3>
                                            <p>{stem.description}</p>
                                        </div>
                                        <div className="stem-lab-track-buttons">
                                            <button
                                                type="button"
                                                className={state.enabled ? 'is-on' : ''}
                                                onClick={() => toggleStem(stem.id)}
                                                aria-pressed={state.enabled}
                                                aria-label={`${stem.label} ${state.enabled ? '끄기' : '켜기'}`}
                                            >
                                                {state.enabled ? 'ON' : 'OFF'}
                                            </button>
                                            <button
                                                type="button"
                                                className={isSolo ? 'is-solo' : ''}
                                                onClick={() => toggleSolo(stem.id)}
                                                aria-pressed={isSolo}
                                                aria-label={`${stem.label} 솔로 ${isSolo ? '해제' : '듣기'}`}
                                            >
                                                S
                                            </button>
                                        </div>
                                    </div>

                                    <div className="stem-lab-track-wave" aria-hidden="true">
                                        <div className="stem-lab-track-wave-bars">
                                            {waveforms[stem.id].map((height, index) => (
                                                <span key={index} style={{ height: `${Math.round(height * 100)}%` }} />
                                            ))}
                                        </div>
                                        <i className="stem-lab-track-playhead" style={{ left: `${progress}%` }} />
                                    </div>

                                    <label className="stem-lab-track-volume">
                                        <i className="ri-volume-down-line" aria-hidden="true" />
                                        <input
                                            type="range"
                                            min="0"
                                            max="100"
                                            value={state.volume}
                                            onChange={(event) => updateStemVolume(stem.id, Number(event.target.value))}
                                            aria-label={`${stem.label} 음량`}
                                        />
                                        <output>{state.volume}%</output>
                                    </label>
                                </article>
                            );
                        })}
                    </div>
                </section>

                <section className="stem-lab-next">
                    <div>
                        <span>NEXT CONNECTION</span>
                        <h2>실제 음악 분석은 다음 단계</h2>
                        <p>업로드 → AI 4스템 분리 → 이 플레이어에 자동 연결하는 처리 서버가 추가로 필요합니다.</p>
                    </div>
                    <div className="stem-lab-next-flow" aria-label="향후 처리 흐름">
                        <span><i className="ri-upload-cloud-2-line" aria-hidden="true" /> 음원</span>
                        <i className="ri-arrow-right-line" aria-hidden="true" />
                        <span><i className="ri-cpu-line" aria-hidden="true" /> AI 분리</span>
                        <i className="ri-arrow-right-line" aria-hidden="true" />
                        <span><i className="ri-sound-module-line" aria-hidden="true" /> 4트랙</span>
                    </div>
                    <Link to="/groove-lab">기존 그루브랩으로 돌아가기 <i className="ri-arrow-right-line" aria-hidden="true" /></Link>
                </section>
            </div>
        </main>
    );
};

export default StemLabPage;
