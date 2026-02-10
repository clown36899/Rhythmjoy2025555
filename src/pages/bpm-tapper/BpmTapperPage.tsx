import React, { useState, useCallback, useRef, useEffect } from 'react';
import './bpm-tapper.css';

const BpmTapperPage: React.FC = () => {
    const [bpm, setBpm] = useState<number | null>(null);
    const [taps, setTaps] = useState<number[]>([]);
    const [isTapping, setIsTapping] = useState(false);
    const tapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const handleTap = useCallback(() => {
        const now = Date.now();
        setIsTapping(true);

        // Reset visual effect after short delay
        if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        tapTimeoutRef.current = setTimeout(() => setIsTapping(false), 100);

        setTaps(prev => {
            const newTaps = [...prev, now];
            // Keep only last 12 taps for a moving average
            const recentTaps = newTaps.slice(-12);

            if (recentTaps.length >= 2) {
                const intervals = [];
                for (let i = 1; i < recentTaps.length; i++) {
                    intervals.push(recentTaps[i] - recentTaps[i - 1]);
                }

                // If gap is too large (> 3 seconds), start over
                const lastGap = now - (prev[prev.length - 1] || now);
                if (lastGap > 3000) {
                    return [now];
                }

                const averageInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
                const calculatedBpm = Math.round(60000 / averageInterval);
                setBpm(calculatedBpm);
            }

            return recentTaps;
        });
    }, []);

    const resetBpm = useCallback(() => {
        setTaps([]);
        setBpm(null);
    }, []);

    // Cleanup timeout on unmount
    useEffect(() => {
        return () => {
            if (tapTimeoutRef.current) clearTimeout(tapTimeoutRef.current);
        };
    }, []);

    return (
        <div className="bpm-tapper-container">
            <div className="bpm-tapper-content">
                <header className="bpm-tapper-header">
                    <h2 className="bpm-tapper-title">BPM 측정기</h2>
                    <p className="bpm-tapper-subtitle">음악에 맞춰 화면을 탭하세요</p>
                </header>

                <div className="bpm-display-area">
                    <div className={`bpm-circle ${isTapping ? 'is-active' : ''}`} onClick={handleTap}>
                        <div className="bpm-value-wrapper">
                            <span className="bpm-number">{bpm || '--'}</span>
                            <span className="bpm-label">BPM</span>
                        </div>
                        <div className="bpm-pulse-ring"></div>
                    </div>
                </div>

                <div className="bpm-stats">
                    <div className="stat-item">
                        <span className="stat-label">탭 횟수</span>
                        <span className="stat-value">{taps.length}</span>
                    </div>
                </div>

                <footer className="bpm-tapper-footer">
                    <button className="bpm-reset-btn" onClick={resetBpm}>
                        <i className="ri-refresh-line"></i> 초기화
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default BpmTapperPage;
