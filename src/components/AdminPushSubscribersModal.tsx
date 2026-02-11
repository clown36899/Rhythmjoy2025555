import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import "./AdminPushSubscribersModal.css";

interface AdminPushSubscribersModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface PushSubscriber {
    id: string;
    endpoint: string;
    user_id: string;
    user_agent: string | null;
    is_admin: boolean;
    pref_events: boolean;
    pref_class: boolean;
    pref_clubs: boolean;
    pref_filter_tags: string[] | null;
    pref_filter_class_genres: string[] | null;
    updated_at: string;
    board_users?: {
        nickname: string;
        profile_image: string | null;
    };
}

export default function AdminPushSubscribersModal({ isOpen, onClose }: AdminPushSubscribersModalProps) {
    const { isAdmin } = useAuth();
    const [subscribers, setSubscribers] = useState<PushSubscriber[]>([]);
    const [filteredSubscribers, setFilteredSubscribers] = useState<PushSubscriber[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && isAdmin) {
            loadSubscribers();
        }
    }, [isOpen, isAdmin]);

    useEffect(() => {
        filterSubscribers();
    }, [searchTerm, subscribers]);

    const loadSubscribers = async () => {
        try {
            setLoading(true);

            // 1. 구독 정보 먼저 가져오기
            const { data: subsData, error: subsError } = await supabase
                .from('user_push_subscriptions')
                .select(`
                    id, endpoint, user_id, user_agent, is_admin, 
                    pref_events, pref_class, pref_clubs, 
                    pref_filter_tags, pref_filter_class_genres, 
                    updated_at
                `)
                .order('updated_at', { ascending: false });

            if (subsError) throw subsError;
            if (!subsData) return;

            // 2. 고유한 user_id 목록 추출
            const userIds = [...new Set(subsData.map(s => s.user_id))];

            // 3. 해당 유저들의 프로필 정보 가져오기
            const { data: profiles, error: profilesError } = await supabase
                .from('board_users')
                .select('user_id, nickname, profile_image')
                .in('user_id', userIds);

            if (profilesError) {
                console.warn('Failed to load user profiles, showing IDs instead:', profilesError);
            }

            // 4. 데이터 매핑
            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const joinedData = subsData.map(sub => ({
                ...sub,
                board_users: profileMap.get(sub.user_id) || {
                    nickname: `User(${sub.user_id.slice(0, 5)})`,
                    profile_image: null
                }
            }));

            setSubscribers(joinedData as any);
        } catch (error) {
            console.error('Error loading push subscribers:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterSubscribers = () => {
        if (!searchTerm.trim()) {
            setFilteredSubscribers(subscribers);
            return;
        }
        const term = searchTerm.toLowerCase();
        const filtered = subscribers.filter(sub =>
            sub.board_users?.nickname.toLowerCase().includes(term) ||
            (sub.user_agent && sub.user_agent.toLowerCase().includes(term)) ||
            sub.endpoint.toLowerCase().includes(term)
        );
        setFilteredSubscribers(filtered);
    };

    const formatDate = (dateString: string) => {
        return new Date(dateString).toLocaleString('ko-KR', {
            month: '2-digit', day: '2-digit',
            hour: '2-digit', minute: '2-digit'
        });
    };

    const getDeviceInfo = (ua: string | null) => {
        if (!ua) return { name: 'Unknown', icon: 'ri-global-line' };
        if (ua.includes('iPhone')) return { name: 'iPhone', icon: 'ri-smartphone-line' };
        if (ua.includes('iPad')) return { name: 'iPad', icon: 'ri-tablet-line' };
        if (ua.includes('Android')) return { name: 'Android', icon: 'ri-android-line' };
        if (ua.includes('Macintosh')) return { name: 'Mac', icon: 'ri-macbook-line' };
        if (ua.includes('Windows')) return { name: 'Windows', icon: 'ri-windows-line' };
        return { name: 'Web Client', icon: 'ri-global-line' };
    };

    // 통계 계산
    const stats = {
        total: subscribers.length,
        ios: subscribers.filter(s => s.user_agent?.includes('iPhone') || s.user_agent?.includes('iPad')).length,
        android: subscribers.filter(s => s.user_agent?.includes('Android')).length,
        active: subscribers.filter(s => s.pref_events || s.pref_class || s.pref_clubs).length
    };

    if (!isOpen) return null;

    return (
        <div className="apsm-overlay" onClick={onClose}>
            <div className="apsm-container" translate="no">
                <div className="apsm-header">
                    <div className="apsm-header-top">
                        <h2 className="apsm-title">
                            <i className="ri-notification-3-fill"></i>
                            푸시 알림 구독자 현황
                        </h2>
                        <button onClick={onClose} className="apsm-close-btn">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>

                    <div className="apsm-stats-bar">
                        <div className="apsm-stat-card">
                            <span className="apsm-stat-value">{stats.total}</span>
                            <span className="apsm-stat-label">전체 기기</span>
                        </div>
                        <div className="apsm-stat-card">
                            <span className="apsm-stat-value" style={{ color: '#34d399' }}>{stats.ios}</span>
                            <span className="apsm-stat-label">iOS</span>
                        </div>
                        <div className="apsm-stat-card">
                            <span className="apsm-stat-value" style={{ color: '#fbbf24' }}>{stats.android}</span>
                            <span className="apsm-stat-label">Android</span>
                        </div>
                        <div className="apsm-stat-card">
                            <span className="apsm-stat-value" style={{ color: '#f87171' }}>{stats.active}</span>
                            <span className="apsm-stat-label">알림 사용</span>
                        </div>
                    </div>

                    <div className="apsm-search-area">
                        <div className="apsm-search-wrapper">
                            <i className="apsm-search-icon ri-search-line"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="닉네임, 기기 또는 토큰 검색..."
                                className="apsm-search-input"
                            />
                        </div>
                        <button onClick={loadSubscribers} className="apsm-refresh-btn">
                            <i className="ri-refresh-line"></i>
                        </button>
                    </div>
                </div>

                <div className="apsm-content">
                    {loading ? (
                        <div className="boum-loading"><div className="prl-spinner"></div></div>
                    ) : (
                        <div className="apsm-grid">
                            {filteredSubscribers.length > 0 ? (
                                filteredSubscribers.map((sub) => {
                                    const device = getDeviceInfo(sub.user_agent);
                                    return (
                                        <div key={sub.id} className="apsm-card">
                                            <div className="apsm-user-info">
                                                <div className="apsm-avatar">
                                                    {sub.board_users?.profile_image ? (
                                                        <img
                                                            src={sub.board_users.profile_image}
                                                            alt=""
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    ) : (
                                                        <i className="ri-user-smile-line"></i>
                                                    )}
                                                </div>
                                                <div className="apsm-user-details">
                                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                                        <span className="apsm-nickname">{sub.board_users?.nickname || 'Unknown'}</span>
                                                        {sub.is_admin && <span className="apsm-admin-badge">ADMIN</span>}
                                                    </div>
                                                    <span className="apsm-user-id">UID: {sub.user_id.slice(0, 8)}</span>
                                                </div>
                                            </div>

                                            <div className="apsm-device-box">
                                                <span className="apsm-device-name">
                                                    <i className={device.icon}></i>
                                                    {device.name}
                                                </span>
                                                <span className="apsm-device-token">..{sub.endpoint.slice(-8)}</span>
                                            </div>

                                            <div className="apsm-prefs">
                                                <span className={`apsm-pref-chip event ${sub.pref_events ? 'active' : ''}`}>
                                                    {sub.pref_events ? '●' : '○'} 이벤트
                                                </span>
                                                <span className={`apsm-pref-chip class ${sub.pref_class ? 'active' : ''}`}>
                                                    {sub.pref_class ? '●' : '○'} 강습
                                                </span>
                                                <span className={`apsm-pref-chip club ${sub.pref_clubs ? 'active' : ''}`}>
                                                    {sub.pref_clubs ? '●' : '○'} 동호회
                                                </span>
                                            </div>

                                            <div className="apsm-card-footer">
                                                <span className="apsm-update-time">
                                                    <i className="ri-time-line"></i> {formatDate(sub.updated_at)}
                                                </span>
                                                <i className="ri-arrow-right-s-line" style={{ color: 'var(--text-tertiary)' }}></i>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="apsm-empty">
                                    <i className="ri-notification-off-line"></i>
                                    <p>검색 결과가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
