import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import "./AdminPwaInstallsModal.css";

interface AdminPwaInstallsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

interface PwaInstall {
    id: string;
    user_id: string | null;
    fingerprint: string | null;
    installed_at: string;
    install_page: string;
    display_mode: string | null;
    user_agent: string | null;
    platform: string | null;
    utm_source: string | null;
    board_users?: {
        nickname: string;
        profile_image: string | null;
    };
    push_subscription?: {
        pref_events: boolean;
        pref_class: boolean;
        pref_clubs: boolean;
    };
}

export default function AdminPwaInstallsModal({ isOpen, onClose }: AdminPwaInstallsModalProps) {
    const { isAdmin } = useAuth();
    const [installs, setInstalls] = useState<PwaInstall[]>([]);
    const [filteredInstalls, setFilteredInstalls] = useState<PwaInstall[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        if (isOpen && isAdmin) {
            loadInstalls();
        }
    }, [isOpen, isAdmin]);

    useEffect(() => {
        filterInstalls();
    }, [searchTerm, installs]);

    const loadInstalls = async () => {
        try {
            setLoading(true);

            // 1. 설치 정보 가져오기
            const { data: installData, error: installError } = await supabase
                .from('pwa_installs')
                .select('*')
                .order('installed_at', { ascending: false });

            if (installError) throw installError;
            if (!installData) return;

            // 2. 유저 정보 매핑을 위한 유저 ID 추출
            const userIds = installData
                .map(i => i.user_id)
                .filter((id): id is string => !!id);

            const uniqueUserIds = [...new Set(userIds)];

            // 3. 유저 프로필 및 알림 구독 정보 가져오기
            const { data: profiles, error: profilesError } = await supabase
                .from('board_users')
                .select('user_id, nickname, profile_image')
                .in('user_id', uniqueUserIds);

            const { data: pushSubs, error: pushError } = await supabase
                .from('user_push_subscriptions')
                .select('user_id, pref_events, pref_class, pref_clubs')
                .in('user_id', uniqueUserIds);

            if (profilesError) console.warn('Failed to load user profiles:', profilesError);
            if (pushError) console.warn('Failed to load push subscriptions:', pushError);

            // 4. 데이터 매핑 및 중복 제거 (최신 순)
            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const pushMap = new Map(pushSubs?.map(s => [s.user_id, s]) || []);
            const uniqueMap = new Map<string, any>();

            installData.forEach(inst => {
                const key = inst.user_id || inst.fingerprint || inst.id;
                if (!uniqueMap.has(key)) {
                    uniqueMap.set(key, {
                        ...inst,
                        board_users: inst.user_id ? profileMap.get(inst.user_id) : null,
                        push_subscription: inst.user_id ? pushMap.get(inst.user_id) : null
                    });
                }
            });

            const joinedData = Array.from(uniqueMap.values()).sort((a, b) => {
                const aHasPush = a.push_subscription && (a.push_subscription.pref_events || a.push_subscription.pref_class || a.push_subscription.pref_clubs);
                const bHasPush = b.push_subscription && (b.push_subscription.pref_events || b.push_subscription.pref_class || b.push_subscription.pref_clubs);

                if (aHasPush && !bHasPush) return -1;
                if (!aHasPush && bHasPush) return 1;
                return new Date(b.installed_at).getTime() - new Date(a.installed_at).getTime();
            });
            setInstalls(joinedData);
        } catch (error) {
            console.error('Error loading PWA installs:', error);
        } finally {
            setLoading(false);
        }
    };

    const filterInstalls = () => {
        if (!searchTerm.trim()) {
            setFilteredInstalls(installs);
            return;
        }
        const term = searchTerm.toLowerCase();
        const filtered = installs.filter(inst =>
            inst.board_users?.nickname.toLowerCase().includes(term) ||
            (inst.user_agent && inst.user_agent.toLowerCase().includes(term)) ||
            (inst.platform && inst.platform.toLowerCase().includes(term))
        );
        setFilteredInstalls(filtered);
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
        total: installs.length,
        ios: installs.filter(i => i.user_agent?.includes('iPhone') || i.user_agent?.includes('iPad')).length,
        android: installs.filter(i => i.user_agent?.includes('Android')).length,
        member: installs.filter(i => i.user_id !== null).length
    };

    if (!isOpen) return null;

    return (
        <div className="apim-overlay" onClick={onClose}>
            <div className="apim-container" translate="no">
                <div className="apim-header">
                    <div className="apim-header-top">
                        <h2 className="apim-title">
                            <i className="ri-app-store-line"></i>
                            PWA 설치 유저 현황
                        </h2>
                        <button onClick={onClose} className="apim-close-btn">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>

                    <div className="apim-stats-bar">
                        <div className="apim-stat-card">
                            <span className="apim-stat-value">{stats.total}</span>
                            <span className="apim-stat-label">전체 설치</span>
                        </div>
                        <div className="apim-stat-card">
                            <span className="apim-stat-value" style={{ color: '#34d399' }}>{stats.ios}</span>
                            <span className="apim-stat-label">iOS</span>
                        </div>
                        <div className="apim-stat-card">
                            <span className="apim-stat-value" style={{ color: '#fbbf24' }}>{stats.android}</span>
                            <span className="apim-stat-label">Android</span>
                        </div>
                        <div className="apim-stat-card">
                            <span className="apim-stat-value" style={{ color: '#10b981' }}>{stats.member}</span>
                            <span className="apim-stat-label">로그인 회원</span>
                        </div>
                    </div>

                    <div className="apim-search-area">
                        <div className="apim-search-wrapper">
                            <i className="apim-search-icon ri-search-line"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder="닉네임, 기기 또는 플랫폼 검색..."
                                className="apim-search-input"
                            />
                        </div>
                        <button onClick={loadInstalls} className="apim-refresh-btn">
                            <i className="ri-refresh-line"></i>
                        </button>
                    </div>
                </div>

                <div className="apim-content">
                    {loading ? (
                        <div className="boum-loading"><div className="prl-spinner"></div></div>
                    ) : (
                        <div className="apim-grid">
                            {filteredInstalls.length > 0 ? (
                                filteredInstalls.map((inst) => {
                                    const device = getDeviceInfo(inst.user_agent);
                                    return (
                                        <div key={inst.id} className="apim-card">
                                            <div className="apim-user-info">
                                                <div className="apim-avatar">
                                                    {inst.board_users?.profile_image ? (
                                                        <img
                                                            src={inst.board_users.profile_image}
                                                            alt=""
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    ) : (
                                                        <i className="ri-user-smile-line"></i>
                                                    )}
                                                </div>
                                                <div className="apim-user-details">
                                                    <span className="apim-nickname">{inst.board_users?.nickname || 'Anonymous'}</span>
                                                    <span className="apim-user-id">{inst.user_id ? `UID: ${inst.user_id.slice(0, 8)}` : '비회원'}</span>
                                                </div>
                                            </div>

                                            <div className="apim-info-box">
                                                <div className="apim-info-row">
                                                    <span className="apim-info-label"><i className={device.icon}></i> 기기</span>
                                                    <span className="apim-info-value">{device.name}</span>
                                                </div>
                                                <div className="apim-info-row">
                                                    <span className="apim-info-label"><i className="ri-computer-line"></i> OS</span>
                                                    <span className="apim-info-value">{inst.platform || 'Unknown'}</span>
                                                </div>
                                                <div className="apim-info-row">
                                                    <span className="apim-info-label"><i className="ri-compass-3-line"></i> 소스</span>
                                                    <span className="apim-info-value">{inst.utm_source || 'Direct'}</span>
                                                </div>
                                            </div>

                                            {inst.user_id && (
                                                <div className="apim-prefs-section">
                                                    <div className="apim-prefs-title">
                                                        <i className="ri-notification-3-line"></i> 알림 설정
                                                    </div>
                                                    <div className="apim-prefs">
                                                        <span className={`apim-pref-chip ${inst.push_subscription?.pref_events ? 'active event' : ''}`}>이벤트</span>
                                                        <span className={`apim-pref-chip ${inst.push_subscription?.pref_class ? 'active class' : ''}`}>강습</span>
                                                        <span className={`apim-pref-chip ${inst.push_subscription?.pref_clubs ? 'active club' : ''}`}>동호회</span>
                                                    </div>
                                                </div>
                                            )}

                                            <div className="apim-card-footer">
                                                <span className="apim-install-time">
                                                    <i className="ri-time-line"></i> {formatDate(inst.installed_at)}
                                                </span>
                                                <span className="apim-page-tag">
                                                    {inst.install_page === '/' ? 'Home' : inst.install_page.split('/').pop()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="apsm-empty" style={{ gridColumn: '1/-1', textAlign: 'center', padding: '40px', color: 'var(--text-tertiary)' }}>
                                    <i className="ri-error-warning-line" style={{ fontSize: '2rem', marginBottom: '10px', display: 'block' }}></i>
                                    <p>데이터가 없습니다.</p>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
