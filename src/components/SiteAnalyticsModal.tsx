import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import './SiteAnalyticsModal.css';

interface AnalyticsSummary {
    total_clicks: number;
    user_clicks: number;
    anon_clicks: number;
    admin_clicks: number;
    daily_details: {
        date: string;
        displayDate: string;
        total: number;
        events: { title: string; type: string; count: number }[];
    }[];
    total_top_items: { title: string; type: string; count: number }[];
    total_sections: { section: string; count: number }[];
}

export default function SiteAnalyticsModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'summary' | 'daily'>('summary');

    // Helper: Get YYYY-MM-DD in Korean Time (UTC+9)
    const getKRDateString = (date: Date) => {
        const krOffset = 9 * 60 * 60 * 1000;
        const krTime = new Date(date.getTime() + krOffset);
        return krTime.toISOString().split('T')[0];
    };

    const [dateRange, setDateRange] = useState({
        start: getKRDateString(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
        end: getKRDateString(new Date())
    });

    useEffect(() => {
        if (isOpen) {
            fetchAnalytics();
        }
    }, [isOpen, dateRange.start, dateRange.end]);

    const setShortcutRange = (days: number) => {
        const end = new Date();
        const start = new Date();

        if (days === 0) {
            // Today
        } else if (days === 1) {
            start.setDate(start.getDate() - 1);
            end.setDate(end.getDate() - 1);
        } else {
            start.setDate(start.getDate() - (days - 1));
        }

        setDateRange({
            start: getKRDateString(start),
            end: getKRDateString(end)
        });
    };

    const fetchAnalytics = async () => {
        setLoading(true);
        try {
            const startStr = dateRange.start + 'T00:00:00+09:00';
            const endStr = dateRange.end + 'T23:59:59+09:00';

            const { data, error } = await supabase
                .from('site_analytics_logs')
                .select('*')
                .gte('created_at', startStr)
                .lte('created_at', endStr)
                .order('created_at', { ascending: false });

            if (error) throw error;

            // [PHASE 5] Admin Exclusion
            // 사용자의 요청으로 관리자 데이터는 통계에서 완전히 제외합니다.
            const validData = data.filter(d => !d.is_admin);

            // 2. 중복 클릭 제거 (Unique Count: 동일 유저가 동일 타겟을 여러 번 클릭해도 1회로 집계)
            const uniqueSet = new Set<string>();
            const uniqueData = validData.filter(d => {
                // 유저 식별자 (로그인 ID 또는 핑거프린트)
                const userIdentifier = d.user_id || d.fingerprint || 'unknown';
                // 고유 키: 타겟 + 유저 (날짜는 구분하지 않음 = 기간 내 1회만 인정)
                // 만약 '일별' 중복을 허용하려면 날짜를 키에 포함해야 함. 유저 요구사항("100번 눌러도 1번")에 따라 전체 기간 Unique로 처리.
                const uniqueKey = `${d.target_type}:${d.target_id}:${userIdentifier}`;

                if (uniqueSet.has(uniqueKey)) {
                    return false;
                }
                uniqueSet.add(uniqueKey);
                return true;
            });

            // 통계 집계는 이제 '순수 유니크 데이터(uniqueData)'를 기준으로 함
            const processedData = uniqueData;

            const total = processedData.length;
            const loggedIn = processedData.filter(d => d.user_id && !d.is_admin).length;
            const anon = processedData.filter(d => !d.user_id && !d.is_admin).length;
            const admin = processedData.filter(d => d.is_admin).length;

            const totalItemMap = new Map<string, { title: string, type: string, count: number }>();
            const totalSectionMap = new Map<string, number>();

            processedData.forEach(d => {
                const key = d.target_type + ':' + d.target_id;
                const existing = totalItemMap.get(key) || { title: d.target_title || d.target_id, type: d.target_type, count: 0 };
                totalItemMap.set(key, { ...existing, count: existing.count + 1 });
                totalSectionMap.set(d.section, (totalSectionMap.get(d.section) || 0) + 1);
            });

            const totalTopItems = Array.from(totalItemMap.values()).sort((a, b) => b.count - a.count).slice(0, 20);
            const totalSections = Array.from(totalSectionMap.entries())
                .map(([section, count]) => ({ section, count }))
                .sort((a, b) => b.count - a.count);

            const dateGroups = new Map<string, any[]>();
            processedData.forEach(d => {
                const dateKey = d.created_at.split('T')[0];
                const group = dateGroups.get(dateKey) || [];
                group.push(d);
                dateGroups.set(dateKey, group);
            });

            const dailyDetails = Array.from(dateGroups.entries())
                .sort((a, b) => b[0].localeCompare(a[0]))
                .map(([date, logs]) => {
                    const eventMap = new Map<string, { title: string, type: string, count: number }>();
                    logs.forEach(l => {
                        const key = l.target_type + ':' + l.target_id;
                        const existing = eventMap.get(key) || { title: l.target_title || l.target_id, type: l.target_type, count: 0 };
                        eventMap.set(key, { ...existing, count: existing.count + 1 });
                    });

                    const dObj = new Date(date);
                    const displayDate = dObj.toLocaleDateString('ko-KR', {
                        month: 'long', day: 'numeric', weekday: 'short'
                    });

                    return {
                        date,
                        displayDate,
                        total: logs.length,
                        events: Array.from(eventMap.values()).sort((a, b) => b.count - a.count)
                    };
                });

            setSummary({
                total_clicks: total,
                user_clicks: loggedIn,
                anon_clicks: anon,
                admin_clicks: admin,
                daily_details: dailyDetails,
                total_top_items: totalTopItems,
                total_sections: totalSections
            });

            // [PHASE 3] Auto Snapshot: 오늘치 스냅샷이 없으면 조용히 생성
            if (dateRange.end === getKRDateString(new Date())) {
                checkAndAutoSnapshot({
                    user_clicks: loggedIn,
                    anon_clicks: anon,
                    admin_clicks: admin
                } as any);
            }
        } catch (err) {
            console.error('Failed to fetch analytics:', err);
        } finally {
            setLoading(false);
        }
    };

    const checkAndAutoSnapshot = async (currentStats: { user_clicks: number, anon_clicks: number, admin_clicks: number }) => {
        try {
            const today = getKRDateString(new Date());
            const startStr = today + 'T00:00:00+09:00';
            const endStr = today + 'T23:59:59+09:00';

            const { data, error } = await supabase
                .from('site_usage_stats')
                .select('id')
                .gte('snapshot_time', startStr)
                .lte('snapshot_time', endStr)
                .limit(1);

            if (error) throw error;

            if (!data || data.length === 0) {
                await supabase.rpc('create_usage_snapshot', {
                    p_logged_in: currentStats.user_clicks,
                    p_anonymous: currentStats.anon_clicks,
                    p_admin: currentStats.admin_clicks
                });
                console.log('[Analytics] 📸 Auto-snapshot created for today');
            }
        } catch (err) {
            console.error('[Analytics] Auto-snapshot check failed:', err);
        }
    };

    // 최근 7일 트렌드 데이터 계산
    const trendData = summary ? summary.daily_details.slice(0, 7).reverse() : [];
    const maxDayClicks = trendData.length > 0 ? Math.max(...trendData.map(d => d.total)) : 0;

    if (!isOpen) return null;

    return (
        <div className="analytics-modal-overlay" onClick={onClose}>
            <div className="analytics-modal-content" onClick={e => e.stopPropagation()}>
                <div className="analytics-modal-header">
                    <div className="header-title-group">
                        <div className="title-left">
                            <h2><i className="ri-bar-chart-2-line"></i> 운영 통계 리포트</h2>
                            <button className="refresh-btn" onClick={fetchAnalytics} disabled={loading}>
                                <i className={loading ? "ri-refresh-line spinning" : "ri-refresh-line"}></i>
                            </button>
                        </div>
                        <div className="view-mode-tabs">
                            <button className={viewMode === 'summary' ? 'active' : ''} onClick={() => setViewMode('summary')}>전체 요약</button>
                            <button className={viewMode === 'daily' ? 'active' : ''} onClick={() => setViewMode('daily')}>날짜별 상세</button>
                        </div>
                    </div>

                    <div className="range-picker">
                        <div className="range-shortcuts">
                            <button onClick={() => setShortcutRange(0)}>오늘</button>
                            <button onClick={() => setShortcutRange(1)}>어제</button>
                            <button onClick={() => setShortcutRange(7)}>7일</button>
                            <button onClick={() => setShortcutRange(30)}>30일</button>
                        </div>
                        <div className="range-inputs">
                            <input type="date" value={dateRange.start} onChange={e => setDateRange(prev => ({ ...prev, start: e.target.value }))} />
                            <span>~</span>
                            <input type="date" value={dateRange.end} onChange={e => setDateRange(prev => ({ ...prev, end: e.target.value }))} />
                        </div>
                    </div>

                    <button className="analytics-close-btn" onClick={onClose}><i className="ri-close-line"></i></button>
                </div>

                <div className="analytics-modal-body">
                    {loading ? (
                        <div className="analytics-loading">데이터 분석 중...</div>
                    ) : summary && summary.total_clicks > 0 ? (
                        <div className="analytics-scroll-container">
                            <div className="analytics-summary-mini">
                                <span>기간 내 총 클릭: <strong>{summary.total_clicks}</strong></span>
                                <span>로그인: <strong className="highlight-blue">{summary.user_clicks}</strong></span>
                                <span>Guest: <strong className="highlight-gray">{summary.anon_clicks}</strong></span>
                            </div>

                            {/* [PHASE 2] 트렌드 미니 차트 */}
                            <div className="analytics-trend-section">
                                <h3><i className="ri-line-chart-line"></i> 최근 7일 클릭 트렌드</h3>
                                <div className="trend-chart-container">
                                    {trendData.map((day, idx) => {
                                        const height = maxDayClicks > 0 ? (day.total / maxDayClicks) * 100 : 0;
                                        return (
                                            <div key={idx} className="trend-bar-wrapper">
                                                <div className="trend-bar-at-bottom">
                                                    <div className="trend-bar-fill" style={{ height: `${height}%` }}>
                                                        <span className="trend-tooltip">{day.total}</span>
                                                    </div>
                                                </div>
                                                <span className="trend-label">{day.date.split('-')[2]}일</span>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>

                            {viewMode === 'summary' ? (
                                <div className="summary-view-content">
                                    <div className="analytics-grid">
                                        <div className="grid-section">
                                            <h3><i className="ri-trophy-line"></i> 기간 통합 인기 콘텐츠 (Top 20)</h3>
                                            <div className="ranking-list">
                                                {summary.total_top_items.length > 0 ? (
                                                    summary.total_top_items.map((item, idx) => (
                                                        <div key={idx} className="ranking-item">
                                                            <span className="item-rank">{idx + 1}</span>
                                                            <div className="item-info">
                                                                <span className="item-title">{item.title}</span>
                                                                <span className="item-meta">{item.type}</span>
                                                            </div>
                                                            <span className="item-count">{item.count}</span>
                                                        </div>
                                                    ))
                                                ) : (
                                                    <div className="no-data-msg">데이터가 없습니다.</div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="grid-section">
                                            <h3><i className="ri-pie-chart-line"></i> 유입 경로 비중</h3>
                                            <div className="section-breakdown">
                                                {summary.total_sections.map((sec, idx) => {
                                                    const percent = Math.round((sec.count / summary.total_clicks) * 100);
                                                    return (
                                                        <div key={idx} className="breakdown-row">
                                                            <div className="row-label">
                                                                <span>{sec.section}</span>
                                                                <span>{percent + '%'}</span>
                                                            </div>
                                                            <div className="row-bar-bg">
                                                                <div className="row-bar-fill" style={{ width: percent + '%' }}></div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="daily-view-content">
                                    <div className="daily-record-list">
                                        {summary.daily_details.map((day, dIdx) => (
                                            <div key={dIdx} className="daily-section">
                                                <div className="daily-header">
                                                    <span className="daily-date">{day.displayDate}</span>
                                                    <span className="daily-total">{day.total} clicks</span>
                                                </div>
                                                <div className="daily-events-grid">
                                                    {day.events.map((evt, eIdx) => (
                                                        <div key={eIdx} className="daily-event-row">
                                                            <span className="evt-type">{evt.type}</span>
                                                            <span className="evt-title">{evt.title}</span>
                                                            <span className="evt-count">{evt.count}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ) : (
                        <div className="analytics-empty">
                            <i className="ri-inbox-line"></i>
                            <p>선택한 기간에 수집된 데이터가 없습니다.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
