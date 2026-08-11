import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import LocalLoading from '../../../components/LocalLoading';
import './SwingSceneStats.css';

import { useSwingSceneStats } from '../hooks/useSwingSceneStats';
import type { StatItem, DayStats, MonthlyStat } from '../hooks/useSwingSceneStats';

interface SwingSceneStatsProps {
    onInsertItem?: (type: string, name: string, config: any) => void;
    section?: 'summary' | 'monthly' | 'weekly-type' | 'weekly-genre' | 'lead-time';
}

const GENRE_COLORS: { [key: string]: string } = {
    '린디합': 'var(--color-blue-600)',
    '솔로재즈': 'var(--color-rose-600)',
    '발보아': 'var(--color-amber-500)',
    '블루스': 'var(--color-teal-600)',
    '동호회 정규강습': 'var(--color-lime-400)',
    '팀원모집': 'var(--color-violet-500)',
    '행사': 'var(--color-teal-600)',
    '지터벅': 'var(--color-emerald-500)',
    '샤그': 'var(--color-emerald-400)',
    '탭댄스': 'var(--color-sky-500)',
    '웨스트코스트스윙': 'var(--color-violet-400)',
    '슬로우린디': 'var(--color-indigo-500)',
    '버번': 'var(--color-rose-500)',
    '기타': 'var(--color-slate-500)'
};

const COLORS = { classes: 'var(--color-blue-500)', events: 'var(--color-amber-400)', socials: 'var(--color-emerald-500)' };
const TYPE_SEGMENTS: Array<{ name: StatItem['type']; color: string }> = [
    { name: '강습', color: COLORS.classes },
    { name: '행사', color: COLORS.events },
    { name: '동호회 이벤트+소셜', color: COLORS.socials }
];

const getKstDateKey = () => {
    const parts = new Intl.DateTimeFormat('en', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());
    const value = (type: 'year' | 'month' | 'day') => parts.find(part => part.type === type)?.value || '';
    return `${value('year')}-${value('month')}-${value('day')}`;
};

