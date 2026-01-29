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
export async function saveSubscriptionToSupabase(
    subscription: PushSubscription,
    options?: { pref_events?: boolean, pref_lessons?: boolean }
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

        // 1. [Dedup] 같은 기기(브라우저)에서 생성된 기존 '죽은' 구독 정보 삭제
        // (재설치/캐시삭제 시 endpoint가 바뀌므로, 기존 endpoint는 더 이상 유효하지 않음)
        // 1-A. 현재 UserAgent와 일치하는 기록 삭제
        await supabase
            .from('user_push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .eq('user_agent', userAgent);

        // 1-B. [Cleanup] UserAgent가 없는(과거 버그 or 초기 데이터) 기록도 삭제 (중복 방지)
        await supabase
            .from('user_push_subscriptions')
            .delete()
            .eq('user_id', user.id)
            .is('user_agent', null);

        console.log('[Push] Cleaned up old subscriptions for this device.');

        // 2. 새로운 구독 정보 저장
        const { error: insertError } = await supabase
            .from('user_push_subscriptions')
            .insert({
                user_id: user.id,
                endpoint: endpoint,
                subscription: subJson,
                is_admin: isAdmin,
                user_agent: userAgent, // [New] 기기 식별 정보 저장
                pref_events: options?.pref_events ?? true,
                pref_lessons: options?.pref_lessons ?? true,
                updated_at: new Date().toISOString()
            });

        if (insertError) {
            console.error('[Push] Supabase Insert Error:', insertError);
            if (insertError.message?.includes('column') || insertError.code === '42703') {
                alert('DB 스키마 업데이트가 필요합니다. (user_agent, endpoint 컬럼 추가)');
            }
            throw insertError;
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
 * 알림 세부 설정(행사, 강습)만 업데이트
 */
export async function updatePushPreferences(prefs: { pref_events?: boolean, pref_lessons?: boolean }): Promise<boolean> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return false;

        const { error } = await supabase
            .from('user_push_subscriptions')
            .update({
                ...prefs,
                updated_at: new Date().toISOString(),
            })
            .eq('user_id', user.id); // Update preferences for ALL devices of this user

        if (error) throw error;
        console.log('[Push] Preferences updated:', prefs);
        return true;
    } catch (error) {
        console.error('[Push] Failed to update preferences:', error);
        return false;
    }
}

/**
 * 현재 저장된 알림 설정 가져오기
 */
export async function getPushPreferences(): Promise<{ pref_events: boolean, pref_lessons: boolean } | null> {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return null;

        const { data, error } = await supabase
            .from('user_push_subscriptions')
            .select('pref_events, pref_lessons')
            .eq('user_id', user.id)
            .limit(1) // Get preferences from any of the user's devices
            .maybeSingle();

        if (error) {
            if (error.code === 'PGRST116') return { pref_events: true, pref_lessons: true };
            throw error;
        }
        return data as { pref_events: boolean, pref_lessons: boolean };
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
