import { useState, useEffect, useMemo } from 'react';
import { useMonthlyBillboard } from '../../hooks/useMonthlyBillboard';
import MonthlyLogDetailModal from './MonthlyLogDetailModal';

// --- Premium Dark Mode Colors (Used for Chart Logic & Dynamic Styles) ---
const colors = {
    bg: 'rgba(255,255,255,0.02)',
    border: 'rgba(255,255,255,0.06)',
    highlight: '#fbbf24', // Amber 400
    textMain: '#f4f4f5', // Zinc 100
    textSub: '#a1a1aa',  // Zinc 400
    class: '#3b82f6',    // Blue 500
    event: '#f43f5e',    // Rose 500
};

const mwStyles = `
                /* Container & Layout */
                .mw-container {
                    padding: 4px;
                    color: #f4f4f5;
                    font-family: 'Pretendard', sans-serif;
                }
                .mw-dashboard {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                    min-height: 0;
                }
                
                .mw-grid {
                    display: grid;
                    grid-template-columns: 1fr;
                    gap: 8px;
                    flex: 1;
                    min-height: 0;
                }
                .mw-col {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    flex: 1;
                    min-height: 0;
                }
                .scroll-list {
                    flex: 1;
                    min-height: 0;
                    overflow: visible !important; /* Allow parent to handle scroll */
                    padding-right: 4px;
                    -webkit-overflow-scrolling: touch;
                    touch-action: pan-y !important;
                    pointer-events: auto !important;
                }

                @media (min-width: 1024px) {
                    .mw-dashboard {
                        display: grid;
                        grid-template-rows: auto 1fr;
                        height: 75vh;
                        gap: 0;
                    }
                    .mw-grid {
                        grid-template-columns: 1fr 1.1fr 0.9fr;
                        height: 100%;
                    }
                    .mw-col {
                        height: 100%;
                    }
                    .scroll-list {
                        overflow-y: auto !important; /* Internal scroll only on Desktop Wide */
                    }
                }

                /* Header Components */
                .mw-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
                .mw-eyebrow { font-size: 10px; font-weight: 800; color: #fbbf24; margin-bottom: 4px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9; }
                .mw-headline { 
                    font-size: 18px; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.5px;
                    background: linear-gradient(to right, #fff, #a1a1aa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .mw-meta-box {
                    font-size: 10px; color: #a1a1aa; background: rgba(255,255,255,0.03);
                    padding: 4px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);
                    text-align: right; cursor: pointer; transition: all 0.2s ease;
                }
                .mw-meta-box:hover { background: rgba(255,255,255,0.08); border-color: rgba(251, 191, 36, 0.3); transform: translateY(-1px); }
                .mw-meta-box:active { transform: translateY(0); opacity: 0.8; }
                .mw-highlight-dot { color: #fbbf24; }
                .mw-meta-sub { opacity: 0.6; }

                /* Cards */
                .mw-card {
                    background: rgba(255,255,255,0.02);
                    border-radius: 12px;
                    border: 1px solid rgba(255,255,255,0.06);
                    padding: 12px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                    min-height: 0; /* CRITICAL for Flex Scroll Chain */
                }
                .mw-card.flex-1 { flex: 1; }
                .mw-card.padding-lg { padding: 14px; }
                .mw-card.no-bg { background: rgba(255,255,255,0.01); border: none; padding: 12px 4px 12px 14px; }

                .mw-section-title {
                    font-size: 13px; font-weight: 700; color: #f4f4f5; margin-bottom: 12px;
                    display: flex; align-items: center; gap: 8px; letter-spacing: -0.3px; margin-top: 0;
                }
                .metric-badge {
                    font-size: 9px; padding: 2px 6px; border-radius: 4px;
                    background: rgba(251, 191, 36, 0.1); color: #fbbf24;
                    border: 1px solid rgba(251, 191, 36, 0.2); font-weight: 600;
                    letter-spacing: 0;
                }

                /* Content Specifics */
                .mw-desc { font-size: 12px; color: #d4d4d8; margin-bottom: 20px; line-height: 1.5; }
                .mw-desc-sm { font-size: 11px; color: #d4d4d8; margin-bottom: 16px; line-height: 1.4; }
                .mw-desc-sub { font-size: 11px; color: #a1a1aa; margin-top: 4px; display: block; }
                
                .text-class { color: #3b82f6; font-weight: 700; }
                .text-event { color: #f43f5e; font-weight: 700; }

                /* Lifecycle Chart (Standard) */
                .lc-chart-container { flex: 1; position: relative; min-height: 90px; margin-bottom: 8px; }
                .lc-svg { position: absolute; top: 0; left: 6%; width: 88%; height: calc(100% - 12px); z-index: 0; overflow: visible; }
                .lc-bars-container { display: flex; align-items: flex-end; justify-content: space-between; height: 100%; padding-bottom: 20px; position: relative; z-index: 1; }
                .lc-bar-col { width: 12%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; cursor: pointer; position: relative; }
                .lc-class-bar { width: 5px; background: #3b82f6; border-radius: 2.5px; opacity: 0.9; }
                .lc-event-bar { width: 5px; background: #f43f5e; border-radius: 2.5px; margin-bottom: 1.5px; opacity: 0.9; }
                .lc-day-label { position: absolute; bottom: -20px; font-size: 10px; font-weight: 600; color: #a1a1aa; }
                .lc-active-dot {
                    position: absolute; width: 8px; height: 8px; background: #fbbf24;
                    border-radius: 50%; border: 2px solid #18181b; box-shadow: 0 0 8px rgba(251, 191, 36, 0.5);
                    transition: bottom 0.3s cubic-bezier(0.34, 1.56, 0.64, 1);
                    z-index: 5;
                }
                .lc-tooltip {
                    position: absolute; background: rgba(0, 0, 0, 0.85); color: #fff;
                    padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800;
                    white-space: nowrap; z-index: 15; pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.5);
                    border: 1px solid rgba(255,255,255,0.1);
                    backdrop-filter: blur(4px);
                }
                .lc-legend { display: flex; justify-content: center; gap: 16px; margin-top: 24px; }
                .legend-item { font-size: 10px; display: flex; align-items: center; color: #a1a1aa; }
                .dot-event { width: 6px; height: 6px; background: #f43f5e; border-radius: 2px; margin-right: 6px; }
                .dot-class { width: 6px; height: 6px; background: #3b82f6; border-radius: 2px; margin-right: 6px; }
                .dot-traffic { width: 10px; height: 2px; background: #fbbf24; margin-right: 6px; }
                
                /* Hourly Chart (Standard) */
                .hourly-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
                .btn-toggle { 
                    font-size: 10px; padding: 4px 10px; border-radius: 8px; 
                    background: rgba(255,255,255,0.05); color: #a1a1aa; 
                    border: 1px solid rgba(255,255,255,0.08); cursor: pointer;
                    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                    font-weight: 600;
                }
                .btn-toggle.active { background: #fbbf24; color: #000; border-color: #fbbf24; }
                .btn-toggle:hover:not(.active) { background: rgba(255,255,255,0.12); color: #fff; border-color: rgba(255,255,255,0.2); }

                .graph-container { height: 60px; position: relative; width: 100%; margin-bottom: 4px; }
                .graph-line-grid { stroke: rgba(255,255,255,0.03); stroke-width: 1; }
                .graph-polyline { fill: none; stroke-width: 2.5; stroke-linecap: round; stroke-linejoin: round; transition: all 0.3s ease; filter: drop-shadow(0 0 2px rgba(0,0,0,0.5)); }
                .graph-polyline-class { stroke: #3b82f6; filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.3)); }
                .graph-polyline-event { stroke: #f43f5e; filter: drop-shadow(0 0 4px rgba(244, 63, 94, 0.3)); }
                
                .graph-area-fill {
                    fill: currentColor;
                    opacity: 0.05;
                    transition: all 0.5s ease;
                }
                .graph-area-fill.active { opacity: 0.15; }

                .graph-y-label {
                    position: absolute; right: 0; font-size: 8px; font-weight: 800;
                    color: rgba(251, 191, 36, 0.6); pointer-events: none;
                }

                .graph-xaxis { display: flex; justify-content: space-between; font-size: 9px; color: #52525b; padding: 0 4px; font-weight: 600; margin-bottom: 12px; }
                
                .graph-interaction-layer {
                    position: absolute; inset: 0; display: flex; z-index: 10;
                }
                .graph-hour-zone { flex: 1; height: 100%; cursor: crosshair; }
                
                .graph-hover-line {
                    position: absolute; top: 0; bottom: 0; width: 1px;
                    background: rgba(251, 191, 36, 0.4); pointer-events: none; z-index: 5;
                }
                
                .graph-tooltip {
                    position: absolute; background: rgba(0, 0, 0, 0.9);
                    padding: 8px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);
                    backdrop-filter: blur(8px); z-index: 20; pointer-events: none;
                    box-shadow: 0 8px 24px rgba(0,0,0,0.4); min-width: 80px;
                }
                .gt-time { font-size: 10px; font-weight: 800; color: #fbbf24; margin-bottom: 4px; display: block; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 2px; }
                .gt-row { display: flex; justify-content: space-between; gap: 8px; font-size: 10px; margin-top: 2px; }
                .gt-label { color: #a1a1aa; }
                .gt-val { font-weight: 700; }
                .gt-val.class { color: #3b82f6; }
                .gt-val.event { color: #f43f5e; }

                .hourly-legend { display: flex; gap: 10px; justify-content: flex-end; }
                .hourly-legend-item { font-size: 9px; display: flex; align-items: center; color: #71717a; gap: 4px; }
                .hl-dot { width: 6px; height: 6px; border-radius: 1px; }

                /* Lead Time */
                .lead-grid { display: flex; flex-direction: column; gap: 8px; flex: 1; }
                .lead-item { display: flex; align-items: center; justify-content: space-between; padding: 10px 12px; border-radius: 8px; }
                .lead-item.class { background: rgba(59, 130, 246, 0.08); border: 1px solid rgba(59, 130, 246, 0.15); }
                .lead-item.event { background: rgba(244, 63, 94, 0.08); border: 1px solid rgba(244, 63, 94, 0.15); }
                .lead-label { font-size: 10px; font-weight: 700; }
                .lead-label-sub { font-size: 12px; color: #fff; }
                .lead-value { font-size: 16px; font-weight: 800; color: #fff; text-align: right; }
                .lead-unit { font-size: 10px; font-weight: 400; margin-left: 2px; }
                .lead-caption { fontSize: 9px; opacity: 0.7; text-align: right; }
                .text-blue-400 { color: #60a5fa; }
                .text-blue-300 { color: #93c5fd; }
                .text-rose-400 { color: #fb7185; }
                .text-rose-300 { color: #fca5a5; }

                /* Ranking */
                .ranking-container { flex: 1; display: flex; flex-direction: column; gap: 6px; padding-right: 12px; }
                .rank-row { 
                    display: flex; align-items: center; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid transparent; 
                }
                .rank-row.top-tier { background: rgba(255,255,255,0.05); border-color: rgba(251, 191, 36, 0.15); }
                .rank-num { width: 24px; font-size: 14px; font-weight: 800; font-style: italic; margin-right: 8px; color: #52525b; }
                .rank-num.highlight { color: #fbbf24; }
                .rank-content { flex: 1; min-width: 0; margin-right: 8px; }
                .rank-type { font-size: 9px; font-weight: 700; margin-bottom: 2px; text-transform: uppercase; }
                .rank-title { font-size: 12px; font-weight: 500; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .rank-val { font-size: 11px; color: #71717a; font-weight: 500; }
`;