export default function SwingSceneStats({ onInsertItem, section }: SwingSceneStatsProps) {
    const { stats, loading, refreshing, manualRefresh } = useSwingSceneStats();
    // Removed local stats/loading/refreshing states
    const [weeklyTab, setWeeklyTab] = useState<'total' | 'monthly'>('monthly');
    const [isAdmin, setIsAdmin] = useState(false);
    const isMounted = useRef(false);

    useEffect(() => {
        isMounted.current = true;
        return () => { isMounted.current = false; };
    }, []);

    const [inspectTypeDay, setInspectTypeDay] = useState<string | null>(null);
    const [inspectGenreDay, setInspectGenreDay] = useState<string | null>(null);
    const chartScrollRef = useRef<HTMLDivElement>(null);

    // 일 최대 이벤트 상세 모달
    const [maxDailyModalData, setMaxDailyModalData] = useState<{ date: string; events: StatItem[] } | null>(null);

    const handleMaxDailyClick = (month: MonthlyStat | undefined) => {
        if (!month?.maxDailyDate) return;
        setMaxDailyModalData({
            date: month.maxDailyDate,
            events: Array.isArray(month.maxDailyItems) ? month.maxDailyItems : []
        });
    };
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        let active = true;
        const checkAdmin = async () => {
            const { data: { user } } = await cafe24.auth.getUser();
            if (active && user?.email === import.meta.env.VITE_ADMIN_EMAIL) setIsAdmin(true);
        };
        checkAdmin();
        return () => { active = false; };
    }, []);

    const handleRefreshMetrics = async () => {
        await manualRefresh();
    };

    // Scroll to current month when chart becomes visible
    const hasScrolledRef = useRef(false);
    useEffect(() => {
        // stats 변경 시 스크롤 플래그 리셋
        hasScrolledRef.current = false;
    }, [stats]);

    useEffect(() => {
        const container = chartScrollRef.current;
        if (!container || !stats?.monthly) return;

        const scrollToCurrentMonth = () => {
            if (hasScrolledRef.current) return;
            const containerWidth = container.clientWidth;
            if (containerWidth === 0) return; // 아직 visible 아님

            const currentMonthStr = stats.dataQuality?.asOfDate?.slice(0, 7) || getKstDateKey().slice(0, 7);
            const currentIndex = stats.monthly.findIndex(m => m.month === currentMonthStr);

            if (currentIndex !== -1) {
                const bars = container.querySelectorAll('.bar-wrapper');
                if (bars[currentIndex]) {
                    const bar = bars[currentIndex] as HTMLElement;
                    const barCenter = bar.offsetLeft + bar.offsetWidth / 2;
                    const targetPosition = containerWidth * 0.75;
                    const scrollTo = Math.max(0, barCenter - targetPosition);
                    console.log('[ChartScroll]', { containerWidth, barCenter, targetPosition, scrollTo });
                    container.scrollLeft = scrollTo;
                    hasScrolledRef.current = true;
                }
            } else {
                container.scrollLeft = container.scrollWidth;
                hasScrolledRef.current = true;
            }
        };

        // IntersectionObserver: 차트가 화면에 보일 때 스크롤 실행
        const observer = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting && !hasScrolledRef.current) {
                requestAnimationFrame(() => {
                    scrollToCurrentMonth();
                });
            }
        }, { threshold: 0.1 });

        observer.observe(container);

        // 이미 visible인 경우 즉시 실행 시도
        requestAnimationFrame(() => {
            scrollToCurrentMonth();
        });

        return () => {
            observer.disconnect();
        };
    }, [stats]);

    if (loading || !stats) {
        return (
            <div style={{ padding: '60px 0' }}>
                <LocalLoading message="데이터 집계 중..." size="lg" />
            </div>
        );
    }

    const currentWeekly = weeklyTab === 'total' ? stats.totalWeekly : stats.monthlyWeekly;
    // const currentMonthly = monthlyRange === '1y' ? stats.monthly : stats.monthly.slice(stats.monthly.length - 6);
    // [Mod] Always show all data for horizontal scrolling
    const currentMonthly = stats.monthly;
    const asOfDate = stats.dataQuality.asOfDate || getKstDateKey();
    const currentMonthKey = asOfDate.slice(0, 7);
    const generatedAtLabel = stats.dataQuality.generatedAt
        ? new Intl.DateTimeFormat('ko-KR', {
            timeZone: stats.dataQuality.timezone || 'Asia/Seoul',
            month: 'numeric',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        }).format(new Date(stats.dataQuality.generatedAt))
        : '집계 시각 없음';

    const maxMonthly = Math.max(...currentMonthly.map(m => m.total), 1);
    const getDayCount = (dayStats: DayStats) => (
        typeof dayStats.count === 'number' ? dayStats.count : 0
    );
    const getTypeCount = (dayStats: DayStats, type: StatItem['type']) => (
        (Array.isArray(dayStats.typeBreakdown) ? dayStats.typeBreakdown : [])
            .find(tb => tb.name === type)?.count || 0
    );
    const getGenreCount = (dayStats: DayStats, genre: string) => (
        (Array.isArray(dayStats.genreBreakdown) ? dayStats.genreBreakdown : [])
            .find(gb => gb.name === genre)?.count || 0
    );
    const maxDay = Math.max(...currentWeekly.map(getDayCount), 1);

    const getTypePeak = (type: string) => {
        const sorted = [...currentWeekly].sort((a, b) => {
            const countA = getTypeCount(a, type as StatItem['type']);
            const countB = getTypeCount(b, type as StatItem['type']);
            return countB - countA;
        });
        const peak = sorted[0];
        return peak && getTypeCount(peak, type as StatItem['type']) > 0 ? peak.day : '-';
    };

    const getGenrePeak = (genre: string) => {
        const sorted = [...currentWeekly].sort((a, b) => {
            const countA = getGenreCount(a, genre);
            const countB = getGenreCount(b, genre);
            return countB - countA;
        });
        const peak = sorted[0];
        return peak && getGenreCount(peak, genre) > 0 ? peak.day : '-';
    };

    const getGenreColor = (name: string) => {
        if (GENRE_COLORS[name]) return GENRE_COLORS[name];

        // Stable fallback: Hash the name to pick a palette color
        const palette = [
            'var(--color-lime-500)',
            'var(--color-fuchsia-500)',
            'var(--color-cyan-500)',
            'var(--color-indigo-400)',
            'var(--color-pink-500)'
        ];
        let hash = 0;
        for (let i = 0; i < name.length; i++) {
            hash = name.charCodeAt(i) + ((hash << 5) - hash);
        }
        return palette[Math.abs(hash) % palette.length];
    };

    // Data Inspector Helper
    const getTypeItems = (day: string | null) => day ? currentWeekly.find(d => d.day === day)?.items || [] : [];
    const getGenreItems = (day: string | null) => day ? (currentWeekly.find(d => d.day === day)?.items || []) : [];

    const handleShare = async () => {
        if (!stats) return;
        const topDayText = stats.summary.topDay === '-' ? '집계 없음' : `${stats.summary.topDay}요일`;
        const text = `📊 스윙씬 통계 요약 (댄스빌보드)\n\n- 최근 12개월 실제 개최 회차: ${stats.summary.totalItems}회\n- 포함된 등록 이벤트: ${stats.summary.uniqueEvents}개\n- ${Number(currentMonthKey.slice(5, 7))}월 등록 일정: ${stats.summary.currentMonthOccurrences}회차 (일평균 ${stats.summary.dailyAverage}회)\n- 가장 많은 개최 요일: ${topDayText}\n\n운영 사이트에 등록된 이벤트의 개최일 기준 통계입니다.\nhttps://swingenjoy.com?modal=stats`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: '스윙씬 통계 - 댄스빌보드',
                    text: text,
                    url: 'https://swingenjoy.com?modal=stats'
                });
            } catch (err) {
                console.error('Share failed:', err);
            }
        } else {
            try {
                await navigator.clipboard.writeText(text);
                alert('통계 요약 링크가 클립보드에 복사되었습니다!');
            } catch (err) {
                console.error('Clipboard failed:', err);
                alert('공유하기를 지원하지 않는 브라우저입니다.');
            }
        }
    };

    const renderHeaderControls = () => {
        const controls = (
            <div className="stats-header-controls">
                {isAdmin && (
                    <button 
                        onClick={handleRefreshMetrics} 
                        className="share-btn admin-refresh-btn" 
                        disabled={refreshing}
                        data-analytics-id="stats_admin_refresh"
                        data-analytics-type="action"
                        data-analytics-title="DB 통계 갱신"
                        data-analytics-section="stats_modal"
                    >
                        <i className={refreshing ? "ri-loader-4-line spinner" : "ri-refresh-line"}></i>
                        {refreshing ? '집계 중...' : '통계 다시 집계'}
                    </button>
                )}
                <button 
                    onClick={handleShare} 
                    className="share-btn"
                    data-analytics-id="stats_share"
                    data-analytics-type="action"
                    data-analytics-title="통계 공유"
                    data-analytics-section="stats_modal"
                >
                    <i className="ri-share-forward-line"></i> 통계 공유
                </button>
            </div>
        );

        if (isDesktop) {
            const portalTarget = document.getElementById('stats-header-portal-target');
            if (portalTarget) {
                return createPortal(controls, portalTarget);
            }
        }

        return controls;
    };

    return (
        <div className={`swing-scene-stats ${section ? 'section-view' : ''}`}>
            {!section && renderHeaderControls()}

            {!section && (
                <div className="scene-trust-strip" aria-label="스윙씬 통계 데이터 기준">
                    <div className="scene-trust-primary">
                        <span className="scene-trust-badge"><i className="ri-shield-check-line"></i> 운영 DB 검증 집계</span>
                        <strong>{stats.summary.uniqueEvents.toLocaleString()}개 일정 · {stats.summary.totalItems.toLocaleString()}회차</strong>
                        <span>{stats.dataQuality.windowStart} ~ {stats.dataQuality.windowEnd}</span>
                    </div>
                    <div className="scene-trust-metrics">
                        <span>명시 개최일 {stats.dataQuality.explicitDateRecords.toLocaleString()}건</span>
                        <span>장르 분류율 {stats.dataQuality.genreCoverageRate.toFixed(1)}%</span>
                        <span>정확 중복 {stats.dataQuality.deduplicatedOccurrences.toLocaleString()}회 제거</span>
                        <span>{generatedAtLabel} KST 갱신</span>
                    </div>
                    <p>event_dates를 우선하며, 없을 때만 시작일을 1회로 계산합니다. 이번 달은 현재 등록된 예정 일정까지 포함합니다.</p>
                </div>
            )}

            <div className="stats-container">

                {/* Column 1: Summary & Monthly */}
                {(!section || section === 'summary' || section === 'monthly') && (
                    <div className="stats-col-1">
                        {/* Summary Section */}
                        {(!section || section === 'summary') && (() => {
                            const [curYear, curMonth] = currentMonthKey.split('-').map(Number);
                            const curStr = currentMonthKey;
                            const lastDate = new Date(Date.UTC(curYear, curMonth - 2, 1));
                            const lastMonth = lastDate.getUTCMonth() + 1;
                            const lastYear = lastDate.getUTCFullYear();
                            const lastStr = `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
                            const curStat = stats.monthly.find(m => m.month === curStr);
                            const lastStat = stats.monthly.find(m => m.month === lastStr);

                            return (
                                <div className="stats-card-grid">
                                    <div className="stats-card">
                                        <div className="card-label">최근 12개월 개최 회차</div>
                                        <div className="card-value">{stats.summary.totalItems}회</div>
                                        <div className="card-hint">등록 이벤트 {stats.summary.uniqueEvents}개 기준</div>
                                    </div>
                                    <div className="stats-card">
                                        <div className="card-label">{curMonth}월 등록 개최 회차</div>
                                        <div className="card-value">{stats.summary.currentMonthOccurrences}회</div>
                                        <div className="card-hint">예정 포함 · 하루 평균 {stats.summary.dailyAverage}회</div>
                                    </div>
                                    <div 
                                        className="stats-card stats-card-clickable" 
                                        onClick={() => handleMaxDailyClick(lastStat)}
                                        onKeyDown={(event) => {
                                            if ((event.key === 'Enter' || event.key === ' ') && lastStat?.maxDailyDate) {
                                                event.preventDefault();
                                                handleMaxDailyClick(lastStat);
                                            }
                                        }}
                                        role="button"
                                        tabIndex={lastStat?.maxDailyDate ? 0 : -1}
                                        aria-disabled={!lastStat?.maxDailyDate}
                                        aria-label={`${lastMonth}월 하루 최다 개최 회차 상세 보기`}
                                        data-analytics-id="stats_max_daily_click"
                                        data-analytics-type="action"
                                        data-analytics-title={`일 최대 이벤트 상세보기 (${lastMonth}월)`}
                                        data-analytics-section="stats_modal_summary"
                                    >
                                        <div className="card-label">{lastMonth}월 하루 최다 회차</div>
                                        <div className="card-value">{lastStat?.maxDaily || 0}회</div>
                                        <div className="card-hint">실제 개최일 기준 (이번 달 {curStat?.maxDaily || 0}회)</div>
                                        <div className="card-hint card-click-hint"><i className="ri-eye-line"></i> 터치하여 상세 보기</div>
                                    </div>
                                    <div className="stats-card">
                                        <div className="card-label">개최가 가장 많은 요일</div>
                                        <div className="card-value">{stats.summary.topDay === '-' ? '-' : `${stats.summary.topDay}요일`}</div>
                                        <div className="card-hint">최근 12개월 회차 기준</div>
                                    </div>
                                    {onInsertItem && (
                                        <div className="card-insert-row">
                                            <button
                                                className="mw-insert-btn"
                                                onClick={() => onInsertItem('scene-summary', '스윙씬 활동 요약', { summary: stats.summary })}
                                            >
                                                <i className="ri-add-line"></i> 요약 정보 본문에 삽입
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}

                        {/* Monthly Chart Section */}
                        {(!section || section === 'monthly') && (
                            <div className="stats-section">
                                <div className="stats-header">
                                    <h4 className="section-title">
                                        <i className="ri-bar-chart-fill"></i> 월별 활동 추이
                                        <span className="title-sub">(실제 개최일 기준)</span>
                                    </h4>
                                    {onInsertItem && (
                                        <button
                                            className="mw-insert-btn"
                                            onClick={() => onInsertItem('scene-monthly', '월별 활동 추이', { range: '1y' })}
                                        >
                                            <i className="ri-add-line"></i> 본문에 삽입
                                        </button>
                                    )}
                                    <div className="tab-group">
                                        <span className="tab-btn active static">최근 12개월</span>
                                    </div>
                                </div>
                                <div
                                    className="chart-container"
                                    ref={chartScrollRef}
                                    onTouchStart={(e) => e.stopPropagation()}
                                    onTouchMove={(e) => e.stopPropagation()}
                                    onTouchEnd={(e) => e.stopPropagation()}
                                >
                                    {/* ... bars mapping ... */}
                                    {currentMonthly.map((m, i) => {
                                        const isThisMonth = m.month === currentMonthKey;
                                        return (
                                            <div key={i} className={`bar-wrapper ${isThisMonth ? 'current-month' : ''}`}>
                                                <div className="bar-info-group">
                                                    {m.total > 0 && <span className="total-label">{m.total}</span>}
                                                    {m.registrations > 0 && <span className="reg-label">+{m.registrations}</span>}
                                                </div>
                                                <div className="stacked-bar">
                                                    {/* Segment order: Bottom to Top -> Classes, Events, Socials */}
                                                    <div className="bar-segment" style={{
                                                        height: `${((m.classes || 0) / maxMonthly) * 100}%`,
                                                        minHeight: (m.classes || 0) > 0 ? '1px' : '0',
                                                        background: COLORS.classes,
                                                        position: 'relative'
                                                    }}>
                                                        {(m.classes || 0) > 5 && <span className="segment-val">{m.classes}</span>}
                                                    </div>
                                                    <div className="bar-segment" style={{
                                                        height: `${((m.events || 0) / maxMonthly) * 100}%`,
                                                        minHeight: (m.events || 0) > 0 ? '1px' : '0',
                                                        background: COLORS.events,
                                                        position: 'relative'
                                                    }}>
                                                        {(m.events || 0) > 5 && <span className="segment-val">{m.events}</span>}
                                                    </div>
                                                    <div className="bar-segment" style={{
                                                        height: `${((m.socials || 0) / maxMonthly) * 100}%`,
                                                        minHeight: (m.socials || 0) > 0 ? '1px' : '0',
                                                        background: COLORS.socials,
                                                        position: 'relative'
                                                    }}>
                                                        {(m.socials || 0) > 5 && <span className="segment-val">{m.socials}</span>}
                                                    </div>
                                                </div>
                                                <div className="axis-group" style={{ height: '70px', justifyContent: 'flex-start', paddingTop: '8px' }}>
                                                    <span className="axis-label" style={{
                                                        fontSize: '0.75rem',
                                                        fontWeight: 800,
                                                        color: '#fff',
                                                        marginBottom: '6px'
                                                    }}>
                                                        {m.month.split('-')[1]}
                                                        <span style={{ fontSize: '0.6rem', fontWeight: 400, marginLeft: '1px', opacity: 0.6 }}>월</span>
                                                        {isThisMonth && <span className="today-badge" style={{ marginTop: '2px' }}>TODAY</span>}
                                                    </span>
                                                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                        <span className="axis-max" style={{
                                                            fontSize: '0.9rem',
                                                            color: '#fff',
                                                            fontWeight: 900,
                                                            lineHeight: 1
                                                        }}>
                                                            {m.maxDaily}
                                                        </span>
                                                        <span className="axis-avg" style={{
                                                            fontSize: '0.65rem',
                                                            marginTop: '2px',
                                                            opacity: 0.5,
                                                            color: 'var(--text-tertiary)',
                                                            fontWeight: 400
                                                        }}>
                                                            {m.dailyAvg}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                                <div className="legend-grid">
                                    <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.classes }}></span> 강습</div>
                                    <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.events }}></span> 행사</div>
                                    <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.socials }}></span> 동호회 이벤트+소셜</div>
                                </div>

                                <div className="chart-info-footer">
                                    <div className="info-item">
                                        <span className="info-label total">실행기준</span>
                                        <span className="info-text"> 숫자 : 실제 개최일별 회차 수</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label reg">등록기준</span>
                                        <span className="info-text"> +N : 해당 월 신규 등록 콘텐츠 수</span>
                                    </div>
                                    <div className="info-item" style={{ alignItems: 'flex-start', marginTop: '4px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px', marginRight: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 900, lineHeight: 1 }}>10</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', opacity: 0.5, fontWeight: 400, marginTop: '2px' }}>1.5</span>
                                        </div>
                                        <span className="info-text" style={{ fontSize: '0.7rem', lineHeight: '1.2', color: 'var(--text-tertiary)' }}>
                                            위(큰 숫자)는 해당 월의 <strong style={{ color: '#fff' }}>하루 최다 개최 회차</strong>,<br />
                                            아래(작은 숫자)는 해당 월의 <strong style={{ color: 'var(--text-secondary)' }}>일평균 개최 회차</strong>입니다.
                                        </span>
                                    </div>

                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Column 2: Weekly Types */}
                {(!section || section === 'weekly-type') && (
                    <div className="stats-col-2">
                        {!section && (
                            <div className="stats-header weekly-header">
                                <h3 className="weekly-title">주간 집중 분석</h3>
                                <div className="tab-group">
                                    <button 
                                        onClick={() => { setWeeklyTab('total'); setInspectTypeDay(null); setInspectGenreDay(null); }} 
                                        className={`tab-btn ${weeklyTab === 'total' ? 'active' : ''}`}
                                        data-analytics-id="stats_weekly_tab_total"
                                        data-analytics-type="action"
                                        data-analytics-title="주간분석: 전체"
                                        data-analytics-section="stats_modal_weekly"
                                    >
                                        최근 12개월
                                    </button>
                                    <button 
                                        onClick={() => { setWeeklyTab('monthly'); setInspectTypeDay(null); setInspectGenreDay(null); }} 
                                        className={`tab-btn ${weeklyTab === 'monthly' ? 'active' : ''}`}
                                        data-analytics-id="stats_weekly_tab_monthly"
                                        data-analytics-type="action"
                                        data-analytics-title="주간분석: 이번달"
                                        data-analytics-section="stats_modal_weekly"
                                    >
                                        이번 달
                                    </button>
                                </div>
                            </div>
                        )}

                        <div className="stats-section">
                            <div className="stats-header">
                                <h4 className="section-title"><i className="ri-calendar-todo-line"></i> 요일별 유형 비중</h4>
                                {onInsertItem && (
                                    <button
                                        className="mw-insert-btn"
                                        onClick={() => onInsertItem('scene-weekly-type', '요일별 유형 비중', { weeklyTab })}
                                    >
                                        <i className="ri-add-line"></i> 본문에 삽입
                                    </button>
                                )}
                            </div>
                            <div className="touch-hint">* 그래프 터치하여 상세 보기</div>

                            <div
                                className="chart-container weekly-chart"
                                onTouchStart={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                                onTouchEnd={(e) => e.stopPropagation()}
                            >
                                {currentWeekly.map((d, i) => (
                                    <div 
                                        key={i} 
                                        className="bar-wrapper" 
                                        style={{ cursor: 'pointer', opacity: inspectTypeDay && inspectTypeDay !== d.day ? 0.3 : 1 }} 
                                        onClick={() => setInspectTypeDay(inspectTypeDay === d.day ? null : d.day)}
                                        data-analytics-id={`stats_weekly_type_inspect_${d.day}`}
                                        data-analytics-type="action"
                                        data-analytics-title={`요일별 유형 상세: ${d.day}`}
                                        data-analytics-section="stats_modal_weekly"
                                    >
                                        {getDayCount(d) > 0 && <span className="total-label" style={{ color: inspectTypeDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)' }}>{getDayCount(d)}</span>}
                                        <div className="stacked-bar">
                                            {TYPE_SEGMENTS.map((segment) => {
                                                const count = getTypeCount(d, segment.name);
                                                return (
                                                    <div key={segment.name} className="bar-segment" style={{
                                                        height: `${(count / maxDay) * 100}%`,
                                                        minHeight: count > 0 ? '1px' : '0',
                                                        background: segment.color,
                                                        position: 'relative'
                                                    }}>
                                                        {count > 5 && <span className="segment-val">{count}</span>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                        <span className="axis-label" style={{ color: inspectTypeDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)', fontWeight: inspectTypeDay === d.day ? 700 : 600 }}>{d.day}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="legend-grid">
                                <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.classes }}></span> 강습</div>
                                <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.events }}></span> 행사</div>
                                <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.socials }}></span> 동호회 이벤트+소셜</div>
                            </div>

                            <div className="chart-desc">
                                <p>• <strong>동호회 이벤트+소셜</strong> 회차는 <strong>{getTypePeak('동호회 이벤트+소셜')}요일</strong>, 행사는 <strong>{getTypePeak('행사')}요일</strong>에 가장 많이 집계됩니다.</p>
                            </div>

                            {inspectTypeDay && (
                                <DataInspectorModal day={inspectTypeDay} items={getTypeItems(inspectTypeDay)} sortBy="type" onClose={() => setInspectTypeDay(null)} />
                            )}
                        </div>
                    </div>
                )}

                {/* Column 3: Weekly Genres */}
                {(!section || section === 'weekly-genre') && (
                    <div className="stats-col-3">
                        {!section && <div className="spacer-52"></div>}

                        <div className="stats-section">
                            <h4 className="section-title"><i className="ri-medal-2-line"></i> 요일별 장르 비중</h4>
                            <div className="touch-hint">* 구조화된 장르 {stats.dataQuality.genreClassifiedOccurrences}회차 / 전체 {stats.dataQuality.includedOccurrences}회차</div>

                            <div
                                className="chart-container weekly-chart"
                                onTouchStart={(e) => e.stopPropagation()}
                                onTouchMove={(e) => e.stopPropagation()}
                                onTouchEnd={(e) => e.stopPropagation()}
                            >
                                {currentWeekly.map((d, i) => (
                                    <div 
                                        key={i} 
                                        className="bar-wrapper" 
                                        style={{ cursor: 'pointer', opacity: inspectGenreDay && inspectGenreDay !== d.day ? 0.3 : 1 }} 
                                        onClick={() => setInspectGenreDay(inspectGenreDay === d.day ? null : d.day)}
                                        data-analytics-id={`stats_weekly_genre_inspect_${d.day}`}
                                        data-analytics-type="action"
                                        data-analytics-title={`요일별 장르 상세: ${d.day}`}
                                        data-analytics-section="stats_modal_weekly"
                                    >
                                        {getDayCount(d) > 0 && <span className="total-label" style={{ color: inspectGenreDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)' }}>{getDayCount(d)}</span>}
                                        <div className="stacked-bar">
                                            {(Array.isArray(d.genreBreakdown) ? d.genreBreakdown : []).map((gb, idx) => (
                                                <div key={idx} className="bar-segment"
                                                    style={{
                                                        height: `${((gb.count || 0) / maxDay) * 100}%`,
                                                        minHeight: (gb.count || 0) > 0 ? '1px' : '0',
                                                        width: '100%',
                                                        background: getGenreColor(gb.name)
                                                    }}></div>
                                            ))}
                                        </div>
                                        <span className="axis-label" style={{ color: inspectGenreDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)', fontWeight: inspectGenreDay === d.day ? 700 : 600 }}>{d.day}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="legend-grid three-cols">
                                {(stats.topGenresList || []).map((g, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-dot" style={{ background: getGenreColor(g) }}></span>
                                        <span>{g}</span>
                                    </div>
                                ))}
                            </div>

                            {(stats.topGenresList || [])[0] && (
                                <div className="chart-desc">
                                    <p>• 분류 가능한 회차 중 {stats.topGenresList[0]}은 <strong>{getGenrePeak(stats.topGenresList[0])}요일</strong>에 가장 많습니다.</p>
                                </div>
                            )}

                            {inspectGenreDay && (
                                <DataInspectorModal day={inspectGenreDay} items={getGenreItems(inspectGenreDay)} sortBy="genre" onClose={() => setInspectGenreDay(null)} />
                            )}
                        </div>
                    </div>
                )}

                {/* Column 4: Promo Stats (Moved from Col 3) */}
                {(!section || section === 'lead-time') && (
                    <div className="stats-col-4">
                        {!section && <div className="spacer-52"></div>}
                        {stats.leadTimeAnalysis && (
                            <div className="promo-analysis-section">
                                <div className="stats-header">
                                    <h4 className="section-title"><i className="ri-flashlight-line"></i> 등록 리드타임 분포</h4>
                                    {onInsertItem && (
                                        <button
                                            className="mw-insert-btn"
                                            onClick={() => onInsertItem('scene-lead-time', '등록 리드타임 분석', {})}
                                        >
                                            <i className="ri-add-line"></i> 본문에 삽입
                                        </button>
                                    )}
                                </div>
                                <p className="touch-hint" style={{ textAlign: 'left', marginTop: 0 }}>* 등록일부터 첫 개최일까지 계산한 유효 표본 {(stats.leadTimeAnalysis.classSampleSize || 0) + (stats.leadTimeAnalysis.eventSampleSize || 0)}건</p>

                                <div className="promo-chart-container">
                                    {/* Class bars */}
                                    <div className="promo-bar-group">
                                        <div className="card-label" style={{ textAlign: 'left' }}>강습 · 중앙값 {stats.leadTimeAnalysis.classMedianDays ?? '-'}일</div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>28일 이상 전</span> <span className="promo-value">{stats.leadTimeAnalysis.classEarly}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classEarly / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>7~27일 전</span> <span className="promo-value">{stats.leadTimeAnalysis.classMid}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classMid / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>0~6일 전</span> <span className="promo-value">{stats.leadTimeAnalysis.classLate}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classLate / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                    </div>

                                    {/* Event bars */}
                                    <div className="promo-bar-group">
                                        <div className="card-label" style={{ textAlign: 'left' }}>행사·소셜 · 중앙값 {stats.leadTimeAnalysis.eventMedianDays ?? '-'}일</div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>42일 이상 전</span> <span className="promo-value">{stats.leadTimeAnalysis.eventEarly}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventEarly / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>14~41일 전</span> <span className="promo-value">{stats.leadTimeAnalysis.eventMid}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventMid / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>0~13일 전</span> <span className="promo-value">{stats.leadTimeAnalysis.eventLate}건</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventLate / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                    </div>
                                </div>

                                <p className="touch-hint" style={{ textAlign: 'left', lineHeight: 1.4 }}>
                                    * 조회수나 도달률을 추정하지 않고 실제 등록일·개최일 간격만 표시합니다.<br />
                                    * 개최 후 등록 등 날짜가 역전된 표본 {stats.leadTimeAnalysis.excludedSamples || 0}건은 제외했습니다.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {maxDailyModalData && (
                <MaxDailyModal data={maxDailyModalData} onClose={() => setMaxDailyModalData(null)} />
            )}
        </div>
    );
}




const DataInspectorModal = ({ day, items, sortBy, onClose }: { day: string, items: StatItem[], sortBy: 'type' | 'genre', onClose: () => void }) => {
    // Escape key to close
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const sortedItems = [...items].sort((a, b) => {
        if (sortBy === 'type') {
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.title.localeCompare(b.title);
        } else {
            // Sort by Genre (Social at bottom) -> Type -> Title
            if (a.genre !== b.genre) {
                if (a.genre === '소셜') return 1;
                if (b.genre === '소셜') return -1;
                if (a.genre === '기타') return 1; // Fallback for legacy '기타'
                if (b.genre === '기타') return -1;
                return a.genre.localeCompare(b.genre);
            }
            if (a.type !== b.type) return a.type.localeCompare(b.type);
            return a.title.localeCompare(b.title);
        }
    });

    return (
        <div className="inspector-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="inspector-modal">
                <div className="inspector-header">
                    <h4 className="inspector-title">
                        {day}요일 상세 <span className="inspector-subtitle">({sortedItems.length}건) - {sortBy === 'type' ? '유형별' : '장르별'} 정렬</span>
                    </h4>
                    <button onClick={onClose} className="inspector-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div
                    className="inspector-content custom-scrollbar"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    {sortedItems.length === 0 ? (
                        <div className="inspector-empty">데이터가 없습니다.</div>
                    ) : (
                        <table className="inspector-table">
                            <thead className="inspector-thead">
                                <tr>
                                    <th className={`inspector-th ${sortBy === 'type' ? 'highlight-type' : ''}`}>구분</th>
                                    <th className="inspector-th">제목</th>
                                    <th className={`inspector-th ${sortBy === 'genre' ? 'highlight-genre' : ''}`}>장르</th>
                                    <th className="inspector-th date-header">등록일</th>
                                    <th className="inspector-th date-header">활동일</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item, idx) => (
                                    <tr key={idx} className="inspector-tr">
                                        <td className="inspector-td">
                                            <span className={`type-badge ${item.type === '강습' ? 'class' :
                                                item.type === '행사' ? 'event' :
                                                    item.type === '동호회 이벤트+소셜' ? 'social' : 'social'
                                                }`}>{item.type}</span>
                                        </td>
                                        <td className="inspector-td">{item.title}</td>
                                        <td className={`inspector-td ${sortBy === 'genre' ? 'genre-highlight' : 'genre-dim'}`}>{item.genre}</td>
                                        <td className="inspector-td date registration">{item.createdAt}</td>
                                        <td className="inspector-td date activity">{item.date}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
};

const MaxDailyModal = ({ data, onClose }: { data: { date: string; events: StatItem[] }; onClose: () => void }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const formattedDate = (() => {
        const [y, m, d] = data.date.split('-');
        const dateObj = new Date(`${y}-${m}-${d}T00:00:00Z`);
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${Number(m)}월 ${Number(d)}일 (${days[dateObj.getUTCDay()]})`;
    })();

    const getEventCategoryInfo = (type: StatItem['type']) => {
        if (type === '강습') return { label: type, theme: 'class' };
        if (type === '동호회 이벤트+소셜') return { label: type, theme: 'social' };
        return { label: '행사', theme: 'event' };
    };

    const statsBreakdown = (() => {
        const catMap: { [key: string]: number } = {};
        const genreMap: { [key: string]: number } = {};
        const totalEvents = data.events.length;

        data.events.forEach(ev => {
            const { label } = getEventCategoryInfo(ev.type);
            catMap[label] = (catMap[label] || 0) + 1;
            const genre = ev.genre || '장르 미분류';
            genreMap[genre] = (genreMap[genre] || 0) + 1;
        });

        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const sortedGenres = Object.entries(genreMap).sort((a, b) => b[1] - a[1]);

        return { sortedCats, sortedGenres, totalEvents };
    })();

    return (
        <div className="inspector-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="inspector-modal">
                <div className="inspector-header">
                    <h4 className="inspector-title">
                        {formattedDate} 개최 회차 <span className="inspector-subtitle">({data.events.length}회)</span>
                    </h4>
                    <button onClick={onClose} className="inspector-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>
                <div
                    className="inspector-content custom-scrollbar"
                    onTouchStart={(e) => e.stopPropagation()}
                    onTouchMove={(e) => e.stopPropagation()}
                    onTouchEnd={(e) => e.stopPropagation()}
                >
                    {data.events.length === 0 ? (
                        <div className="inspector-empty">집계된 개최 회차가 없습니다.</div>
                    ) : (
                        <>
                            <div className="max-daily-stats-summary">
                                <div className="stats-summary-header">
                                    <span className="main-label">분류별 비중</span>
                                    <span className="sub-label">(전체 {statsBreakdown.totalEvents}회)</span>
                                </div>

                                <div className="stats-visual-ratio">
                                    {statsBreakdown.sortedCats.map(([cat, count]) => (
                                        <div
                                            key={cat}
                                            className={`ratio-segment theme-${getEventCategoryInfo(cat as StatItem['type']).theme}`}
                                            style={{ width: `${(count / statsBreakdown.totalEvents) * 100}%` }}
                                            title={`${cat}: ${count}회`}
                                        >
                                            <span className="ratio-label">{cat}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="stats-summary-groups">
                                    <div className="stats-group">
                                        <div className="group-title">대분류</div>
                                        <div className="stats-chips-row">
                                            {statsBreakdown.sortedCats.map(([cat, count]) => (
                                                <div key={cat} className={`stats-summary-chip ${getEventCategoryInfo(cat as StatItem['type']).theme}`}>
                                                    <span className="chip-cat">{cat}</span>
                                                    <span className="chip-count">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="stats-group">
                                        <div className="group-title">구조화 장르</div>
                                        <div className="stats-chips-row">
                                            {statsBreakdown.sortedGenres.map(([genre, count]) => (
                                                <div key={genre} className="stats-summary-chip genre">
                                                    <span className="chip-cat">{genre}</span>
                                                    <span className="chip-count">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="max-daily-event-list">
                                {data.events.map((ev, idx) => (
                                    <div key={`${ev.eventId || ev.title}-${idx}`} className="max-daily-event-item">
                                        <div className="max-daily-event-info">
                                            <div className="max-daily-event-badge-row">
                                                <span className={`type-badge ${getEventCategoryInfo(ev.type).theme}`}>{getEventCategoryInfo(ev.type).label}</span>
                                                {ev.genre && <span className="max-daily-event-genre">{ev.genre}</span>}
                                            </div>
                                            <div className="max-daily-event-title">{ev.title}</div>
                                            {ev.time && <div className="max-daily-event-location"><i className="ri-time-line"></i> {ev.time}</div>}
                                            {ev.location && <div className="max-daily-event-location"><i className="ri-map-pin-line"></i> {ev.location}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};
