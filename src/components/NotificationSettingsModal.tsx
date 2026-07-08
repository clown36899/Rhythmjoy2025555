import { useState, useEffect } from 'react';
import {
    getPushSubscription,
    subscribeToPush,
    saveSubscriptionToDataStore,
    unsubscribeFromPush,
    getPushPreferences,
    updatePushPreferences,
    verifySubscriptionOwnership,
    getNotificationPermission,
    requestNotificationPermission,
    DEFAULT_PUSH_PREFERENCES,
    PUSH_DIGEST_TIME_OPTIONS,
    getPushSupportStatus,
} from '../lib/pushNotifications';
import type { PushPreferences, PushSupportStatus } from '../lib/pushNotifications';
import { useAuth } from '../contexts/AuthContext';
import { isPWAMode, getMobilePlatform } from '../lib/pwaDetect';
import '../styles/domains/settings.css';

interface NotificationSettingsModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const DEFAULT_EVENT_TAGS = ['워크샵', '파티', '대회', '기타'];
const DEFAULT_CLASS_GENRES = ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집', '기타'];
const QUICK_DIGEST_TIMES = ['07:00', '07:30', '08:00', '08:30', '09:00', '09:30'];
const DIGEST_WEEKDAYS = [
    { value: 1, label: '월' },
    { value: 2, label: '화' },
    { value: 3, label: '수' },
    { value: 4, label: '목' },
    { value: 5, label: '금' },
    { value: 6, label: '토' },
    { value: 0, label: '일' },
];

const normalizeModalDigestTime = (time?: string | null) => (
    time && PUSH_DIGEST_TIME_OPTIONS.includes(time)
        ? time
        : DEFAULT_PUSH_PREFERENCES.pref_digest_time
);

const getEnabledChannelCount = (prefs: PushPreferences) => (
    [prefs.pref_events, prefs.pref_class, prefs.pref_clubs].filter(Boolean).length
);

const normalizeModalPrefs = (prefs?: Partial<PushPreferences> | null): PushPreferences => {
    const normalized: PushPreferences = {
        ...DEFAULT_PUSH_PREFERENCES,
        ...(prefs || {}),
        pref_filter_tags: prefs?.pref_filter_tags || DEFAULT_EVENT_TAGS,
        pref_filter_class_genres: prefs?.pref_filter_class_genres || DEFAULT_CLASS_GENRES,
        pref_digest_time: normalizeModalDigestTime(prefs?.pref_digest_time),
        pref_digest_days: Array.isArray(prefs?.pref_digest_days) && prefs.pref_digest_days.length > 0
            ? prefs.pref_digest_days
            : DEFAULT_PUSH_PREFERENCES.pref_digest_days,
        pref_digest_timezone: prefs?.pref_digest_timezone || DEFAULT_PUSH_PREFERENCES.pref_digest_timezone,
        pref_only_with_events: prefs?.pref_only_with_events ?? DEFAULT_PUSH_PREFERENCES.pref_only_with_events,
    };

    if (getEnabledChannelCount(normalized) === 0) {
        normalized.pref_events = true;
    }

    return normalized;
};

type MobilePlatform = ReturnType<typeof getMobilePlatform>;

const getPermissionBlockedMessage = (platform: MobilePlatform) => {
    if (platform === 'android') {
        return 'Chrome 주소창 왼쪽 사이트 설정에서 알림을 허용하고, Android 설정 > 앱 > Chrome > 알림도 켜주세요.';
    }

    if (platform === 'ios') {
        return 'iOS 설정 > 알림에서 이 앱의 알림을 허용한 뒤 다시 확인해주세요.';
    }

    return '브라우저 주소창의 사이트 설정에서 알림을 허용한 뒤 다시 확인해주세요.';
};

