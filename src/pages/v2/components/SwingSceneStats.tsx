import { useState, useEffect } from 'react';
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
    monthly: {
        month: string;
        classes: number;
        events: number;
        socials: number;
        clubs: number;
        total: number;
        registrations: number;
    }[];
    totalWeekly: DayStats[];    // 12 months
    monthlyWeekly: DayStats[];  // Latest 1 month
    topGenresList: string[];
    summary: {
        totalItems: number;
        monthlyAverage: number;
        topDay: string;
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
}

export default function SwingSceneStats() {
    const [stats, setStats] = useState<SceneStats | null>(null);
    const [loading, setLoading] = useState(true);
    const { data: billboard } = useMonthlyBillboard('all' as any); // All-time for stability
    const [weeklyTab, setWeeklyTab] = useState<'total' | 'monthly'>('total');
    const [monthlyRange, setMonthlyRange] = useState<'6m' | '1y'>('6m');
    const [inspectTypeDay, setInspectTypeDay] = useState<string | null>(null);
    const [inspectGenreDay, setInspectGenreDay] = useState<string | null>(null);

    useEffect(() => {
        const cached = localStorage.getItem('swing_scene_stats_cache');
        if (cached) {
            try {
                const { timestamp, data, v } = JSON.parse(cached);
                const now = new Date().getTime();
                // 1 Hour Cache + Version Invalidation
                if (v === 'v4' && now - timestamp < 3600 * 1000) {
                    setStats(data);
                    setLoading(false);
                    return;
                }
            } catch (e) {
                console.error('Cache parse failed', e);
            }
        }
        fetchSceneStats();
    }, []);

    const fetchSceneStats = async () => {
        setLoading(true);
        try {
            const twelveMonthsAgo = new Date();
            twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12);
            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);



            // 1. Fetch data (Fetch enough history to cover 12 months)
            const dateFilter = twelveMonthsAgo.toISOString(); // Use ISO for accurate comparison

            // Paginated fetch helper (Supabase 1000건 제한 우회)
            const fetchAll = async (tableName: string, query: () => any) => {
                let all: any[] = [];
                let page = 0;
                const PAGE_SIZE = 1000;
                let hasMore = true;
                while (hasMore) {
                    const { data, error } = await query()
                        .range(page * PAGE_SIZE, (page + 1) * PAGE_SIZE - 1);
                    if (error) throw error;
                    if (data && data.length > 0) {
                        all = all.concat(data);
                        console.log(`[SwingSceneStats] ${tableName}: page ${page + 1} → ${data.length}건 (누적 ${all.length}건)`);
                        hasMore = data.length === PAGE_SIZE;
                        page++;
                    } else {
                        hasMore = false;
                    }
                }
                console.log(`[SwingSceneStats] ${tableName}: 총 ${all.length}건 로드 완료 (${page}페이지)`);
                return all;
            };

            // 1. Fetch data with improved filtering + pagination
            // Fetch items where (Created in last 12m) OR (Starts in last 12m)
            // 게시글(board_posts)은 스윙씬 통계에서 제외 — 행사/강습/소셜만 집계
            const [events, socials] = await Promise.all([
                fetchAll('events', () => supabase.from('events')
                    .select('id, category, genre, created_at, date, start_date, event_dates, title')
                    .or(`created_at.gte.${dateFilter},start_date.gte.${dateFilter},date.gte.${dateFilter}`)),
                fetchAll('social_schedules', () => supabase.from('social_schedules')
                    .select('id, v2_category, v2_genre, created_at, date, day_of_week, title')
                    .or(`created_at.gte.${dateFilter},date.gte.${dateFilter}`))
            ]);


            // 2. Process Data
            const monthlyDict: { [key: string]: MonthlyStat } = {};
            const globalGenreDict: { [name: string]: number } = {};
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

            const initDow = () => {
                const dict: { [key: string]: StatAccumulator } = {};
                dayNames.forEach(d => dict[d] = {
                    types: { '강습': 0, '행사': 0, '동호회 이벤트+소셜': 0 },
                    genres: {}, // Initialize empty
                    items: [] as StatItem[]
                });
                return dict;
            };

            const dowTotal = initDow();
            const dowMonthly = initDow();

            const months: string[] = [];
            for (let i = 11; i >= 0; i--) {
                const d = new Date();
                d.setMonth(d.getMonth() - i);
                const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                months.push(key);
                monthlyDict[key] = { month: key, classes: 0, events: 0, socials: 0, clubs: 0, total: 0, registrations: 0 };
            }

            // Events
            events.forEach(e => {
                // [정합성] 게시판, 공지사항 성격의 카테고리는 통계에서 제외 (v7.0)
                if (['notice', 'notice_popup', 'board'].includes(e.category)) return;

                // TEST DEBUG: Strict Check for Dec 2025 - REMOVED for Production
                const dCreated = new Date(e.created_at);

                // Update Registration Trend (Supply)
                const regMonKey = `${dCreated.getFullYear()}-${String(dCreated.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyDict[regMonKey]) {
                    monthlyDict[regMonKey].registrations++;
                }

                // Weekly & Monthly: Based on Activity Date (STRICT ACTIVITY ONLY)
                const targetDates: string[] = [];
                if (e.event_dates && e.event_dates.length > 0) {
                    e.event_dates.forEach((d: string) => targetDates.push(d));
                } else {
                    const primaryDate = e.start_date || e.date;
                    if (primaryDate) targetDates.push(primaryDate);
                }

                const type = e.category === 'club' ? 'clubs' : e.category === 'class' ? 'classes' : 'events';
                const typeKr = type === 'clubs' ? '동호회 이벤트+소셜' : type === 'classes' ? '강습' : '행사';

                // Update Monthly Trend (Activity-based)
                if (targetDates.length > 0) {
                    const dFirstActivity = new Date(targetDates[0]);
                    if (!isNaN(dFirstActivity.getTime())) {
                        const activityMonKey = `${dFirstActivity.getFullYear()}-${String(dFirstActivity.getMonth() + 1).padStart(2, '0')}`;
                        if (monthlyDict[activityMonKey]) {
                            monthlyDict[activityMonKey][type]++;
                            monthlyDict[activityMonKey].total++;
                        }
                    }
                }

                if (targetDates.length === 0) return;

                // UNIQUE DAY LOGIC: Count each Day-of-Week only ONCE per event
                const uniqueDays = new Set<string>();

                targetDates.forEach(dateStr => {
                    const dActivity = new Date(dateStr);
                    if (isNaN(dActivity.getTime())) return;
                    const dowKey = dayNames[dActivity.getDay()];
                    uniqueDays.add(dowKey);
                });



                uniqueDays.forEach(dowKey => {
                    // Item for Inspector
                    const item: StatItem = {
                        type: typeKr,
                        title: e.title || '제목 없음',
                        date: targetDates[0] + (targetDates.length > 1 ? ` 외 ${targetDates.length - 1}건` : ''),
                        createdAt: e.created_at.split('T')[0],
                        genre: e.genre || '',
                        day: dowKey
                    };

                    dowTotal[dowKey].types[typeKr]++;
                    dowTotal[dowKey].items.push(item);

                    if (dCreated >= oneMonthAgo) {
                        dowMonthly[dowKey].types[typeKr]++;
                        dowMonthly[dowKey].items.push(item);
                    }

                    // 장르 파싱: 강습/행사만 장르 집계
                    if (typeKr === '동호회 이벤트+소셜') return;

                    const GENRE_EXCLUDE = ['정규강습', '팀원모집', '-']; // '기타'는 제외하지 않음, '소셜'은 장르가 아님
                    const eventGenres = e.genre
                        ? e.genre.split(',').map((g: string) => g.trim()).filter((g: string) => g && !GENRE_EXCLUDE.includes(g) && g !== '소셜')
                        : [];

                    if (eventGenres.length > 0) {
                        eventGenres.forEach((g: string) => {
                            // 대회, 워크샵, 파티 통합 + 행사의 '기타'도 '행사'로 통합
                            let mappedGenre = g;
                            if (['대회', '워크샵', '파티'].includes(g)) {
                                mappedGenre = '행사';
                            } else if (typeKr === '행사' && g === '기타') {
                                mappedGenre = '행사';
                            }

                            globalGenreDict[mappedGenre] = (globalGenreDict[mappedGenre] || 0) + 1;
                            dowTotal[dowKey].genres[mappedGenre] = (dowTotal[dowKey].genres[mappedGenre] || 0) + 1;
                            if (dCreated >= oneMonthAgo) dowMonthly[dowKey].genres[mappedGenre] = (dowMonthly[dowKey].genres[mappedGenre] || 0) + 1;
                        });
                    }
                });
            });

            // Socials
            socials.forEach(s => {
                // Monthly: Created At (Supply Tracker)
                const dCreated = new Date(s.created_at);
                const regMonKey = `${dCreated.getFullYear()}-${String(dCreated.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyDict[regMonKey]) {
                    monthlyDict[regMonKey].registrations++;
                }

                // Monthly: Based on Activity Date (Activity Trend) - USER REQUEST
                const dActivity = s.date ? new Date(s.date) : null;
                if (dActivity && !isNaN(dActivity.getTime())) {
                    const monKey = `${dActivity.getFullYear()}-${String(dActivity.getMonth() + 1).padStart(2, '0')}`;
                    if (monthlyDict[monKey]) {
                        monthlyDict[monKey].socials++;
                        monthlyDict[monKey].total++;
                    }
                } else if (s.day_of_week !== null) {
                    // Recurring
                    if (monthlyDict[regMonKey]) {
                        monthlyDict[regMonKey].socials++;
                        monthlyDict[regMonKey].total++;
                    }
                }

                // Weekly: Activity Date
                let dowIndex = -1;
                if (s.day_of_week !== null && s.day_of_week !== undefined) {
                    dowIndex = Number(s.day_of_week) % 7;
                } else if (s.date) {
                    const dActivity = new Date(s.date);
                    if (!isNaN(dActivity.getTime())) {
                        dowIndex = dActivity.getDay();
                    }
                }

                if (dowIndex === -1) return;

                const dowKey = dayNames[dowIndex];

                const item: StatItem = {
                    type: '동호회 이벤트+소셜',
                    title: s.title || '제목 없음',
                    date: s.day_of_week ? '매주 반복' : (s.date || '-'),
                    createdAt: s.created_at.split('T')[0],
                    genre: s.v2_genre || '소셜',
                    day: dowKey
                };

                dowTotal[dowKey].types['동호회 이벤트+소셜']++;
                dowTotal[dowKey].items.push(item);

                // For "New" filter (This Month), use created_at for socials 
                // because recurring events don't have a single "date" to check against `oneMonthAgo` nicely 
                // unless we generate occurrences. Stick to "Recently Added" semantics for consistency.
                const isRecent = dCreated >= oneMonthAgo;

                if (isRecent) {
                    dowMonthly[dowKey].types['동호회 이벤트+소셜']++;
                    dowMonthly[dowKey].items.push(item);
                }

                // 소셜/동호회는 장르 집계 제외 (사용자 요청)
                // 위에서 socials.forEach로 돌고 있는 것은 '소셜' 테이블 데이터임.

                // Removed duplicate increment
                if (isRecent) {
                    // handled above
                }
            });


            const sortedGenres = Object.entries(globalGenreDict).sort((a, b) => b[1] - a[1]).map(e => e[0]);
            const top5Genres = sortedGenres.slice(0, 5);

            const buildWeeklyStats = (dict: { [key: string]: StatAccumulator }) => {
                return dayNames.map(day => {
                    const data = dict[day];
                    const total = Object.values(data.types).reduce((a: number, b: number) => a + (Number(b) || 0), 0);
                    const typeCountForGenre = (Number(data.types['강습']) || 0) + (Number(data.types['행사']) || 0);

                    const typeBreakdown = [
                        { name: '강습', count: Number(data.types['강습']) || 0 },
                        { name: '행사', count: Number(data.types['행사']) || 0 },
                        { name: '동호회 이벤트+소셜', count: Number(data.types['동호회 이벤트+소셜']) || 0 },
                    ];

                    // Genre Breakdown: Normalized to total class+event count to avoid over-100% bars
                    const genreBreakdown: { name: string; count: number }[] = [];
                    const top8Genres = sortedGenres.slice(0, 8);

                    top8Genres.forEach(g => {
                        const rawCount = Number(data.genres[g]) || 0;
                        // 정규화: (해당 장르 건수 / 전체 장르 발생 합계) * (강습+행사 총 개수)
                        // 이렇게 하면 세그먼트의 합이 정확히 typeCountForGenre가 됨
                        const totalGenreOccurrences = Object.values(data.genres).reduce((a, b) => a + b, 0) || 1;
                        const normalizedCount = (rawCount / totalGenreOccurrences) * typeCountForGenre;
                        genreBreakdown.push({ name: g, count: normalizedCount });
                    });

                    const topGenre = sortedGenres.find(g => (Number(data.genres[g]) || 0) > 0) || '';
                    return { day, count: total, typeBreakdown, genreBreakdown, topGenre, items: data.items };
                });
            };

            const totalWeekly = buildWeeklyStats(dowTotal);
            const monthlyWeekly = buildWeeklyStats(dowMonthly);

            const totalItems = events.length + socials.length;

            // Calculate Active Months Average (Excluding incomplete current month for accuracy)
            const calculateAccurateAverage = () => {
                const now = new Date();
                const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                // 1. Get items from completed months only
                const completedMonthlyStats = months.filter(m => m !== currentMonthKey).map(m => monthlyDict[m]);
                const completedTotal = completedMonthlyStats.reduce((acc, curr) => acc + (curr?.total || 0), 0);

                // 2. Count months from first data to last month
                if (completedTotal === 0) {
                    // Fallback: If only current month has data, project it
                    const currentStats = monthlyDict[currentMonthKey];
                    if (!currentStats || currentStats.total === 0) return 0;
                    const daysPassed = Math.max(1, now.getDate());
                    return Number((currentStats.total / daysPassed * 30.4).toFixed(1));
                }

                // Find earliest month with data (Bucket-based)
                // months array is sorted Ascending (Oldest -> Newest) [M-11, ... M-1, CurrentM]
                let startMonthIndex = -1;
                for (let i = 0; i < months.length - 1; i++) { // Exclude last (current) month
                    if (monthlyDict[months[i]]?.total > 0) {
                        startMonthIndex = i;
                        break;
                    }
                }

                if (startMonthIndex === -1) return 0;

                // months.length is 12 (typically). Current Month is at index 11.
                // We consider months from startMonthIndex up to index 10 (Last Completed Month).
                // Count = (months.length - 1) - startMonthIndex
                const validMonthsCount = (months.length - 1) - startMonthIndex;

                return Number((completedTotal / Math.max(1, validMonthsCount)).toFixed(1));
            };

            const refinedAverage = calculateAccurateAverage();
            const topDayData = [...totalWeekly].sort((a, b) => b.count - a.count)[0];

            setStats({
                monthly: months.map(m => monthlyDict[m]),
                totalWeekly,
                monthlyWeekly,
                topGenresList: sortedGenres.slice(0, 8),
                summary: {
                    totalItems,
                    monthlyAverage: refinedAverage,
                    topDay: topDayData.day
                }
            });

        } catch (error) {
            console.error('[SwingSceneStats] Error fetching scene stats:', error);
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

    if (loading || !stats) {
        return (
            <div style={{ padding: '60px 0' }}>
                <LocalLoading message="데이터 집계 중..." size="lg" />
            </div>
        );
    }

    const currentWeekly = weeklyTab === 'total' ? stats.totalWeekly : stats.monthlyWeekly;
    const currentMonthly = monthlyRange === '1y' ? stats.monthly : stats.monthly.slice(stats.monthly.length - 6);
    const maxMonthly = Math.max(...currentMonthly.map(m => m.total), 1);
    const maxDay = Math.max(...currentWeekly.map(d => d.count), 1);

    const getTypePeak = (type: string) => {
        const peak = [...currentWeekly].sort((a, b) => {
            const countA = a.typeBreakdown.find(tb => tb.name === type)?.count || 0;
            const countB = b.typeBreakdown.find(tb => tb.name === type)?.count || 0;
            return countB - countA;
        })[0];
        return peak.day;
    };

    const getGenrePeak = (genre: string) => {
        const peak = [...currentWeekly].sort((a, b) => {
            const countA = a.genreBreakdown.find(gb => gb.name === genre)?.count || 0;
            const countB = b.genreBreakdown.find(gb => gb.name === genre)?.count || 0;
            return countB - countA;
        })[0];
        return peak.day;
    };

    const getGenreColor = (name: string, index: number) => {
        if (GENRE_COLORS[name]) return GENRE_COLORS[name];
        // 팔레트 중복 최소화를 위해 선명한 색상 위주로 폴백 구성
        const palette = [
            'var(--color-lime-500)',
            'var(--color-fuchsia-500)',
            'var(--color-cyan-500)',
            'var(--color-indigo-400)',
            'var(--color-pink-500)'
        ];
        return palette[index % palette.length];
    };

    // Data Inspector Helper
    const getTypeItems = (day: string | null) => day ? currentWeekly.find(d => d.day === day)?.items || [] : [];
    const getGenreItems = (day: string | null) => day ? (currentWeekly.find(d => d.day === day)?.items || []) : [];

    const handleShare = async () => {
        if (!stats) return;
        const text = `📊 스윙씬 통계 요약 (From 댄스빌보드)\n\n- 최근 1년 활동: ${stats.summary.totalItems}건\n- 월평균 이벤트: ${stats.summary.monthlyAverage}건\n- 가장 활발한 요일: ${stats.summary.topDay}요일\n\n더 자세한 스윙씬 트렌드는 댄스빌보드에서 확인하세요!\nhttps://swingenjoy.com?modal=stats`;

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

    return (
        <div className="swing-scene-stats">
            <div className="stats-container">

                {/* Column 1: Summary & Monthly */}
                <div className="stats-col-1">
                    <div className="share-container">
                        <button onClick={handleShare} className="share-btn">
                            <i className="ri-share-forward-line"></i> 통계 공유
                        </button>
                    </div>

                    <div className="stats-card-grid">
                        <div className="stats-card">
                            <div className="card-label">최근 1년 활동</div>
                            <div className="card-value">{stats.summary.totalItems}건</div>
                            <div className="card-hint">시작일 기준</div>
                        </div>
                        <div className="stats-card">
                            <div className="card-label">월평균 이벤트</div>
                            <div className="card-value">{stats.summary.monthlyAverage}건</div>
                            <div className="card-hint">시작일 기준</div>
                        </div>
                        <div className="stats-card">
                            <div className="card-label">최고 활성</div>
                            <div className="card-value">{stats.summary.topDay}요일</div>
                            <div className="card-hint">누적 통계</div>
                        </div>
                    </div>

                    <div className="stats-section">
                        <div className="stats-header">
                            <h4 className="section-title">
                                <i className="ri-bar-chart-fill"></i> 월별 활동 추이
                                <span className="title-sub">(시작일 기준)</span>
                            </h4>
                            <div className="tab-group">
                                <button onClick={() => setMonthlyRange('6m')} className={`tab-btn ${monthlyRange === '6m' ? 'active' : ''}`}>6개월</button>
                                <button onClick={() => setMonthlyRange('1y')} className={`tab-btn ${monthlyRange === '1y' ? 'active' : ''}`}>1년</button>
                            </div>
                        </div>
                        <div className="chart-container">
                            {currentMonthly.map((m, i) => (
                                <div key={i} className="bar-wrapper">
                                    <div className="bar-info-group">
                                        {m.total > 0 && <span className="total-label">{m.total}</span>}
                                        {m.registrations > 0 && <span className="reg-label">+{m.registrations}</span>}
                                    </div>
                                    <div className="stacked-bar">
                                        {/* Using percentage for accurate height proportion */}
                                        <div className="bar-segment" style={{ height: `${(m.classes / maxMonthly) * 100}%`, minHeight: m.classes > 0 ? '1px' : '0', background: COLORS.classes }}></div>
                                        <div className="bar-segment" style={{ height: `${(m.events / maxMonthly) * 100}%`, minHeight: m.events > 0 ? '1px' : '0', background: COLORS.events }}></div>
                                        <div className="bar-segment" style={{ height: `${((m.socials + m.clubs) / maxMonthly) * 100}%`, minHeight: (m.socials + m.clubs) > 0 ? '1px' : '0', background: COLORS.socials }}></div>
                                    </div>
                                    <span className="axis-label">{m.month.split('-')[1]}월</span>
                                </div>
                            ))}
                        </div>
                        <div className="legend-grid">
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.classes }}></span> 강습</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.events }}></span> 행사</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.socials }}></span> 동호회 이벤트+소셜</div>
                        </div>

                        <div className="chart-info-footer">
                            <div className="info-item">
                                <span className="info-label total">숫자</span>
                                <span className="info-text">이벤트 시작일 기준으로</span>
                            </div>
                            <div className="info-item">
                                <span className="info-label reg">+N</span>
                                <span className="info-text">신규 정보 등록 건수</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Column 2: Weekly Types */}
                <div className="stats-col-2">
                    <div className="stats-header weekly-header">
                        <h3 className="weekly-title">주간 집중 분석</h3>
                        <div className="tab-group">
                            <button onClick={() => { setWeeklyTab('total'); setInspectTypeDay(null); setInspectGenreDay(null); }} className={`tab-btn ${weeklyTab === 'total' ? 'active' : ''}`}>전체</button>
                            <button onClick={() => { setWeeklyTab('monthly'); setInspectTypeDay(null); setInspectGenreDay(null); }} className={`tab-btn ${weeklyTab === 'monthly' ? 'active' : ''}`}>이번 달</button>
                        </div>
                    </div>

                    <div className="stats-section">
                        <h4 className="section-title"><i className="ri-calendar-todo-line"></i> 요일별 유형 비중</h4>
                        <div className="touch-hint">* 그래프 터치하여 상세 보기</div>

                        <div className="chart-container">
                            {currentWeekly.map((d, i) => (
                                <div key={i} className="bar-wrapper" style={{ cursor: 'pointer', opacity: inspectTypeDay && inspectTypeDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectTypeDay(inspectTypeDay === d.day ? null : d.day)}>
                                    {d.count > 0 && <span className="total-label" style={{ color: inspectTypeDay === d.day ? 'var(--color-blue-400)' : 'var(--text-primary)' }}>{d.count}</span>}
                                    <div className="stacked-bar">
                                        {d.typeBreakdown.map((tb, idx) => (
                                            <div key={idx} className="bar-segment"
                                                style={{
                                                    height: `${(tb.count / maxDay) * 100}%`,
                                                    minHeight: tb.count > 0 ? '1px' : '0',
                                                    background: [COLORS.classes, COLORS.events, COLORS.socials][idx]
                                                }}></div>
                                        ))}
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

                {/* Column 3: Weekly Genres */}
                <div className="stats-col-3">
                    <div className="spacer-52"></div> {/* Spacer to align with Section 2 */}

                    <div className="stats-section">
                        <h4 className="section-title"><i className="ri-medal-2-line"></i> 외부강습 요일별 장르 비중</h4>

                        <div className="chart-container">
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
                                                    background: getGenreColor(gb.name, idx)
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
                                    <span className="legend-dot" style={{ background: getGenreColor(g, i) }}></span>
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

                    <div className="spacer-30"></div>

                    {billboard?.leadTime && (
                        <div className="promo-analysis-section">
                            <h4 className="section-title"><i className="ri-flashlight-line"></i> 홍보 시작 시점별 조회 도달율</h4>
                            <p className="touch-hint" style={{ textAlign: 'left', marginTop: 0 }}>* 등록일부터 행사 시작일까지의 준비 기간별 분석</p>

                            <div className="promo-chart-container">
                                {/* Class bars */}
                                <div className="promo-bar-group">
                                    <div className="card-label" style={{ textAlign: 'left' }}>정규 강습</div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>얼리버드 (21일 전)</span> <span className="promo-value">{billboard.leadTime.classEarly} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (billboard.leadTime.classEarly / Math.max(1, billboard.leadTime.classEarly, billboard.leadTime.classMid, billboard.leadTime.classLate)) * 100)}%` }}></div></div>
                                    </div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>적기 홍보 (7~21일)</span> <span className="promo-value">{billboard.leadTime.classMid} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (billboard.leadTime.classMid / Math.max(1, billboard.leadTime.classEarly, billboard.leadTime.classMid, billboard.leadTime.classLate)) * 100)}%` }}></div></div>
                                    </div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>긴급 등록 (7일 이내)</span> <span className="promo-value">{billboard.leadTime.classLate} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (billboard.leadTime.classLate / Math.max(1, billboard.leadTime.classEarly, billboard.leadTime.classMid, billboard.leadTime.classLate)) * 100)}%` }}></div></div>
                                    </div>
                                </div>

                                {/* Event bars */}
                                <div className="promo-bar-group">
                                    <div className="card-label" style={{ textAlign: 'left' }}>파티 및 이벤트</div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>얼리버드 (35일 전)</span> <span className="promo-value">{billboard.leadTime.eventEarly} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill early" style={{ width: `${Math.min(100, (billboard.leadTime.eventEarly / Math.max(1, billboard.leadTime.eventEarly, billboard.leadTime.eventMid, billboard.leadTime.eventLate)) * 100)}%` }}></div></div>
                                    </div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>적기 홍보 (14~35일)</span> <span className="promo-value">{billboard.leadTime.eventMid} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill mid" style={{ width: `${Math.min(100, (billboard.leadTime.eventMid / Math.max(1, billboard.leadTime.eventEarly, billboard.leadTime.eventMid, billboard.leadTime.eventLate)) * 100)}%` }}></div></div>
                                    </div>
                                    <div className="promo-bar-item">
                                        <div className="promo-label-row"><span>긴급 등록 (14일 이내)</span> <span className="promo-value">{billboard.leadTime.eventLate} pv</span></div>
                                        <div className="promo-bar-bg"><div className="promo-bar-fill late" style={{ width: `${Math.min(100, (billboard.leadTime.eventLate / Math.max(1, billboard.leadTime.eventEarly, billboard.leadTime.eventMid, billboard.leadTime.eventLate)) * 100)}%` }}></div></div>
                                    </div>
                                </div>
                            </div>

                            <p className="touch-hint" style={{ textAlign: 'left', lineHeight: 1.4 }}>
                                * 리드타임이 길수록 잠재 고객 노출 기회가 많아집니다.<br />
                                * 강습은 최소 21일 전, 이벤트는 35일 전 등록을 권장합니다.
                            </p>
                        </div>
                    )}

                    <div className="spacer-30"></div>
                </div>
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

const GENRE_COLORS: { [key: string]: string } = {
    '린디합': 'var(--color-blue-600)',
    '솔로재즈': 'var(--color-rose-600)',
    '발보아': 'var(--color-amber-500)',
    '블루스': 'var(--color-sky-400)',
    '행사': 'var(--color-teal-600)',
    '기타': 'var(--color-slate-500)',
    '지터벅': 'var(--color-emerald-500)',
    '샤그': 'var(--color-lime-500)',
    '탭댄스': 'var(--color-cyan-500)',
    '웨스트코스트스윙': 'var(--color-violet-400)',
    '슬로우린디': 'var(--color-indigo-500)',
    '버번': 'var(--color-rose-500)'
};

const COLORS = { classes: 'var(--color-blue-500)', events: 'var(--color-amber-400)', socials: 'var(--color-emerald-500)' };


