import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface StatItem {
    type: '강습' | '행사' | '소셜' | '게시글';
    title: string;
    date: string; // Activity Date or Created Date
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
        posts: number;
        total: number;
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

export default function SwingSceneStats() {
    const [stats, setStats] = useState<SceneStats | null>(null);
    const [loading, setLoading] = useState(true);
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
                if (v === 'v3' && now - timestamp < 3600 * 1000) {
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
            const dateStr = twelveMonthsAgo.toISOString().split('T')[0];

            const oneMonthAgo = new Date();
            oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);



            // 1. Fetch data (Fetch enough history to cover 12 months)
            // Using 'dateStr' (12 months ago) as base.
            const queryDateStr = dateStr;

            const [eventsRes, socialsRes, postsRes] = await Promise.all([
                supabase.from('events').select('category, genre, created_at, date, event_dates, title').gte('created_at', queryDateStr),
                supabase.from('social_schedules').select('v2_category, v2_genre, created_at, date, day_of_week, title').gte('created_at', queryDateStr),
                supabase.from('board_posts').select('category, created_at, title').gte('created_at', queryDateStr)
            ]);

            const events = eventsRes.data || [];
            const socials = socialsRes.data || [];
            const posts = postsRes.data || [];




            // 2. Process Data
            const monthlyDict: { [key: string]: any } = {};
            const globalGenreDict: { [name: string]: number } = {};
            const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

            const initDow = () => {
                const dict: any = {};
                dayNames.forEach(d => dict[d] = {
                    types: { '강습': 0, '행사': 0, '소셜': 0, '게시글': 0 },
                    genres: { '소셜': 0 },
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
                monthlyDict[key] = { month: key, classes: 0, events: 0, socials: 0, posts: 0, total: 0 };
            }

            // Events
            events.forEach(e => {
                // TEST DEBUG: Strict Check for Dec 2025 - REMOVED for Production
                const dCreated = new Date(e.created_at);


                // Monthly: Based on Created At (Registration Trend)
                const monKey = `${dCreated.getFullYear()}-${String(dCreated.getMonth() + 1).padStart(2, '0')}`;
                const type = (e.category === 'class' || e.category === 'club') ? 'classes' : 'events';
                const typeKr = type === 'classes' ? '강습' : '행사';

                if (monthlyDict[monKey]) {
                    monthlyDict[monKey][type]++;
                    monthlyDict[monKey].total++;
                }

                // Weekly: Based on Activity Date (STRICT ACTIVITY ONLY)
                const targetDates: string[] = [];
                if (e.event_dates && e.event_dates.length > 0) {
                    e.event_dates.forEach((d: string) => targetDates.push(d));
                } else if (e.date) {
                    targetDates.push(e.date);
                }

                if (targetDates.length === 0) {

                    return;
                }

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
                        genre: e.genre || '소셜',
                        day: dowKey
                    };

                    dowTotal[dowKey].types[typeKr]++;
                    dowTotal[dowKey].items.push(item);

                    // For "This Month" filter in Weekly Stats
                    // In this Test Mode (Dec Only), we can just count it. 
                    // But to respect the logic: "Recent Registration"
                    if (dCreated >= oneMonthAgo) {
                        dowMonthly[dowKey].types[typeKr]++;
                        dowMonthly[dowKey].items.push(item);
                    }

                    if (e.genre) {
                        e.genre.split(',').forEach((g: string) => {
                            const trimmed = g.trim().replace('정규강습', '').trim();
                            if (trimmed && trimmed !== '-') {
                                globalGenreDict[trimmed] = (globalGenreDict[trimmed] || 0) + 1;
                                dowTotal[dowKey].genres[trimmed] = (dowTotal[dowKey].genres[trimmed] || 0) + 1;
                                if (dCreated >= oneMonthAgo) dowMonthly[dowKey].genres[trimmed] = (dowMonthly[dowKey].genres[trimmed] || 0) + 1;
                            } else {
                                dowTotal[dowKey].genres['소셜']++;
                                if (dCreated >= oneMonthAgo) dowMonthly[dowKey].genres['소셜']++;
                            }
                        });
                    } else {
                        dowTotal[dowKey].genres['소셜']++;
                        if (dCreated >= oneMonthAgo) dowMonthly[dowKey].genres['소셜']++;
                    }
                });
            });

            // Socials
            socials.forEach(s => {
                // Monthly: Created At (Registration)
                const dCreated = new Date(s.created_at);
                const monKey = `${dCreated.getFullYear()}-${String(dCreated.getMonth() + 1).padStart(2, '0')}`;
                if (monthlyDict[monKey]) {
                    monthlyDict[monKey].socials++;
                    monthlyDict[monKey].total++;
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
                    type: '소셜',
                    title: s.title || '제목 없음',
                    date: s.day_of_week ? '매주 반복' : (s.date || '-'),
                    genre: s.v2_genre || '소셜',
                    day: dowKey
                };

                dowTotal[dowKey].types['소셜']++;
                dowTotal[dowKey].items.push(item);

                // For "New" filter (This Month), use created_at for socials 
                // because recurring events don't have a single "date" to check against `oneMonthAgo` nicely 
                // unless we generate occurrences. Stick to "Recently Added" semantics for consistency.
                const isRecent = dCreated >= oneMonthAgo;

                if (isRecent) {
                    dowMonthly[dowKey].types['소셜']++;
                    dowMonthly[dowKey].items.push(item);
                }

                let hasGenre = false;
                if (s.v2_genre) {
                    s.v2_genre.split(',').forEach((g: string) => {
                        const trimmed = g.trim().replace('정규강습', '').trim();
                        if (trimmed && trimmed !== '-') {
                            hasGenre = true;
                            globalGenreDict[trimmed] = (globalGenreDict[trimmed] || 0) + 1;
                            dowTotal[dowKey].genres[trimmed] = (dowTotal[dowKey].genres[trimmed] || 0) + 1;
                            if (isRecent) dowMonthly[dowKey].genres[trimmed] = (dowMonthly[dowKey].genres[trimmed] || 0) + 1;
                        }
                    });
                }

                if (!hasGenre) {
                    dowTotal[dowKey].genres['소셜']++;
                    if (isRecent) dowMonthly[dowKey].genres['소셜']++;
                }

                // Removed duplicate increment
                if (isRecent) {
                    // handled above
                }
            });

            // Posts
            posts.forEach(p => {
                const d = new Date(p.created_at);
                const monKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
                const dowKey = dayNames[d.getDay()];
                if (monthlyDict[monKey]) {
                    monthlyDict[monKey].posts++;
                    monthlyDict[monKey].total++;
                }
                dowTotal[dowKey].types['게시글']++;
                // Removed: dowTotal[dowKey].genres['기타']++; -> Posts should not contribute to Genre Stats

                const item: StatItem = {
                    type: '게시글',
                    title: p.title || '제목 없음',
                    date: p.created_at.split('T')[0],
                    genre: '-',
                    day: dowKey
                };

                dowTotal[dowKey].items.push(item);

                if (d >= oneMonthAgo) {
                    dowMonthly[dowKey].types['게시글']++;
                    // Removed: dowMonthly[dowKey].genres['기타']++;
                    dowMonthly[dowKey].items.push(item);
                }
            });


            const sortedGenres = Object.entries(globalGenreDict).sort((a, b) => b[1] - a[1]).map(e => e[0]);
            const top5Genres = sortedGenres.slice(0, 5);

            const buildWeeklyStats = (dict: any) => {
                return dayNames.map(day => {
                    const data = dict[day];
                    const total = Object.values(data.types).reduce((a: number, b: any) => a + (Number(b) || 0), 0);
                    const typeBreakdown = [
                        { name: '강습', count: Number(data.types['강습']) || 0 },
                        { name: '행사', count: Number(data.types['행사']) || 0 },
                        { name: '소셜', count: Number(data.types['소셜']) || 0 },
                        { name: '게시글', count: Number(data.types['게시글']) || 0 }
                    ];
                    let genreBreakdown: any[] = [];
                    let othersCount = Number(data.genres['소셜']) || 0;
                    top5Genres.forEach(g => genreBreakdown.push({ name: g, count: Number(data.genres[g]) || 0 }));
                    Object.entries(data.genres).forEach(([name, count]: [string, any]) => {
                        if (name !== '소셜' && !top5Genres.includes(name)) othersCount += (Number(count) || 0);
                    });
                    genreBreakdown.push({ name: '소셜', count: othersCount });
                    const topGenre = sortedGenres.find(g => (Number(data.genres[g]) || 0) > 0) || '소셜';
                    return { day, count: total, typeBreakdown, genreBreakdown, topGenre, items: data.items };
                });
            };

            const totalWeekly = buildWeeklyStats(dowTotal);
            const monthlyWeekly = buildWeeklyStats(dowMonthly);

            const totalItems = events.length + socials.length + posts.length;

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
                topGenresList: [...top5Genres, '소셜'],
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
                    v: 'v3'
                }));
            } catch (e) {
                console.error('Cache save failed', e);
            }
        }
    }, [stats]);

    if (loading || !stats) {
        return (
            <div style={{ padding: '60px 0', textAlign: 'center' }}>
                <div className="evt-loading-spinner-base evt-loading-spinner-blue evt-animate-spin" style={{ margin: '0 auto' }}></div>
                <p style={{ marginTop: '12px', color: '#71717a', fontSize: '13px' }}>데이터 집계 중...</p>
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
        const palette = ['#14b8a6', '#8b5cf6', '#f43f5e', '#fbbf24', '#3b82f6'];
        return palette[index % palette.length];
    };

    // Data Inspector Helper
    const getTypeItems = (day: string | null) => day ? currentWeekly.find(d => d.day === day)?.items || [] : [];
    const getGenreItems = (day: string | null) => day ? (currentWeekly.find(d => d.day === day)?.items || []).filter(i => i.type !== '게시글') : [];

    const handleShare = async () => {
        if (!stats) return;
        const text = `📊 스윙씬 통계 요약 (From 댄스빌보드)\n\n- 최근 1년 등록: ${stats.summary.totalItems}건\n- 월평균 등록: ${stats.summary.monthlyAverage}건\n- 가장 활발한 요일: ${stats.summary.topDay}요일\n\n더 자세한 스윙씬 트렌드는 댄스빌보드에서 확인하세요!\nhttps://swingenjoy.com?modal=stats`;

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
            <style>{`
                .swing-scene-stats {
                    color: #fff;
                    font-family: 'Pretendard', sans-serif;
                    height: 100%;
                    width: 100%;
                }

                .stats-container {
                    display: flex;
                    flex-direction: column;
                    gap: 12px; 
                    width: 100%;
                    height: 100%;
                    box-sizing: border-box;
                    padding: 0 4px; /* Significantly reduced for mobile */
                }
                
                @media (min-width: 1024px) {
                    .stats-container {
                        display: grid;
                        grid-template-columns: 1fr 1fr 1fr;
                        grid-template-rows: 1fr; /* Single row, 100% height */
                        gap: 24px;
                        height: 100%;
                        overflow: hidden;
                        padding: 0 24px 24px 24px;
                    }

                    .stats-col-1, .stats-col-2, .stats-col-3 {
                        overflow: hidden; /* Prevent scrolling inside columns */
                        padding-right: 0;
                        display: flex;
                        flex-direction: column;
                        gap: 16px; /* Slightly reduced gap */
                        height: 100%;
                        min-height: 0; /* Crucial for nested flex scrolling/shrinking */
                    }
                    
                    .stats-col-2, .stats-col-3 {
                        border-left: 1px solid rgba(255,255,255,0.06);
                        padding-left: 20px;
                    }
                }

                /* Component Styles */
                .stats-section {
                    background: rgba(255,255,255,0.02);
                    padding: 16px 20px; /* Reduced vertical padding */
                    border-radius: 20px;
                    border: 1px solid rgba(255,255,255,0.06);
                    display: flex;
                    flex-direction: column;
                    flex: 1; /* Expand to fill column */
                    min-height: 0; /* Allow shrinking */
                    justify-content: space-between;
                }
                
                .stats-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 12px;
                    flex-shrink: 0; /* Don't shrink header */
                }

                .section-title {
                    margin: 0;
                    font-size: 14px;
                    color: #e4e4e7;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-weight: 600;
                }

                .stats-card-grid {
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 12px;
                    margin-bottom: 20px;
                    flex-shrink: 0;
                }

                .stats-card {
                    background: rgba(255,255,255,0.03);
                    padding: 16px 12px;
                    border-radius: 16px;
                    border: 1px solid rgba(255,255,255,0.08);
                    text-align: center;
                    transition: transform 0.2s;
                }
                .stats-card:hover { transform: translateY(-2px); background: rgba(255,255,255,0.05); }

                .card-label { font-size: 11px; color: #a1a1aa; margin-bottom: 6px; }
                .card-value { font-size: 16px; color: #fff; font-weight: 700; }

                /* Chart Components */
                .chart-container {
                    display: flex;
                    align-items: flex-end;
                    justify-content: space-between;
                    flex: 1; /* Take all available height */
                    min-height: 0; /* Allow massive shrinking if needed */
                    margin-top: 12px;
                    padding-bottom: 8px;
                    border-bottom: 1px solid rgba(255,255,255,0.08);
                }

                .bar-wrapper {
                    flex: 1;
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    height: 100%;
                    justify-content: flex-end;
                    position: relative;
                }
                
                .stacked-bar { 
                    width: 16px; /* Reduced from 20px for mobile scaling */
                    height: 100%;
                    display: flex; 
                    flex-direction: column-reverse; 
                    gap: 1px;
                    border-radius: 4px;
                    overflow: hidden;
                    justify-content: flex-start;
                }
                
                @media (min-width: 375px) {
                    .stacked-bar { width: 20px; }
                }
                
                .bar-segment { width: 100%; transition: height 0.3s ease; }
                
                .total-label { font-size: 9px; color: #fff; margin-bottom: 4px; font-weight: 600; }
                .axis-label { font-size: 10px; color: #71717a; margin-top: 8px; flex-shrink: 0; }

                /* Legend */
                .legend-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 8px;
                    margin-top: 16px;
                    flex-shrink: 0;
                }
                .legend-item {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 11px;
                    color: #a1a1aa;
                }
                .legend-dot { width: 8px; height: 8px; border-radius: 2px; flex-shrink: 0; }

                /* Tabs & Buttons */
                .tab-group {
                    display: flex;
                    background: rgba(0,0,0,0.3);
                    padding: 3px;
                    border-radius: 8px;
                    border: 1px solid rgba(255,255,255,0.08);
                }

                .tab-btn {
                    padding: 6px 14px;
                    font-size: 11px;
                    border: none;
                    border-radius: 6px;
                    cursor: pointer;
                    transition: all 0.2s;
                    font-weight: 500;
                    color: #71717a;
                    background: transparent;
                }
                .tab-btn.active { background: rgba(255,255,255,0.15); color: #fff; font-weight: 600; }

                .share-btn {
                    background: rgba(255, 255, 255, 0.08);
                    border: 1px solid rgba(255, 255, 255, 0.15);
                    border-radius: 8px;
                    color: #e4e4e7;
                    padding: 8px 16px;
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                    transition: all 0.2s;
                }
                .share-btn:hover { background: rgba(255, 255, 255, 0.12); border-color: rgba(255,255,255,0.3); }

                .chart-desc {
                    margin-top: 16px;
                    padding: 12px;
                    background: rgba(59, 130, 246, 0.08);
                    border-radius: 12px;
                    font-size: 12px;
                    color: #bae6fd;
                    line-height: 1.4;
                    border: 1px solid rgba(59, 130, 246, 0.1);
                    flex-shrink: 0;
                }

                /* Utility / Specific Overrides */
                .share-container { display: flex; justify-content: flex-end; margin-bottom: 16px; }
                .weekly-header { margin-bottom: 16px; padding: 0 4px; }
                .weekly-title { margin: 0; font-size: 16px; font-weight: 700; color: #fff; }
                .touch-hint { margin-bottom: 12px; font-size: 11px; color: #9ca3af; text-align: right; margin-top: 4px; }
                .spacer-52 { height: 52px; }
                .spacer-30 { height: 30px; }
                .legend-grid.three-cols { grid-template-columns: repeat(3, 1fr); }

                /* Data Inspector Modal Styles */
                .inspector-overlay {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    bottom: 0;
                    z-index: 9999;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    background: rgba(0, 0, 0, 0.6);
                    backdrop-filter: blur(4px);
                    animation: fadeIn 0.2s ease-out;
                }

                .inspector-modal {
                    background: #1e293b;
                    width: 90%;
                    max-width: 500px;
                    max-height: 80vh;
                    border-radius: 16px;
                    border: 1px solid rgba(148, 163, 184, 0.2);
                    display: flex;
                    flex-direction: column;
                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.25);
                    overflow: hidden;
                }

                .inspector-header {
                    padding: 16px 20px;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    background: #1e293b; /* Ensure opaque background */
                }

                .inspector-title {
                    margin: 0;
                    font-size: 16px;
                    font-weight: 600;
                    color: #fff;
                }

                .inspector-subtitle {
                    font-size: 13px;
                    color: #94a3b8;
                    font-weight: 400;
                }

                .inspector-close-btn {
                    background: none;
                    border: none;
                    color: #94a3b8;
                    cursor: pointer;
                    padding: 4px;
                    display: flex;
                    align-items: center;
                    transition: color 0.2s;
                }
                .inspector-close-btn:hover { color: #fff; }

                .inspector-content {
                    flex: 1;
                    overflow-y: auto;
                }

                .inspector-empty {
                    padding: 40px;
                    text-align: center;
                    color: #64748b;
                    font-size: 14px;
                }

                .inspector-table {
                    width: 100%;
                    border-collapse: collapse;
                    font-size: 13px;
                }

                .inspector-thead {
                    position: sticky;
                    top: 0;
                    background: #1e293b;
                    z-index: 10;
                }

                .inspector-th {
                    padding: 12px 16px;
                    text-align: left;
                    font-weight: 500;
                    border-bottom: 1px solid rgba(255, 255, 255, 0.05);
                    color: #94a3b8;
                }
                .inspector-th.highlight-type { color: #60a5fa; }
                .inspector-th.highlight-genre { color: #fcd34d; }
                .inspector-th.align-right { text-align: right; }

                .inspector-tr {
                    border-bottom: 1px solid rgba(255, 255, 255, 0.03);
                    transition: background 0.1s;
                }
                .inspector-tr:nth-child(even) { background: rgba(255, 255, 255, 0.01); }
                .inspector-tr:hover { background: rgba(255, 255, 255, 0.03); }

                .inspector-td { padding: 12px 16px; color: #e2e8f0; }
                .inspector-td.date { color: #94a3b8; text-align: right; font-size: 12px; white-space: nowrap; }
                .inspector-td.genre-highlight { color: #fcd34d; font-weight: 600; }
                .inspector-td.genre-dim { color: #cbd5e1; font-weight: 400; }

                .type-badge {
                    padding: 2px 8px;
                    border-radius: 4px;
                    font-size: 11px;
                    font-weight: 600;
                }
                .type-badge.class { background: rgba(59, 130, 246, 0.2); color: #60a5fa; }
                .type-badge.event { background: rgba(251, 191, 36, 0.2); color: #fcd34d; }
                .type-badge.social { background: rgba(16, 185, 129, 0.2); color: #34d399; }
                .type-badge.post { background: rgba(168, 85, 247, 0.2); color: #c084fc; }

            `}</style>

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
                            <div className="card-label">최근 1년</div>
                            <div className="card-value">{stats.summary.totalItems}건</div>
                        </div>
                        <div className="stats-card">
                            <div className="card-label">월평균 등록</div>
                            <div className="card-value">{stats.summary.monthlyAverage}건</div>
                        </div>
                        <div className="stats-card">
                            <div className="card-label">최고 활성</div>
                            <div className="card-value">{stats.summary.topDay}요일</div>
                        </div>
                    </div>

                    <div className="stats-section">
                        <div className="stats-header">
                            <h4 className="section-title"><i className="ri-bar-chart-fill"></i> 월별 추이</h4>
                            <div className="tab-group">
                                <button onClick={() => setMonthlyRange('6m')} className={`tab-btn ${monthlyRange === '6m' ? 'active' : ''}`}>6개월</button>
                                <button onClick={() => setMonthlyRange('1y')} className={`tab-btn ${monthlyRange === '1y' ? 'active' : ''}`}>1년</button>
                            </div>
                        </div>
                        <div className="chart-container">
                            {currentMonthly.map((m, i) => (
                                <div key={i} className="bar-wrapper">
                                    {m.total > 0 && <span className="total-label">{m.total}</span>}
                                    <div className="stacked-bar">
                                        <div className="bar-segment" style={{ height: (m.classes / maxMonthly) * 150, background: COLORS.classes }}></div>
                                        <div className="bar-segment" style={{ height: (m.events / maxMonthly) * 150, background: COLORS.events }}></div>
                                        <div className="bar-segment" style={{ height: (m.socials / maxMonthly) * 150, background: COLORS.socials }}></div>
                                        <div className="bar-segment" style={{ height: (m.posts / maxMonthly) * 150, background: COLORS.posts }}></div>
                                    </div>
                                    <span className="axis-label">{m.month.split('-')[1]}월</span>
                                </div>
                            ))}
                        </div>
                        <div className="legend-grid">
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.classes }}></span> 강습</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.events }}></span> 행사</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.socials }}></span> 소셜</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.posts }}></span> 게시글</div>
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
                                    {d.count > 0 && <span className="total-label" style={{ color: inspectTypeDay === d.day ? '#60a5fa' : '#fff' }}>{d.count}</span>}
                                    <div className="stacked-bar">
                                        {d.typeBreakdown.map((tb, idx) => (
                                            <div key={idx} className="bar-segment" style={{ height: (tb.count / maxDay) * 150, background: [COLORS.classes, COLORS.events, COLORS.socials, COLORS.posts][idx] }}></div>
                                        ))}
                                    </div>
                                    <span className="axis-label" style={{ color: inspectTypeDay === d.day ? '#60a5fa' : '#71717a' }}>{d.day}</span>
                                </div>
                            ))}
                        </div>

                        <div className="legend-grid">
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.classes }}></span> 강습</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.events }}></span> 행사</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.socials }}></span> 소셜</div>
                            <div className="legend-item"><span className="legend-dot" style={{ background: COLORS.posts }}></span> 게시글</div>
                        </div>

                        <div className="chart-desc">
                            <p>• 소셜은 <strong>{getTypePeak('소셜')}요일</strong>, 행사는 <strong>{getTypePeak('행사')}요일</strong>에 가장 활발합니다.</p>
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
                        <h4 className="section-title"><i className="ri-medal-2-line"></i> 요일별 장르 비중</h4>

                        <div className="chart-container">
                            {currentWeekly.map((d, i) => (
                                <div key={i} className="bar-wrapper" style={{ cursor: 'pointer', opacity: inspectGenreDay && inspectGenreDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectGenreDay(inspectGenreDay === d.day ? null : d.day)}>
                                    {d.count > 0 && <span className="total-label" style={{ color: inspectGenreDay === d.day ? '#60a5fa' : '#fff' }}>{d.count}</span>}
                                    <div className="stacked-bar">
                                        {d.genreBreakdown.map((gb, idx) => (
                                            <div key={idx} className="bar-segment" style={{ height: (gb.count / maxDay) * 150, width: '100%', background: getGenreColor(gb.name, idx) }}></div>
                                        ))}
                                    </div>
                                    <span className="axis-label" style={{ color: inspectGenreDay === d.day ? '#60a5fa' : '#71717a' }}>{d.day}</span>
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
                        <i className="ri-close-line" style={{ fontSize: '24px' }}></i>
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
                                    <th className="inspector-th align-right">날짜</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item, idx) => (
                                    <tr key={idx} className="inspector-tr">
                                        <td className="inspector-td">
                                            <span className={`type-badge ${item.type === '강습' ? 'class' :
                                                item.type === '행사' ? 'event' :
                                                    item.type === '소셜' ? 'social' : 'post'
                                                }`}>{item.type}</span>
                                        </td>
                                        <td className="inspector-td" style={{ minWidth: '120px' }}>{item.title}</td>
                                        <td className={`inspector-td ${sortBy === 'genre' ? 'genre-highlight' : 'genre-dim'}`}>{item.genre}</td>
                                        <td className="inspector-td date">{item.date}</td>
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
    '린디합': '#2563eb', '발보아': '#f59e0b', '지터벅': '#10b981', '블루스': '#4f46e5',
    '솔로재즈': '#e11d48', '샤그': '#ea580c', '탭댄스': '#06b6d4', '웨스트코스트스윙': '#8b5cf6',
    '슬로우린디': '#6366f1', '버번': '#f43f5e', '소셜': '#44444a'
};

const COLORS = { classes: '#3b82f6', events: '#fbbf24', socials: '#10b981', posts: '#a855f7' };


