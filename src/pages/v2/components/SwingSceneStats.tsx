import React, { useState, useEffect } from 'react';
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

            console.log('%c[Stats Debug] Starting Analysis (Dec 2025 Focus)', 'background: #222; color: #bada55; font-size: 14px');

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

            console.log(`[Stats Debug] Raw Fetched: Events=${events.length}, Socials=${socials.length}, Posts=${posts.length}`);


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
                    console.log(`[Stats Exclude] "${e.title || 'Untitled'}" - 날짜 정보 없음`);
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

                console.log(`[Stats Event] "${e.title || 'Untitled'}" (${typeKr}) -> Days: ${Array.from(uniqueDays).join(', ')} (Dates: ${targetDates.length})`);

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
        <div style={{ color: '#fff' }}>
            {/* 요약 */}
            {/* 요약 */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '12px' }}>
                <button onClick={handleShare} style={{
                    background: 'rgba(255, 255, 255, 0.1)',
                    border: '1px solid rgba(255, 255, 255, 0.2)',
                    borderRadius: '8px',
                    color: '#fff',
                    padding: '6px 12px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '4px',
                    transition: 'all 0.2s'
                }}>
                    <i className="ri-share-forward-line"></i> 통계 공유
                </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px', marginBottom: '24px' }}>
                <div style={cardStyle}>
                    <div style={labelStyle}>최근 1년</div>
                    <div style={valueStyle}>{stats.summary.totalItems}건</div>
                </div>
                <div style={cardStyle}>
                    <div style={labelStyle}>월평균 등록</div>
                    <div style={valueStyle}>{stats.summary.monthlyAverage}건</div>
                </div>
                <div style={cardStyle}>
                    <div style={labelStyle}>최고 활성</div>
                    <div style={valueStyle}>{stats.summary.topDay}요일</div>
                </div>
            </div>

            {/* 1. 월별 통계 */}
            <div style={sectionStyle}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
                    <h4 style={sectionTitleStyle}><i className="ri-bar-chart-fill"></i> 월별 콘텐츠 등록 추이</h4>
                    <div style={tabGroupStyle}>
                        <button onClick={() => setMonthlyRange('6m')} style={{ ...tabButtonStyle, background: monthlyRange === '6m' ? 'rgba(255,255,255,0.1)' : 'transparent', color: monthlyRange === '6m' ? '#fff' : '#71717a' }}>6개월</button>
                        <button onClick={() => setMonthlyRange('1y')} style={{ ...tabButtonStyle, background: monthlyRange === '1y' ? 'rgba(255,255,255,0.1)' : 'transparent', color: monthlyRange === '1y' ? '#fff' : '#71717a' }}>1년</button>
                    </div>
                </div>
                <div style={chartContainerStyle}>
                    {currentMonthly.map((m, i) => (
                        <div key={i} style={barWrapperStyle}>
                            {m.total > 0 && <span style={totalLabelStyle}>{m.total}</span>}
                            <div style={stackedBarOuterStyle}>
                                <div style={{ height: (m.classes / maxMonthly) * 150, width: '100%', background: COLORS.classes }}></div>
                                <div style={{ height: (m.events / maxMonthly) * 150, width: '100%', background: COLORS.events }}></div>
                                <div style={{ height: (m.socials / maxMonthly) * 150, width: '100%', background: COLORS.socials }}></div>
                                <div style={{ height: (m.posts / maxMonthly) * 150, width: '100%', background: COLORS.posts, borderRadius: '2px 2px 0 0' }}></div>
                            </div>
                            <span style={axisLabelStyle}>{m.month.split('-')[1]}월</span>
                        </div>
                    ))}
                </div>
                <div style={legendGridStyle}>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.classes }}></span> 강습</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.events }}></span> 행사</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.socials }}></span> 소셜</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.posts }}></span> 게시글</div>
                </div>
            </div>

            <div style={{ height: '32px' }}></div>

            {/* 주간 통계 헤더 (탭) */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px', padding: '0 4px' }}>
                <h3 style={{ margin: 0, fontSize: '15px', fontWeight: '700', color: '#fff' }}>주간 집중 분석</h3>
                <div style={tabGroupStyle}>
                    <button onClick={() => { setWeeklyTab('total'); setInspectTypeDay(null); setInspectGenreDay(null); }} style={{ ...tabButtonStyle, background: weeklyTab === 'total' ? 'rgba(255,255,255,0.1)' : 'transparent', color: weeklyTab === 'total' ? '#fff' : '#71717a' }}>전체</button>
                    <button onClick={() => { setWeeklyTab('monthly'); setInspectTypeDay(null); setInspectGenreDay(null); }} style={{ ...tabButtonStyle, background: weeklyTab === 'monthly' ? 'rgba(255,255,255,0.1)' : 'transparent', color: weeklyTab === 'monthly' ? '#fff' : '#71717a' }}>이번 달</button>
                </div>
            </div>

            {/* 2. 요일별 콘텐츠 유형 */}
            <div style={sectionStyle}>
                <h4 style={sectionTitleStyle}><i className="ri-calendar-todo-line"></i> 요일별 유형 비중 ({weeklyTab === 'total' ? '12개월 평균' : '이번 달'})</h4>
                <div style={{ marginBottom: '12px', fontSize: '11px', color: '#9ca3af', textAlign: 'right' }}>* 그래프를 클릭하여 상세 데이터를 확인하세요</div>
                <div style={chartContainerStyle}>
                    {currentWeekly.map((d, i) => (
                        <div key={i} style={{ ...barWrapperStyle, cursor: 'pointer', opacity: inspectTypeDay && inspectTypeDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectTypeDay(inspectTypeDay === d.day ? null : d.day)}>
                            {d.count > 0 && <span style={{ ...totalLabelStyle, color: inspectTypeDay === d.day ? '#60a5fa' : '#fff', fontWeight: inspectTypeDay === d.day ? '700' : '400' }}>{d.count}</span>}
                            <div style={stackedBarOuterStyle}>
                                {d.typeBreakdown.map((tb, idx) => (
                                    <div key={idx} style={{ height: (tb.count / maxDay) * 150, width: '100%', background: [COLORS.classes, COLORS.events, COLORS.socials, COLORS.posts][idx] }}></div>
                                ))}
                            </div>
                            <span style={{ ...axisLabelStyle, color: inspectTypeDay === d.day ? '#60a5fa' : '#71717a' }}>{d.day}</span>
                        </div>
                    ))}
                </div>
                <div style={legendGridStyle}>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.classes }}></span> 강습</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.events }}></span> 행사</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.socials }}></span> 소셜</div>
                    <div style={legendItemStyle}><span style={{ ...dotStyle, background: COLORS.posts }}></span> 게시글</div>
                </div>
                <div style={chartDescStyle}>
                    <p>• 소셜은 주로 <strong>{getTypePeak('소셜')}요일</strong>, 행사는 <strong>{getTypePeak('행사')}요일</strong>에 가장 활발하게 등록됩니다.</p>
                </div>
                {inspectTypeDay && (
                    <DataInspectorModal day={inspectTypeDay} items={getTypeItems(inspectTypeDay)} sortBy="type" onClose={() => setInspectTypeDay(null)} />
                )}
            </div>

            {/* 3. 요일별 장르 비중 */}
            <div style={{ ...sectionStyle, marginTop: '20px' }}>
                <h4 style={sectionTitleStyle}><i className="ri-medal-2-line"></i> 요일별 장르 비중 ({weeklyTab === 'total' ? '12개월 평균' : '이번 달'})</h4>
                <div style={chartContainerStyle}>
                    {currentWeekly.map((d, i) => (
                        <div key={i} style={{ ...barWrapperStyle, cursor: 'pointer', opacity: inspectGenreDay && inspectGenreDay !== d.day ? 0.3 : 1 }} onClick={() => setInspectGenreDay(inspectGenreDay === d.day ? null : d.day)}>
                            {d.count > 0 && <span style={{ ...totalLabelStyle, color: inspectGenreDay === d.day ? '#60a5fa' : '#fff', fontWeight: inspectGenreDay === d.day ? '700' : '400' }}>{d.count}</span>}
                            <div style={stackedBarOuterStyle}>
                                {d.genreBreakdown.map((gb, idx) => (
                                    <div key={idx} style={{ height: (gb.count / maxDay) * 150, width: '100%', background: getGenreColor(gb.name, idx), borderRadius: idx === d.genreBreakdown.length - 1 ? '2px 2px 0 0' : '0' }}></div>
                                ))}
                            </div>
                            <span style={{ ...axisLabelStyle, color: inspectGenreDay === d.day ? '#60a5fa' : '#71717a' }}>{d.day}</span>
                        </div>
                    ))}
                </div>
                <div style={{ ...legendGridStyle, gridTemplateColumns: 'repeat(3, 1fr)' }}>
                    {stats.topGenresList.map((g, i) => (
                        <div key={i} style={legendItemStyle}>
                            <span style={{ ...dotStyle, background: getGenreColor(g, i) }}></span>
                            <span style={{ fontSize: '10px' }}>{g}</span>
                        </div>
                    ))}
                </div>
                <div style={chartDescStyle}>
                    <p>• {stats.topGenresList[0]} 장르는 <strong>{getGenrePeak(stats.topGenresList[0])}요일</strong>에 가장 높은 점유율을 기록합니다.</p>
                </div>
                {inspectGenreDay && (
                    <DataInspectorModal day={inspectGenreDay} items={getGenreItems(inspectGenreDay)} sortBy="genre" onClose={() => setInspectGenreDay(null)} />
                )}
            </div>

            <div style={{ height: '30px' }}></div>
        </div >
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
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}>
            <div style={{ background: '#1e293b', width: '90%', maxWidth: '500px', maxHeight: '80vh', borderRadius: '16px', border: '1px solid rgba(148, 163, 184, 0.2)', display: 'flex', flexDirection: 'column', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
                <div style={{ padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <h4 style={{ margin: 0, fontSize: '16px', fontWeight: '600', color: '#fff' }}>
                        {day}요일 상세 데이터 <span style={{ fontSize: '13px', color: '#94a3b8', fontWeight: '400' }}>({sortedItems.length}건) - {sortBy === 'type' ? '유형별' : '장르별'} 정렬</span>
                    </h4>
                    <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: '4px' }}>
                        <i className="ri-close-line" style={{ fontSize: '24px' }}></i>
                    </button>
                </div>

                <div style={{ flex: 1, overflowY: 'auto' }}>
                    {sortedItems.length === 0 ? (
                        <div style={{ padding: '40px', textAlign: 'center', color: '#64748b', fontSize: '14px' }}>데이터가 없습니다.</div>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
                            <thead style={{ position: 'sticky', top: 0, background: '#1e293b', zIndex: 10 }}>
                                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', color: '#94a3b8' }}>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: sortBy === 'type' ? '#60a5fa' : '#94a3b8' }}>구분</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500' }}>제목</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '500', color: sortBy === 'genre' ? '#fcd34d' : '#94a3b8' }}>장르</th>
                                    <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '500' }}>날짜</th>
                                </tr>
                            </thead>
                            <tbody>
                                {sortedItems.map((item, idx) => (
                                    <tr key={idx} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)', background: idx % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                                        <td style={{ padding: '12px 16px' }}>
                                            <span style={{
                                                padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '600',
                                                background: item.type === '강습' ? 'rgba(59, 130, 246, 0.2)' :
                                                    item.type === '행사' ? 'rgba(251, 191, 36, 0.2)' :
                                                        item.type === '소셜' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                                                color: item.type === '강습' ? '#60a5fa' :
                                                    item.type === '행사' ? '#fcd34d' :
                                                        item.type === '소셜' ? '#34d399' : '#c084fc'
                                            }}>{item.type}</span>
                                        </td>
                                        <td style={{ padding: '12px 16px', color: '#e2e8f0', minWidth: '120px' }}>{item.title}</td>
                                        <td style={{ padding: '12px 16px', color: sortBy === 'genre' ? '#fcd34d' : '#cbd5e1', fontWeight: sortBy === 'genre' ? '600' : '400' }}>{item.genre}</td>
                                        <td style={{ padding: '12px 16px', color: '#94a3b8', textAlign: 'right', fontSize: '12px', whiteSpace: 'nowrap' }}>{item.date}</td>
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

const cardStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', padding: '12px 4px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.08)', textAlign: 'center' };
const labelStyle: React.CSSProperties = { fontSize: '10px', color: '#a1a1aa', marginBottom: '4px' };
const valueStyle: React.CSSProperties = { fontSize: '15px', color: '#fff', fontWeight: '700' };
const sectionStyle: React.CSSProperties = { background: 'rgba(255,255,255,0.02)', padding: '20px 16px', borderRadius: '24px', border: '1px solid rgba(255,255,255,0.04)' };
const sectionTitleStyle: React.CSSProperties = { margin: 0, fontSize: '13px', color: '#d1d5db', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: '600', opacity: 0.9 };
const chartContainerStyle: React.CSSProperties = { display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '170px', marginTop: '20px', paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.05)' };
const barWrapperStyle: React.CSSProperties = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' };
const stackedBarOuterStyle: React.CSSProperties = { width: '18px', display: 'flex', flexDirection: 'column-reverse', gap: '1px' };
const totalLabelStyle: React.CSSProperties = { fontSize: '9px', color: '#fff', marginBottom: '4px' };
const axisLabelStyle: React.CSSProperties = { fontSize: '10px', color: '#71717a', marginTop: '8px' };
const legendGridStyle: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '16px' };
const legendItemStyle: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: '6px', fontSize: '10px', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis' };
const dotStyle: React.CSSProperties = { width: '7px', height: '7px', borderRadius: '2px', flexShrink: 0 };
const tabGroupStyle: React.CSSProperties = { display: 'flex', background: 'rgba(0,0,0,0.2)', padding: '2px', borderRadius: '8px', border: '1px solid rgba(255,255,255,0.05)' };
const tabButtonStyle: React.CSSProperties = { padding: '4px 12px', fontSize: '11px', border: 'none', borderRadius: '6px', cursor: 'pointer', transition: 'all 0.2s', fontWeight: '500' };
const chartDescStyle: React.CSSProperties = { marginTop: '16px', padding: '12px', background: 'rgba(59, 130, 246, 0.05)', borderRadius: '12px', fontSize: '12px', color: '#e0f2fe', lineHeight: '1.6' };
