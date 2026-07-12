import { useState, useEffect } from 'react';
import {
    getPushSubscription,
    subscribeToPush,
    saveSubscriptionToDataStore,
    unsubscribeFromPush,
    getPushPreferences,
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

type StatusMessage = { type: 'success' | 'error'; text: string };
type NotificationDetailPanel = 'today' | 'new';

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

const getNewEventChannelCount = (prefs: PushPreferences) => (
    [prefs.pref_new_event_social, prefs.pref_new_event_class, prefs.pref_new_event_clubs].filter(Boolean).length
);

const getEnabledNotificationRouteCount = (prefs: PushPreferences) => (
    [prefs.pref_today_digest, prefs.pref_new_event_alerts].filter(Boolean).length
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

    if (getNewEventChannelCount(normalized) === 0) {
        normalized.pref_new_event_social = true;
    }

    if (getEnabledNotificationRouteCount(normalized) === 0) {
        normalized.pref_today_digest = true;
    }

    return normalized;
};

type MobilePlatform = ReturnType<typeof getMobilePlatform>;

const getDisplayMode = () => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return 'unknown';
    if (window.matchMedia('(display-mode: standalone)').matches) return 'standalone';
    if (window.matchMedia('(display-mode: fullscreen)').matches) return 'fullscreen';
    if (window.matchMedia('(display-mode: minimal-ui)').matches) return 'minimal-ui';
    if (window.matchMedia('(display-mode: browser)').matches) return 'browser';
    return 'unknown';
};

const getRuntimeLogMeta = (platform: MobilePlatform, pwa?: boolean) => {
    if (typeof window === 'undefined' || typeof navigator === 'undefined') {
        return {
            platform,
            pwa: false,
            displayMode: 'server',
            permission: 'denied',
            support: { supported: false, reason: 'browser-unavailable' },
        };
    }

    return {
        platform,
        pwa: pwa ?? isPWAMode(),
        displayMode: getDisplayMode(),
        permission: getNotificationPermission(),
        support: getPushSupportStatus(),
        secureContext: window.isSecureContext,
        notificationApi: 'Notification' in window,
        serviceWorkerApi: 'serviceWorker' in navigator,
        serviceWorkerController: Boolean(navigator.serviceWorker?.controller),
        pushManagerApi: 'PushManager' in window,
        visibility: document.visibilityState,
        focused: document.hasFocus(),
        online: navigator.onLine,
        userActivation: navigator.userActivation
            ? {
                isActive: navigator.userActivation.isActive,
                hasBeenActive: navigator.userActivation.hasBeenActive,
            }
            : null,
    };
};

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

const LEGACY_ANDROID_PWA_SCOPE_SESSION_KEY = 'swingenjoy_legacy_forum_media_pwa_scope';

const hasLegacyForumMediaPwaLaunchUrl = () => {
    if (typeof window === 'undefined') return false;

    const params = new URLSearchParams(window.location.search);
    const normalizedPath = window.location.pathname.replace(/\/$/, '');
    return normalizedPath === '/forum/media' && params.get('utm_source') === 'pwa';
};

const detectLegacyAndroidPwaScope = (platform: MobilePlatform, isPwa: boolean) => {
    if (platform !== 'android' || !isPwa) return false;

    const hasLegacyLaunchUrl = hasLegacyForumMediaPwaLaunchUrl();
    try {
        if (hasLegacyLaunchUrl) {
            window.sessionStorage.setItem(LEGACY_ANDROID_PWA_SCOPE_SESSION_KEY, '1');
            return true;
        }

        return window.sessionStorage.getItem(LEGACY_ANDROID_PWA_SCOPE_SESSION_KEY) === '1';
    } catch {
        return hasLegacyLaunchUrl;
    }
};

