import { supabase } from './supabase';

/**
 * PWA 푸시 알림 유틸리티 함수들
 * 
 * 테스트용으로 만들어진 푸시 알림 시스템입니다.
 * 실제 프로덕션 환경에서는 VAPID 키와 백엔드 통합이 필요합니다.
 */

// 테스트용 공개 VAPID 키 (실제 사용 시 환경 변수로 관리)
// 실제 키를 생성하려면: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BKg5c8Ja6Ce_iEtvV4y3KqaCb8mV9f-a2ClJsy8eiBLIfOi1wlAhaidG6jPq9Va0PM10RmOvOIetYs1wSeZRDG0';

console.log(`[Push] Using VAPID Public Key: ${VAPID_PUBLIC_KEY.substring(0, 5)}...${VAPID_PUBLIC_KEY.slice(-5)}`);

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
        console.log('[Push] Service Worker registered and ready:', registration);
        return registration;
    } catch (error) {
        console.error('[Push] Service Worker registration check failed:', error);
        return null;
    }
}

export function isPushSupported(): boolean {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window;
    console.log('[Push] Support check:', { supported, sw: 'serviceWorker' in navigator, pm: 'PushManager' in window });
    return supported;
}

export async function checkNotificationPermission(): Promise<NotificationPermission> {
    const permission = Notification.permission;
    console.log('[Push] Current permission:', permission);
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
    console.log('[Push] Requesting permission...');
    if (!('Notification' in window)) {
        console.warn('[Push] Notifications not supported in this browser');
        return 'denied';
    }
    const permission = await Notification.requestPermission();
    console.log('[Push] Permission result:', permission);
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
}

export const getPushSubscription = async (): Promise<PushSubscription | null> => {
    if (!isPushSupported()) return null;
    const registration = await navigator.serviceWorker.ready;
    return await registration.pushManager.getSubscription();
};

/**
 * [New] 서버에 해당 유저의 구독 정보가 실제로 존재하는지 확인
 */
export const verifySubscriptionOwnership = async (): Promise<boolean> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const sub = await getPushSubscription();
    if (!sub || !sub.endpoint) return false;

    const { count, error } = await supabase
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
            console.log("Existing subscription found:", existingSub);
            return existingSub;
        }

        // 2. Subscribe (VAPID)
        const vapidPublicKey = import.meta.env.VITE_PUBLIC_VAPID_KEY || 'BKg5c8Ja6Ce_iEtvV4y3KqaCb8mV9f-a2ClJsy8eiBLIfOi1wlAhaidG6jPq9Va0PM10RmOvOIetYs1wSeZRDG0';

        const convertedVapidKey = urlBase64ToUint8Array(vapidPublicKey);
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: convertedVapidKey as any
        });

        console.log("New subscription created:", subscription);
        return subscription;

    } catch (error) {
        console.error("Failed to subscribe to push:", error);
        return null;
    }
};

export const saveSubscriptionToSupabase = async (subscription: PushSubscription, prefs?: PushPreferences) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return; // Must be logged in

    // Get Endpoint (Unique Device ID)
    const endpoint = subscription.endpoint;

    // Prepare Payload
    const defaultPrefs: PushPreferences = {
        pref_events: true,
        pref_class: true,
        pref_clubs: true,
        pref_filter_tags: null,
        pref_filter_class_genres: null
    };

    const finalPrefs = prefs || defaultPrefs;

    // Check if user is admin
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    const isAdmin = user.email === adminEmail ||
        user.user_metadata?.role === 'admin' ||
        user.app_metadata?.role === 'admin' ||
        false;

    console.log('[Push] Saving subscription. Is Admin?', isAdmin);

    // Use RPC to safely upsert based on endpoint
    const { error } = await supabase.rpc('handle_push_subscription', {
        p_endpoint: endpoint,
        p_subscription: subscription,
        p_user_agent: navigator.userAgent,
        p_is_admin: isAdmin,
        p_pref_events: finalPrefs.pref_events,
        p_pref_class: finalPrefs.pref_class, // Match DB parameter name
        p_pref_clubs: finalPrefs.pref_clubs,
        p_pref_filter_tags: finalPrefs.pref_filter_tags,
        p_pref_filter_class_genres: finalPrefs.pref_filter_class_genres
    });

    if (error) {
        console.error("Failed to save subscription to Supabase:", error);
        throw error;
    }

    // [BRIDGE] 알림 신청 시 PWA 설치 로그가 없으면 즉시 생성 (데이터 일관성 확보)
    try {
        const { trackPWAInstall } = await import('../utils/analyticsEngine');
        await trackPWAInstall({ id: user.id });
    } catch (e) {
        console.warn('[Push] Failed to link PWA install log:', e);
    }

    console.log('[Push] Subscription saved to Supabase');
    return true;
}

export const updatePushPreferences = async (prefs: PushPreferences) => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return false;

    const sub = await getPushSubscription();
    if (!sub || !sub.endpoint) return false;

    const { error } = await supabase
        .from('user_push_subscriptions')
        .update({
            pref_events: prefs.pref_events,
            pref_class: prefs.pref_class,
            pref_clubs: prefs.pref_clubs,
            pref_filter_tags: prefs.pref_filter_tags,
            pref_filter_class_genres: prefs.pref_filter_class_genres,
            updated_at: new Date().toISOString(),
        })
        .eq('user_id', user.id)
        .eq('endpoint', sub.endpoint);

    if (error) {
        console.error('[Push] Failed to update preferences:', error);
        return false;
    }
    return true;
}

/**
 * 현재 저장된 알림 설정 가져오기
 */
export async function getPushPreferences(): Promise<PushPreferences | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const sub = await getPushSubscription();
        if (!sub || !sub.endpoint) {
            return null;
        }

        const { data, error } = await supabase
            .from('user_push_subscriptions')
            .select('pref_events, pref_class, pref_clubs, pref_filter_tags, pref_filter_class_genres')
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint)
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST116') return {
                pref_events: true,
                pref_class: true,
                pref_clubs: true,
                pref_filter_tags: null,
                pref_filter_class_genres: null
            };
            throw error;
        }

        if (!data) return null;

        return {
            pref_events: data.pref_events,
            pref_class: data.pref_class,
            pref_clubs: data.pref_clubs,
            pref_filter_tags: data.pref_filter_tags,
            pref_filter_class_genres: data.pref_filter_class_genres
        };
    } catch (error) {
        console.error('[Push] Failed to fetch preferences:', error);
        return null;
    }
}

/**
 * 푸시 구독 해제
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    console.log('[Push] Unsubscribing from push notifications...');
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            console.warn('[Push] No Service Worker registration found for unsubscribe.');
            return false;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            console.log('[Push] No active subscription found to unsubscribe.');
            return true;
        }

        const endpoint = subscription.endpoint;
        const successful = await subscription.unsubscribe();
        console.log('[Push] Push subscription removed from browser:', successful);

        // 서버에서도 구독 정보 삭제
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase
                .from('user_push_subscriptions')
                .delete()
                .eq('user_id', user.id)
                .eq('endpoint', endpoint);

            if (error) console.error('[Push] Failed to delete subscription from server:', error);
            else console.log('[Push] Push subscription removed from server');
        }

        return successful;
    } catch (error) {
        console.error('[Push] Failed to unsubscribe:', error);
        return false;
    }
}
