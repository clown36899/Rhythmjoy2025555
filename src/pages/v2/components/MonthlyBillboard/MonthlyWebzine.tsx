import React, { useState, useEffect } from 'react';
import { useMonthlyBillboard } from '../../hooks/useMonthlyBillboard';

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

const MonthlyWebzine = () => {
    const { data, loading } = useMonthlyBillboard();
    const [viewMode, setViewMode] = useState<'percent' | 'count'>('percent');
    const [userActivityInfo, setUserActivityInfo] = useState<{ day: string, val: number, idx: number } | null>(null);

    // Initial Tooltip Setup
    useEffect(() => {
        if (data?.weeklyFlow?.visitorTrafficDays) {
            const traffic = data.weeklyFlow.visitorTrafficDays;
            const maxVal = Math.max(...traffic, 0);
            const maxIdx = traffic.indexOf(maxVal);
            if (maxIdx !== -1) {
                const days = ['일', '월', '화', '수', '목', '금', '토'];
                setUserActivityInfo({ day: days[maxIdx], val: maxVal, idx: maxIdx });
            }
        }
    }, [data]);

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

    const { weeklyFlow, dailyFlow, leadTime, topContents, meta } = data;

    // --- Helper Functions ---
    const maxSupply = Math.max(...weeklyFlow.classStartDays, ...weeklyFlow.socialRunDays, 1);
    const getBarHeight = (val: number) => Math.max((val / maxSupply) * 50, 4); // max 50px for compactness

    const sourceData = viewMode === 'percent' ? dailyFlow.hourlyData : dailyFlow.rawHourlyData;
    const maxValHourly = Math.max(...sourceData.map(h => Math.max(h.class, h.event)), 1);

    // Hourly Chart SVG Props
    const hourlyW = 300;
    const hourlyH = 80; // Compact height
    const stepX = hourlyW / 23;
    const classPoints = sourceData.map((d, i) => `${i * stepX},${hourlyH - (d.class / maxValHourly) * (hourlyH - 10)}`).join(' ');
    const eventPoints = sourceData.map((d, i) => `${i * stepX},${hourlyH - (d.event / maxValHourly) * (hourlyH - 10)}`).join(' ');

    return (
        <div className="mw-container">

            <style>{`
                /* Container & Layout */
                .mw-container {
                    padding: 4px;
                    color: #f4f4f5;
                    font-family: 'Pretendard', sans-serif;
                }
                .mw-dashboard {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                @media (min-width: 1024px) {
                    .mw-dashboard {
                        display: grid;
                        grid-template-rows: auto 1fr;
                        height: calc(70vh - 48px);
                        gap: 0;
                    }
                    .mw-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        margin-bottom: 16px;
                        padding: 0 8px;
                    }
                    .mw-grid {
                        display: grid;
                        grid-template-columns: 1fr 1.1fr 0.9fr;
                        gap: 12px;
                        overflow: hidden;
                        flex: 1;
                        min-height: 0;
                    }
                    .mw-col {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        overflow: hidden;
                        height: 100%;
                    }
                    .scroll-list {
                        overflow-y: auto;
                        padding-right: 2px;
                    }
                    .scroll-list::-webkit-scrollbar { width: 4px; }
                    .scroll-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; }
                    .scroll-list::-webkit-scrollbar-track { background: transparent; }
                }

                /* Header Components */
                .mw-header { display: flex; justify-content: space-between; align-items: flex-end; margin-bottom: 12px; }
                .mw-eyebrow { font-size: 10px; font-weight: 800; color: #fbbf24; margin-bottom: 4px; letter-spacing: 1px; text-transform: uppercase; opacity: 0.9; }
                .mw-headline { 
                    font-size: 20px; font-weight: 800; margin: 0; line-height: 1.2; letter-spacing: -0.5px;
                    background: linear-gradient(to right, #fff, #a1a1aa); -webkit-background-clip: text; -webkit-text-fill-color: transparent;
                }
                .mw-meta-box {
                    font-size: 10px; color: #a1a1aa; background: rgba(255,255,255,0.03);
                    padding: 8px 12px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.05);
                    backdrop-filter: blur(10px); text-align: right;
                }
                .mw-highlight-dot { color: #fbbf24; }
                .mw-meta-sub { opacity: 0.6; }

                /* Cards */
                .mw-card {
                    background: rgba(255,255,255,0.02);
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.06);
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
                }
                .mw-card.flex-1 { flex: 1; }
                .mw-card.padding-lg { padding: 20px; }
                .mw-card.no-bg { background: rgba(255,255,255,0.01); border: none; padding: 16px 4px 16px 16px; }

                .mw-section-title {
                    font-size: 13px; font-weight: 700; color: #f4f4f5; margin-bottom: 12px;
                    display: flex; align-items: center; gap: 6px; letter-spacing: -0.3px; margin-top: 0;
                }
                .mw-section-title.mb-0 { margin-bottom: 0; }
                .mw-section-title.pl-1 { padding-left: 4px; }

                /* Content Specifics */
                .mw-desc { font-size: 12px; color: #d4d4d8; margin-bottom: 20px; line-height: 1.5; }
                .mw-desc-sm { font-size: 11px; color: #d4d4d8; margin-bottom: 12px; }
                .mw-desc-sub { font-size: 11px; color: #a1a1aa; margin-top: 4px; display: block; }
                
                .text-class { color: #3b82f6; font-weight: 700; }
                .text-event { color: #f43f5e; font-weight: 700; }

                /* Lifecycle Chart */
                .lc-chart-container { flex: 1; position: relative; min-height: 120px; margin-bottom: 10px; }
                .lc-svg { position: absolute; top: 0; left: 6%; width: 88%; height: calc(100% - 20px); z-index: 0; overflow: visible; }
                .lc-bars-container { display: flex; align-items: flex-end; justify-content: space-between; height: 100%; padding-bottom: 20px; position: relative; z-index: 1; }
                .lc-bar-col { width: 12%; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; height: 100%; cursor: pointer; position: relative; }
                .lc-class-bar { width: 6px; background: #3b82f6; border-radius: 4px; opacity: 0.9; }
                .lc-event-bar { width: 6px; background: #f43f5e; border-radius: 4px; margin-bottom: 2px; opacity: 0.9; }
                .lc-day-label { position: absolute; bottom: -20px; font-size: 10px; font-weight: 600; color: #a1a1aa; }
                .lc-active-dot {
                    position: absolute; width: 8px; height: 8px; background: #fbbf24;
                    border-radius: 50%; border: 2px solid #18181b; box-shadow: 0 2px 4px rgba(0,0,0,0.5);
                    transition: bottom 0.3s ease;
                }
                .lc-tooltip {
                    position: absolute; background: rgba(255,255,255,0.9); color: #000;
                    padding: 4px 8px; border-radius: 6px; font-size: 10px; font-weight: 800;
                    white-space: nowrap; z-index: 10; pointer-events: none;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
                }
                .lc-legend { display: flex; justify-content: center; gap: 16px; margin-top: 12px; }
                .legend-item { font-size: 10px; display: flex; align-items: center; color: #a1a1aa; }
                .dot-event { width: 6px; height: 6px; background: #f43f5e; border-radius: 2px; margin-right: 6px; }
                .dot-class { width: 6px; height: 6px; background: #3b82f6; border-radius: 2px; margin-right: 6px; }
                .dot-traffic { width: 8px; height: 2px; background: #fbbf24; margin-right: 6px; }

                /* Hourly Chart */
                .hourly-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
                .btn-toggle { background: rgba(255,255,255,0.05); border: none; border-radius: 4px; padding: 2px 6px; font-size: 9px; color: #a1a1aa; cursor: pointer; }
                .graph-container { height: 80px; position: relative; width: 100%; }
                .graph-line-grid { stroke: rgba(255,255,255,0.03); stroke-width: 1; }
                .graph-xaxis { display: flex; justify-content: space-between; margin-top: 4px; font-size: 8px; color: #52525b; padding: 0 2px; }

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
                .rank-row { display: flex; align-items: center; padding: 10px 12px; border-radius: 10px; background: rgba(255,255,255,0.02); border: 1px solid transparent; }
                .rank-row.top-tier { background: rgba(255,255,255,0.05); border-color: rgba(251, 191, 36, 0.15); }
                .rank-num { width: 24px; font-size: 14px; font-weight: 800; font-style: italic; margin-right: 8px; color: #52525b; }
                .rank-num.highlight { color: #fbbf24; }
                .rank-content { flex: 1; min-width: 0; margin-right: 8px; }
                .rank-type { font-size: 9px; font-weight: 700; margin-bottom: 2px; text-transform: uppercase; }
                .rank-title { font-size: 12px; font-weight: 500; color: #f4f4f5; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
                .rank-val { font-size: 11px; color: #71717a; font-weight: 500; }
            `}</style>

            <div className="mw-dashboard">
                {/* 1. Header (Compact) */}
                <div className="mw-header dashboard-header">
                    <div>
                        <div className="mw-eyebrow">Monthly Insight • JAN 2026</div>
                        <h1 className="mw-headline">동호회의 주말, 외부 강습의 평일.</h1>
                    </div>

                    <div className="mw-meta-box">
                        <div style={{ marginBottom: '2px' }}><span className="mw-highlight-dot">●</span> <strong>Data</strong>: {meta.totalLogs.toLocaleString()} Logs Analysis</div>
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
                                    <path d={weeklyFlow.visitorTrafficDays.map((val, i) => {
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
                                <h3 className="mw-section-title mb-0">2. 시간대별 패턴</h3>
                                <button onClick={() => setViewMode(m => m === 'percent' ? 'count' : 'percent')} className="btn-toggle">
                                    {viewMode === 'percent' ? '% 보기' : '수치 보기'}
                                </button>
                            </div>

                            <div className="mw-desc-sm">
                                점심(<strong>{dailyFlow.classPeakHour}시</strong>)은 강습, 퇴근 전(<strong>{dailyFlow.eventPeakHour}시</strong>)은 행사.
                            </div>

                            <div className="graph-container">
                                <svg width="100%" height="100%" viewBox={`0 0 ${hourlyW} ${hourlyH}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                    <line x1="0" y1={hourlyH * 0.25} x2={hourlyW} y2={hourlyH * 0.25} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.5} x2={hourlyW} y2={hourlyH * 0.5} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.75} x2={hourlyW} y2={hourlyH * 0.75} className="graph-line-grid" />

                                    <polyline points={classPoints} fill="none" stroke={colors.class} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <polyline points={eventPoints} fill="none" stroke={colors.event} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                <div className="graph-xaxis">
                                    <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
                                </div>
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
                            <h3 className="mw-section-title pl-1">4. 1월의 화제 (Top 20)</h3>

                            <div className="ranking-container scroll-list">
                                {topContents.map((item, index) => (
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
            </div>
        </div>
    );
};

export default MonthlyWebzine;