export default function NotificationSettingsModal({ isOpen, onClose }: NotificationSettingsModalProps) {
    const { user } = useAuth();
    const [isPushEnabled, setIsPushEnabled] = useState<boolean>(false);
    const [isPushLoading, setIsPushLoading] = useState<boolean>(false);
    const [isRunningInPWA, setIsRunningInPWA] = useState(false);
    const [needsPwaReinstall, setNeedsPwaReinstall] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [isRequestingPermission, setIsRequestingPermission] = useState(false);
    const [permissionStatus, setPermissionStatus] = useState<NotificationPermission>(() => getNotificationPermission());
    const [pushSupportStatus, setPushSupportStatus] = useState<PushSupportStatus>(() => getPushSupportStatus());

    const platform = getMobilePlatform();

    const [pushPrefs, setPushPrefs] = useState<PushPreferences>(() => normalizeModalPrefs(DEFAULT_PUSH_PREFERENCES));
    const [detailPanel, setDetailPanel] = useState<NotificationDetailPanel | null>(null);

    const [originalPrefs, setOriginalPrefs] = useState<any>(null);
    const [originalPushEnabled, setOriginalPushEnabled] = useState<boolean>(false);
    const [statusMessage, setStatusMessage] = useState<StatusMessage | null>(null);

    const setLoggedStatusMessage = (message: StatusMessage | null, meta: Record<string, unknown> = {}) => {
        if (message?.type === 'error') {
            console.warn('[NotificationSettingsModal] status error', {
                text: message.text,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
                ...meta,
            });
        } else if (message?.type === 'success') {
            console.info('[NotificationSettingsModal] status success', {
                text: message.text,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
                ...meta,
            });
        }
        setStatusMessage(message);
    };

    const refreshPushEnvironment = (source = 'manual') => {
        const support = getPushSupportStatus();
        const permission = getNotificationPermission();
        setPushSupportStatus(support);
        setPermissionStatus(permission);
        console.info('[NotificationSettingsModal] environment refresh', {
            source,
            ...getRuntimeLogMeta(platform, isRunningInPWA),
            permission,
            support,
        });
        return { support, permission };
    };

    useEffect(() => {
        if (!isOpen) return;

        setLoggedStatusMessage(null);
        setDetailPanel(null);
        refreshPushEnvironment('open');

        const checkPWA = () => {
            const pwa = isPWAMode();
            setIsRunningInPWA(pwa);
            console.info('[NotificationSettingsModal] open', {
                hasUser: Boolean(user),
                ...getRuntimeLogMeta(platform, pwa),
            });
            return pwa;
        };

        const pwa = checkPWA();
        const legacyAndroidPwa = detectLegacyAndroidPwaScope(platform, pwa);
        setNeedsPwaReinstall(legacyAndroidPwa);
        if (legacyAndroidPwa) {
            console.warn('[NotificationSettingsModal] legacy Android PWA scope detected', {
                path: window.location.pathname,
                search: window.location.search,
                ...getRuntimeLogMeta(platform, pwa),
            });
            return;
        }

        loadSettings();
    }, [isOpen]);

    const loadSettings = async () => {
        if (!user) {
            console.warn('[NotificationSettingsModal] load skipped no user', getRuntimeLogMeta(platform, isRunningInPWA));
            return;
        }
        setIsPushLoading(true);
        try {
            console.info('[NotificationSettingsModal] load start', {
                hasUser: true,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
            });
            const browserSub = await getPushSubscription();
            let isVerified = false;
            if (browserSub) {
                isVerified = await verifySubscriptionOwnership();
            }

            console.info('[NotificationSettingsModal] load subscription result', {
                hasBrowserSubscription: Boolean(browserSub),
                isVerified,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
            });

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
            console.info('[NotificationSettingsModal] load end', getRuntimeLogMeta(platform, isRunningInPWA));
        }
    };

    const handlePreferenceToggle = (type: 'pref_events' | 'pref_class' | 'pref_clubs') => {
        setPushPrefs(prev => {
            const nextVal = !prev[type];
            if (!nextVal && getEnabledChannelCount(prev) <= 1) {
                setLoggedStatusMessage({ type: 'error', text: '오늘 일정 요약에 포함할 일정을 하나 이상 선택해야 합니다.' }, { step: 'today-channel-toggle', type });
                return prev;
            }

            const updates: any = { [type]: nextVal };
            setLoggedStatusMessage(null);
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

    const handleNewEventPreferenceToggle = (
        type: 'pref_new_event_social' | 'pref_new_event_class' | 'pref_new_event_clubs'
    ) => {
        setPushPrefs(prev => {
            const nextVal = !prev[type];
            if (!nextVal && getNewEventChannelCount(prev) <= 1) {
                setLoggedStatusMessage({ type: 'error', text: '새 등록 알림 대상을 하나 이상 선택해야 합니다.' }, { step: 'new-event-channel-toggle', type });
                return prev;
            }

            setLoggedStatusMessage(null);
            return { ...prev, [type]: nextVal };
        });
    };

    const enablePushNotificationsFromUserAction = async () => {
        if (isSaving || isPushLoading || isRequestingPermission) {
            console.info('[NotificationSettingsModal] toggle ignored busy', {
                isSaving,
                isPushLoading,
                isRequestingPermission,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
            });
            return false;
        }

        setLoggedStatusMessage(null);
        console.info('[NotificationSettingsModal] enable from alert toggle', getRuntimeLogMeta(platform, isRunningInPWA));

        setIsRequestingPermission(true);
        try {
            const { support, permission } = refreshPushEnvironment('toggle');
            if (!support.supported) {
                setLoggedStatusMessage({
                    type: 'error',
                    text: getPushSupportMessage(support, platform),
                }, { step: 'toggle-unsupported' });
                return false;
            }

            if (permission === 'denied') {
                setLoggedStatusMessage({
                    type: 'error',
                    text: getPermissionBlockedMessage(platform),
                }, { step: 'toggle-denied' });
                return false;
            }

            if (permission === 'default') {
                console.info('[NotificationSettingsModal] permission request before toggle enable', getRuntimeLogMeta(platform, isRunningInPWA));
                const requestedPermission = await requestNotificationPermission();
                const latestPermission = getNotificationPermission();
                setPermissionStatus(latestPermission);
                refreshPushEnvironment('toggle-after-permission');
                console.info('[NotificationSettingsModal] permission request after toggle enable', {
                    requestedPermission,
                    latestPermission,
                    ...getRuntimeLogMeta(platform, isRunningInPWA),
                });

                if (requestedPermission !== 'granted' && latestPermission !== 'granted') {
                    setLoggedStatusMessage({
                        type: 'error',
                        text: '알림 권한이 허용되지 않았습니다. 브라우저 권한 창에서 허용을 누른 뒤 다시 켜주세요.',
                    }, {
                        step: 'toggle-permission-not-granted',
                        requestedPermission,
                        latestPermission,
                    });
                    return false;
                }
            }

            setPushPrefs(prev => normalizeModalPrefs(prev));
            setIsPushEnabled(true);
            console.info('[NotificationSettingsModal] toggle on staged without subscription save', getRuntimeLogMeta(platform, isRunningInPWA));
            return true;
        } finally {
            setIsRequestingPermission(false);
        }
    };

    const handleAlertActivationToggle = async (type: 'pref_today_digest' | 'pref_new_event_alerts') => {
        if (isSaving || isPushLoading || isRequestingPermission) return;

        const isCurrentlyActive = isPushEnabled && Boolean(pushPrefs[type]);
        if (isCurrentlyActive) {
            const routeCount = getEnabledNotificationRouteCount(pushPrefs);
            setLoggedStatusMessage(null);
            setPushPrefs(prev => ({ ...prev, [type]: false }));
            if (type === 'pref_today_digest' && detailPanel === 'today') setDetailPanel(null);
            if (type === 'pref_new_event_alerts' && detailPanel === 'new') setDetailPanel(null);
            if (routeCount <= 1) {
                setIsPushEnabled(false);
                console.info('[NotificationSettingsModal] all alert routes disabled, push staged off', getRuntimeLogMeta(platform, isRunningInPWA));
            }
            return;
        }

        if (!isPushEnabled) {
            const enabled = await enablePushNotificationsFromUserAction();
            if (!enabled) return;
        }

        setLoggedStatusMessage(null);
        setPushPrefs(prev => normalizeModalPrefs({ ...prev, [type]: true }));
    };

    const handleDigestDayToggle = (day: number) => {
        setPushPrefs(prev => {
            const current = prev.pref_digest_days || DEFAULT_PUSH_PREFERENCES.pref_digest_days;
            const nextDays = current.includes(day)
                ? current.filter(value => value !== day)
                : [...current, day].sort((a, b) => a - b);

            if (nextDays.length === 0) {
                console.warn('[NotificationSettingsModal] weekday toggle blocked empty', {
                    day,
                    ...getRuntimeLogMeta(platform, isRunningInPWA),
                });
                return prev;
            }
            setLoggedStatusMessage(null);
            return { ...prev, pref_digest_days: nextDays };
        });
    };

    const handleTimeChange = (time: string) => {
        setLoggedStatusMessage(null);
        setPushPrefs(prev => ({ ...prev, pref_digest_time: normalizeModalDigestTime(time) }));
    };

    const handleOnlyWithEventsToggle = () => {
        setLoggedStatusMessage(null);
        setPushPrefs(prev => ({ ...prev, pref_only_with_events: !prev.pref_only_with_events }));
    };

    const handleSaveChanges = async () => {
        setIsSaving(true);
        setLoggedStatusMessage(null);
        try {
            const prefsToSave = isPushEnabled ? normalizeModalPrefs(pushPrefs) : { ...pushPrefs };
            console.info('[NotificationSettingsModal] save start', {
                pushEnabled: isPushEnabled,
                originalPushEnabled,
                ...getRuntimeLogMeta(platform, isRunningInPWA),
                prefs: {
                    pref_today_digest: prefsToSave.pref_today_digest,
                    pref_new_event_alerts: prefsToSave.pref_new_event_alerts,
                    pref_events: prefsToSave.pref_events,
                    pref_class: prefsToSave.pref_class,
                    pref_clubs: prefsToSave.pref_clubs,
                    pref_new_event_social: prefsToSave.pref_new_event_social,
                    pref_new_event_class: prefsToSave.pref_new_event_class,
                    pref_new_event_clubs: prefsToSave.pref_new_event_clubs,
                    pref_digest_time: prefsToSave.pref_digest_time,
                    pref_digest_days: prefsToSave.pref_digest_days,
                    pref_only_with_events: prefsToSave.pref_only_with_events,
                },
            });

            if (isPushEnabled && JSON.stringify(prefsToSave) !== JSON.stringify(pushPrefs)) {
                setPushPrefs(prefsToSave);
            }

            if (isPushEnabled && getEnabledNotificationRouteCount(prefsToSave) === 0) {
                setLoggedStatusMessage({ type: 'error', text: '받을 알림 종류를 하나 이상 선택해주세요.' }, { step: 'save-no-route' });
                return;
            }

            if (isPushEnabled && prefsToSave.pref_today_digest && getEnabledChannelCount(prefsToSave) === 0) {
                setLoggedStatusMessage({ type: 'error', text: '오늘 일정 요약에 포함할 일정을 하나 이상 선택해주세요.' }, { step: 'save-no-today-channel' });
                return;
            }

            if (isPushEnabled && prefsToSave.pref_today_digest && (!prefsToSave.pref_digest_days || prefsToSave.pref_digest_days.length === 0)) {
                setLoggedStatusMessage({ type: 'error', text: '알림 받을 요일을 하나 이상 선택해주세요.' }, { step: 'save-no-weekday' });
                return;
            }

            if (isPushEnabled && prefsToSave.pref_new_event_alerts && getNewEventChannelCount(prefsToSave) === 0) {
                setLoggedStatusMessage({ type: 'error', text: '새 등록 알림 대상을 하나 이상 선택해주세요.' }, { step: 'save-no-new-event-channel' });
                return;
            }

            if (isPushEnabled) {
                console.info('[NotificationSettingsModal] save subscription upsert flow', {
                    originalPushEnabled,
                    ...getRuntimeLogMeta(platform, isRunningInPWA),
                });
                const { support, permission: currentPermission } = refreshPushEnvironment('save-before-permission');
                if (!support.supported) {
                    setLoggedStatusMessage({ type: 'error', text: getPushSupportMessage(support, platform) }, { step: 'save-unsupported' });
                    setIsPushEnabled(false);
                    return;
                }

                if (currentPermission === 'denied') {
                    setLoggedStatusMessage({ type: 'error', text: getPermissionBlockedMessage(platform) }, { step: 'save-denied-before-request' });
                    setIsPushEnabled(false);
                    return;
                }

                if (currentPermission === 'default') {
                    console.warn('[NotificationSettingsModal] save blocked permission still default', getRuntimeLogMeta(platform, isRunningInPWA));
                    setLoggedStatusMessage({ type: 'error', text: '알림 권한이 아직 허용되지 않았습니다. 알림 스위치를 다시 켜서 권한을 먼저 허용해주세요.' }, {
                        step: 'save-permission-default',
                    });
                    setIsPushEnabled(false);
                    return;
                }

                console.info('[NotificationSettingsModal] subscription upsert before save', getRuntimeLogMeta(platform, isRunningInPWA));
                const sub = await subscribeToPush();
                console.info('[NotificationSettingsModal] subscription upsert after save', {
                    hasSubscription: Boolean(sub),
                    ...getRuntimeLogMeta(platform, isRunningInPWA),
                });
                if (!sub) {
                    const latestPermission = getNotificationPermission();
                    setPermissionStatus(latestPermission);
                    setLoggedStatusMessage({
                        type: 'error',
                        text: latestPermission === 'denied'
                            ? getPermissionBlockedMessage(platform)
                            : '브라우저가 푸시 구독을 거부했습니다. Chrome 사이트 설정과 휴대폰의 Chrome 알림 권한을 확인해주세요.',
                    }, { step: 'save-subscribe-missing', latestPermission });
                    setIsPushEnabled(false);
                    return;
                }
                localStorage.removeItem('push_explicitly_disabled');
                console.info('[NotificationSettingsModal] datastore save before', getRuntimeLogMeta(platform, isRunningInPWA));
                const saved = await saveSubscriptionToDataStore(sub, prefsToSave);
                if (!saved) {
                    console.warn('[NotificationSettingsModal] save returned false');
                    setLoggedStatusMessage({ type: 'error', text: '알림 설정을 서버에 저장하지 못했습니다.' }, { step: 'save-datastore-false' });
                    return;
                }
                console.info('[NotificationSettingsModal] datastore save after', getRuntimeLogMeta(platform, isRunningInPWA));
            } else if (isPushEnabled !== originalPushEnabled) {
                console.info('[NotificationSettingsModal] unsubscribe before save', getRuntimeLogMeta(platform, isRunningInPWA));
                await unsubscribeFromPush();
                console.info('[NotificationSettingsModal] unsubscribe after save', getRuntimeLogMeta(platform, isRunningInPWA));
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
            setLoggedStatusMessage({
                type: 'error',
                text: error instanceof Error && error.message
                    ? error.message
                    : '저장 중 오류가 발생했습니다. 다시 시도해주세요.',
            }, { step: 'save-catch' });
        } finally {
            setIsSaving(false);
            console.info('[NotificationSettingsModal] save end', getRuntimeLogMeta(platform, isRunningInPWA));
        }
    };

    const enabledChannelCount = getEnabledChannelCount(pushPrefs);
    const newEventChannelCount = getNewEventChannelCount(pushPrefs);
    const isTodayAlertActive = isPushEnabled && pushPrefs.pref_today_digest;
    const isNewEventAlertActive = isPushEnabled && pushPrefs.pref_new_event_alerts;
    const selectedDayLabels = DIGEST_WEEKDAYS
        .filter(day => pushPrefs.pref_digest_days?.includes(day.value))
        .map(day => day.label)
        .join(' ');
    const todayDeliverySummary = isTodayAlertActive
        ? `${selectedDayLabels || '선택 없음'} ${pushPrefs.pref_digest_time}`
        : '꺼짐';
    const newEventSummary = isNewEventAlertActive
        ? `${newEventChannelCount}/3 대상`
        : '꺼짐';
    const todayRouteLabel = isTodayAlertActive ? '켜짐' : '꺼짐';
    const newEventRouteLabel = isNewEventAlertActive ? '켜짐' : '꺼짐';
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
    const saveButtonDisabled = !hasUnsavedChanges || isSaving || isRequestingPermission || (isPushEnabled && (isPermissionBlocked || isPushUnavailable));
    const saveButtonLabel = isSaving
        ? '저장 중...'
        : isRequestingPermission
        ? '권한 확인 중...'
        : saveBlockedLabel
            ? saveBlockedLabel
            : isPermissionBlocked && !isPushEnabled
            ? '권한 차단됨'
            : statusMessage?.type === 'error' && !hasUnsavedChanges
                ? '확인 필요'
            : hasUnsavedChanges
                ? '설정 저장'
                : '저장됨';
    const showInstallGuideOnly = needsPwaReinstall || (!isRunningInPWA && platform === 'ios');
    const showSaveControls = !isPushLoading && !showInstallGuideOnly;

    if (!isOpen) return null;

    return (
        <div className="NotificationSettingsModal NSM-overlay" onClick={onClose}>
            <div className="NSM-container" onClick={e => e.stopPropagation()}>
                <div className="NSM-header">
                    <div className="NSM-titleBlock">
                        <h2 className="NSM-title"><i className="ri-notification-3-fill"></i> 알림 설정</h2>
                    </div>
                    <div className="NSM-headerControls">
                        <button className="NSM-closeBtn" onClick={onClose} aria-label="닫기">
                            <i className="ri-close-line"></i>
                        </button>
                    </div>
                </div>

                <div className="NSM-body">
                    {isPushLoading ? (
                        <div className="NSM-loadingRow">
                            <i className="ri-loader-4-line NSM-spinner"></i>
                            <span>설정 불러오는 중...</span>
                        </div>
                    ) : needsPwaReinstall ? (
                        <div className="NSM-pwaTip NSM-pwaTip--warning">
                            <div className="NSM-pwaHeader">
                                <div className="NSM-appIconPreview">
                                    <img src="/icon-192.png" alt="App Icon" className="NSM-logoImg" draggable={false} />
                                    <div className="NSM-iconBadge">
                                        <i className="ri-refresh-line"></i>
                                    </div>
                                </div>
                                <p className="NSM-pwaText">
                                    이전에 설치한 앱은 <strong>옛날 설치 정보</strong>를 쓰고 있어 알림 권한이 정상이어도 저장이 막힐 수 있습니다.
                                </p>
                            </div>

                            <div className="NSM-installSteps">
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">1</span>
                                    <span className="NSM-stepText">휴대폰에서 기존 <strong>댄스빌보드 앱 삭제</strong></span>
                                </div>
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">2</span>
                                    <span className="NSM-stepText">Chrome에서 <strong>swingenjoy.com</strong> 접속</span>
                                </div>
                                <div className="NSM-stepItem">
                                    <span className="NSM-stepNumber">3</span>
                                    <span className="NSM-stepText">메뉴에서 <strong>앱 설치</strong> 후 알림 설정 다시 저장</span>
                                </div>
                            </div>

                            <p className="NSM-pwaFooterTip">
                                <i className="ri-information-line"></i> 브라우저에서 접속한 경우는 다시 설치하지 않아도 됩니다.
                            </p>
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

                            <section className={`NSM-alertMenu ${isTodayAlertActive ? 'is-enabled' : ''}`}>
                                <div className="NSM-alertMenuHead">
                                    <i className="ri-calendar-check-line" aria-hidden="true"></i>
                                    <span>
                                        <strong>오늘 일정 요약</strong>
                                        <small>아침에 오늘 일정만 모아서 받기</small>
                                    </span>
                                    <button
                                        type="button"
                                        className={`NSM-cardSwitch ${isTodayAlertActive ? 'is-active' : ''}`}
                                        onClick={() => handleAlertActivationToggle('pref_today_digest')}
                                        disabled={isSaving || isPushLoading || isRequestingPermission}
                                        aria-pressed={isTodayAlertActive}
                                    >
                                        <span>{todayRouteLabel}</span>
                                        <span className={`NSM-switch ${isTodayAlertActive ? 'is-active' : ''} ${isRequestingPermission ? 'is-loading' : ''}`} aria-hidden="true">
                                            <span className="NSM-switchThumb" />
                                            {isRequestingPermission && (
                                                <i className="ri-loader-4-line NSM-switchSpinner"></i>
                                            )}
                                        </span>
                                    </button>
                                </div>

                                {isTodayAlertActive && (
                                    <button
                                        type="button"
                                        className="NSM-detailOpenBtn"
                                        onClick={() => setDetailPanel('today')}
                                    >
                                        <i className="ri-equalizer-line" aria-hidden="true"></i>
                                        <span>세부설정</span>
                                        <small>{todayDeliverySummary}</small>
                                    </button>
                                )}
                            </section>

                            <section className={`NSM-alertMenu ${isNewEventAlertActive ? 'is-enabled' : ''}`}>
                                <div className="NSM-alertMenuHead">
                                    <i className="ri-notification-badge-line" aria-hidden="true"></i>
                                    <span>
                                        <strong>새 등록 알림</strong>
                                        <small>누가 새 일정을 올리면 받기</small>
                                    </span>
                                    <button
                                        type="button"
                                        className={`NSM-cardSwitch ${isNewEventAlertActive ? 'is-active' : ''}`}
                                        onClick={() => handleAlertActivationToggle('pref_new_event_alerts')}
                                        disabled={isSaving || isPushLoading || isRequestingPermission}
                                        aria-pressed={isNewEventAlertActive}
                                    >
                                        <span>{newEventRouteLabel}</span>
                                        <span className={`NSM-switch ${isNewEventAlertActive ? 'is-active' : ''} ${isRequestingPermission ? 'is-loading' : ''}`} aria-hidden="true">
                                            <span className="NSM-switchThumb" />
                                            {isRequestingPermission && (
                                                <i className="ri-loader-4-line NSM-switchSpinner"></i>
                                            )}
                                        </span>
                                    </button>
                                </div>

                                {isNewEventAlertActive && (
                                    <button
                                        type="button"
                                        className="NSM-detailOpenBtn"
                                        onClick={() => setDetailPanel('new')}
                                    >
                                        <i className="ri-equalizer-line" aria-hidden="true"></i>
                                        <span>세부설정</span>
                                        <small>{newEventSummary}</small>
                                    </button>
                                )}
                            </section>
                        </div>
                    )}
                </div>

                {showSaveControls && statusMessage && (
                    <div className={`NSM-statusBanner NSM-statusBanner--${statusMessage.type}`}>
                        <i className={statusMessage.type === 'error' ? 'ri-error-warning-fill' : 'ri-checkbox-circle-fill'}></i>
                        {statusMessage.text}
                    </div>
                )}

                {showSaveControls && (
                    <div className="NSM-footer">
                        <p className="NSM-footerHint">변경 후 저장 버튼을 눌러야 적용됩니다.</p>
                        <button
                            className={`NSM-saveBtn ${hasUnsavedChanges ? 'is-ready' : ''}`}
                            disabled={saveButtonDisabled}
                            onClick={handleSaveChanges}
                        >
                            {saveButtonLabel}
                        </button>
                    </div>
                )}
            </div>

            {detailPanel && (
                <div
                    className="NSM-detailModalOverlay"
                    onClick={(event) => {
                        event.stopPropagation();
                        setDetailPanel(null);
                    }}
                >
                    <div className="NSM-detailModal" onClick={event => event.stopPropagation()}>
                        <div className="NSM-detailModalHeader">
                            <h3>{detailPanel === 'today' ? '오늘 일정 요약 설정' : '새 등록 알림 설정'}</h3>
                            <button type="button" onClick={() => setDetailPanel(null)} aria-label="세부설정 닫기">
                                <i className="ri-close-line"></i>
                            </button>
                        </div>

                        <div className="NSM-detailModalBody">
                            {detailPanel === 'today' ? (
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
                                            <span className="NSM-sectionMeta">일정 없으면 생략</span>
                                        </div>
                                        <button
                                            type="button"
                                            className={`NSM-settingLine ${pushPrefs.pref_only_with_events ? 'is-active' : ''}`}
                                            onClick={handleOnlyWithEventsToggle}
                                        >
                                            <i className="ri-calendar-check-line"></i>
                                            <span>
                                                <strong>일정이 있을 때만 보내기</strong>
                                                <small>오늘 일정이 없으면 알림을 보내지 않습니다.</small>
                                            </span>
                                            <span className={`NSM-checkPill ${pushPrefs.pref_only_with_events ? 'is-active' : ''}`}>
                                                {pushPrefs.pref_only_with_events ? '사용' : '해제'}
                                            </span>
                                        </button>
                                    </section>

                                    <section className="NSM-section">
                                        <div className="NSM-sectionHead">
                                            <span className="NSM-sectionLabel">포함할 일정</span>
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
                                                    <small>정규 강습과 특강</small>
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
                                </>
                            ) : (
                                <section className="NSM-section">
                                    <div className="NSM-sectionHead">
                                        <span className="NSM-sectionLabel">새 등록 알림 대상</span>
                                        <span className="NSM-sectionMeta">{newEventChannelCount}/3 선택</span>
                                    </div>

                                    <div className="NSM-channelList">
                                        <button
                                            type="button"
                                            className={`NSM-channelCard ${pushPrefs.pref_new_event_social ? 'is-active' : ''} ${pushPrefs.pref_new_event_social && newEventChannelCount === 1 ? 'is-locked' : ''}`}
                                            onClick={() => handleNewEventPreferenceToggle('pref_new_event_social')}
                                            aria-disabled={pushPrefs.pref_new_event_social && newEventChannelCount === 1}
                                        >
                                            <i className="ri-calendar-event-line"></i>
                                            <span>
                                                <strong>행사/소셜</strong>
                                                <small>새 파티, 워크샵, 대회</small>
                                            </span>
                                            <em>{pushPrefs.pref_new_event_social ? '포함' : '제외'}</em>
                                        </button>

                                        <button
                                            type="button"
                                            className={`NSM-channelCard ${pushPrefs.pref_new_event_class ? 'is-active' : ''} ${pushPrefs.pref_new_event_class && newEventChannelCount === 1 ? 'is-locked' : ''}`}
                                            onClick={() => handleNewEventPreferenceToggle('pref_new_event_class')}
                                            aria-disabled={pushPrefs.pref_new_event_class && newEventChannelCount === 1}
                                        >
                                            <i className="ri-graduation-cap-line"></i>
                                            <span>
                                                <strong>강습/워크샵</strong>
                                                <small>새 정규 강습과 특강</small>
                                            </span>
                                            <em>{pushPrefs.pref_new_event_class ? '포함' : '제외'}</em>
                                        </button>

                                        <button
                                            type="button"
                                            className={`NSM-channelCard ${pushPrefs.pref_new_event_clubs ? 'is-active' : ''} ${pushPrefs.pref_new_event_clubs && newEventChannelCount === 1 ? 'is-locked' : ''}`}
                                            onClick={() => handleNewEventPreferenceToggle('pref_new_event_clubs')}
                                            aria-disabled={pushPrefs.pref_new_event_clubs && newEventChannelCount === 1}
                                        >
                                            <i className="ri-team-line"></i>
                                            <span>
                                                <strong>동호회</strong>
                                                <small>새 동호회 강습과 모임</small>
                                            </span>
                                            <em>{pushPrefs.pref_new_event_clubs ? '포함' : '제외'}</em>
                                        </button>
                                    </div>
                                </section>
                            )}
                        </div>

                        <div className="NSM-detailModalFooter">
                            <button type="button" onClick={() => setDetailPanel(null)}>완료</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
