import { useState, useEffect } from 'react';
import {
    getPushSubscription,
    subscribeToPush,
    saveSubscriptionToSupabase,
    unsubscribeFromPush,
    getPushPreferences,
    updatePushPreferences,
    verifySubscriptionOwnership
} from '../lib/pushNotifications';
import { useAuth } from '../contexts/AuthContext';
import GlobalLoadingOverlay from './GlobalLoadingOverlay';
import '../styles/domains/settings.css';

interface NotificationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
    const { user } = useAuth();
    const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);
    const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const [pushPrefs, setPushPrefs] = useState<{
        pref_events: boolean,
        pref_class: boolean,
        pref_clubs: boolean,
        pref_filter_tags: string[] | null,
        pref_filter_class_genres: string[] | null
    }>({
        pref_events: true,
        pref_class: true,
        pref_clubs: true,
        pref_filter_tags: null,
        pref_filter_class_genres: null
    });

    const [originalPrefs, setOriginalPrefs] = useState<any>(null);
    const [originalPushEnabled, setOriginalPushEnabled] = useState<boolean>(false);

    useEffect(() => {
        if (!isOpen) return;

        const checkPWA = () => {
            const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                (window.navigator as any).standalone === true ||
                new URLSearchParams(window.location.search).get('utm_source') === 'pwa';
            setIsRunningInPWA(isStandalone);
            return isStandalone;
        };

        checkPWA();
        loadSettings();
    }, [isOpen]);

    const loadSettings = async () => {
        if (!user) return;
        setIsPushLoading(true);
        try {
            const browserSub = await getPushSubscription();
            let isVerified = false;
            if (browserSub) {
                isVerified = await verifySubscriptionOwnership();
            }

            setIsPushEnabled(isVerified);
            setOriginalPushEnabled(isVerified);

            if (isVerified) {
                const prefs = await getPushPreferences();
                if (prefs) {
                    const uiPrefs = {
                        ...prefs,
                        pref_filter_tags: prefs.pref_filter_tags || ['워크샵', '파티', '대회', '기타'],
                        pref_filter_class_genres: prefs.pref_filter_class_genres || ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타']
                    };
                    setPushPrefs(uiPrefs);
                    setOriginalPrefs({ ...uiPrefs });
                }
            }
        } catch (error) {
            console.error('[NotificationSettingsModal] Load error:', error);
        } finally {
            setIsPushLoading(false);
        }
    };

    const handlePreferenceToggle = (type: 'pref_events' | 'pref_class' | 'pref_clubs') => {
        setPushPrefs(prev => {
            const nextVal = !prev[type];
            const updates: any = { [type]: nextVal };
            if (nextVal) {
                if (type === 'pref_events' && (!prev.pref_filter_tags || prev.pref_filter_tags.length === 0)) {
                    updates.pref_filter_tags = ['워크샵', '파티', '대회', '기타'];
                }
                if (type === 'pref_class' && (!prev.pref_filter_class_genres || prev.pref_filter_class_genres.length === 0)) {
                    updates.pref_filter_class_genres = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                }
            }
            return { ...prev, ...updates };
        });
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        try {
            if (isPushEnabled !== originalPushEnabled) {
                if (isPushEnabled) {
                    const sub = await subscribeToPush();
                    if (!sub) {
                        alert('알림 권한이 차단되었거나 오류가 발생했습니다.');
                        setIsPushEnabled(false);
                        return;
                    }
                    await saveSubscriptionToSupabase(sub, pushPrefs);
                } else {
                    await unsubscribeFromPush();
                }
            }

            if (isPushEnabled) {
                await updatePushPreferences(pushPrefs);
            }
            alert('알림 설정이 저장되었습니다.');
            onClose();
        } catch (error) {
            console.error('Save failed:', error);
            alert('오류가 발생했습니다.');
        } finally {
            setIsSaving(false);
        }
    };

    const hasUnsavedChanges = (isPushEnabled !== originalPushEnabled) ||
        (isPushEnabled && JSON.stringify(pushPrefs) !== JSON.stringify(originalPrefs));

    if (!isOpen) return null;

    return (
        <div className="NotificationSettingsModal NSM-overlay" onClick={onClose}>
            <div className="NSM-container" onClick={e => e.stopPropagation()}>
                <GlobalLoadingOverlay isLoading={isPushLoading} message="설정 불러오는 중..." />

                <div className="NSM-header">
                    <h2 className="NSM-title"><i className="ri-notification-3-fill"></i> 알림 설정</h2>
                    <button className="NSM-closeBtn" onClick={onClose} aria-label="닫기">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="NSM-body">
                    {!isRunningInPWA && (
                        <div className="NSM-pwaTip" onClick={() => window.dispatchEvent(new CustomEvent('showPWAInstructions'))}>
                            <i className="ri-information-line"></i>
                            <div className="NSM-pwaContent">
                                <p className="NSM-pwaText">홈 화면에 앱을 추가하면 실시간 알림을 받을 수 있습니다.</p>
                                <span className="NSM-pwaAction">설치 방법 보기 <i className="ri-arrow-right-s-line"></i></span>
                            </div>
                        </div>
                    )}

                    <span className="NSM-sectionLabel">기본 설정</span>
                    <div className="NSM-masterRow">
                        <div className="NSM-labelGroup">
                            <span className="NSM-labelTitle">푸시 알림 사용</span>
                            <span className="NSM-labelDesc">전체 알림을 켜거나 끕니다.</span>
                        </div>
                        <div
                            className={`NSM-switch ${isPushEnabled ? 'is-active' : ''} ${!isRunningInPWA ? 'is-disabled' : ''}`}
                            onClick={() => isRunningInPWA && setIsPushEnabled(!isPushEnabled)}
                        >
                            <div className="NSM-switchThumb" />
                        </div>
                    </div>

                    {isPushEnabled && (
                        <div className="NSM-details">
                            <span className="NSM-sectionLabel">카테고리별 알림</span>

                            {/* Events */}
                            <div className="NSM-card">
                                <div className="NSM-cardHeader" onClick={() => handlePreferenceToggle('pref_events')}>
                                    <span className="NSM-cardTitle">행사 소식</span>
                                    <div className={`NSM-switch is-active-sm ${pushPrefs.pref_events ? 'is-active' : ''}`}>
                                        <div className="NSM-switchThumb" />
                                    </div>
                                </div>
                                {pushPrefs.pref_events && (
                                    <div className="NSM-tagGrid">
                                        {['워크샵', '파티', '대회', '기타'].map(tag => (
                                            <button
                                                key={tag}
                                                className={`NSM-chip ${(!pushPrefs.pref_filter_tags || pushPrefs.pref_filter_tags.includes(tag)) ? 'is-active' : ''}`}
                                                onClick={() => setPushPrefs(prev => {
                                                    const tags = prev.pref_filter_tags || ['워크샵', '파티', '대회', '기타'];
                                                    const nextTags = tags.includes(tag) ? tags.filter(t => t !== tag) : [...tags, tag];
                                                    return { ...prev, pref_filter_tags: nextTags, pref_events: nextTags.length > 0 };
                                                })}
                                            >
                                                {tag}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Classes */}
                            <div className="NSM-card">
                                <div className="NSM-cardHeader" onClick={() => handlePreferenceToggle('pref_class')}>
                                    <span className="NSM-cardTitle">강습 및 워크샵</span>
                                    <div className={`NSM-switch is-active-sm ${pushPrefs.pref_class ? 'is-active' : ''}`}>
                                        <div className="NSM-switchThumb" />
                                    </div>
                                </div>
                                {pushPrefs.pref_class && (
                                    <div className="NSM-tagGrid">
                                        {['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'].map(genre => (
                                            <button
                                                key={genre}
                                                className={`NSM-chip ${(!pushPrefs.pref_filter_class_genres || pushPrefs.pref_filter_class_genres.includes(genre)) ? 'is-active' : ''}`}
                                                onClick={() => setPushPrefs(prev => {
                                                    const genres = prev.pref_filter_class_genres || ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
                                                    const nextGenres = genres.includes(genre) ? genres.filter(g => g !== genre) : [...genres, genre];
                                                    return { ...prev, pref_filter_class_genres: nextGenres, pref_class: nextGenres.length > 0 };
                                                })}
                                            >
                                                {genre}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Clubs */}
                            <div className="NSM-card">
                                <div className="NSM-cardHeader" onClick={() => handlePreferenceToggle('pref_clubs')}>
                                    <span className="NSM-cardTitle">동호회 소식</span>
                                    <div className={`NSM-switch is-active-sm ${pushPrefs.pref_clubs ? 'is-active' : ''}`}>
                                        <div className="NSM-switchThumb" />
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="NSM-footer">
                    <button
                        className={`NSM-saveBtn ${hasUnsavedChanges ? 'is-ready' : ''}`}
                        disabled={!hasUnsavedChanges || isSaving}
                        onClick={handleSaveChanges}
                    >
                        {isSaving ? '보안 연결 중...' : '변경사항 저장'}
                    </button>
                </div>
            </div>
        </div>
    );
}
