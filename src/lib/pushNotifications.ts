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
        console.warn('Service Worker not supported');
        console.warn('[Push] Service Worker not supported');
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
        .replace(/\-/g, '+')
        .replace(/_/g, '/');

    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
}

/**
 * 푸시 구독 생성
 */
export async function subscribeToPush(): Promise<PushSubscription | null> {
    console.log('[Push] subscribeToPush started');
    try {
        if (!isPushSupported()) {
            console.error('[Push] Push not supported');
            return null;
        }

        const registration = await navigator.serviceWorker.ready;
        console.log('[Push] SW registration ready:', registration);

        // 1. 기존 구독 확인
        let subscription = await registration.pushManager.getSubscription();
        console.log('[Push] Existing subscription check:', !!subscription);

        // 2. 권한 확인 및 요청
        let permission = await checkNotificationPermission();
        if (permission === 'default') {
            permission = await requestNotificationPermission();
        }

        if (permission !== 'granted') {
            console.warn('[Push] Notification permission denied');
            return null;
        }

        // 3. 구독 안 되어 있으면 새로 생성
        if (!subscription) {
            console.log('[Push] Creating new subscription with VAPID key...');
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as any
            });
            console.log('[Push] New subscription created successfully');
        }

        return subscription;
    } catch (error) {
        console.error('[Push] Failed to subscribe to push notifications:', error);
        return null;
    }
}

/**
 * 현재 기기의 푸시 구독 정보 가져오기
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
    try {
        if (!('serviceWorker' in navigator)) return null;
        const registration = await navigator.serviceWorker.getRegistration();
        if (!registration) return null;
        return await registration.pushManager.getSubscription();
    } catch (error) {
        console.error('[Push] Failed to get push subscription:', error);
        return null;
    }
}

/**
 * 푸시 구독 정보를 Supabase에 저장
 */
/**
 * 푸시 구독 정보를 Supabase에 저장
 */
export async function saveSubscriptionToSupabase(
    subscription: PushSubscription,
    options?: { pref_events?: boolean, pref_lessons?: boolean, pref_filter_tags?: string[] | null }
): Promise<boolean> {
    console.log('[Push] Saving subscription to Supabase...');
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error('User not logged in');

        // isAdmin 판단
        const isAdmin = user.email === 'clown313@naver.com' || (user.app_metadata?.is_admin === true);

        const subJson = JSON.parse(JSON.stringify(subscription));
        const endpoint = subscription.endpoint;
        // [Fix] UserAgent가 없으면 'unknown'으로 설정하여 DB에 NULL 방지
        const userAgent = navigator.userAgent || 'unknown-device';

        if (!endpoint) {
            console.error('[Push] Endpoint is missing in subscription object');
            return false;
        }

        console.log('[Push] Starting DB save logic for user:', user.id);

        // [Updated Logic - Industry Standard]
        // "One Endpoint = One Active User"
        // endpoint가 유니크 키입니다.
        // - 새 기기면: Insert됨.
        // - 기존 기기인데 유저가 바뀌면: Update됨 (기존 유저는 덮어씌워짐 -> 보안상 안전).
        // - 내 기기면: Update됨 (정보 갱신).

        const { error: upsertError } = await supabase
            .from('user_push_subscriptions')
            .upsert({
                // id: ... (Optional, 기존 user_id로 찾을 수 없으므로 endpoint 기준 매칭)
                user_id: user.id,
                endpoint: endpoint,
                subscription: subJson,
                is_admin: isAdmin,
                user_agent: userAgent,
                pref_events: options?.pref_events ?? true,
                pref_lessons: options?.pref_lessons ?? true,
                pref_filter_tags: options?.pref_filter_tags ?? null,
                updated_at: new Date().toISOString()
            }, {
                onConflict: 'endpoint' // [Standard] Endpoint 기준으로 덮어쓰기
            });

        if (upsertError) {
            console.error('[Push] Supabase Upsert Error:', upsertError);
            throw upsertError;
        }

        console.log('[Push] Push subscription saved to Supabase successfully');
        // alert('✅ DB 저장 성공! (기기 등록 완료)'); // 사용자 경험을 위해 Alert 제거 (조용히 성공)
        return true;
    } catch (error: any) {
        console.error('[Push] Fatal error in saveSubscriptionToSupabase:', error);
        throw error;
    }
}

/**
 * 알림 세부 설정(행사, 강습, 태그)만 업데이트
 */
export async function updatePushPreferences(prefs: { pref_events?: boolean, pref_lessons?: boolean, pref_filter_tags?: string[] | null }): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        // [Fix] 현재 기기(endpoint)만 특정해서 업데이트 (다른 기기 설정 덮어쓰기 방지)
        const sub = await getPushSubscription();
        if (!sub || !sub.endpoint) {
            console.error('[Push] Cannot update prefs: No active subscription found on this device.');
            return false;
        }

        const { error } = await supabase
            .from('user_push_subscriptions')
            .update({
                ...prefs,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint); // target only this device

        if (error) throw error;
        console.log('[Push] Preferences updated for this device:', prefs);
        return true;
    } catch (error) {
        console.error('[Push] Failed to update preferences:', error);
        return false;
    }
}

/**
 * 현재 저장된 알림 설정 가져오기
 */
export async function getPushPreferences(): Promise<{ pref_events: boolean, pref_lessons: boolean, pref_filter_tags: string[] | null } | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        // [Fix] 현재 기기의 구독 정보(Endpoint)를 가져와서 해당 기기의 설정만 조회
        const sub = await getPushSubscription();
        if (!sub || !sub.endpoint) {
            // 구독이 없으면 설정도 없는 것
            return null;
        }

        const { data, error } = await supabase
            .from('user_push_subscriptions')
            .select('pref_events, pref_lessons, pref_filter_tags')
            .eq('user_id', user.id)
            .eq('endpoint', sub.endpoint) // [Key] 이 기기의 설정만 조회
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST116') return { pref_events: true, pref_lessons: true, pref_filter_tags: null };
            throw error;
        }
        return data as { pref_events: boolean, pref_lessons: boolean, pref_filter_tags: string[] | null };
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
