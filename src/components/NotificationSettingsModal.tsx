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
import { isPWAMode, getMobilePlatform } from '../lib/pwaDetect';
import { PWAInstallGuideModal } from './PWAInstallGuideModal';
import { useInstallPrompt } from '../contexts/InstallPromptContext';
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
    const [isPWAInstallModalOpen, setIsPWAInstallModalOpen] = useState(false);
    const { promptEvent } = useInstallPrompt();

    const platform = getMobilePlatform();
    const isIOS = platform === 'ios';

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
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    useEffect(() => {
        if (!isOpen) return;

        setStatusMessage(null);

        const checkPWA = () => {
            const pwa = isPWAMode();
            setIsRunningInPWA(pwa);
            return pwa;
        };

        const pwa = checkPWA();
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
        setStatusMessage(null);
        try {
            if (isPushEnabled !== originalPushEnabled) {
                if (isPushEnabled) {
                    const sub = await subscribeToPush();
                    if (!sub) {
                        setStatusMessage({ type: 'error', text: '알림 권한이 차단되었거나 오류가 발생했습니다.' });
                        setIsPushEnabled(false);
                        return;
                    }
                    // 명시적 비활성화 플래그 해제 (사용자가 다시 켰으므로 자동 재구독 허용)
                    localStorage.removeItem('push_explicitly_disabled');
                    await saveSubscriptionToSupabase(sub, pushPrefs);
                } else {
                    await unsubscribeFromPush();
                }
            }

            if (isPushEnabled) {
                await updatePushPreferences(pushPrefs);
            }

            // [Sync] 사이드바 등 다른 컴포넌트에 알림 상태 변경 알림
            window.dispatchEvent(new CustomEvent('pushStatusChanged', {
                detail: { enabled: isPushEnabled }
            }));

            // 성공 시 바로 닫기 (alert 없이 — focus 이벤트로 인한 무한 루프 방지)
            onClose();
        } catch (error) {
            console.error('Save failed:', error);
            setStatusMessage({ type: 'error', text: '저장 중 오류가 발생했습니다. 다시 시도해주세요.' });
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
                    {(!isRunningInPWA && platform !== 'android') ? (
                        <div className="NSM-pwaTip">
                            <div className="NSM-pwaHeader">
                                <div className="NSM-appIconPreview">
                                    <img src="/icon-192.png" alt="App Icon" className="NSM-logoImg" />
                                    <div className="NSM-iconBadge">
                                        <i className="ri-notification-3-fill"></i>
                                    </div>
                                </div>
                                <p className="NSM-pwaText">
                                    아이폰은 <strong>바로가기 추가</strong> 후,<br />
                                    <span className="NSM-highlightText">바탕화면의 아이콘으로 접속</span>해야 알림이 작동합니다.
                                </p>
                            </div>

                            <div className="NSM-installSteps">
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">1</span>
                                    <span className="NSM-stepText">하단 <i className="ri-upload-2-line"></i> <strong>공유</strong> 버튼 클릭</span>
                                </div>
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">2</span>
                                    <span className="NSM-stepText"><strong>'홈 화면에 추가'</strong> 선택</span>
                                </div>
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">3</span>
                                    <span className="NSM-stepText">우측 상단 <strong>'추가'</strong> 클릭</span>
                                </div>
                            </div>
                            
                            <p className="NSM-pwaFooterTip">
                                <i className="ri-smartphone-line"></i> 생성된 아이콘을 눌러 앱을 실행해 주세요.
                            </p>
                        </div>
                    ) : (
                        <>
                            <span className="NSM-sectionLabel">기본 설정</span>
                            <div className="NSM-masterRow">
                                <div className="NSM-labelGroup">
                                    <span className="NSM-labelTitle">푸시 알림 사용</span>
                                    <span className="NSM-labelDesc">전체 알림을 켜거나 끕니다.</span>
                                </div>
                                <div
                                    className={`NSM-switch ${isPushEnabled ? 'is-active' : ''}`}
                                    onClick={() => setIsPushEnabled(!isPushEnabled)}
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
                        </>
                    )}
                </div>

                {statusMessage && (
                    <div className={`NSM-statusBanner NSM-statusBanner--${statusMessage.type}`}>
                        <i className={statusMessage.type === 'error' ? 'ri-error-warning-fill' : 'ri-checkbox-circle-fill'}></i>
                        {statusMessage.text}
                    </div>
                )}

                <div className="NSM-footer">
                    <button
                        className={`NSM-saveBtn ${hasUnsavedChanges ? 'is-ready' : ''}`}
                        disabled={!hasUnsavedChanges || isSaving}
                        onClick={handleSaveChanges}
                    >
                        {isSaving ? '보안 연결 중...' : '변경사항 저장'}
                    </button>
                </div>
                <PWAInstallGuideModal
                    isOpen={isPWAInstallModalOpen}
                    onClose={() => setIsPWAInstallModalOpen(false)}
                />
            </div>
        </div>
    );
}
