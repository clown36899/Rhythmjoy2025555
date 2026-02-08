import { useState, useEffect, useMemo } from 'react';
import { useMonthlyBillboard, type BillboardData, type RankingItem } from '../../hooks/useMonthlyBillboard';
import MonthlyLogDetailModal from './MonthlyLogDetailModal';
import LocalLoading from '../../../../components/LocalLoading';
import './MonthlyWebzine.css';

// --- Premium Dark Mode Colors (Used for Chart Logic & Dynamic Styles) ---
const colors = {
    bg: 'var(--bg-surface-glass, rgba(255,255,255,0.02))',
    border: 'var(--border-glass, rgba(255,255,255,0.06))',
    highlight: 'var(--color-amber-400)',
    textMain: 'var(--text-primary)',
    textSub: 'var(--text-tertiary)',
    class: 'var(--color-blue-500)',
    event: 'var(--color-rose-500)',
};


const MonthlyWebzine = () => {
    const { data, loading, targetDate, setTargetDate } = useMonthlyBillboard();
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
        weeklyFlow: { classStartRatio: 0, weekendSocialRatio: 0, weekendClassDrop: 0, classStartDays: [], socialRunDays: [], visitorTrafficDays: [] },
        dailyFlow: { hourlyData: [], rawHourlyData: [], classPeakHour: 0, eventPeakHour: 0 },
        leadTime: { classD28: 0, classD7: 0, eventD42: 0, eventD14: 0 },
        topContents: [],
        meta: { totalLogs: 0, uniqueVisitors: 0, clickRate: 0, range: '', monthLabel: 'LOADING...', monthKor: '' },
        loading: false
    } as BillboardData;

    const getHourLabel = (h: number) => {
        if (h >= 0 && h < 6) return '심야';
        if (h >= 6 && h < 11) return '오전';
        if (h >= 11 && h < 14) return '점심 전후';
        if (h >= 14 && h < 17) return '오후';
        if (h >= 17 && h < 21) return '퇴근 전후';
        return '야간';
    };

    // --- Month Selection Logic ---
    const handleMonthChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
        const val = e.target.value;
        if (val === 'all') {
            setTargetDate('all');
        } else {
            const [y, m] = val.split('-').map(Number);
            setTargetDate({ year: y, month: m });
        }
    };

    const monthOptions = useMemo(() => {
        const opts = [];
        // Generate last 12 months (excluding current month, as per requirement, or including logic handled by hook default?)
        // Requirement: "Normally analyzes previous month on the 1st". 
        // We will show options starting from Previous Month back to 12 months ago.

        const d = new Date();
        d.setDate(1); // Safety
        d.setMonth(d.getMonth() - 1); // Start from previous month

        for (let i = 0; i < 12; i++) {
            const y = d.getFullYear();
            const m = d.getMonth();

            // Limit: Start from Jan 2026
            if (y < 2026) break;

            const label = `${y}년 ${m + 1}월`;
            opts.push({ value: `${y}-${m}`, label });
            d.setMonth(d.getMonth() - 1);
        }
        return opts;
    }, []);

    const selectedValue = targetDate === 'all'
        ? 'all'
        : `${targetDate?.year}-${targetDate?.month}`;


    // --- Memoized Calculations (Moved ABOVE conditional return to satisfy Hook rules) ---
    const sourceData = useMemo(() => {
        if (!dailyFlow) return [];
        return viewMode === 'percent' ? dailyFlow.hourlyData : dailyFlow.rawHourlyData;
    }, [viewMode, dailyFlow]);

    const maxValHourly = useMemo(() => {
        if (sourceData.length === 0) return 1;
        return Math.max(...sourceData.map((h: { class: number, event: number }) => Math.max(h.class, h.event)), 1);
    }, [sourceData]);

    const hourlyW = 300;
    const hourlyH = 80;
    const stepX = hourlyW / 23;

    const classPoints = useMemo(() => {
        return sourceData.map((d: { class: number, event: number }, i: number) => `${i * stepX},${hourlyH - (d.class / maxValHourly) * (hourlyH - 10)}`).join(' ');
    }, [sourceData, maxValHourly, stepX, hourlyH]);

    const eventPoints = useMemo(() => {
        return sourceData.map((d: { class: number, event: number }, i: number) => `${i * stepX},${hourlyH - (d.event / maxValHourly) * (hourlyH - 10)}`).join(' ');
    }, [sourceData, maxValHourly, stepX, hourlyH]);

    const classAreaPoints = useMemo(() => {
        if (sourceData.length === 0) return '';
        const pts = sourceData.map((d: { class: number, event: number }, i: number) => `${i * stepX},${hourlyH - (d.class / maxValHourly) * (hourlyH - 10)}`).join(' ');
        return `0,${hourlyH} ${pts} ${hourlyW},${hourlyH}`;
    }, [sourceData, maxValHourly, stepX, hourlyH, hourlyW]);

    const eventAreaPoints = useMemo(() => {
        if (sourceData.length === 0) return '';
        const pts = sourceData.map((d: { class: number, event: number }, i: number) => `${i * stepX},${hourlyH - (d.event / maxValHourly) * (hourlyH - 10)}`).join(' ');
        return `0,${hourlyH} ${pts} ${hourlyW},${hourlyH}`;
    }, [sourceData, maxValHourly, stepX, hourlyH, hourlyW]);


    if (loading || !data) {
        return (
            <div className="mw-loading-container">
                <LocalLoading message="데이터 분석 중..." size="lg" color="white" />
            </div>
        );
    }

    // --- Helper Functions ---
    const maxSupply = Math.max(...weeklyFlow.classStartDays, ...weeklyFlow.socialRunDays, 1);
    const getBarHeight = (val: number) => Math.max((val / maxSupply) * 50, 4); // max 50px for compactness

    return (
        <div className="mw-container">


            <div className="mw-dashboard">
                {/* 1. Header (Compact) with Selector */}
                <div className="mw-header dashboard-header">
                    <div className="mw-header-info">
                        <div className="mw-eyebrow mw-eyebrow-group">
                            <span>Monthly Insight</span>
                            <span className="mw-header-separator">•</span>
                            <select
                                value={selectedValue}
                                onChange={handleMonthChange}
                                className="mw-month-select"
                            >
                                {monthOptions.map(opt => (
                                    <option key={opt.value} value={opt.value} className="mw-month-option">
                                        {opt.label}
                                    </option>
                                ))}
                                <option value="all" className="mw-month-option">전체 기간 (All Time)</option>
                            </select>
                        </div>
                        <h1 className="mw-headline">동호회의 주말, 외부 강습의 평일.</h1>
                        <p className="mw-header-note">
                            * 매월 1일 지난 달의 데이터를 분석하여 업데이트됩니다.
                        </p>
                    </div>

                    <div className="mw-meta-box" onClick={() => setShowDetailModal(true)}>
                        <div className="mw-meta-data-row"><span className="mw-highlight-dot">●</span> <strong>Data</strong>: {meta.uniqueVisitors.toLocaleString()} Visitors ({meta.totalLogs.toLocaleString()} Logs)</div>
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
                                <h3 className="mw-section-title mb-0">
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
                                <div className="graph-y-label graph-y-label-peak">
                                    Peak: {viewMode === 'percent' ? '100%' : `${Math.round(maxValHourly)}회`}
                                </div>
                                <svg width="100%" height="100%" viewBox={`0 0 ${hourlyW} ${hourlyH}`} preserveAspectRatio="none" className="graph-svg-main">
                                    <line x1="0" y1={hourlyH * 0.25} x2={hourlyW} y2={hourlyH * 0.25} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.5} x2={hourlyW} y2={hourlyH * 0.5} className="graph-line-grid" />
                                    <line x1="0" y1={hourlyH * 0.75} x2={hourlyW} y2={hourlyH * 0.75} className="graph-line-grid" />

                                    {/* Area Fills */}
                                    <polyline points={classAreaPoints} className={`graph-area-fill ${viewMode === 'count' ? 'active' : ''}`} style={{ color: 'var(--color-blue-500)' }} />
                                    <polyline points={eventAreaPoints} className={`graph-area-fill ${viewMode === 'count' ? 'active' : ''}`} style={{ color: 'var(--color-rose-500)' }} />

                                    <polyline points={classPoints} className="graph-polyline graph-polyline-class" />
                                    <polyline points={eventPoints} className="graph-polyline graph-polyline-event" />
                                </svg>
                                \n                                <div className="graph-interaction-layer">
                                    {dailyFlow.rawHourlyData.map((_item: { hour: number, class: number, event: number }, i: number) => (
                                        <div
                                            key={i}
                                            className="graph-hour-zone"
                                            onMouseEnter={() => setHoverHour(i)}
                                            onTouchStart={() => setHoverHour(i)}
                                        />
                                    ))}
                                </div>
                                \n                                {hoverHour !== null && (
                                    <>
                                        <div className="graph-hover-line" style={{ left: `${(hoverHour / 23) * 100}%` }} />
                                        <div className="graph-tooltip" style={{
                                            left: hoverHour > 16 ? 'auto' : `${(hoverHour / 23) * 100}%`,
                                            right: hoverHour > 16 ? `${100 - (hoverHour / 23) * 100}%` : 'auto'
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
                                <div className="hourly-legend-item legend-note">* 시스템 로그 기반</div>
                                <div className="hourly-legend-item"><div className="hl-dot bg-blue-500" /> 강습</div>
                                <div className="hourly-legend-item"><div className="hl-dot bg-rose-500" /> 행사</div>
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
                                    <div className="lead-item-right">
                                        <div className="lead-value">{leadTime.classD28}<span className="lead-unit text-blue-300">회</span></div>
                                        <div className="lead-caption text-blue-300">평균 조회</div>
                                    </div>
                                </div>

                                <div className="lead-item event">
                                    <div>
                                        <div className="lead-label text-rose-400">EVENT</div>
                                        <div className="lead-label-sub">6주 전 등록</div>
                                    </div>
                                    <div className="lead-item-right">
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
                            <h3 className="mw-section-title pl-1">4. {meta.monthKor} 조회수 (Top 20)</h3>

                            <div className="ranking-container scroll-list">
                                {topContents.slice(0, 20).map((item: RankingItem, index: number) => (
                                    <div key={index} className={`rank-row ${index < 3 ? 'top-tier' : ''}`}>
                                        <div className={`rank-num ${index < 3 ? 'highlight' : ''}`}>{index + 1}</div>

                                        <div className="rank-content">
                                            <div className="rank-type rank-type-label" style={{ color: item.type === 'class' ? colors.class : colors.event }}>
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
