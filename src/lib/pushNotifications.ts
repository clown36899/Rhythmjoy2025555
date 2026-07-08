import { cafe24 } from './cafe24Client';

/**
 * PWA 푸시 알림 유틸리티 함수들
 * 
 * 테스트용으로 만들어진 푸시 알림 시스템입니다.
 * 실제 프로덕션 환경에서는 VAPID 키와 백엔드 통합이 필요합니다.
 */

// 테스트용 공개 VAPID 키 (실제 사용 시 환경 변수로 관리)
// 실제 키를 생성하려면: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BIngahG6SewkoWiBA5hrItBYVvawKxqvUwazI5uKrph7YJA1tKtzdxpc94Vc8Mz5PtXLifBKmcXzmsgoNTEzSsc';
const PUSH_DEBUG = import.meta.env.VITE_PUSH_DEBUG === 'true';
const pushDebug = (...args: unknown[]) => {
    if (PUSH_DEBUG) console.debug(...args);
};

/**
 * Service Worker 등록 상태 확인
 */
export async function checkServiceWorkerRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (!('serviceWorker' in navigator)) {
        console.warn('[Push] Service Worker not supported in this browser.');
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        pushDebug('[Push] Service Worker registered and ready:', registration);
        return registration;
    } catch (error) {
        console.error('[Push] Service Worker registration check failed:', error);
        return null;
    }
}

export function isPushSupported(): boolean {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    pushDebug('[Push] Support check:', { supported, sw: 'serviceWorker' in navigator, pm: 'PushManager' in window });
    return supported;
}

export async function checkNotificationPermission(): Promise<NotificationPermission> {
    const permission = Notification.permission;
    pushDebug('[Push] Current permission:', permission);
    return permission;
}

/**
 * 푸시 알림 권한 상태 확인
 */
export function getNotificationPermission(): NotificationPermission {
    if (!('Notification' in window)) {
        return 'denied';
    }
    return Notification.permission;
}

/**
 * 푸시 알림 권한 요청
 */
export async function requestNotificationPermission(): Promise<NotificationPermission> {
    pushDebug('[Push] Requesting permission...');
    if (!('Notification' in window)) {
        console.warn('[Push] Notifications not supported in this browser');
        return 'denied';
    }
    const permission = await Notification.requestPermission();
    pushDebug('[Push] Permission result:', permission);
    return permission;
}

/**
 * URL-safe Base64를 Uint8Array로 변환
 */
function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - base64String.length % 4) % 4);
    const base64 = (base64String + padding)
        .replace(/-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * [Updated] Push Preferences Interface
 */
export interface PushPreferences {
    pref_events: boolean;
    pref_class: boolean; // "Classes" (강습)
    pref_clubs: boolean;   // "Club Lessons" (동호회 강습)
    pref_filter_tags: string[] | null; // For Events
    pref_filter_class_genres: string[] | null; // For Classes
    pref_digest_time: string;
    pref_digest_days: number[];
    pref_digest_timezone: string;
    pref_only_with_events: boolean;
}

export const PUSH_DIGEST_TIME_OPTIONS = Array.from({ length: 48 }, (_, index) => {
    const totalMinutes = index * 30;
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
});

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
    pref_events: true,
    pref_class: true,
    pref_clubs: true,
    pref_filter_tags: null,
    pref_filter_class_genres: null,
    pref_digest_time: '08:30',
    pref_digest_days: [0, 1, 2, 3, 4, 5, 6],
    pref_digest_timezone: 'Asia/Seoul',
    pref_only_with_events: true,
};

const normalizeDigestTime = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (PUSH_DIGEST_TIME_OPTIONS.includes(raw)) return raw;

    const match = raw.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
    if (!match) return DEFAULT_PUSH_PREFERENCES.pref_digest_time;

    const hour = match[1];
    const minute = Number(match[2]);
    return `${hour}:${minute < 30 ? '00' : '30'}`;
};

const normalizeDigestDays = (value: unknown) => {
    if (!Array.isArray(value)) return DEFAULT_PUSH_PREFERENCES.pref_digest_days;
    const uniqueDays = Array.from(new Set(
        value
            .map((day) => Number(day))
            .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    ));
    return uniqueDays.length > 0 ? uniqueDays.sort((a, b) => a - b) : DEFAULT_PUSH_PREFERENCES.pref_digest_days;
};

const normalizeDigestTimezone = (value: unknown) => {
    const raw = typeof value === 'string' ? value.trim() : '';
    return raw || DEFAULT_PUSH_PREFERENCES.pref_digest_timezone;
};

const getStoredPushPreferences = (subscriptionPayload: any): Partial<PushPreferences> => {
    if (!subscriptionPayload || typeof subscriptionPayload !== 'object') return {};
    const preferences = subscriptionPayload.preferences;
    if (!preferences || typeof preferences !== 'object') return {};
    return preferences;
};

