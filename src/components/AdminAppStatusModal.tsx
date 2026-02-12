import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import "./AdminAppStatusModal.css";

interface AdminAppStatusModalProps {
    isOpen: boolean;
    onClose: () => void;
    initialTab?: 'pwa' | 'push';
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
    board_users?: { nickname: string; profile_image: string | null };
    push_subscription?: { pref_events: boolean; pref_class: boolean; pref_clubs: boolean };
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
    updated_at: string;
    board_users?: { nickname: string; profile_image: string | null };
}

export default function AdminAppStatusModal({ isOpen, onClose, initialTab }: AdminAppStatusModalProps) {
    const { isAdmin } = useAuth();
    const [activeTab, setActiveTab] = useState<'pwa' | 'push'>(initialTab || 'pwa');
    const [searchTerm, setSearchTerm] = useState('');

    // PWA state
    const [pwaInstalls, setPwaInstalls] = useState<PwaInstall[]>([]);
    const [filteredPwa, setFilteredPwa] = useState<PwaInstall[]>([]);
    const [pwaLoading, setPwaLoading] = useState(true);

    // Push state
    const [pushSubs, setPushSubs] = useState<PushSubscriber[]>([]);
    const [filteredPush, setFilteredPush] = useState<PushSubscriber[]>([]);
    const [pushLoading, setPushLoading] = useState(true);

    useEffect(() => {
        if (isOpen && isAdmin) {
            loadPwaInstalls();
            loadPushSubscribers();
        }
    }, [isOpen, isAdmin]);

    useEffect(() => {
        if (initialTab) setActiveTab(initialTab);
    }, [initialTab]);

    useEffect(() => {
        filterData();
    }, [searchTerm, pwaInstalls, pushSubs, activeTab]);

    // === PWA Data ===
    const loadPwaInstalls = async () => {
        try {
            setPwaLoading(true);
            const { data: installData, error: installError } = await supabase
                .from('pwa_installs').select('*').order('installed_at', { ascending: false });
            if (installError) throw installError;
            if (!installData) return;

            const userIds = [...new Set(installData.map(i => i.user_id).filter((id): id is string => !!id))];

            const [{ data: profiles }, { data: pushData }] = await Promise.all([
                supabase.from('board_users').select('user_id, nickname, profile_image').in('user_id', userIds),
                supabase.from('user_push_subscriptions').select('user_id, pref_events, pref_class, pref_clubs').in('user_id', userIds)
            ]);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const pushMap = new Map(pushData?.map(s => [s.user_id, s]) || []);
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

            const sorted = Array.from(uniqueMap.values()).sort((a, b) => {
                const aHasPush = a.push_subscription && (a.push_subscription.pref_events || a.push_subscription.pref_class || a.push_subscription.pref_clubs);
                const bHasPush = b.push_subscription && (b.push_subscription.pref_events || b.push_subscription.pref_class || b.push_subscription.pref_clubs);
                if (aHasPush && !bHasPush) return -1;
                if (!aHasPush && bHasPush) return 1;
                return new Date(b.installed_at).getTime() - new Date(a.installed_at).getTime();
            });
            setPwaInstalls(sorted);
        } catch (error) {
            console.error('Error loading PWA installs:', error);
        } finally {
            setPwaLoading(false);
        }
    };

    // === Push Data ===
    const loadPushSubscribers = async () => {
        try {
            setPushLoading(true);
            const { data: subsData, error } = await supabase
                .from('user_push_subscriptions')
                .select('id, endpoint, user_id, user_agent, is_admin, pref_events, pref_class, pref_clubs, updated_at')
                .order('updated_at', { ascending: false });
            if (error) throw error;
            if (!subsData) return;

            const userIds = [...new Set(subsData.map(s => s.user_id))];
            const { data: profiles } = await supabase
                .from('board_users').select('user_id, nickname, profile_image').in('user_id', userIds);

            const profileMap = new Map(profiles?.map(p => [p.user_id, p]) || []);
            const joined = subsData.map(sub => ({
                ...sub,
                board_users: profileMap.get(sub.user_id) || { nickname: `User(${sub.user_id.slice(0, 5)})`, profile_image: null }
            }));
            setPushSubs(joined as any);
        } catch (error) {
            console.error('Error loading push subscribers:', error);
        } finally {
            setPushLoading(false);
        }
    };

    const filterData = () => {
        const term = searchTerm.toLowerCase().trim();
        if (!term) {
            setFilteredPwa(pwaInstalls);
            setFilteredPush(pushSubs);
            return;
        }
        setFilteredPwa(pwaInstalls.filter(i =>
            i.board_users?.nickname.toLowerCase().includes(term) ||
            i.user_agent?.toLowerCase().includes(term) ||
            i.platform?.toLowerCase().includes(term)
        ));
        setFilteredPush(pushSubs.filter(s =>
            s.board_users?.nickname.toLowerCase().includes(term) ||
            s.user_agent?.toLowerCase().includes(term)
        ));
    };

    const formatDate = (dateString: string) =>
        new Date(dateString).toLocaleString('ko-KR', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

    const getDeviceInfo = (ua: string | null) => {
        if (!ua) return { name: 'Unknown', icon: 'ri-global-line' };
        if (ua.includes('iPhone')) return { name: 'iPhone', icon: 'ri-smartphone-line' };
        if (ua.includes('iPad')) return { name: 'iPad', icon: 'ri-tablet-line' };
        if (ua.includes('Android')) return { name: 'Android', icon: 'ri-android-line' };
        if (ua.includes('Macintosh')) return { name: 'Mac', icon: 'ri-macbook-line' };
        if (ua.includes('Windows')) return { name: 'Windows', icon: 'ri-windows-line' };
        return { name: 'Web Client', icon: 'ri-global-line' };
    };

    const pwaStats = {
        total: pwaInstalls.length,
        ios: pwaInstalls.filter(i => i.user_agent?.includes('iPhone') || i.user_agent?.includes('iPad')).length,
        android: pwaInstalls.filter(i => i.user_agent?.includes('Android')).length,
        member: pwaInstalls.filter(i => i.user_id !== null).length
    };

    const pushStats = {
        total: pushSubs.length,
        ios: pushSubs.filter(s => s.user_agent?.includes('iPhone') || s.user_agent?.includes('iPad')).length,
        android: pushSubs.filter(s => s.user_agent?.includes('Android')).length,
        active: pushSubs.filter(s => s.pref_events || s.pref_class || s.pref_clubs).length
    };

    const handleRefresh = () => {
        if (activeTab === 'pwa') loadPwaInstalls();
        else loadPushSubscribers();
    };

    if (!isOpen) return null;

    const isLoading = activeTab === 'pwa' ? pwaLoading : pushLoading;
    const currentStats = activeTab === 'pwa' ? pwaStats : pushStats;
    const statLabels = activeTab === 'pwa'
        ? ['PWA 설치', 'iOS', 'Android', '회원']
        : ['전체 기기', 'iOS', 'Android', '알림 ON'];
    const statColors = ['var(--text-primary)', '#34d399', '#fbbf24', activeTab === 'pwa' ? '#10b981' : '#f87171'];

    return (
        <div className="aasm-overlay" onClick={onClose}>
            <div className="aasm-container" translate="no" onClick={e => e.stopPropagation()}>
                <div className="aasm-header">
                    <div className="aasm-header-top">
                        <h2 className="aasm-title">
                            <i className="ri-smartphone-line"></i>
                            앱 / 알림 현황
                        </h2>
                        <button onClick={onClose} className="aasm-close-btn">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>

                    {/* Tab Switcher */}
                    <div className="aasm-tabs">
                        <button
                            className={`aasm-tab ${activeTab === 'pwa' ? 'is-active' : ''}`}
                            onClick={() => { setActiveTab('pwa'); setSearchTerm(''); }}
                        >
                            <i className="ri-app-store-line"></i>
                            PWA 설치
                            <span className="aasm-tab-count">{pwaStats.total}</span>
                        </button>
                        <button
                            className={`aasm-tab ${activeTab === 'push' ? 'is-active' : ''}`}
                            onClick={() => { setActiveTab('push'); setSearchTerm(''); }}
                        >
                            <i className="ri-notification-3-fill"></i>
                            알림 구독
                            <span className="aasm-tab-count">{pushStats.total}</span>
                        </button>
                    </div>

                    {/* Stats Bar */}
                    <div className="aasm-stats-bar">
                        {Object.values(currentStats).map((val, idx) => (
                            <div key={idx} className="aasm-stat-card">
                                <span className="aasm-stat-value" style={{ color: statColors[idx] }}>{val}</span>
                                <span className="aasm-stat-label">{statLabels[idx]}</span>
                            </div>
                        ))}
                    </div>

                    <div className="aasm-search-area">
                        <div className="aasm-search-wrapper">
                            <i className="aasm-search-icon ri-search-line"></i>
                            <input
                                type="text"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                placeholder={activeTab === 'pwa' ? '닉네임, 기기 또는 플랫폼 검색...' : '닉네임 또는 기기 검색...'}
                                className="aasm-search-input"
                            />
                        </div>
                        <button onClick={handleRefresh} className="aasm-refresh-btn">
                            <i className="ri-refresh-line"></i>
                        </button>
                    </div>
                </div>

                <div className="aasm-content">
                    {isLoading ? (
                        <div className="boum-loading"><div className="prl-spinner"></div></div>
                    ) : (
                        <div className="aasm-grid">
                            {activeTab === 'pwa' ? (
                                filteredPwa.length > 0 ? filteredPwa.map(inst => {
                                    const device = getDeviceInfo(inst.user_agent);
                                    return (
                                        <div key={inst.id} className="aasm-card">
                                            <div className="aasm-user-info">
                                                <div className="aasm-avatar">
                                                    {inst.board_users?.profile_image ? (
                                                        <img src={inst.board_users.profile_image} alt="" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <i className="ri-user-smile-line"></i>
                                                    )}
                                                </div>
                                                <div className="aasm-user-details">
                                                    <span className="aasm-nickname">{inst.board_users?.nickname || 'Anonymous'}</span>
                                                    <span className="aasm-user-id">{inst.user_id ? `UID: ${inst.user_id.slice(0, 8)}` : '비회원'}</span>
                                                </div>
                                            </div>
                                            <div className="aasm-info-box">
                                                <div className="aasm-info-row">
                                                    <span className="aasm-info-label"><i className={device.icon}></i> 기기</span>
                                                    <span className="aasm-info-value">{device.name}</span>
                                                </div>
                                                <div className="aasm-info-row">
                                                    <span className="aasm-info-label"><i className="ri-computer-line"></i> OS</span>
                                                    <span className="aasm-info-value">{inst.platform || 'Unknown'}</span>
                                                </div>
                                                <div className="aasm-info-row">
                                                    <span className="aasm-info-label"><i className="ri-compass-3-line"></i> 소스</span>
                                                    <span className="aasm-info-value">{inst.utm_source || 'Direct'}</span>
                                                </div>
                                            </div>
                                            {inst.user_id && inst.push_subscription && (
                                                <div className="aasm-prefs">
                                                    <span className={`aasm-pref-chip ${inst.push_subscription.pref_events ? 'active event' : ''}`}>이벤트</span>
                                                    <span className={`aasm-pref-chip ${inst.push_subscription.pref_class ? 'active class' : ''}`}>강습</span>
                                                    <span className={`aasm-pref-chip ${inst.push_subscription.pref_clubs ? 'active club' : ''}`}>동호회</span>
                                                </div>
                                            )}
                                            <div className="aasm-card-footer">
                                                <span className="aasm-time"><i className="ri-time-line"></i> {formatDate(inst.installed_at)}</span>
                                                <span className="aasm-tag">{inst.install_page === '/' ? 'Home' : inst.install_page.split('/').pop()}</span>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="aasm-empty"><i className="ri-error-warning-line"></i><p>PWA 설치 데이터가 없습니다.</p></div>
                                )
                            ) : (
                                filteredPush.length > 0 ? filteredPush.map(sub => {
                                    const device = getDeviceInfo(sub.user_agent);
                                    return (
                                        <div key={sub.id} className="aasm-card">
                                            <div className="aasm-user-info">
                                                <div className="aasm-avatar">
                                                    {sub.board_users?.profile_image ? (
                                                        <img src={sub.board_users.profile_image} alt="" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <i className="ri-user-smile-line"></i>
                                                    )}
                                                </div>
                                                <div className="aasm-user-details">
                                                    <div className="aasm-name-row">
                                                        <span className="aasm-nickname">{sub.board_users?.nickname || 'Unknown'}</span>
                                                        {sub.is_admin && <span className="aasm-admin-badge">ADMIN</span>}
                                                    </div>
                                                    <span className="aasm-user-id">UID: {sub.user_id.slice(0, 8)}</span>
                                                </div>
                                            </div>
                                            <div className="aasm-info-box">
                                                <div className="aasm-info-row">
                                                    <span className="aasm-info-label"><i className={device.icon}></i> 기기</span>
                                                    <span className="aasm-info-value">{device.name}</span>
                                                </div>
                                                <div className="aasm-info-row">
                                                    <span className="aasm-info-label"><i className="ri-key-line"></i> 토큰</span>
                                                    <span className="aasm-info-value" style={{ fontFamily: 'monospace', fontSize: '0.7rem' }}>..{sub.endpoint.slice(-8)}</span>
                                                </div>
                                            </div>
                                            <div className="aasm-prefs">
                                                <span className={`aasm-pref-chip ${sub.pref_events ? 'active event' : ''}`}>{sub.pref_events ? '●' : '○'} 이벤트</span>
                                                <span className={`aasm-pref-chip ${sub.pref_class ? 'active class' : ''}`}>{sub.pref_class ? '●' : '○'} 강습</span>
                                                <span className={`aasm-pref-chip ${sub.pref_clubs ? 'active club' : ''}`}>{sub.pref_clubs ? '●' : '○'} 동호회</span>
                                            </div>
                                            <div className="aasm-card-footer">
                                                <span className="aasm-time"><i className="ri-time-line"></i> {formatDate(sub.updated_at)}</span>
                                            </div>
                                        </div>
                                    );
                                }) : (
                                    <div className="aasm-empty"><i className="ri-notification-off-line"></i><p>알림 구독자가 없습니다.</p></div>
                                )
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
