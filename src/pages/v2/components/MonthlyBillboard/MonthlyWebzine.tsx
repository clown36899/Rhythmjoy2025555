import React, { useState, useEffect } from 'react';
import { useMonthlyBillboard } from '../../hooks/useMonthlyBillboard';

// --- Premium Dark Mode Colors & Styles ---
const colors = {
    bg: 'rgba(255,255,255,0.02)',
    border: 'rgba(255,255,255,0.06)',
    highlight: '#fbbf24', // Amber 400
    textMain: '#f4f4f5', // Zinc 100
    textSub: '#a1a1aa',  // Zinc 400
    class: '#3b82f6',    // Blue 500
    event: '#f43f5e',    // Rose 500
};

const cardStyle: React.CSSProperties = {
    backgroundColor: colors.bg,
    borderRadius: '16px',
    border: `1px solid ${colors.border}`,
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
};

const sectionTitleStyle: React.CSSProperties = {
    fontSize: '13px',
    fontWeight: '700',
    color: colors.textMain,
    marginBottom: '12px',
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    letterSpacing: '-0.3px'
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
            <div style={{ height: '400px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin"></div>
                <p style={{ marginTop: '16px', color: colors.textSub, fontSize: '12px', fontWeight: '500' }}>데이터 분석 중...</p>
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
        <div style={{ padding: '0 4px', color: colors.textMain, fontFamily: "'Pretendard', sans-serif" }}>

            <style>{`
                .monthly-dashboard {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }
                
                @media (min-width: 1024px) {
                    .monthly-dashboard {
                        display: grid;
                        grid-template-rows: auto 1fr;
                        height: calc(70vh - 48px); /* Strictly fit inside modal with padding */
                        gap: 0;
                    }

                    .dashboard-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: flex-end;
                        margin-bottom: 16px;
                        padding: 0 8px;
                    }

                    .dashboard-grid {
                        display: grid;
                        grid-template-columns: 1fr 1.1fr 0.9fr; /* Optimized ratios */
                        gap: 12px;
                        overflow: hidden; /* Parent prevents scroll */
                        flex: 1;
                        min-height: 0; /* Important for firefox/grid scrolling */
                    }
                    
                    .dashboard-col {
                        display: flex;
                        flex-direction: column;
                        gap: 12px;
                        overflow: hidden;
                        height: 100%;
                    }

                    /* Custom Scrollbar for the list only */
                    .scroll-list {
                        overflow-y: auto;
                        padding-right: 2px;
                        overscroll-behavior: contain; /* Prevent parent scroll interaction */
                        will-change: scroll-position; /* Optimize scrolling */
                    }
                    .scroll-list::-webkit-scrollbar { width: 4px; } /* Slightly wider for better grab */
                    .scroll-list::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); border-radius: 4px; } /* More visible thumb */
                    .scroll-list::-webkit-scrollbar-track { background: transparent; }
                }

                /* Text Gradients */
                .text-gradient {
                    background: linear-gradient(to right, #fff, #a1a1aa);
                    -webkit-background-clip: text;
                    -webkit-text-fill-color: transparent;
                }
            `}</style>

            <div className="monthly-dashboard">

                {/* 1. Header (Compact) */}
                <div className="dashboard-header">
                    <div>
                        <div style={{ fontSize: '10px', fontWeight: '800', color: colors.highlight, marginBottom: '4px', letterSpacing: '1px', textTransform: 'uppercase', opacity: 0.9 }}>
                            Monthly Insight • JAN 2026
                        </div>
                        <h1 style={{ fontSize: '20px', fontWeight: '800', margin: 0, lineHeight: '1.2', letterSpacing: '-0.5px' }} className="text-gradient">
                            동호회의 주말, 외부 강습의 평일.
                        </h1>
                    </div>

                    <div style={{
                        fontSize: '10px',
                        color: colors.textSub,
                        background: 'rgba(255,255,255,0.03)',
                        padding: '8px 12px',
                        borderRadius: '8px',
                        border: '1px solid rgba(255,255,255,0.05)',
                        backdropFilter: 'blur(10px)',
                        textAlign: 'right'
                    }}>
                        <div style={{ marginBottom: '2px' }}><span style={{ color: colors.highlight }}>●</span> <strong>Data</strong>: {meta.totalLogs.toLocaleString()} Logs Analysis</div>
                        <div><span style={{ opacity: 0.6 }}>Range: {meta.range}</span></div>
                    </div>
                </div>

                {/* 2. Main Grid */}
                <div className="dashboard-grid">

                    {/* Col 1: Lifecycle (High Visual Impact) */}
                    <div className="dashboard-col">
                        <section style={{ ...cardStyle, flex: 1, padding: '20px' }}>
                            <h3 style={sectionTitleStyle}>1. 스윙 라이프사이클</h3>

                            <div style={{ fontSize: '12px', color: '#d4d4d8', marginBottom: '20px', lineHeight: '1.5' }}>
                                <span style={{ color: colors.class, fontWeight: '700' }}>월/화</span>에 시작하고,
                                <span style={{ color: colors.event, fontWeight: '700' }}> 주말</span>에 폭발합니다.<br />
                                <span style={{ fontSize: '11px', color: colors.textSub, marginTop: '4px', display: 'block' }}>* 강습 오픈(초반) → 소셜/행사 참여(후반)</span>
                            </div>

                            <div style={{ flex: 1, position: 'relative', minHeight: '120px', marginBottom: '10px' }}>
                                {/* Background Line Chart (User Activity) */}
                                <svg viewBox="0 0 600 100" preserveAspectRatio="none" style={{ position: 'absolute', top: 0, left: '6%', width: '88%', height: 'calc(100% - 20px)', zIndex: 0, overflow: 'visible' }}>
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
                                <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '100%', paddingBottom: '20px', position: 'relative', zIndex: 1 }}>
                                    {['일', '월', '화', '수', '목', '금', '토'].map((day, idx) => {
                                        const trafficVal = weeklyFlow.visitorTrafficDays[idx];
                                        const maxTraffic = Math.max(...weeklyFlow.visitorTrafficDays, 1);
                                        const trafficHeightPct = (trafficVal / maxTraffic) * 90;

                                        return (
                                            <div key={day}
                                                onClick={() => setUserActivityInfo({ day, val: trafficVal, idx })}
                                                style={{ width: '12%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', cursor: 'pointer', position: 'relative' }}
                                            >
                                                {/* Bars */}
                                                <div style={{ width: '6px', height: `${getBarHeight(weeklyFlow.socialRunDays[idx])}px`, background: colors.event, borderRadius: '4px', marginBottom: '2px', opacity: 0.9 }}></div>
                                                <div style={{ width: '6px', height: `${getBarHeight(weeklyFlow.classStartDays[idx])}px`, background: colors.class, borderRadius: '4px', opacity: 0.9 }}></div>

                                                {/* X Label */}
                                                <span style={{ position: 'absolute', bottom: '-20px', fontSize: '10px', fontWeight: '600', color: colors.textSub }}>{day}</span>

                                                {/* Active Dot */}
                                                <div style={{
                                                    position: 'absolute',
                                                    bottom: `calc(${trafficHeightPct}% - 4px)`,
                                                    width: '8px', height: '8px',
                                                    background: colors.highlight,
                                                    borderRadius: '50%',
                                                    border: '2px solid #18181b', // Match bg
                                                    boxShadow: '0 2px 4px rgba(0,0,0,0.5)',
                                                    transition: 'bottom 0.3s ease'
                                                }} />

                                                {/* Tooltip */}
                                                {userActivityInfo?.idx === idx && (
                                                    <div style={{
                                                        position: 'absolute',
                                                        bottom: `calc(${trafficHeightPct}% + 10px)`,
                                                        background: 'rgba(255,255,255,0.9)',
                                                        color: '#000',
                                                        padding: '4px 8px',
                                                        borderRadius: '6px',
                                                        fontSize: '10px',
                                                        fontWeight: '800',
                                                        whiteSpace: 'nowrap',
                                                        zIndex: 10,
                                                        boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                                                        pointerEvents: 'none'
                                                    }}>
                                                        {trafficVal.toLocaleString()}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            <div style={{ display: 'flex', justifyContent: 'center', gap: '16px', marginTop: '12px' }}>
                                <div style={{ fontSize: '10px', display: 'flex', alignItems: 'center', color: colors.textSub }}><div style={{ width: '6px', height: '6px', background: colors.event, borderRadius: '2px', marginRight: '6px' }} />소셜/행사</div>
                                <div style={{ fontSize: '10px', display: 'flex', alignItems: 'center', color: colors.textSub }}><div style={{ width: '6px', height: '6px', background: colors.class, borderRadius: '2px', marginRight: '6px' }} />강습 시작</div>
                                <div style={{ fontSize: '10px', display: 'flex', alignItems: 'center', color: colors.textSub }}><div style={{ width: '8px', height: '2px', background: colors.highlight, marginRight: '6px' }} />유저 트래픽</div>
                            </div>
                        </section>
                    </div>

                    {/* Col 2: Hourly & Lead (Dense) */}
                    <div className="dashboard-col">
                        {/* 2. Hourly */}
                        <section style={{ ...cardStyle }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                                <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>2. 시간대별 패턴</h3>
                                <button onClick={() => setViewMode(m => m === 'percent' ? 'count' : 'percent')} style={{ background: 'rgba(255,255,255,0.05)', border: 'none', borderRadius: '4px', padding: '2px 6px', fontSize: '9px', color: colors.textSub, cursor: 'pointer' }}>
                                    {viewMode === 'percent' ? '% 보기' : '수치 보기'}
                                </button>
                            </div>

                            <div style={{ fontSize: '11px', color: '#d4d4d8', marginBottom: '12px' }}>
                                점심(<strong>{dailyFlow.classPeakHour}시</strong>)은 강습, 퇴근 전(<strong>{dailyFlow.eventPeakHour}시</strong>)은 행사.
                            </div>

                            <div style={{ height: '80px', position: 'relative', width: '100%' }}>
                                <svg width="100%" height="100%" viewBox={`0 0 ${hourlyW} ${hourlyH}`} preserveAspectRatio="none" style={{ overflow: 'visible' }}>
                                    {/* Grid Lines */}
                                    <line x1="0" y1={hourlyH * 0.25} x2={hourlyW} y2={hourlyH * 0.25} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                    <line x1="0" y1={hourlyH * 0.5} x2={hourlyW} y2={hourlyH * 0.5} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />
                                    <line x1="0" y1={hourlyH * 0.75} x2={hourlyW} y2={hourlyH * 0.75} stroke="rgba(255,255,255,0.03)" strokeWidth="1" />

                                    {/* Charts */}
                                    <polyline points={classPoints} fill="none" stroke={colors.class} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                    <polyline points={eventPoints} fill="none" stroke={colors.event} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                                {/* X-Axis Labels Compact */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px', fontSize: '8px', color: '#52525b', padding: '0 2px' }}>
                                    <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
                                </div>
                            </div>
                        </section>

                        {/* 3. Lead Time */}
                        <section style={{ ...cardStyle, flex: 1 }}>
                            <h3 style={{ ...sectionTitleStyle, marginBottom: '8px' }}>3. 등록 리드타임</h3>
                            <div style={{ fontSize: '11px', color: '#d4d4d8', marginBottom: '12px' }}>
                                빠를수록 좋습니다. (Max 조회수 기준)
                            </div>

                            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', flex: 1 }}>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(59, 130, 246, 0.08)', borderRadius: '8px', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                                    <div>
                                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#60a5fa' }}>CLASS</div>
                                        <div style={{ fontSize: '12px', color: '#fff' }}>4주 전 등록</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>{leadTime.classD28}<span style={{ fontSize: '10px', fontWeight: '400', color: '#93c5fd', marginLeft: '2px' }}>회</span></div>
                                        <div style={{ fontSize: '9px', color: '#93c5fd', opacity: 0.7 }}>평균 조회</div>
                                    </div>
                                </div>

                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 12px', background: 'rgba(244, 63, 94, 0.08)', borderRadius: '8px', border: '1px solid rgba(244, 63, 94, 0.15)' }}>
                                    <div>
                                        <div style={{ fontSize: '10px', fontWeight: '700', color: '#fb7185' }}>EVENT</div>
                                        <div style={{ fontSize: '12px', color: '#fff' }}>6주 전 등록</div>
                                    </div>
                                    <div style={{ textAlign: 'right' }}>
                                        <div style={{ fontSize: '16px', fontWeight: '800', color: '#fff' }}>{leadTime.eventD42}<span style={{ fontSize: '10px', fontWeight: '400', color: '#fca5a5', marginLeft: '2px' }}>회</span></div>
                                        <div style={{ fontSize: '9px', color: '#fca5a5', opacity: 0.7 }}>평균 조회</div>
                                    </div>
                                </div>
                            </div>
                        </section>
                    </div>

                    {/* Col 3: Ranking (Scrollable) */}
                    <div className="dashboard-col">
                        <section style={{ ...cardStyle, flex: 1, padding: '16px 4px 16px 16px', background: 'rgba(255,255,255,0.01)', border: 'none' }}>
                            <h3 style={{ ...sectionTitleStyle, paddingLeft: '4px' }}>4. 1월의 화제 (Top 20)</h3>

                            <div className="scroll-list" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '6px', paddingRight: '12px' }}>
                                {topContents.map((item, index) => (
                                    <div key={index} style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        padding: '10px 12px',
                                        borderRadius: '10px',
                                        background: index < 3 ? 'rgba(255,255,255,0.05)' : 'rgba(255,255,255,0.02)',
                                        border: index < 3 ? '1px solid rgba(251, 191, 36, 0.15)' : '1px solid transparent'
                                    }}>
                                        <div style={{
                                            width: '24px',
                                            fontSize: '14px',
                                            fontWeight: '800',
                                            color: index < 3 ? colors.highlight : '#52525b',
                                            fontStyle: 'italic',
                                            marginRight: '8px'
                                        }}>{index + 1}</div>

                                        <div style={{ flex: 1, minWidth: 0, marginRight: '8px' }}>
                                            <div style={{ fontSize: '9px', fontWeight: '700', color: item.type === 'class' ? colors.class : colors.event, marginBottom: '2px', textTransform: 'uppercase' }}>
                                                {item.type === 'board_post' ? 'INFO' : item.type}
                                            </div>
                                            <div style={{ fontSize: '12px', fontWeight: '500', color: '#f4f4f5', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                                {item.title}
                                            </div>
                                        </div>

                                        <div style={{ fontSize: '11px', color: '#71717a', fontWeight: '500' }}>
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
