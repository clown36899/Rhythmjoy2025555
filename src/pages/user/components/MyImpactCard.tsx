import { useState, useMemo } from 'react';
import type { StandardBoardPost } from '../../../types/board';
import type { Event as SupabaseEvent } from '../../../lib/supabase';

interface MyImpactCardProps {
    user: any;
    posts: StandardBoardPost[];
    events: SupabaseEvent[];
    initialExpanded?: boolean;
}

export default function MyImpactCard({ posts, events, initialExpanded = false }: MyImpactCardProps) {
    const [showDetail, setShowDetail] = useState(initialExpanded);

    // 1. Calculate Aggregates (Client-Side)
    const stats = useMemo(() => {
        // Posts Stats
        const postViews = posts.reduce((sum, p) => sum + (p.views || 0), 0);
        const postLikes = posts.reduce((sum, p) => sum + (p.likes || 0), 0);
        const postComments = posts.reduce((sum, p) => sum + (p.comment_count || 0), 0);

        // Events Stats
        const eventViews = events.reduce((sum, e) => sum + (e.views || 0), 0); // Assuming 'views' exists on events

        return {
            totalViews: postViews + eventViews,
            totalLikes: postLikes, // Events usually don't have likes yet in this system
            totalComments: postComments,
            postCount: posts.length,
            eventCount: events.length
        };
    }, [posts, events]);

    // UI Props
    const impactLevel = useMemo(() => {
        if (stats.totalViews > 10000) return { color: "#a855f7" }; // Purple
        if (stats.totalViews > 1000) return { color: "#00ddff" }; // Cyan
        return { color: "#22c55e" }; // Green
    }, [stats.totalViews]);

    // Top Lists
    const topPosts = useMemo(() => [...posts].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5), [posts]);
    const topEvents = useMemo(() => [...events].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5), [events]);

    // 3. Exposure Status Logic (Matching Main Screen Filters)
    const getExposureStatus = (item: any, type: 'post' | 'event') => {
        if (type === 'post') return { label: '노출 중', color: '#22c55e', isActive: true };

        const today = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD local
        let startDate = item.start_date || item.date;

        if (item.event_dates && item.event_dates.length > 0) {
            const sorted = [...item.event_dates].sort();
            startDate = sorted[0];
        }

        // Logic from User: "If start date has passed today, it's not visible"
        // This applies to both Events and Classes/Clubs.
        const isVisible = !(today > (startDate || ''));

        return isVisible
            ? { label: '노출 중', color: '#22c55e', isActive: true }
            : { label: '종료됨', color: '#71717a', isActive: false };
    };

    return (
        <div className="mic-card" onClick={() => setShowDetail(!showDetail)}>
            <style>{`
                .mic-card {
                    background: linear-gradient(135deg, #1f2937 0%, #111827 100%);
                    border-radius: 16px;
                    padding: 20px;
                    margin-bottom: 24px;
                    box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);
                    border: 1px solid rgba(255,255,255,0.05);
                    position: relative;
                    overflow: hidden;
                    cursor: pointer;
                    transition: all 0.2s ease;
                }
                
                .mic-bg-deco {
                    position: absolute;
                    top: -20%;
                    right: -10%;
                    width: 150px;
                    height: 150px;
                    filter: blur(80px);
                    opacity: 0.15;
                    border-radius: 50%;
                }

                .mic-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    margin-bottom: 16px;
                    position: relative;
                }

                .mic-title {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 700;
                    color: #fff;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .mic-subtitle {
                    font-size: 12px;
                    color: #9ca3af;
                    margin-top: 4px;
                }

                .mic-arrow {
                    color: #6b7280;
                    transition: transform 0.2s;
                }
                .mic-arrow.rotated { transform: rotate(180deg); }

                .mic-stats-grid {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 12px;
                    position: relative;
                }

                .mic-stat-box {
                    background: rgba(255,255,255,0.03);
                    border-radius: 12px;
                    padding: 16px;
                    display: flex;
                    flex-direction: column;
                }

                .mic-stat-label {
                    font-size: 11px;
                    color: #9ca3af;
                    margin-bottom: 4px;
                }

                .mic-stat-val {
                    font-size: 24px;
                    font-weight: 700;
                    color: #fff;
                }
                .mic-stat-val.pink { color: #ec4899; }

                .mic-footer {
                    margin-top: 16px;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255,255,255,0.05);
                    display: flex;
                    gap: 16px;
                    font-size: 11px;
                    color: #6b7280;
                    justify-content: space-between;
                    align-items: center;
                }
                .mic-footer-counts { display: flex; gap: 16px; }

                .mic-expanded {
                    margin-top: 20px;
                    padding-top: 20px;
                    border-top: 1px solid rgba(255,255,255,0.1);
                    animation: fadeIn 0.3s ease;
                }

                .mic-section-title {
                    font-size: 13px;
                    color: #e5e7eb;
                    margin-bottom: 10px;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }
                .mic-section-margin { margin-bottom: 20px; }

                .mic-list {
                    list-style: none;
                    padding: 0;
                    margin: 0;
                }

                .mic-list-item {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 0;
                    border-bottom: 1px solid rgba(255,255,255,0.05);
                    font-size: 13px;
                }

                .mic-item-info {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    overflow: hidden;
                }

                .mic-badge {
                    padding: 2px 6px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                    white-space: nowrap;
                }

                .mic-item-title {
                    color: #fff;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }
                .mic-item-title.max-w-140 { max-width: 140px; }
                .mic-item-title.max-w-160 { max-width: 160px; }

                .mic-item-stats {
                    display: flex;
                    gap: 12px;
                    font-size: 12px;
                }
                .mic-stat-view { color: #9ca3af; }
                .mic-stat-like { color: #ec4899; }

                .mic-empty {
                    font-size: 12px;
                    color: #6b7280;
                }
            `}</style>

            {/* Background Decoration */}
            <div className="mic-bg-deco" style={{ background: impactLevel.color }}></div>

            {/* Header */}
            <div className="mic-header">
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3 className="mic-title">
                        <i className="ri-bar-chart-groupped-fill" style={{ color: impactLevel.color }}></i>
                        내 활동
                    </h3>
                    <span className="mic-subtitle">
                        지금까지 <strong>{stats.totalViews.toLocaleString()}명</strong>에게 영감을 주셨어요!
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`ri-arrow-down-s-line mic-arrow ${showDetail ? 'rotated' : ''}`}></i>
                </div>
            </div>

            {/* Stats Grid */}
            <div className="mic-stats-grid">
                {/* 1. Total Views */}
                <div className="mic-stat-box">
                    <span className="mic-stat-label">누적 조회수</span>
                    <span className="mic-stat-val">
                        {stats.totalViews.toLocaleString()}
                    </span>
                </div>

                {/* 2. Likes/Engagement */}
                <div className="mic-stat-box">
                    <span className="mic-stat-label">받은 좋아요</span>
                    <span className="mic-stat-val pink">
                        {stats.totalLikes.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Footer / Breakdown */}
            {!showDetail && (
                <div className="mic-footer">
                    <div className="mic-footer-counts">
                        <span>게시글 {stats.postCount}개</span>
                        <span>행사 {stats.eventCount}개</span>
                    </div>
                    <span><i className="ri-arrow-down-circle-line"></i> 자세히 보기</span>
                </div>
            )}

            {/* EXPANDED DETAIL VIEW */}
            {showDetail && (
                <div className="mic-expanded">

                    {/* Top Posts */}
                    <div className="mic-section-margin">
                        <h4 className="mic-section-title">
                            <i className="ri-fire-fill" style={{ color: '#ef4444' }}></i> 인기 게시글 TOP 5
                        </h4>
                        {topPosts.length > 0 ? (
                            <ul className="mic-list">
                                {topPosts.map(post => (
                                    <li key={post.id} className="mic-list-item">
                                        <div className="mic-item-info">
                                            <div className="mic-badge" style={{
                                                background: `${getExposureStatus(post, 'post').color}15`,
                                                color: getExposureStatus(post, 'post').color,
                                                border: `1px solid ${getExposureStatus(post, 'post').color}30`
                                            }}>
                                                {getExposureStatus(post, 'post').label}
                                            </div>
                                            <span className="mic-item-title max-w-140">{post.title}</span>
                                        </div>
                                        <div className="mic-item-stats">
                                            <span className="mic-stat-view"><i className="ri-eye-line"></i> {post.views?.toLocaleString()}</span>
                                            <span className="mic-stat-like"><i className="ri-heart-3-fill"></i> {post.likes}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mic-empty">작성한 게시글이 없습니다.</p>
                        )}
                    </div>

                    {/* Top Events */}
                    <div>
                        <h4 className="mic-section-title">
                            <i className="ri-calendar-event-fill" style={{ color: '#3b82f6' }}></i> 인기 행사 TOP 5
                        </h4>
                        {topEvents.length > 0 ? (
                            <ul className="mic-list">
                                {topEvents.map(event => (
                                    <li key={event.id} className="mic-list-item">
                                        <div className="mic-item-info">
                                            <div className="mic-badge" style={{
                                                background: `${getExposureStatus(event, 'event').color}15`,
                                                color: getExposureStatus(event, 'event').color,
                                                border: `1px solid ${getExposureStatus(event, 'event').color}30`
                                            }}>
                                                {getExposureStatus(event, 'event').label}
                                            </div>
                                            <span className="mic-item-title max-w-160">{event.title}</span>
                                        </div>
                                        <span className="mic-stat-view" style={{ fontSize: '12px' }}><i className="ri-eye-line"></i> {event.views?.toLocaleString()}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p className="mic-empty">등록한 행사가 없습니다.</p>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
