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
        <div style={{
            background: 'linear-gradient(135deg, #1f2937 0%, #111827 100%)',
            borderRadius: '16px',
            padding: '20px',
            marginBottom: '24px',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            border: '1px solid rgba(255,255,255,0.05)',
            position: 'relative',
            overflow: 'hidden',
            cursor: 'pointer',
            transition: 'all 0.2s ease'
        }} onClick={() => setShowDetail(!showDetail)}>
            {/* Background Decoration */}
            <div style={{
                position: 'absolute',
                top: '-20%',
                right: '-10%',
                width: '150px',
                height: '150px',
                background: impactLevel.color,
                filter: 'blur(80px)',
                opacity: 0.15,
                borderRadius: '50%'
            }}></div>

            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', position: 'relative' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                    <h3 style={{
                        margin: 0,
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px'
                    }}>
                        <i className="ri-bar-chart-groupped-fill" style={{ color: impactLevel.color }}></i>
                        내 활동
                    </h3>
                    <span style={{ fontSize: '12px', color: '#9ca3af', marginTop: '4px' }}>
                        지금까지 <strong>{stats.totalViews.toLocaleString()}명</strong>에게 영감을 주셨어요!
                    </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <i className={`ri-arrow-down-s-line ${showDetail ? 'rotate-180' : ''}`} style={{ color: '#6b7280', transition: 'transform 0.2s' }}></i>
                </div>
            </div>

            {/* Stats Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', position: 'relative' }}>
                {/* 1. Total Views */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>누적 조회수</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#fff' }}>
                        {stats.totalViews.toLocaleString()}
                    </span>
                </div>

                {/* 2. Likes/Engagement */}
                <div style={{ background: 'rgba(255,255,255,0.03)', borderRadius: '12px', padding: '16px', display: 'flex', flexDirection: 'column' }}>
                    <span style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '4px' }}>받은 좋아요</span>
                    <span style={{ fontSize: '24px', fontWeight: 700, color: '#ec4899' }}>
                        {stats.totalLikes.toLocaleString()}
                    </span>
                </div>
            </div>

            {/* Footer / Breakdown */}
            {!showDetail && (
                <div style={{ marginTop: '16px', paddingTop: '12px', borderTop: '1px solid rgba(255,255,255,0.05)', display: 'flex', gap: '16px', fontSize: '11px', color: '#6b7280', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ display: 'flex', gap: '16px' }}>
                        <span>게시글 {stats.postCount}개</span>
                        <span>행사 {stats.eventCount}개</span>
                    </div>
                    <span><i className="ri-arrow-down-circle-line"></i> 자세히 보기</span>
                </div>
            )}

            {/* EXPANDED DETAIL VIEW */}
            {showDetail && (
                <div style={{ marginTop: '20px', paddingTop: '20px', borderTop: '1px solid rgba(255,255,255,0.1)', animation: 'fadeIn 0.3s ease' }}>

                    {/* Top Posts */}
                    <div style={{ marginBottom: '20px' }}>
                        <h4 style={{ fontSize: '13px', color: '#e5e7eb', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ri-fire-fill" style={{ color: '#ef4444' }}></i> 인기 게시글 TOP 5
                        </h4>
                        {topPosts.length > 0 ? (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {topPosts.map(post => (
                                    <li key={post.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <div style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: `${getExposureStatus(post, 'post').color}15`,
                                                color: getExposureStatus(post, 'post').color,
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                border: `1px solid ${getExposureStatus(post, 'post').color}30`
                                            }}>
                                                {getExposureStatus(post, 'post').label}
                                            </div>
                                            <span style={{ color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '140px' }}>{post.title}</span>
                                        </div>
                                        <div style={{ display: 'flex', gap: '12px', fontSize: '12px' }}>
                                            <span style={{ color: '#9ca3af' }}><i className="ri-eye-line"></i> {post.views?.toLocaleString()}</span>
                                            <span style={{ color: '#ec4899' }}><i className="ri-heart-3-fill"></i> {post.likes}</span>
                                        </div>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p style={{ fontSize: '12px', color: '#6b7280' }}>작성한 게시글이 없습니다.</p>
                        )}
                    </div>

                    {/* Top Events */}
                    <div>
                        <h4 style={{ fontSize: '13px', color: '#e5e7eb', marginBottom: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="ri-calendar-event-fill" style={{ color: '#3b82f6' }}></i> 인기 행사 TOP 5
                        </h4>
                        {topEvents.length > 0 ? (
                            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                                {topEvents.map(event => (
                                    <li key={event.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', fontSize: '13px' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                                            <div style={{
                                                padding: '2px 6px',
                                                borderRadius: '4px',
                                                background: `${getExposureStatus(event, 'event').color}15`,
                                                color: getExposureStatus(event, 'event').color,
                                                fontSize: '10px',
                                                fontWeight: 600,
                                                whiteSpace: 'nowrap',
                                                border: `1px solid ${getExposureStatus(event, 'event').color}30`
                                            }}>
                                                {getExposureStatus(event, 'event').label}
                                            </div>
                                            <span style={{ color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '160px' }}>{event.title}</span>
                                        </div>
                                        <span style={{ color: '#9ca3af', fontSize: '12px' }}><i className="ri-eye-line"></i> {event.views?.toLocaleString()}</span>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <p style={{ fontSize: '12px', color: '#6b7280' }}>등록한 행사가 없습니다.</p>
                        )}
                    </div>

                </div>
            )}
        </div>
    );
}
