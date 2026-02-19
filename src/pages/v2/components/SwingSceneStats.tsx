import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import LocalLoading from '../../../components/LocalLoading';
import { useMonthlyBillboard } from '../hooks/useMonthlyBillboard';
import './SwingSceneStats.css';

interface StatItem {
    type: '강습' | '행사' | '동호회 이벤트+소셜';
    title: string;
    date: string; // Activity Date
    createdAt: string; // Registration Date
    genre: string;
    day: string;
}

interface DayStats {
    day: string;
    count: number;
    typeBreakdown: { name: string; count: number }[];
    genreBreakdown: { name: string; count: number }[];
    topGenre: string;
    items: StatItem[]; // Added for inspection
}

interface SceneStats {
    monthly: MonthlyStat[];
    totalWeekly: DayStats[];    // 12 months
    monthlyWeekly: DayStats[];  // Latest 1 month
    topGenresList: string[];
    summary: {
        totalItems: number;
        dailyAverage: number;
        topDay: string;
        memberCount?: number;
        pwaCount?: number;
        pushCount?: number;
    };
    leadTimeAnalysis?: {
        classEarly: number;
        classMid: number;
        classLate: number;
        eventEarly: number;
        eventMid: number;
        eventLate: number;
    };
}

interface StatAccumulator {
    types: { [key: string]: number };
    genres: { [key: string]: number };
    items: StatItem[];
}

