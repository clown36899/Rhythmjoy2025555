import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import LocalLoading from '../../../components/LocalLoading';
import { useMonthlyBillboard } from '../hooks/useMonthlyBillboard';
import './SwingSceneStats.css';

import { useSwingSceneStats } from '../hooks/useSwingSceneStats';
import type { StatItem, DayStats, SceneStats, MonthlyStat } from '../hooks/useSwingSceneStats';

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
    const [maxDailyModalData, setMaxDailyModalData] = useState<{ date: string; events: any[] } | null>(null);
    const [maxDailyLoading, setMaxDailyLoading] = useState(false);

    const handleMaxDailyClick = async (targetDate: string | undefined) => {
        console.log('[MaxDailyClick] Clicked. targetDate:', targetDate);
        if (!targetDate) {
            console.warn('[MaxDailyClick] No targetDate provided. Check if server stats have maxDailyDate field.');
            return;
        }
        setMaxDailyLoading(true);
        try {
            // Fetch only non-recurring events as they are what contributes to act_count in stats index.
            // Conditions from DB refresh_site_stats_index function:
            // 1. day_of_week IS NULL
            // 2. category != 'board' (and not 'notice', 'notice_popup' in some versions)
            // 3. Match by: (start_date OR date) OR (any date inside event_dates)

            const { data, error } = await supabase
                .from('events')
                .select('id, title, category, genre, start_date, date, location, image_thumbnail, event_dates')
                .not('category', 'in', '("board", "notice", "notice_popup")')
                .or(`start_date.eq.${targetDate},date.eq.${targetDate},event_dates.cs.["${targetDate}"],event_dates.cs.[{"date":"${targetDate}"}]`)
                .order('category', { ascending: true });

            if (error) throw error;

            console.log(`[MaxDailyClick] Target: ${targetDate}, Found: ${data?.length} events`);
            if (data && data.length > 0) {
                data.forEach((ev, idx) => {
                    console.log(`  ${idx + 1}. [${ev.category}] ${ev.title} (ID: ${ev.id})`);
                });
            } else {
                console.warn(`[MaxDailyClick] No events found for ${targetDate}`);
            }

            setMaxDailyModalData({ date: targetDate, events: data || [] });
        } catch (err) {
            console.error('[MaxDailyClick] Error:', err);
        } finally {
            setMaxDailyLoading(false);
        }
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
            const { data: { user } } = await supabase.auth.getUser();
            if (active && user?.email === import.meta.env.VITE_ADMIN_EMAIL) setIsAdmin(true);
        };
        checkAdmin();
        return () => { active = false; };
    }, []);

    const handleRefreshMetrics = async () => {
        await manualRefresh();
    };

    // Save Cache when stats update
    useEffect(() => {
        if (stats) {
            try {
                localStorage.setItem('swing_scene_stats_cache', JSON.stringify({
                    timestamp: new Date().getTime(),
                    data: stats,
                    v: 'v5'
                }));
            } catch (e) {
                console.error('Cache save failed', e);
            }
        }
    }, [stats]);

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

            const now = new Date();
            const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
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

    const maxMonthly = Math.max(...currentMonthly.map(m => m.total), 1);
    const maxDay = Math.max(...currentWeekly.map(d => d.count), 1);

    const getTypePeak = (type: string) => {
        const sorted = [...currentWeekly].sort((a, b) => {
            const countA = a.typeBreakdown.find(tb => tb.name === type)?.count || 0;
            const countB = b.typeBreakdown.find(tb => tb.name === type)?.count || 0;
            return countB - countA;
        });
        return sorted[0]?.day || '-';
    };

    const getGenrePeak = (genre: string) => {
        const sorted = [...currentWeekly].sort((a, b) => {
            const countA = a.genreBreakdown.find(gb => gb.name === genre)?.count || 0;
            const countB = b.genreBreakdown.find(gb => gb.name === genre)?.count || 0;
            return countB - countA;
        });
        return sorted[0]?.day || '-';
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
        const text = `📊 스윙씬 통계 요약 (From 댄스빌보드)\n\n- 최근 1년 이벤트 등록수: ${stats.summary.totalItems}건\n- 실질 일평균 이벤트: ${stats.summary.dailyAverage}건\n- 가장 활발한 요일: ${stats.summary.topDay}요일\n\n더 자세한 스윙씬 트렌드는 댄스빌보드에서 확인하세요!\nhttps://swingenjoy.com?modal=stats`;

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
                        {refreshing ? '갱신 중...' : 'DB 통계 갱신'}
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

            <div className="stats-container">

                {/* Column 1: Summary & Monthly */}
                {(!section || section === 'summary' || section === 'monthly') && (
                    <div className="stats-col-1">
                        {/* Summary Section */}
                        {(!section || section === 'summary') && (() => {
                            // KST 시간 계산 (카드 공유용)
                            const now = new Date();
                            const kstNow = new Date(now.getTime() + (9 * 60 * 60 * 1000));
                            const curMonth = kstNow.getUTCMonth() + 1;
                            const curYear = kstNow.getUTCFullYear();
                            const curStr = `${curYear}-${String(curMonth).padStart(2, '0')}`;
                            const lastDate = new Date(Date.UTC(curYear, curMonth - 2, 1));
                            const lastMonth = lastDate.getUTCMonth() + 1;
                            const lastYear = lastDate.getUTCFullYear();
                            const lastStr = `${lastYear}-${String(lastMonth).padStart(2, '0')}`;
                            const curStat = stats.monthly.find(m => m.month === curStr);
                            const lastStat = stats.monthly.find(m => m.month === lastStr);

                            return (
                                <div className="stats-card-grid">
                                    <div className="stats-card">
                                        <div className="card-label">최근 1년 이벤트 등록수</div>
                                        <div className="card-value">{stats.summary.totalItems}건</div>
                                        <div className="card-hint">시작일 기준</div>
                                    </div>
                                    <div className="stats-card">
                                        <div className="card-label">{curMonth}월 일평균 이벤트</div>
                                        <div className="card-value">{stats.summary.dailyAverage}건</div>
                                        <div className="card-hint">하루 평균 발생 수</div>
                                    </div>
                                    <div 
                                        className="stats-card stats-card-clickable" 
                                        onClick={() => handleMaxDailyClick(lastStat?.maxDailyDate)}
                                        data-analytics-id="stats_max_daily_click"
                                        data-analytics-type="action"
                                        data-analytics-title={`일 최대 이벤트 상세보기 (${lastMonth}월)`}
                                        data-analytics-section="stats_modal_summary"
                                    >
                                        <div className="card-label">{lastMonth}월 일 최대 이벤트수</div>
                                        <div className="card-value">{lastStat?.maxDaily || 0}건</div>
                                        <div className="card-hint">하루에 가장 많이 등록된 수 (이번달 {curStat?.maxDaily || 0}건)</div>
                                        <div className="card-hint card-click-hint"><i className="ri-eye-line"></i> 터치하여 상세 보기</div>
                                    </div>
                                    <div className="stats-card">
                                        <div className="card-label">최고 활성</div>
                                        <div className="card-value">{stats.summary.topDay}요일</div>
                                        <div className="card-hint">누적 통계</div>
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
                                        <span className="title-sub">(시작일 기준)</span>
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
                                        <span className="tab-btn active static">최근 1년</span>
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
                                        const [year, monthNum] = m.month.split('-').map(Number);
                                        const isThisMonth = year === new Date().getFullYear() && monthNum === (new Date().getMonth() + 1);
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
                                                        height: `${(((m.socials || 0) + (m.clubs || 0)) / maxMonthly) * 100}%`,
                                                        minHeight: ((m.socials || 0) + (m.clubs || 0)) > 0 ? '1px' : '0',
                                                        background: COLORS.socials,
                                                        position: 'relative'
                                                    }}>
                                                        {((m.socials || 0) + (m.clubs || 0)) > 5 && <span className="segment-val">{(m.socials || 0) + (m.clubs || 0)}</span>}
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
                                        <span className="info-text"> 숫자 : 이벤트 시작일 기준 발생 수</span>
                                    </div>
                                    <div className="info-item">
                                        <span className="info-label reg">등록기준</span>
                                        <span className="info-text"> +N : 신규 정보 등록 건수</span>
                                    </div>
                                    <div className="info-item" style={{ alignItems: 'flex-start', marginTop: '4px' }}>
                                        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: '40px', marginRight: '8px' }}>
                                            <span style={{ fontSize: '0.9rem', color: '#fff', fontWeight: 900, lineHeight: 1 }}>10</span>
                                            <span style={{ fontSize: '0.65rem', color: 'var(--text-tertiary)', opacity: 0.5, fontWeight: 400, marginTop: '2px' }}>1.5</span>
                                        </div>
                                        <span className="info-text" style={{ fontSize: '0.7rem', lineHeight: '1.2', color: 'var(--text-tertiary)' }}>
                                            위(큰 숫자)는 해당 월의 <strong style={{ color: '#fff' }}>일일 최대 등록수</strong>,<br />
                                            아래(작은 숫자)는 해당 월의 <strong style={{ color: 'var(--text-secondary)' }}>일평균 발생수</strong>를 의미합니다.
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
                                        전체
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
                                        {d.count > 0 && <span className="total-label" style={{ color: inspectTypeDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)' }}>{d.count}</span>}
                                        <div className="stacked-bar">
                                            {/* Correct order (Bottom to Top): 0:Classes, 1:Events, 2:Socials */}
                                            <div className="bar-segment" style={{
                                                height: `${(d.typeBreakdown[0].count / maxDay) * 100}%`,
                                                minHeight: d.typeBreakdown[0].count > 0 ? '1px' : '0',
                                                background: COLORS.classes,
                                                position: 'relative'
                                            }}>
                                                {d.typeBreakdown[0].count > 5 && <span className="segment-val">{d.typeBreakdown[0].count}</span>}
                                            </div>
                                            <div className="bar-segment" style={{
                                                height: `${(d.typeBreakdown[1].count / maxDay) * 100}%`,
                                                minHeight: d.typeBreakdown[1].count > 0 ? '1px' : '0',
                                                background: COLORS.events,
                                                position: 'relative'
                                            }}>
                                                {d.typeBreakdown[1].count > 5 && <span className="segment-val">{d.typeBreakdown[1].count}</span>}
                                            </div>
                                            <div className="bar-segment" style={{
                                                height: `${(d.typeBreakdown[2].count / maxDay) * 100}%`,
                                                minHeight: d.typeBreakdown[2].count > 0 ? '1px' : '0',
                                                background: COLORS.socials,
                                                position: 'relative'
                                            }}>
                                                {d.typeBreakdown[2].count > 5 && <span className="segment-val">{d.typeBreakdown[2].count}</span>}
                                            </div>
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
                                <p>• <strong>동호회 이벤트+소셜</strong> 항목은 <strong>{getTypePeak('동호회 이벤트+소셜')}요일</strong>, 행사는 <strong>{getTypePeak('행사')}요일</strong>에 가장 활발합니다.</p>
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
                            <h4 className="section-title"><i className="ri-medal-2-line"></i> 외부강습 요일별 장르 비중</h4>

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
                                        {d.count > 0 && <span className="total-label" style={{ color: inspectGenreDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)' }}>{d.count}</span>}
                                        <div className="stacked-bar">
                                            {d.genreBreakdown.map((gb, idx) => (
                                                <div key={idx} className="bar-segment"
                                                    style={{
                                                        height: `${(gb.count / maxDay) * 100}%`,
                                                        minHeight: gb.count > 0 ? '1px' : '0',
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
                                {stats.topGenresList.map((g, i) => (
                                    <div key={i} className="legend-item">
                                        <span className="legend-dot" style={{ background: getGenreColor(g) }}></span>
                                        <span>{g}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="chart-desc">
                                <p>• {stats.topGenresList[0]} 장르는 <strong>{getGenrePeak(stats.topGenresList[0])}요일</strong>에 가장 핫합니다.</p>
                            </div>

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
                                    <h4 className="section-title"><i className="ri-flashlight-line"></i> 홍보 시작 시점별 조회 도달율</h4>
                                    {onInsertItem && (
                                        <button
                                            className="mw-insert-btn"
                                            onClick={() => onInsertItem('scene-lead-time', '홍보 리드타임 분석', {})}
                                        >
                                            <i className="ri-add-line"></i> 본문에 삽입
                                        </button>
                                    )}
                                </div>
                                <p className="touch-hint" style={{ textAlign: 'left', marginTop: 0 }}>* 등록일부터 행사 시작일까지의 준비 기간별 분석</p>

                                <div className="promo-chart-container">
                                    {/* Class bars */}
                                    <div className="promo-bar-group">
                                        <div className="card-label" style={{ textAlign: 'left' }}>정규 강습</div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>얼리버드 (28일 전)</span> <span className="promo-value">{stats.leadTimeAnalysis.classEarly} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classEarly / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>적기 홍보 (7~21일)</span> <span className="promo-value">{stats.leadTimeAnalysis.classMid} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classMid / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>긴급 등록 (7일 이내)</span> <span className="promo-value">{stats.leadTimeAnalysis.classLate} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.classLate / Math.max(1, stats.leadTimeAnalysis.classEarly, stats.leadTimeAnalysis.classMid, stats.leadTimeAnalysis.classLate)) * 100)}%` }}></div></div>
                                        </div>
                                    </div>

                                    {/* Event bars */}
                                    <div className="promo-bar-group">
                                        <div className="card-label" style={{ textAlign: 'left' }}>파티 및 이벤트</div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>얼리버드 (42일 전)</span> <span className="promo-value">{stats.leadTimeAnalysis.eventEarly} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventEarly / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>적기 홍보 (14~35일)</span> <span className="promo-value">{stats.leadTimeAnalysis.eventMid} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventMid / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                        <div className="promo-bar-item">
                                            <div className="promo-label-row"><span>긴급 등록 (14일 이내)</span> <span className="promo-value">{stats.leadTimeAnalysis.eventLate} pv</span></div>
                                            <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (stats.leadTimeAnalysis.eventLate / Math.max(1, stats.leadTimeAnalysis.eventEarly, stats.leadTimeAnalysis.eventMid, stats.leadTimeAnalysis.eventLate)) * 100)}%` }}></div></div>
                                        </div>
                                    </div>
                                </div>

                                <p className="touch-hint" style={{ textAlign: 'left', lineHeight: 1.4 }}>
                                    * 리드타임이 길수록 잠재 고객 노출 기회가 많아집니다.<br />
                                    * 강습은 최소 21일 전, 이벤트는 35일 전 등록을 권장합니다.
                                </p>
                            </div>
                        )}
                    </div>
                )}
            </div>
            {maxDailyModalData && (
                <MaxDailyModal data={maxDailyModalData} onClose={() => setMaxDailyModalData(null)} />
            )}
            {maxDailyLoading && (
                <div className="inspector-overlay">
                    <div className="inspector-modal" style={{ textAlign: 'center', padding: '40px' }}>
                        <LocalLoading message="이벤트 조회 중..." size="sm" />
                    </div>
                </div>
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

const MaxDailyModal = ({ data, onClose }: { data: { date: string; events: any[] }; onClose: () => void }) => {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    const formattedDate = (() => {
        const [y, m, d] = data.date.split('-');
        const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
        const days = ['일', '월', '화', '수', '목', '금', '토'];
        return `${Number(m)}월 ${Number(d)}일 (${days[dateObj.getDay()]})`;
    })();

    const getEventCategoryInfo = (category: string) => {
        const cat = category || '';

        // 실제 분류(DB의 category 필드)를 기반으로 고유 테마 매핑
        if (cat === 'class' || cat === 'club_lesson' || cat === '강습') {
            return { label: '강습', theme: 'class' };
        }
        if (cat === 'social' || cat === '소셜') {
            return { label: '소셜', theme: 'social' };
        }
        if (cat === 'club' || cat === '동호회') {
            return { label: '동호회', theme: 'club' };
        }
        if (cat === 'event' || cat === '행사') {
            return { label: '행사', theme: 'event' };
        }

        return { label: cat || '이벤트', theme: 'etc' };
    };

    // --- 통계 집계 로직 ---
    const statsBreakdown = (() => {
        const catMap: { [key: string]: number } = {};
        const genreMap: { [key: string]: number } = {};
        const totalEvents = data.events.length;

        data.events.forEach(ev => {
            // 1. 대분류 집계 (이벤트당 1개, 총합이 totalEvents와 일치)
            const { label } = getEventCategoryInfo(ev.category);
            catMap[label] = (catMap[label] || 0) + 1;

            // 2. 소분류(장르) 집계 (한 이벤트가 여러 장르를 가질 수 있음)
            if (ev.genre) {
                const genres = ev.genre.split(',').map((g: string) => g.trim()).filter(Boolean);
                genres.forEach((g: string) => {
                    genreMap[g] = (genreMap[g] || 0) + 1;
                });
            } else {
                genreMap['기타'] = (genreMap['기타'] || 0) + 1;
            }
        });

        // 3. 정렬
        const sortedCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
        const sortedGenres = Object.entries(genreMap).sort((a, b) => b[1] - a[1]);

        return { sortedCats, sortedGenres, totalEvents };
    })();

    return (
        <div className="inspector-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="inspector-modal">
                <div className="inspector-header">
                    <h4 className="inspector-title">
                        {formattedDate} 이벤트 <span className="inspector-subtitle">({data.events.length}건)</span>
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
                        <div className="inspector-empty">이벤트가 없습니다.</div>
                    ) : (
                        <>
                            {/* 통계 요약 섹션 */}
                            <div className="max-daily-stats-summary">
                                <div className="stats-summary-header">
                                    <span className="main-label">분류별 비중</span>
                                    <span className="sub-label">(전체 {statsBreakdown.totalEvents}건)</span>
                                </div>

                                {/* 대분류 기준 비율 바 (총합 100%) */}
                                <div className="stats-visual-ratio">
                                    {statsBreakdown.sortedCats.map(([cat, count]) => (
                                        <div
                                            key={cat}
                                            className={`ratio-segment theme-${getEventCategoryInfo(cat).theme}`}
                                            style={{ width: `${(count / statsBreakdown.totalEvents) * 100}%` }}
                                            title={`${cat}: ${count}건`}
                                        >
                                            <span className="ratio-label">{cat}</span>
                                        </div>
                                    ))}
                                </div>

                                <div className="stats-summary-groups">
                                    {/* 대분류 칩 */}
                                    <div className="stats-group">
                                        <div className="group-title">대분류</div>
                                        <div className="stats-chips-row">
                                            {statsBreakdown.sortedCats.map(([cat, count]) => (
                                                <div key={cat} className={`stats-summary-chip ${getEventCategoryInfo(cat).theme}`}>
                                                    <span className="chip-cat">{cat}</span>
                                                    <span className="chip-count">{count}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* 소분류(장르) 칩 */}
                                    <div className="stats-group">
                                        <div className="group-title">소분류(장르)</div>
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
                                    <div key={ev.id || idx} className="max-daily-event-item">
                                        {ev.image_thumbnail && (
                                            <div className="max-daily-event-thumb">
                                                <img src={ev.image_thumbnail} alt={ev.title} />
                                            </div>
                                        )}
                                        <div className="max-daily-event-info">
                                            <div className="max-daily-event-badge-row">
                                                <span className={`type-badge ${getEventCategoryInfo(ev.category).theme}`}>{getEventCategoryInfo(ev.category).label}</span>
                                                {ev.genre && <span className="max-daily-event-genre">{ev.genre}</span>}
                                            </div>
                                            <div className="max-daily-event-title">{ev.title}</div>
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
