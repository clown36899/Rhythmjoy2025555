import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
    isTempoToolItemHidden,
    useTempoToolVisibilitySettings,
} from '../../hooks/useTempoToolVisibilitySettings';
import './bpm-tapper.css';

const TAP_HISTORY_LIMIT = 12;
const TAP_RESET_MS = 3000;
const MIN_TAP_INTERVAL_MS = 180;
const TAP_SOUND_GAIN = 0.46;

type Measurement = {
    bpm: number;
    confidence: number | null;
};

const getTrimmedIntervals = (intervals: number[]) => {
    if (intervals.length < 4) return intervals;

    return [...intervals]
        .sort((a, b) => a - b)
        .slice(1, -1);
};

const measureBpm = (tapTimes: number[]): Measurement | null => {
    if (tapTimes.length < 2) return null;

    const intervals = tapTimes.slice(1).map((tap, index) => tap - tapTimes[index]);
    const usableIntervals = getTrimmedIntervals(intervals);
    const averageInterval = usableIntervals.reduce((sum, interval) => sum + interval, 0) / usableIntervals.length;

    if (!Number.isFinite(averageInterval) || averageInterval <= 0) return null;

    const variance = usableIntervals.reduce((sum, interval) => {
        const delta = interval - averageInterval;
        return sum + delta * delta;
    }, 0) / usableIntervals.length;
    const consistency = Math.sqrt(variance) / averageInterval;
    const confidence = intervals.length >= 3
        ? Math.max(0, Math.min(100, Math.round(100 - consistency * 220)))
        : null;

    return {
        bpm: Math.round(60000 / averageInterval),
        confidence
    };
};

const BpmTapperPageInner: React.FC = () => {
    const [bpm, setBpm] = useState<number | null>(null);
    const [taps, setTaps] = useState<number[]>([]);
    const [isTapping, setIsTapping] = useState(false);
    const [confidence, setConfidence] = useState<number | null>(null);
    const tapTimeoutRef = useRef<ReturnType<typeof window.setTimeout> | null>(null);
    const tapTimesRef = useRef<number[]>([]);
    const audioContextRef = useRef<AudioContext | null>(null);

    const confidenceLabel = useMemo(() => {
        if (confidence === null) return taps.length >= 3 ? '측정중' : '--';
        if (confidence >= 82) return '안정';
        if (confidence >= 62) return '보통';
        return '흔들림';
    }, [confidence, taps.length]);

    const playTapFeedback = useCallback(() => {
        try {
            const AudioContextClass = window.AudioContext || (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
            if (!AudioContextClass) return;

            const context = audioContextRef.current ?? new AudioContextClass();
            audioContextRef.current = context;

            if (context.state === 'suspended') {
                void context.resume();
            }

            const startTime = context.currentTime + 0.002;
            const oscillator = context.createOscillator();
            const gain = context.createGain();
            const filter = context.createBiquadFilter();

            oscillator.type = 'triangle';
            oscillator.frequency.setValueAtTime(1160, startTime);
            oscillator.frequency.exponentialRampToValueAtTime(780, startTime + 0.04);

            filter.type = 'bandpass';
            filter.frequency.setValueAtTime(1600, startTime);
            filter.Q.setValueAtTime(6, startTime);

            gain.gain.setValueAtTime(0.0001, startTime);
            gain.gain.exponentialRampToValueAtTime(TAP_SOUND_GAIN, startTime + 0.004);
            gain.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.045);

            oscillator.connect(filter);
            filter.connect(gain);
            gain.connect(context.destination);
            oscillator.start(startTime);
            oscillator.stop(startTime + 0.06);
        } catch {
            // Audio feedback is optional; tap measurement must continue even if Web Audio is blocked.
        }
    }, []);

    const handleTap = useCallback(() => {
        const now = performance.now();
        setIsTapping(true);
        playTapFeedback();

        if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = setTimeout(() => setIsTapping(false), 100);

        const previousTaps = tapTimesRef.current;
        const previousTap = previousTaps[previousTaps.length - 1];
        const intervalFromLastTap = previousTap !== undefined ? now - previousTap : null;

        if (intervalFromLastTap !== null && intervalFromLastTap < MIN_TAP_INTERVAL_MS) return;

        const nextTaps = intervalFromLastTap !== null && intervalFromLastTap > TAP_RESET_MS
            ? [now]
            : [...previousTaps, now].slice(-TAP_HISTORY_LIMIT);
        const nextMeasurement = measureBpm(nextTaps);

        tapTimesRef.current = nextTaps;
        setTaps(nextTaps);
        setBpm(nextMeasurement?.bpm ?? null);
        setConfidence(nextMeasurement?.confidence ?? null);
    }, [playTapFeedback]);

    const resetBpm = useCallback(() => {
        tapTimesRef.current = [];
        setTaps([]);
        setBpm(null);
        setConfidence(null);
    }, []);

    useEffect(() => {
        return () => {
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
            void audioContextRef.current?.close();
        };
    }, []);

    useEffect(() => {
        document.documentElement.classList.add('bpm-tapper-page-active');
        return () => document.documentElement.classList.remove('bpm-tapper-page-active');
    }, []);

    return (
        <div className="bpm-tapper-container">
            <div className="bpm-tapper-content">
                <header className="bpm-tapper-header">
                    <h2 className="bpm-tapper-title">BPM 측정기</h2>
                    <p className="bpm-tapper-subtitle">음악에 맞춰 화면을 탭하세요</p>
                </header>

                <button
                    type="button"
                    className="bpm-display-area"
                    onClick={handleTap}
                    aria-label="BPM 탭 입력"
                >
                    <div className={`bpm-circle ${isTapping ? 'is-active' : ''}`}>
                        <div className="bpm-value-wrapper">
                            <span className="bpm-number" aria-live="polite">{bpm ?? 0}</span>
                            <span className="bpm-label">BPM</span>
                        </div>
                        <div className="bpm-pulse-ring"></div>
                    </div>
                </button>

                <div className="bpm-stats">
                    <div className="stat-item bpm-stat-item">
                        <span className="stat-label">탭 횟수</span>
                        <span className="stat-value">{taps.length}</span>
                    </div>
                    <div className="stat-item bpm-stat-item">
                        <span className="stat-label">안정도</span>
                        <span className="stat-value">{confidenceLabel}</span>
                    </div>
                </div>

                <footer className="bpm-tapper-footer">
                    <button type="button" className="bpm-action-btn bpm-reset-btn" onClick={resetBpm}>
                        <i className="ri-refresh-line"></i> 초기화
                    </button>
                </footer>
            </div>
        </div>
    );
};

const BpmTapperPage: React.FC = () => {
    const { isAdmin, isAuthCheckComplete } = useAuth();
    const {
        settings: tempoToolVisibilitySettings,
        isLoading: isTempoToolVisibilityLoading,
    } = useTempoToolVisibilitySettings();
    const isAccessCheckPending = isTempoToolVisibilityLoading || !isAuthCheckComplete;
    const isAccessBlocked = isTempoToolItemHidden(tempoToolVisibilitySettings, 'bpm-tapper') && !isAdmin;

    if (isAccessCheckPending) return null;
    if (isAccessBlocked) return <Navigate to="/" replace />;

    return <BpmTapperPageInner />;
};

export default BpmTapperPage;