const normalizePushPreferences = (row: any = {}, stored: Partial<PushPreferences> = {}): PushPreferences => {
    const normalized: PushPreferences = {
        ...DEFAULT_PUSH_PREFERENCES,
        pref_events: row.pref_events ?? stored.pref_events ?? DEFAULT_PUSH_PREFERENCES.pref_events,
        pref_class: row.pref_class ?? stored.pref_class ?? DEFAULT_PUSH_PREFERENCES.pref_class,
        pref_clubs: row.pref_clubs ?? stored.pref_clubs ?? DEFAULT_PUSH_PREFERENCES.pref_clubs,
        pref_filter_tags: row.pref_filter_tags ?? stored.pref_filter_tags ?? DEFAULT_PUSH_PREFERENCES.pref_filter_tags,
        pref_filter_class_genres: row.pref_filter_class_genres ?? stored.pref_filter_class_genres ?? DEFAULT_PUSH_PREFERENCES.pref_filter_class_genres,
        pref_digest_time: normalizeDigestTime(stored.pref_digest_time ?? row.pref_digest_time),
        pref_digest_days: normalizeDigestDays(stored.pref_digest_days ?? row.pref_digest_days),
        pref_digest_timezone: normalizeDigestTimezone(stored.pref_digest_timezone ?? row.pref_digest_timezone),
        pref_only_with_events: stored.pref_only_with_events ?? row.pref_only_with_events ?? DEFAULT_PUSH_PREFERENCES.pref_only_with_events,
    };

    if (!normalized.pref_events && !normalized.pref_class && !normalized.pref_clubs) {
        normalized.pref_events = true;
    }

    return normalized;
};

const serializePushSubscription = (subscription: PushSubscription) => {
    const json = typeof subscription.toJSON === 'function' ? subscription.toJSON() : {};
    return {
        ...json,
        endpoint: subscription.endpoint,
        expirationTime: subscription.expirationTime ?? (json as any).expirationTime ?? null,
    };
};

const withPushPreferences = (subscriptionPayload: any, prefs: Partial<PushPreferences>) => ({
    ...(subscriptionPayload && typeof subscriptionPayload === 'object' ? subscriptionPayload : {}),
    preferences: normalizePushPreferences(prefs),
});

export const getPushSubscription = async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return null;
    return await registration.pushManager.getSubscription();
};

/**
 * [New] 서버에 해당 유저의 구독 정보가 실제로 존재하는지 확인
 */
export const verifySubscriptionOwnership = async (): Promise<boolean> => {
    const { data: { user } } = await cafe24.auth.getUser();
    if (!user) return false;

    const sub = await getPushSubscription();
    if (!sub || !sub.endpoint) return false;

    const { count, error } = await cafe24
        .from('user_push_subscriptions')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint);

    if (error) {
        console.error('[Push] Verification failed:', error);
        return false;
    }

    return (count || 0) > 0;
};

export const subscribeToPush = async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;

    try {
        const registration = await navigator.serviceWorker.ready;

        // 1. Check existing
        const existingSub = await registration.pushManager.getSubscription();
        if (existingSub) {
            return existingSub;
        }

        // 2. Subscribe (VAPID)
        const vapidPublicKey = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BIngahG6SewkoWiBA5hrItBYVvawKxqvUwazI5uKrph7YJA1tKtzdxpc94Vc8Mz5PtXLifBKmcXzmsgoNTEzSsc';
        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);

        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey as any
        });

        return subscription;

    } catch (error: any) {
        console.error('[Push] Subscribe failed:', error?.name, error?.message);
        return null;
    }
};