interface MonthlyStat {
    month: string;
    classes: number;
    events: number;
    socials: number;
    clubs: number;
    total: number;
    registrations: number;
    dailyAvg: number;
}

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
    const [stats, setStats] = useState<SceneStats | null>(null);
    const [loading, setLoading] = useState(true);
    // Removed useMonthlyBillboard hook
    const [weeklyTab, setWeeklyTab] = useState<'total' | 'monthly'>('total');
    const [monthlyRange, setMonthlyRange] = useState<'6m' | '1y'>('6m');
    const [isAdmin, setIsAdmin] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [inspectTypeDay, setInspectTypeDay] = useState<string | null>(null);
    const [inspectGenreDay, setInspectGenreDay] = useState<string | null>(null);
    const chartScrollRef = useRef<HTMLDivElement>(null);
    const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 1024);

    useEffect(() => {
        const handleResize = () => setIsDesktop(window.innerWidth >= 1024);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        const checkAdmin = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (user?.email === import.meta.env.VITE_ADMIN_EMAIL) setIsAdmin(true);
        };
        checkAdmin();
        loadServerCache();
        fetchSceneStats();
    }, []);

    const handleRefreshMetrics = async () => {
        if (!confirm('DB 통계 인덱스를 재생성하고 캐시를 갱신하시겠습니까?')) return;
        setRefreshing(true);
        console.log('[SwingSceneStats] 🚀 Manual Refresh Start...');
        try {
            console.log('[SwingSceneStats] 1. Calling DB Indexing Function (refresh_site_stats_index)...');
            const { error } = await supabase.rpc('refresh_site_stats_index');
            if (error) throw error;
            console.log('[SwingSceneStats] 2. DB Indexing Success. Fetching updated stats from API...');
            await fetchSceneStats(true);
            console.log('[SwingSceneStats] ✅ Manual Refresh Complete.');
            alert('통계 인덱스가 성공적으로 최신화되었습니다.');
        } catch (err) {
            console.error('[SwingSceneStats] ❌ Refresh Error:', err);
            alert('갱신 실패: ' + (err as any).message);
        } finally {
            setRefreshing(false);
        }
    };

    const loadServerCache = async () => {
        try {
            const { data, error } = await supabase
                .from('metrics_cache')
                .select('value, updated_at')
                .eq('key', 'scene_analytics')
                .maybeSingle();

            if (data && data.value) {
                const cached = data.value as any;
                // Merge into state (Summary & Monthly only)
                setStats(prev => {
                    // If we already have full data (more keys), don't overwrite with partial cache
                    if (prev && prev.totalWeekly && prev.totalWeekly.length > 0) return prev;

                    return {
                        monthly: cached.monthly || [],
                        summary: cached.summary || { totalItems: 0, dailyAverage: 0, topDay: '-' },
                        totalWeekly: [], // Placeholder until raw fetch
                        monthlyWeekly: [], // Placeholder
                        topGenresList: [],  // Placeholder
                        leadTimeAnalysis: cached.leadTimeAnalysis // Use cached lead time
                    };
                });
                setLoading(false); // Show content immediately
            }
        } catch (e) {
            console.error('[SwingSceneStats] Server cache load failed', e);
        }
    };

    const fetchSceneStats = async (isManualRefresh = false) => {
        try {
            const url = isManualRefresh ? '/.netlify/functions/get-site-stats?refresh=true' : '/.netlify/functions/get-site-stats';
            const response = await fetch(url);
            if (!response.ok) throw new Error('API Error');
            const data = await response.json();
            console.log('[SwingSceneStats] Raw Data:', data); // DEBUG

            if (!data || !data.summary) {
                console.error('[SwingSceneStats] Invalid Data Structure:', data);
                throw new Error('Invalid Data Structure');
            }

            const newStats: SceneStats = {
                monthly: data.monthly || [],
                totalWeekly: (data.totalWeekly || []).map((d: any) => ({
                    ...d,
                    items: Array.isArray(d.items) ? d.items.flat() : []
                })),
                monthlyWeekly: (data.monthlyWeekly || []).map((d: any) => ({
                    ...d,
                    items: Array.isArray(d.items) ? d.items.flat() : []
                })),
                topGenresList: data.topGenresList || [],
                summary: {
                    totalItems: data.summary?.totalItems || 0,
                    dailyAverage: data.summary?.dailyAverage || 0,
                    topDay: data.summary?.topDay || '-',
                    memberCount: data.summary?.memberCount || 0,
                    pwaCount: data.summary?.pwaCount || 0,
                    pushCount: data.summary?.pushCount || 0
                },
                leadTimeAnalysis: data.leadTimeAnalysis
            };
            console.log('[SwingSceneStats] Parsed Stats:', newStats); // DEBUG
            console.log('[SwingSceneStats] Monthly Details:', newStats.monthly);
            console.log('[SwingSceneStats] Weekly Details:', newStats.totalWeekly);
            console.log('[SwingSceneStats] Top Genres:', newStats.topGenresList);
            console.log('[SwingSceneStats] Lead Time:', newStats.leadTimeAnalysis);

            setStats(newStats);

            window.dispatchEvent(new CustomEvent('statsUpdated', {
                detail: {
                    total: newStats.summary.totalItems,
                    avg: newStats.summary.dailyAverage,
                    memberCount: newStats.summary.memberCount,
                    pwaCount: newStats.summary.pwaCount,
                    pushCount: newStats.summary.pushCount
                }
            }));

        } catch (error) {
            console.error('[SwingSceneStats] API Error:', error);
        } finally {
            setLoading(false);
        }
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

    // Scroll to current month on load
    useEffect(() => {
        if (chartScrollRef.current && stats?.monthly) {
            const now = new Date();
            const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
            const currentIndex = stats.monthly.findIndex(m => m.month === currentMonthStr);

            if (currentIndex !== -1) {
                const container = chartScrollRef.current;
                const bars = container.querySelectorAll('.bar-wrapper');
                if (bars[currentIndex]) {
                    const bar = bars[currentIndex] as HTMLElement;
                    const containerWidth = container.clientWidth;
                    // Align the right edge of the bar with the right edge of the container
                    const barRight = bar.offsetLeft + bar.offsetWidth + 16; // Add some gap padding
                    container.scrollLeft = barRight - containerWidth;
                }
            } else {
                chartScrollRef.current.scrollLeft = chartScrollRef.current.scrollWidth;
            }
        }
    }, [stats, monthlyRange]);

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
                    <button onClick={handleRefreshMetrics} className="share-btn admin-refresh-btn" disabled={refreshing}>
                        <i className={refreshing ? "ri-loader-4-line spinner" : "ri-refresh-line"}></i>
                        {refreshing ? '갱신 중...' : 'DB 통계 갱신'}
                    </button>
                )}
                <button onClick={handleShare} className="share-btn">
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
                        {(!section || section === 'summary') && (
                            <div className="stats-card-grid">
                                <div className="stats-card">
                                    <div className="card-label">최근 1년 이벤트 등록수</div>
                                    <div className="card-value">{stats.summary.totalItems}건</div>
                                    <div className="card-hint">시작일 기준</div>
                                </div>
                                <div className="stats-card">
                                    <div className="card-label">일평균 이벤트</div>
                                    <div className="card-value">{stats.summary.dailyAverage}건</div>
                                    <div className="card-hint">시작일 기준</div>
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
                        )}

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
                                            onClick={() => onInsertItem('scene-monthly', '월별 활동 추이', { range: monthlyRange })}
                                        >
                                            <i className="ri-add-line"></i> 본문에 삽입
                                        </button>
                                    )}
                                    <div className="tab-group">
                                        <button onClick={() => setMonthlyRange('6m')} className={`tab-btn ${monthlyRange === '6m' ? 'active' : ''}`}>6개월</button>
                                        <button onClick={() => setMonthlyRange('1y')} className={`tab-btn ${monthlyRange === '1y' ? 'active' : ''}`}>1년</button>
                                    </div>
                                </div>
                                <div className="chart-container" ref={chartScrollRef}>
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
                                                <div className="axis-group">
                                                    <span className="axis-label">
                                                        {m.month.split('-')[1]}월
                                                        {isThisMonth && <span className="today-badge">오늘까지</span>}
                                                    </span>
                                                    <span className="axis-avg">{m.dailyAvg}</span>
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
                                    <div className="info-item">
                                        <span className="info-label avg">일평균</span>
                                        <span className="info-text">5.4 : 해당 월의 일평균 이벤트수 (이번 달은 오늘까지 기준)</span>
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
                                    <button onClick={() => { setWeeklyTab('total'); setInspectTypeDay(null); setInspectGenreDay(null); }} className={`tab-btn ${weeklyTab === 'total' ? 'active' : ''}`}>전체</button>
                                    <button onClick={() => { setWeeklyTab('monthly'); setInspectTypeDay(null); setInspectGenreDay(null); }} className={`tab-btn ${weeklyTab === 'monthly' ? 'active' : ''}`}>이번 달</button>
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

                            <div className="chart-container weekly-chart">
                                {currentWeekly.map((d, i) => (
                                    <div key={i} className="bar-wrapper" style={{ cursor: 'pointer', opacity: inspectTypeDay && inspectTypeDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectTypeDay(inspectTypeDay === d.day ? null : d.day)}>
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
                                        <span className="axis-label" style={{ color: inspectTypeDay === d.day ? 'var(--color-blue-400)' : 'var(--text-muted)' }}>{d.day}</span>
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

                            <div className="chart-container weekly-chart">
                                {currentWeekly.map((d, i) => (
                                    <div key={i} className="bar-wrapper" style={{ cursor: 'pointer', opacity: inspectGenreDay && inspectGenreDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectGenreDay(inspectGenreDay === d.day ? null : d.day)}>
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
                                        <span className="axis-label" style={{ color: inspectGenreDay === d.day ? 'var(--color-blue-400)' : 'var(--text-muted)' }}>{d.day}</span>
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
                                            <div className="promo-label-row"><span>얼리버드 (21일 전)</span> <span className="promo-value">{stats.leadTimeAnalysis.classEarly} pv</span></div>
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
                                            <div className="promo-label-row"><span>얼리버드 (35일 전)</span> <span className="promo-value">{stats.leadTimeAnalysis.eventEarly} pv</span></div>
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
        </div>
    );
}



const DataInspectorModal = ({ day, items, sortBy, onClose }: { day: string, items: StatItem[], sortBy: 'type' | 'genre', onClose: () => void }) => {
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
        <div className="inspector-overlay">
            <div className="inspector-modal">
                <div className="inspector-header">
                    <h4 className="inspector-title">
                        {day}요일 상세 <span className="inspector-subtitle">({sortedItems.length}건) - {sortBy === 'type' ? '유형별' : '장르별'} 정렬</span>
                    </h4>
                    <button onClick={onClose} className="inspector-close-btn">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="inspector-content custom-scrollbar">
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