const MonthlyWebzine = () => {
    const { data, loading } = useMonthlyBillboard();
    const [viewMode, setViewMode] = useState<'percent' | 'count'>('percent');
    const [userActivityInfo, setUserActivityInfo] = useState<{ day: string, val: number, idx: number } | null>(null);
    const [hoverHour, setHoverHour] = useState<number | null>(null);
    const [showDetailModal, setShowDetailModal] = useState(false);

    // Initial Tooltip Setup - Set only once when data becomes available
    useEffect(() => {
        if (data?.weeklyFlow?.visitorTrafficDays && !userActivityInfo) {
            const traffic = data.weeklyFlow.visitorTrafficDays;
            const maxVal = Math.max(...traffic, 0);
            const maxIdx = traffic.indexOf(maxVal);
            if (maxIdx !== -1) {
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                setUserActivityInfo({ day: days[maxIdx], val: maxVal, idx: maxIdx });
            }
        }
    }, [data, userActivityInfo]);

    const { weeklyFlow, dailyFlow, leadTime, topContents, meta } = data || {
        weeklyFlow: { classStartDays: [], socialRunDays: [], visitorTrafficDays: [] },
        dailyFlow: { hourlyData: [], rawHourlyData: [], classPeakHour: 0, eventPeakHour: 0 },
        leadTime: { classD28: 0, eventD42: 0 },
        topContents: [],
        meta: { totalLogs: 0, uniqueVisitors: 0, clickRate: 0, range: '' }
    };

    const getHourLabel = (h: number) => {
        if (h >= 0 && h < 6) return '심야';
        if (h >= 6 && h < 11) return '오전';
        if (h >= 11 && h < 14) return '점심 전후';
        if (h >= 14 && h < 17) return '오후';
        if (h >= 17 && h < 21) return '퇴근 전후';
        return '야간';
    };

    // --- Memoized Calculations (Moved ABOVE conditional return to satisfy Hook rules) ---
    const sourceData = useMemo(() => {
        if (!dailyFlow) return [];
        return viewMode === 'percent' ? dailyFlow.hourlyData : dailyFlow.rawHourlyData;
    }, [viewMode, dailyFlow]);

    const maxValHourly = useMemo(() => {
        if (sourceData.length === 0) return 1;
        return Math.max(...sourceData.map((h: any) => Math.max(h.class, h.event)), 1);
    }, [sourceData]);

    const hourlyW = 300;
    const hourlyH = 80;
    const stepX = hourlyW / 23;

    const classPoints = useMemo(() => {
        return sourceData.map((d: any, i: number) => `${i * stepX},${hourlyH - (d.class / maxValHourly) * (hourlyH - 10)}`).join(' ');
    }, [sourceData, maxValHourly, stepX, hourlyH]);

    const eventPoints = useMemo(() => {
        return sourceData.map((d: any, i: number) => `${i * stepX},${hourlyH - (d.event / maxValHourly) * (hourlyH - 10)}`).join(' ');
    }, [sourceData, maxValHourly, stepX, hourlyH]);

    const classAreaPoints = useMemo(() => {
        if (sourceData.length === 0) return '';
        const pts = sourceData.map((d: any, i: number) => `${i * stepX},${hourlyH - (d.class / maxValHourly) * (hourlyH - 10)}`).join(' ');
        return `0,${hourlyH} ${pts} ${hourlyW},${hourlyH}`;
    }, [sourceData, maxValHourly, stepX, hourlyH, hourlyW]);

    const eventAreaPoints = useMemo(() => {
        if (sourceData.length === 0) return '';
        const pts = sourceData.map((d: any, i: number) => `${i * stepX},${hourlyH - (d.event / maxValHourly) * (hourlyH - 10)}`).join(' ');
        return `0,${hourlyH} ${pts} ${hourlyW},${hourlyH}`;
    }, [sourceData, maxValHourly, stepX, hourlyH, hourlyW]);


    if (loading || !data) {
        return (
            <div className="mw-loading-container">
                <style>{`
                    .mw-loading-container { height: 400px; display: flex; flex-direction: column; align-items: center; justify-content: center; }
                    .mw-loading-text { margin-top: 16px; color: #a1a1aa; font-size: 12px; font-weight: 500; }
                `}</style>
                <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                <p className="mw-loading-text">데이터 분석 중...</p>
            </div>
        );
    }

    // --- Helper Functions ---
    const maxSupply = Math.max(...weeklyFlow.classStartDays, ...weeklyFlow.socialRunDays, 1);
    const getBarHeight = (val: number) => Math.max((val / maxSupply) * 50, 4); // max 50px for compactness

    return (
        <div className="mw-container">
            <style>{mwStyles}</style>

            <div className="mw-dashboard">
                {/* 1. Header (Compact) */}
                <div className="mw-header dashboard-header">
                    <div>
                        <div className="mw-eyebrow">Monthly Insight • JAN 2026</div>
                        <h1 className="mw-headline">동호회의 주말, 외부 강습의 평일.</h1>
                    </div>

                    <div className="mw-meta-box" onClick={() => setShowDetailModal(true)}>
                        <div style={{ marginBottom: '2px' }}><span className="mw-highlight-dot">●</span> <strong>Data</strong>: {meta.uniqueVisitors.toLocaleString()} Visitors ({meta.totalLogs.toLocaleString()} Logs)</div>
                        <div><span className="mw-meta-sub">Range: {meta.range}</span></div>
                    </div>
                </div>

                {/* 2. Main Grid */}
                <div className="mw-grid dashboard-grid">

                    {/* Col 1: Lifecycle */}
                    <div className="mw-col dashboard-col">
                        <section className="mw-card flex-1 padding-lg">
                            <h3 className="mw-section-title">1. 스윙 라이프사이클</h3>

                            <div className="mw-desc">
                                <span className="text-class">월/화</span>에 시작하고,
                                <span className="text-event"> 주말</span>에 폭발합니다.<br />
                                <span className="mw-desc-sub">* 강습 오픈(초반) → 소셜/행사 참여(후반)</span>
                            </div>

                            <div className="lc-chart-container">
                                {/* Background Line Chart */}
                                <svg className="lc-svg" viewBox="0 0 600 100" preserveAspectRatio="none">
                                    <defs>
                                        <linearGradient id="lineGap" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="0%" stopColor={colors.highlight} stopOpacity="0.2" />
                                            <stop offset="100%" stopColor={colors.highlight} stopOpacity="0" />
                                        </linearGradient>
                                    </defs>
                                    <path d={weeklyFlow.visitorTrafficDays.map((val: number, i: number) => {
                                        const max = Math.max(...weeklyFlow.visitorTrafficDays, 1);
                                        const x = i * 100;
                                        const y = 100 - (val / max) * 90;
                                        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
                                    }).join(' ')} fill="url(#lineGap)" stroke={colors.highlight} strokeWidth="2" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
                                </svg>

                                {/* Bar System */}
                                <div className="lc-bars-container">
                                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => {
                                        const trafficVal = weeklyFlow.visitorTrafficDays[idx];
                                        const maxTraffic = Math.max(...weeklyFlow.visitorTrafficDays, 1);
                                        const trafficHeightPct = (trafficVal / maxTraffic) * 90;

                                        return (
                                            <div key={day} className="lc-bar-col" onClick={() => setUserActivityInfo({ day, val: trafficVal, idx })}>
                                                {/* Bars */}
                                                <div className="lc-event-bar" style={{ height: `${getBarHeight(weeklyFlow.socialRunDays[idx])}px` }}></div>
                                                <div className="lc-class-bar" style={{ height: `${getBarHeight(weeklyFlow.classStartDays[idx])}px` }}></div>

                                                {/* X Label */}
                                                <span className="lc-day-label">{day}</span>

                                                {/* Active Dot */}
                                                <div className="lc-active-dot" style={{ bottom: `calc(${trafficHeightPct}% - 4px)` }} />

                                                {/* Tooltip */}
                                                {userActivityInfo?.idx === idx && (
                                                    <div className="lc-tooltip" style={{ bottom: `calc(${trafficHeightPct}% + 10px)` }}>
                                                        {trafficVal.toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="lc-legend">
                                <div className="legend-item"><div className="dot-event" />소셜/행사</div>
                                <div className="legend-item"><div className="dot-class" />강습 시작</div>
                                <div className="legend-item"><div className="dot-traffic" />유저 트래픽</div>
                            </div>
                        </section>
                    </div>

                    {/* Col 2: Hourly & Lead (Dense) */}
                    <div className="mw-col dashboard-col">
                        {/* 2. Hourly */}
                        <section className="mw-card">
                            <div className="hourly-header">
                                <h3 className="mw-section-title mb-0" style={{ marginBottom: 0 }}>
                                    2. 시간대별 패턴 <span className="metric-badge">조회/클릭</span>
                                </h3>
                                <button
                                    onClick={() => setViewMode(m => m === 'percent' ? 'count' : 'percent')}
                                    className={`btn-toggle ${viewMode === 'count' ? 'active' : ''}`}
                                >
                                    실제 수치
                                </button>
                            </div>

                            <div className="mw-desc-sm">
                                데이터 기준: <strong>시간당 평균 조회·클릭 (Views/hr)</strong><br />
                                <strong>{getHourLabel(dailyFlow.classPeakHour)}({dailyFlow.classPeakHour}시)</strong>은 강습 활동,
                                <strong> {getHourLabel(dailyFlow.eventPeakHour)}({dailyFlow.eventPeakHour}시)</strong>는 행사 패턴이 활발합니다.
                            </div>

                            <div className="graph-container" onMouseLeave={() => setHoverHour(null)} key={viewMode}>
                                <div className="graph-y-label" style={{ top: '0px' }}>
                                    Peak: {viewMode === 'percent' ? '100%' : `${Math.round(maxValHourly)}회`}
                                </div>
                                <svg width="100%" height="100%" viewBox={`0 0 ${hourlyW} ${hourlyH}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                    <line x1="0" y1={hourlyH * 0.25} x2={hourlyW} y2={hourlyH * 0.25} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.5} x2={hourlyW} y2={hourlyH * 0.5} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.75} x2={hourlyW} y2={hourlyH * 0.75} className="graph-line-grid" />

                                    {/* Area Fills */}
                                    <polyline points={classAreaPoints} className={`graph-area-fill ${viewMode === 'count' ? 'active' : ''}`} style={{ color: '#3b82f6' }} />
                                    <polyline points={eventAreaPoints} className={`graph-area-fill ${viewMode === 'count' ? 'active' : ''}`} style={{ color: '#f43f5e' }} />

                                    <polyline points={classPoints} className="graph-polyline graph-polyline-class" />
                                    <polyline points={eventPoints} className="graph-polyline graph-polyline-event" />
                                </svg>

                                {/* Interaction Layer */}
                                <div className="graph-interaction-layer">
                                    {dailyFlow.rawHourlyData.map((_: any, i: number) => (
                                        <div
                                            key={i}
                                            className="graph-hour-zone"
                                            onMouseEnter={() => setHoverHour(i)}
                                            onTouchStart={() => setHoverHour(i)}
                                        />
                                    ))}
                                </div>

                                {/* Tooltip & Line */}
                                {hoverHour !== null && (
                                    <>
                                        <div className="graph-hover-line" style={{ left: `${(hoverHour / 23) * 100}%` }} />
                                        <div className="graph-tooltip" style={{
                                            left: hoverHour > 16 ? 'auto' : `${(hoverHour / 23) * 100}%`,
                                            right: hoverHour > 16 ? `${100 - (hoverHour / 23) * 100}%` : 'auto',
                                            top: '-10px',
                                            transform: 'translateY(-100%)'
                                        }}>
                                            <span className="gt-time">{hoverHour.toString().padStart(2, '0')}:00</span>
                                            <div className="gt-row">
                                                <span className="gt-label">강습</span>
                                                <span className="gt-val class">
                                                    {viewMode === 'count'
                                                        ? `${dailyFlow.rawHourlyData[hoverHour].class}회`
                                                        : `${dailyFlow.hourlyData[hoverHour].class.toFixed(1)}%`}
                                                </span>
                                            </div>
                                            <div className="gt-row">
                                                <span className="gt-label">행사</span>
                                                <span className="gt-val event">
                                                    {viewMode === 'count'
                                                        ? `${dailyFlow.rawHourlyData[hoverHour].event}회`
                                                        : `${dailyFlow.hourlyData[hoverHour].event.toFixed(1)}%`}
                                                </span>
                                            </div>
                                        </div>
                                    </>
                                )}
                            </div>

                            <div className="graph-xaxis">
                                <span>00시</span><span>06시</span><span>12시</span><span>18시</span><span>24시</span>
                            </div>

                            <div className="hourly-legend">
                                <div className="hourly-legend-item" style={{ opacity: 0.5, marginRight: 'auto' }}>* 시스템 로그 기반</div>
                                <div className="hourly-legend-item"><div className="hl-dot" style={{ background: '#3b82f6' }} /> 강습</div>
                                <div className="hourly-legend-item"><div className="hl-dot" style={{ background: '#f43f5e' }} /> 행사</div>
                            </div>
                        </section>

                        {/* 3. Lead Time */}
                        <section className="mw-card flex-1">
                            <h3 className="mw-section-title">3. 등록 리드타임</h3>
                            <div className="mw-desc-sm">
                                빠를수록 좋습니다. (Max 조회수 기준)
                            </div>

                            <div className="lead-grid">
                                <div className="lead-item class">
                                    <div>
                                        <div className="lead-label text-blue-400">CLASS</div>
                                        <div className="lead-label-sub">4주 전 등록</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="lead-value">{leadTime.classD28}<span className="lead-unit text-blue-300">회</span></div>
                                        <div className="lead-caption text-blue-300">평균 조회</div>
                                    </div>
                                </div>

                                <div className="lead-item event">
                                    <div>
                                        <div className="lead-label text-rose-400">EVENT</div>
                                        <div className="lead-label-sub">6주 전 등록</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div className="lead-value">{leadTime.eventD42}<span className="lead-unit text-rose-300">회</span></div>
                                        <div className="lead-caption text-rose-300">평균 조회</div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Col 3: Ranking (Scrollable) */}
                    <div className="mw-col dashboard-col">
                        <section className="mw-card flex-1 no-bg">
                            <h3 className="mw-section-title pl-1">4. 1월 조회수 (Top 20)</h3>

                            <div className="ranking-container scroll-list">
                                {topContents.slice(0, 20).map((item: any, index: number) => (
                                    <div key={index} className={`rank-row ${index < 3 ? 'top-tier' : ''}`}>
                                        <div className={`rank-num ${index < 3 ? 'highlight' : ''}`}>{index + 1}</div>

                                        <div className="rank-content">
                                            <div className="rank-type" style={{ color: item.type === 'class' ? colors.class : colors.event }}>
                                                {item.type === 'board_post' ? 'INFO' : item.type}
                                            </div>
                                            <div className="rank-title">
                                                {item.title}
                                            </div>
                                        </div>

                                        <div className="rank-val">
                                            {item.count}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </section>
                    </div>

                </div>
                {/* Modal Registry */}
                <MonthlyLogDetailModal
                    isOpen={showDetailModal}
                    onClose={() => setShowDetailModal(false)}
                    data={meta}
                />
            </div>
        </div>
    );
};

export default MonthlyWebzine;