const getPushSupportMessage = (status: PushSupportStatus, platform: MobilePlatform) => {
    if (status.supported) return '';

    if (platform === 'ios') {
        return '아이폰은 Safari 브라우저 탭에서 푸시 알림을 받을 수 없습니다. 홈 화면에 추가한 앱에서 설정해주세요.';
    }

    switch (status.reason) {
        case 'insecure-context':
            return 'HTTPS 접속에서만 브라우저 푸시 알림을 사용할 수 있습니다.';
        case 'notification-unavailable':
            return '이 브라우저는 알림 권한 API를 제공하지 않습니다.';
        case 'service-worker-unavailable':
            return '이 브라우저는 서비스워커를 지원하지 않아 푸시 알림을 사용할 수 없습니다.';
        case 'push-manager-unavailable':
            return '이 브라우저는 웹 푸시 구독을 지원하지 않습니다. Android Chrome 최신 버전에서 다시 시도해주세요.';
        default:
            return '현재 브라우저 환경에서는 푸시 알림을 사용할 수 없습니다.';
    }
};

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
    const { user } = useAuth();
    const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);
    const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => getNotificationPermission());
    const [pushSupportStatus, setPushSupportStatus] = useState<PushSupportStatus>(() => getPushSupportStatus());

    const platform = getMobilePlatform();

    const [pushPrefs, setPushPrefs] = useState<PushPreferences>(() => normalizeModalPrefs(DEFAULT_PUSH_PREFERENCES));

    const [originalPrefs, setOriginalPrefs] = useState<any>(null);
    const [originalPushEnabled, setOriginalPushEnabled] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const refreshPushEnvironment = () => {
        const support = getPushSupportStatus();
        const permission = getNotificationPermission();
        setPushSupportStatus(support);
        setPermissionStatus(permission);
        return { support, permission };
    };

    useEffect(() => {
        if (!isOpen) return;

        setStatusMessage(null);
        refreshPushEnvironment();

        const checkPWA = () => {
            const pwa = isPWAMode();
            setIsRunningInPWA(pwa);
            return pwa;
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
                    const uiPrefs = normalizeModalPrefs(prefs);
                    setPushPrefs(uiPrefs);
                    setOriginalPrefs({ ...uiPrefs });
                }
            } else {
                const uiPrefs = normalizeModalPrefs(DEFAULT_PUSH_PREFERENCES);
                setPushPrefs(uiPrefs);
                setOriginalPrefs({ ...uiPrefs });
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
            if (!nextVal && getEnabledChannelCount(prev) <= 1) {
                setStatusMessage({ type: 'error', text: '요약에 포함할 일정을 하나 이상 선택해야 합니다.' });
                return prev;
            }

            const updates: any = { [type]: nextVal };
            setStatusMessage(null);
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

    const handlePushEnabledToggle = () => {
        if (isSaving || isPushLoading) return;

        setStatusMessage(null);

        if (isPushEnabled) {
            setIsPushEnabled(false);
            return;
        }

        const { support, permission } = refreshPushEnvironment();
        if (!support.supported) {
            setStatusMessage({
                type: 'error',
                text: getPushSupportMessage(support, platform),
            });
            return;
        }

        if (permission === 'denied') {
            setStatusMessage({
                type: 'error',
                text: getPermissionBlockedMessage(platform),
            });
            return;
        }

        setPushPrefs(prev => normalizeModalPrefs(prev));
        setIsPushEnabled(true);
    };

    const handleDigestDayToggle = (day: number) => {
        setPushPrefs(prev => {
            const current = prev.pref_digest_days || DEFAULT_PUSH_PREFERENCES.pref_digest_days;
            const nextDays = current.includes(day)
                ? current.filter(value => value !== day)
                : [...current, day].sort((a, b) => a - b);

            if (nextDays.length === 0) return prev;
            setStatusMessage(null);
            return { ...prev, pref_digest_days: nextDays };
        });
    };

    const handleTimeChange = (time: string) => {
        setStatusMessage(null);
        setPushPrefs(prev => ({ ...prev, pref_digest_time: normalizeModalDigestTime(time) }));
    };

    const handleOnlyWithEventsToggle = () => {
        setStatusMessage(null);
        setPushPrefs(prev => ({ ...prev, pref_only_with_events: !prev.pref_only_with_events }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        setStatusMessage(null);
        try {
            const prefsToSave = normalizeModalPrefs(pushPrefs);
            console.info('[NotificationSettingsModal] save start', {
                pushEnabled: isPushEnabled,
                originalPushEnabled,
                permission: getNotificationPermission(),
                support: getPushSupportStatus(),
                prefs: {
                    pref_events: prefsToSave.pref_events,
                    pref_class: prefsToSave.pref_class,
                    pref_clubs: prefsToSave.pref_clubs,
                    pref_digest_time: prefsToSave.pref_digest_time,
                    pref_digest_days: prefsToSave.pref_digest_days,
                    pref_only_with_events: prefsToSave.pref_only_with_events,
                },
            });

            if (JSON.stringify(prefsToSave) !== JSON.stringify(pushPrefs)) {
                setPushPrefs(prefsToSave);
            }

            if (isPushEnabled && getEnabledChannelCount(prefsToSave) === 0) {
                setStatusMessage({ type: 'error', text: '요약에 포함할 일정을 하나 이상 선택해주세요.' });
                return;
            }

            if (isPushEnabled && (!prefsToSave.pref_digest_days || prefsToSave.pref_digest_days.length === 0)) {
                setStatusMessage({ type: 'error', text: '알림 받을 요일을 하나 이상 선택해주세요.' });
                return;
            }

            let shouldUpdateExistingPreferences = isPushEnabled;
            if (isPushEnabled !== originalPushEnabled) {
                if (isPushEnabled) {
                    const { support, permission: currentPermission } = refreshPushEnvironment();
                    if (!support.supported) {
                        setStatusMessage({ type: 'error', text: getPushSupportMessage(support, platform) });
                        setIsPushEnabled(false);
                        return;
                    }

                    if (currentPermission === 'denied') {
                        setStatusMessage({ type: 'error', text: getPermissionBlockedMessage(platform) });
                        setIsPushEnabled(false);
                        return;
                    }

                    if (currentPermission === 'default') {
                        const permission = await requestNotificationPermission();
                        setPermissionStatus(permission);
                        if (permission !== 'granted') {
                            setStatusMessage({ type: 'error', text: '알림 권한이 허용되지 않았습니다. 권한을 허용해야 요약 알림을 받을 수 있습니다.' });
                            setIsPushEnabled(false);
                            return;
                        }
                    }

                    const sub = await subscribeToPush();
                    if (!sub) {
                        const latestPermission = getNotificationPermission();
                        setPermissionStatus(latestPermission);
                        setStatusMessage({
                            type: 'error',
                            text: latestPermission === 'denied'
                                ? getPermissionBlockedMessage(platform)
                                : '브라우저가 푸시 구독을 거부했습니다. Chrome 사이트 설정과 휴대폰의 Chrome 알림 권한을 확인해주세요.',
                        });
                        setIsPushEnabled(false);
                        return;
                    }
                    // 명시적 비활성화 플래그 해제 (사용자가 다시 켰으므로 자동 재구독 허용)
                    localStorage.removeItem('push_explicitly_disabled');
                    const saved = await saveSubscriptionToDataStore(sub, prefsToSave);
                    if (!saved) {
                        console.warn('[NotificationSettingsModal] save returned false');
                        setStatusMessage({ type: 'error', text: '알림 설정을 서버에 저장하지 못했습니다.' });
                        return;
                    }
                    shouldUpdateExistingPreferences = false;
                } else {
                    await unsubscribeFromPush();
                    shouldUpdateExistingPreferences = false;
                }
            }

            if (shouldUpdateExistingPreferences) {
                const updated = await updatePushPreferences(prefsToSave);
                if (!updated) {
                    console.warn('[NotificationSettingsModal] update existing preferences failed');
                    setStatusMessage({
                        type: 'error',
                        text: '기존 알림 구독을 찾지 못해 설정을 저장하지 못했습니다. 알림을 껐다가 다시 켜주세요.',
                    });
                    return;
                }
            }

            console.info('[NotificationSettingsModal] save success');

            // [Sync] 사이드바 등 다른 컴포넌트에 알림 상태 변경 알림
            window.dispatchEvent(new CustomEvent('pushStatusChanged', {
                detail: { enabled: isPushEnabled }
            }));

            // 성공 시 바로 닫기 (alert 없이 — focus 이벤트로 인한 무한 루프 방지)
            onClose();
        } catch (error) {
            console.error('Save failed:', error);
            setStatusMessage({
                type: 'error',
                text: error instanceof Error && error.message
                    ? error.message
                    : '저장 중 오류가 발생했습니다. 다시 시도해주세요.',
            });
        } finally {
            setIsSaving(false);
        }
    };

    const enabledChannelCount = getEnabledChannelCount(pushPrefs);
    const selectedDayLabels = DIGEST_WEEKDAYS
        .filter(day => pushPrefs.pref_digest_days?.includes(day.value))
        .map(day => day.label)
        .join(' ');
    const deliverySummary = isPushEnabled
        ? `${selectedDayLabels || '선택 없음'} ${pushPrefs.pref_digest_time} · ${pushPrefs.pref_digest_timezone === 'Asia/Seoul' ? '한국 시간' : pushPrefs.pref_digest_timezone}`
        : '알림 꺼짐';
    const hasUnsavedChanges = (isPushEnabled !== originalPushEnabled) ||
        (isPushEnabled && JSON.stringify(pushPrefs) !== JSON.stringify(originalPrefs));
    const isPermissionBlocked = permissionStatus === 'denied';
    const isPushUnavailable = !pushSupportStatus.supported;
    const showEnvironmentPanel = isPermissionBlocked || isPushUnavailable;
    const saveBlockedLabel = isPushEnabled && isPushUnavailable
        ? '브라우저 미지원'
        : isPushEnabled && isPermissionBlocked
            ? '권한 차단됨'
            : null;
    const saveButtonDisabled = !hasUnsavedChanges || isSaving || (isPushEnabled && (isPermissionBlocked || isPushUnavailable));
    const saveButtonLabel = isSaving
        ? '저장 중...'
        : saveBlockedLabel
            ? saveBlockedLabel
            : isPermissionBlocked && !isPushEnabled
            ? '권한 차단됨'
            : hasUnsavedChanges
                ? '설정 저장'
                : '저장됨';

    if (!isOpen) return null;

    return (
        <div className="NotificationSettingsModal NSM-overlay" onClick={onClose}>
            <div className="NSM-container" onClick={e => e.stopPropagation()}>
                <div className="NSM-header">
                    <h2 className="NSM-title"><i className="ri-notification-3-fill"></i> 알림 설정</h2>
                    <button className="NSM-closeBtn" onClick={onClose} aria-label="닫기">
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="NSM-body">
                    {isPushLoading ? (
                        <div className="NSM-loadingRow">
                            <i className="ri-loader-4-line NSM-spinner"></i>
                            <span>설정 불러오는 중...</span>
                        </div>
                    ) : (!isRunningInPWA && platform === 'ios') ? (
                        <div className="NSM-pwaTip">
                            <div className="NSM-pwaHeader">
                                <div className="NSM-appIconPreview">
                                    <img src="/icon-192.png" alt="App Icon" className="NSM-logoImg" draggable={false} />
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
                        <div className="NSM-settingsStack">
                            <section className={`NSM-summaryPanel ${isPushEnabled ? 'is-active' : ''}`}>
                                <div className="NSM-summaryIcon" aria-hidden="true">
                                    <i className={isPushEnabled ? 'ri-notification-3-fill' : 'ri-notification-off-line'}></i>
                                </div>
                                <div className="NSM-summaryCopy">
                                    <span className="NSM-summaryEyebrow">Daily digest</span>
                                    <strong>오늘 일정 요약</strong>
                                    <small>{deliverySummary}</small>
                                </div>
                                <button
                                    type="button"
                                    className={`NSM-switch ${isPushEnabled ? 'is-active' : ''}`}
                                    onClick={handlePushEnabledToggle}
                                    aria-pressed={isPushEnabled}
                                    aria-label="오늘 일정 요약 알림"
                                >
                                    <div className="NSM-switchThumb" />
                                </button>
                            </section>

                            {showEnvironmentPanel && (
                                <section className="NSM-permissionPanel">
                                    <div className="NSM-permissionIcon" aria-hidden="true">
                                        <i className={isPushUnavailable ? 'ri-compass-3-line' : 'ri-notification-off-line'}></i>
                                    </div>
                                    <div className="NSM-permissionCopy">
                                        <strong>{isPushUnavailable ? '브라우저 푸시 미지원' : '브라우저 알림 권한 차단됨'}</strong>
                                        <small>
                                            {isPushUnavailable
                                                ? getPushSupportMessage(pushSupportStatus, platform)
                                                : getPermissionBlockedMessage(platform)}
                                        </small>
                                    </div>
                                </section>
                            )}

                            {isPushEnabled && (
                                <>
                                    <section className="NSM-section">
                                        <div className="NSM-sectionHead">
                                            <span className="NSM-sectionLabel">받는 시간</span>
                                            <span className="NSM-sectionMeta">30분 단위</span>
                                        </div>
                                        <div className="NSM-timeRow">
                                            <label className="NSM-timeInputWrap">
                                                <span>발송 시간</span>
                                                <select
                                                    value={pushPrefs.pref_digest_time}
                                                    onChange={(event) => handleTimeChange(event.target.value)}
                                                >
                                                    {PUSH_DIGEST_TIME_OPTIONS.map(time => (
                                                        <option key={time} value={time}>
                                                            {time}
                                                        </option>
                                                    ))}
                                                </select>
                                            </label>
                                            <div className="NSM-quickTimes" aria-label="빠른 시간 선택">
                                                {QUICK_DIGEST_TIMES.map(time => (
                                                    <button
                                                        key={time}
                                                        type="button"
                                                        className={pushPrefs.pref_digest_time === time ? 'is-active' : ''}
                                                        onClick={() => handleTimeChange(time)}
                                                    >
                                                        {time}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </section>

                                    <section className="NSM-section">
                                        <div className="NSM-sectionHead">
                                            <span className="NSM-sectionLabel">받는 요일</span>
                                            <span className="NSM-sectionMeta">최소 1일</span>
                                        </div>
                                        <div className="NSM-weekdayGrid" aria-label="알림 받을 요일">
                                            {DIGEST_WEEKDAYS.map(day => {
                                                const active = pushPrefs.pref_digest_days?.includes(day.value);
                                                return (
                                                    <button
                                                        key={day.value}
                                                        type="button"
                                                        className={active ? 'is-active' : ''}
                                                        onClick={() => handleDigestDayToggle(day.value)}
                                                    >
                                                        {day.label}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                    </section>

                                    <section className="NSM-section">
                                        <div className="NSM-sectionHead">
                                            <span className="NSM-sectionLabel">발송 조건</span>
                                            <span className="NSM-sectionMeta">불필요한 알림 줄이기</span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`NSM-settingLine ${pushPrefs.pref_only_with_events ? 'is-active' : ''}`}
                                            onClick={handleOnlyWithEventsToggle}
                                        >
                                            <i className="ri-calendar-check-line"></i>
                                            <span>
                                                <strong>일정이 있을 때만 보내기</strong>
                                                <small>오늘 일정이 없으면 조용히 넘어갑니다.</small>
                                            </span>
                                            <span className={`NSM-checkPill ${pushPrefs.pref_only_with_events ? 'is-active' : ''}`}>
                                                {pushPrefs.pref_only_with_events ? 'ON' : 'OFF'}
                                            </span>
                                        </button>
                                    </section>

                                    <section className="NSM-section">
                                        <div className="NSM-sectionHead">
                                            <span className="NSM-sectionLabel">요약에 포함할 일정</span>
                                            <span className="NSM-sectionMeta">{enabledChannelCount}/3 선택</span>
                                        </div>

                                        <div className="NSM-channelList">
                                            <button
                                                type="button"
                                                className={`NSM-channelCard ${pushPrefs.pref_events ? 'is-active' : ''} ${pushPrefs.pref_events && enabledChannelCount === 1 ? 'is-locked' : ''}`}
                                                onClick={() => handlePreferenceToggle('pref_events')}
                                                aria-disabled={pushPrefs.pref_events && enabledChannelCount === 1}
                                            >
                                                <i className="ri-calendar-event-line"></i>
                                                <span>
                                                    <strong>행사/소셜</strong>
                                                    <small>파티, 워크샵, 대회</small>
                                                </span>
                                                <em>{pushPrefs.pref_events ? '포함' : '제외'}</em>
                                            </button>

                                            <button
                                                type="button"
                                                className={`NSM-channelCard ${pushPrefs.pref_class ? 'is-active' : ''} ${pushPrefs.pref_class && enabledChannelCount === 1 ? 'is-locked' : ''}`}
                                                onClick={() => handlePreferenceToggle('pref_class')}
                                                aria-disabled={pushPrefs.pref_class && enabledChannelCount === 1}
                                            >
                                                <i className="ri-graduation-cap-line"></i>
                                                <span>
                                                    <strong>강습/워크샵</strong>
                                                    <small>린디합, 솔로재즈, 발보아</small>
                                                </span>
                                                <em>{pushPrefs.pref_class ? '포함' : '제외'}</em>
                                            </button>

                                            <button
                                                type="button"
                                                className={`NSM-channelCard ${pushPrefs.pref_clubs ? 'is-active' : ''} ${pushPrefs.pref_clubs && enabledChannelCount === 1 ? 'is-locked' : ''}`}
                                                onClick={() => handlePreferenceToggle('pref_clubs')}
                                                aria-disabled={pushPrefs.pref_clubs && enabledChannelCount === 1}
                                            >
                                                <i className="ri-team-line"></i>
                                                <span>
                                                    <strong>동호회</strong>
                                                    <small>동호회 강습과 모임</small>
                                                </span>
                                                <em>{pushPrefs.pref_clubs ? '포함' : '제외'}</em>
                                            </button>
                                        </div>
                                    </section>

                                    <p className="NSM-helperNote">
                                        새 일정 등록 즉시 알림은 보내지 않고, 설정한 시간에 하루 한 번 요약만 보냅니다.
                                    </p>
                                </>
                            )}
                        </div>
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
                        disabled={saveButtonDisabled}
                        onClick={handleSaveChanges}
                    >
                        {saveButtonLabel}
                    </button>
                </div>
            </div>
        </div>
    );
}