export const saveSubscriptionToDataStore = async (subscription: PushSubscription, prefs?: Partial<PushPreferences>) => {
    const { data: { user } } = await cafe24.auth.getUser();
    if (!user) return; // Must be logged in

    // Get Endpoint (Unique Device ID)
    const endpoint = subscription.endpoint;

    // 새 구독 저장 전, 같은 유저 + 같은 기기의 이전(죽은) 구독만 정리
    // 다른 기기(iOS vs Android vs Mac 등)의 구독은 유지
    let savedDevicePrefs: PushPreferences | null = null;
    try {
        const currentUA = navigator.userAgent;
        const { data: oldSubs } = await cafe24
            .from('user_push_subscriptions')
            .select('id, endpoint, user_agent, updated_at, subscription, pref_events, pref_class, pref_clubs, pref_filter_tags, pref_filter_class_genres')
            .eq('user_id', user.id)
            .neq('endpoint', endpoint);

        if (oldSubs && oldSubs.length > 0) {
            // 같은 기기 판별: OS 키워드 기반 매칭
            const getDeviceKey = (ua: string): string => {
                if (/iPhone|iPad/.test(ua)) return 'ios';
                if (/Android/.test(ua)) return 'android';
                if (/Mac/.test(ua)) return 'mac';
                if (/Windows/.test(ua)) return 'windows';
                return 'unknown';
            };
            const currentDevice = getDeviceKey(currentUA);
            const sameDeviceSubs = oldSubs.filter(s => getDeviceKey(s.user_agent) === currentDevice);

            if (sameDeviceSubs.length > 0) {
                // 재설치 시 이전 기기 설정 복원: prefs가 명시적으로 전달되지 않은 경우에만 적용
                if (!prefs) {
                    const mostRecent = sameDeviceSubs.sort((a, b) =>
                        new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
                    )[0];
                    savedDevicePrefs = normalizePushPreferences(mostRecent, getStoredPushPreferences(mostRecent.subscription));
                    pushDebug(`[Push] Restoring previous preferences for device (${currentDevice})`);
                }

                const oldIds = sameDeviceSubs.map(s => s.id);
                pushDebug(`[Push] Cleaning ${oldIds.length} old subscription(s) for same device (${currentDevice})`);
                await cafe24
                    .from('user_push_subscriptions')
                    .delete()
                    .in('id', oldIds);
            }
        }
    } catch (e) {
        console.warn('[Push] Old subscription cleanup failed (non-critical):', e);
    }

    // 우선순위: 명시적 prefs > 이전 기기 설정(재설치 복원) > 기본값
    const finalPrefs = normalizePushPreferences(prefs || savedDevicePrefs || DEFAULT_PUSH_PREFERENCES);

    // Check if user is admin
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const isAdmin = user.email === adminEmail ||
        user.user_metadata?.role === 'admin' ||
        user.app_metadata?.role === 'admin' ||
        false;

    pushDebug('[Push] Saving subscription. Is Admin?', isAdmin);

    // Use RPC to safely upsert based on endpoint
    const { error } = await cafe24.rpc('handle_push_subscription', {
        p_endpoint: endpoint,
        p_subscription: withPushPreferences(serializePushSubscription(subscription), finalPrefs),
        p_user_agent: navigator.userAgent,
        p_is_admin: isAdmin,
        p_pref_events: finalPrefs.pref_events,
        p_pref_class: finalPrefs.pref_class, // Match DB parameter name
        p_pref_clubs: finalPrefs.pref_clubs,
        p_pref_filter_tags: finalPrefs.pref_filter_tags,
        p_pref_filter_class_genres: finalPrefs.pref_filter_class_genres
    });

    if (error) {
        console.error("Failed to save subscription to data store:", error);
        throw error;
    }

    // [BRIDGE] 알림 신청 시 PWA 설치 로그가 없으면 즉시 생성 (데이터 일관성 확보)
    try {
        const { trackPWAInstall } = await import('../utils/analyticsEngine');
        await trackPWAInstall({ id: user.id });
    } catch (e) {
        console.warn('[Push] Failed to link PWA install log:', e);
    }

    pushDebug('[Push] Subscription saved to data store');
    return true;
}

export const updatePushPreferences = async (prefs: PushPreferences) => {
    const { data: { user } } = await cafe24.auth.getUser();
    if (!user) return false;

    const sub = await getPushSubscription();
    if (!sub || !sub.endpoint) return false;

    try {
        await saveSubscriptionToDataStore(sub, prefs);
        return true;
    } catch (error) {
        console.error('[Push] Failed to update preferences:', error);
        return false;
    }
}

/**
 * 현재 저장된 알림 설정 가져오기
 */
export async function getPushPreferences(): Promise<PushPreferences | null> {
    try {
        const { data: { user } } = await cafe24.auth.getUser();
        if (!user) return null;

        const sub = await getPushSubscription();
        if (!sub || !sub.endpoint) {
            return null;
        }

        const { data, error } = await cafe24
            .from('user_push_subscriptions')
            .select('subscription, pref_events, pref_class, pref_clubs, pref_filter_tags, pref_filter_class_genres')
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint)
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST116') return {
                ...DEFAULT_PUSH_PREFERENCES,
            };
            throw error;
        }

        if (!data) return null;

        return normalizePushPreferences(data, getStoredPushPreferences(data.subscription));
    } catch (error) {
        console.error('[Push] Failed to fetch preferences:', error);
        return null;
    }
}

/**
 * 푸시 구독 해제
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    pushDebug('[Push] Unsubscribing from push notifications...');
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            console.warn('[Push] No Service Worker registration found for unsubscribe.');
            return false;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            pushDebug('[Push] No active subscription found to unsubscribe.');
            return true;
        }

        const endpoint = subscription.endpoint;
        const successful = await subscription.unsubscribe();
        pushDebug('[Push] Push subscription removed from browser:', successful);

        if (successful) {
            // 사용자가 명시적으로 구독을 해제했음을 기록
            // → 앱 재실행 시 'granted' 권한이 있더라도 조용히 재구독하지 않도록 방지
            localStorage.setItem('push_explicitly_disabled', 'true');
        }

        // 서버에서도 구독 정보 삭제
        const { data: { user } } = await cafe24.auth.getUser();
        if (user) {
            const { error } = await cafe24
                .from('user_push_subscriptions')
                .delete()
                .eq('user_id', user.id)
                .eq('endpoint', endpoint);

            if (error) console.error('[Push] Failed to delete subscription from server:', error);
            else pushDebug('[Push] Push subscription removed from server');
        }

        return successful;
    } catch (error) {
        console.error('[Push] Failed to unsubscribe:', error);
        return false;
    }
}
