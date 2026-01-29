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

        const existingSubscription = await registration.pushManager.getSubscription();
        if (existingSubscription) {
            console.log('[Push] Existing subscription found:', existingSubscription);
            await saveSubscriptionToSupabase(existingSubscription); // Assuming saveSubscriptionToSupabase can handle just subscription
            return existingSubscription;
        }

        console.log('[Push] Creating new subscription with VAPID:', VAPID_PUBLIC_KEY);
        const subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
        });

        console.log('[Push] New subscription success:', subscription);
        await saveSubscriptionToSupabase(subscription); // Assuming saveSubscriptionToSupabase can handle just subscription
        return subscription;
    } catch (error) {
        console.error('[Push] subscribeToPush failed:', error);
        return null;
    }
}

/**
 * Supabase에 구독 정보 저장
 */
export async function saveSubscriptionToSupabase(subscription: PushSubscription, isAdmin: boolean = false): Promise<void> {
    console.log(`[Push] Saving subscription (isAdmin: ${isAdmin}) to Supabase...`);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
        console.warn('[Push] No user logged in, cannot save subscription to Supabase.');
        return;
    }

    const subJson = subscription.toJSON();
    const endpoint = subJson.endpoint;

    // 1. 단말기 소유권 정리: 동일한 endpoint(기기)를 가진 다른 유저의 구독 정보가 있다면 먼저 삭제
    await supabase
        .from('user_push_subscriptions')
        .delete()
        .neq('user_id', user.id)
        .filter('subscription->>endpoint', 'eq', endpoint);

    // 2. 현재 유저의 정보를 저장/갱신 (is_admin 플래그 포함)
    const { error } = await supabase
        .from('user_push_subscriptions')
        .upsert({
            user_id: user.id,
            subscription: subJson,
            is_admin: isAdmin, // 관리자 여부 저장
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id'
        });

    if (error) {
        console.error('[Push] Failed to save push subscription to Supabase:', error);
        throw error;
    }
    console.log('[Push] Push subscription saved to Supabase');
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

        const successful = await subscription.unsubscribe();
        console.log('[Push] Push subscription removed from browser:', successful);

        // 실제 프로덕션에서는 여기서 서버에서도 구독 정보 삭제
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await removeSubscriptionFromSupabase(user.id);
        }

        return successful;
    } catch (error) {
        console.error('[Push] Failed to unsubscribe from push notifications:', error);
        return false;
    }
}

/**
 * Supabase에서 구독 정보 삭제
 */
export async function removeSubscriptionFromSupabase(userId: string): Promise<void> {
    console.log(`[Push] Removing subscription for user ${userId} from Supabase...`);
    const { error } = await supabase
        .from('user_push_subscriptions')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('[Push] Failed to remove push subscription from Supabase:', error);
        throw error;
    }
    console.log('[Push] Push subscription removed from Supabase');
}

/**
 * 현재 푸시 구독 상태 확인
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
    console.log('[Push] Getting current push subscription...');
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            console.warn('[Push] No Service Worker registration found for getting subscription.');
            return null;
        }

        const subscription = await registration.pushManager.getSubscription();
        console.log('[Push] Current push subscription:', subscription);
        return subscription;
    } catch (error) {
        console.error('[Push] Failed to get push subscription:', error);
        return null;
    }
}

/**
 * 앱 배지 설정 (숫자 표시)
 */
export async function setBadge(count: number): Promise<void> {
    console.log(`[Push] Attempting to set app badge to ${count}...`);
    if ('setAppBadge' in navigator) {
        try {
            await (navigator as any).setAppBadge(count);
            console.log('[Push] Badge set to:', count);
        } catch (error) {
            console.error('[Push] Failed to set badge:', error);
        }
    } else {
        console.warn('[Push] Badge API not supported');
    }
}

/**
 * 앱 배지 제거
 */
export async function clearBadge(): Promise<void> {
    console.log('[Push] Attempting to clear app badge...');
    if ('clearAppBadge' in navigator) {
        try {
            await (navigator as any).clearAppBadge();
            console.log('[Push] Badge cleared');
        } catch (error) {
            console.error('[Push] Failed to clear badge:', error);
        }
    } else {
        console.warn('[Push] Badge API not supported');
    }
}

/**
 * 테스트용 로컬 알림 표시
 * (실제 푸시 서버 없이 테스트하기 위한 함수)
 */
export async function showTestNotification(title: string, body: string) {
    console.log('[Push] showTestNotification called:', { title, body });
    try {
        if (Notification.permission === 'granted') {
            const registration = await navigator.serviceWorker.ready;
            console.log('[Push] Triggering SW showNotification from registered worker');
            await registration.showNotification(title, {
                body,
                icon: '/icons/icon-192x192.png',
                badge: '/icons/badge-72x72.png',
                data: {
                    dateOfArrival: Date.now(),
                    primaryKey: 1
                }
            });
        } else {
            console.warn('[Push] Show notification failed: Permission not granted. Current:', Notification.permission);
            const perm = await requestNotificationPermission();
            if (perm === 'granted') {
                await showTestNotification(title, body);
            }
        }
    } catch (error) {
        console.error('[Push] showTestNotification error:', error);
    }
}
