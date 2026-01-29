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
        return null;
    }

    try {
        const registration = await navigator.serviceWorker.ready;
        return registration;
    } catch (error) {
        console.error('Service Worker registration check failed:', error);
        return null;
    }
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
    if (!('Notification' in window)) {
        throw new Error('This browser does not support notifications');
    }

    const permission = await Notification.requestPermission();
    console.log('Notification permission:', permission);
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
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            throw new Error('Service Worker not registered');
        }

        const permission = await requestNotificationPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission denied');
        }

        // 기존 구독 확인
        let subscription = await registration.pushManager.getSubscription();

        if (subscription) {
            console.log('Already subscribed to push notifications');
            return subscription;
        }

        // 새 구독 생성
        subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY) as BufferSource
        });

        console.log('Push subscription created:', subscription);

        // 실제 프로덕션에서는 여기서 서버에 구독 정보 저장
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await saveSubscriptionToSupabase(user.id, subscription);
        }

        return subscription;
    } catch (error) {
        console.error('Failed to subscribe to push notifications:', error);
        throw error;
    }
}

/**
 * Supabase에 구독 정보 저장
 */
export async function saveSubscriptionToSupabase(userId: string, subscription: PushSubscription): Promise<void> {
    const { error } = await supabase
        .from('user_push_subscriptions')
        .upsert({
            user_id: userId,
            subscription: subscription.toJSON(),
            updated_at: new Date().toISOString()
        }, {
            onConflict: 'user_id'
        });

    if (error) {
        console.error('Failed to save push subscription to Supabase:', error);
        throw error;
    }
    console.log('Push subscription saved to Supabase');
}

/**
 * 푸시 구독 해제
 */
export async function unsubscribeFromPush(): Promise<boolean> {
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            return false;
        }

        const subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            console.log('No active subscription found');
            return true;
        }

        const successful = await subscription.unsubscribe();
        console.log('Push subscription removed:', successful);

        // 실제 프로덕션에서는 여기서 서버에서도 구독 정보 삭제
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            await removeSubscriptionFromSupabase(user.id);
        }

        return successful;
    } catch (error) {
        console.error('Failed to unsubscribe from push notifications:', error);
        return false;
    }
}

/**
 * Supabase에서 구독 정보 삭제
 */
export async function removeSubscriptionFromSupabase(userId: string): Promise<void> {
    const { error } = await supabase
        .from('user_push_subscriptions')
        .delete()
        .eq('user_id', userId);

    if (error) {
        console.error('Failed to remove push subscription from Supabase:', error);
        throw error;
    }
    console.log('Push subscription removed from Supabase');
}

/**
 * 현재 푸시 구독 상태 확인
 */
export async function getPushSubscription(): Promise<PushSubscription | null> {
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            return null;
        }

        const subscription = await registration.pushManager.getSubscription();
        return subscription;
    } catch (error) {
        console.error('Failed to get push subscription:', error);
        return null;
    }
}

/**
 * 앱 배지 설정 (숫자 표시)
 */
export async function setBadge(count: number): Promise<void> {
    if ('setAppBadge' in navigator) {
        try {
            await (navigator as any).setAppBadge(count);
            console.log('Badge set to:', count);
        } catch (error) {
            console.error('Failed to set badge:', error);
        }
    } else {
        console.warn('Badge API not supported');
    }
}

/**
 * 앱 배지 제거
 */
export async function clearBadge(): Promise<void> {
    if ('clearAppBadge' in navigator) {
        try {
            await (navigator as any).clearAppBadge();
            console.log('Badge cleared');
        } catch (error) {
            console.error('Failed to clear badge:', error);
        }
    } else {
        console.warn('Badge API not supported');
    }
}

/**
 * 테스트용 로컬 알림 표시
 * (실제 푸시 서버 없이 테스트하기 위한 함수)
 */
export async function showTestNotification(title: string, body: string, url: string = '/'): Promise<void> {
    try {
        const registration = await checkServiceWorkerRegistration();
        if (!registration) {
            throw new Error('Service Worker not registered');
        }

        const permission = getNotificationPermission();
        if (permission !== 'granted') {
            throw new Error('Notification permission not granted');
        }

        await registration.showNotification(title, {
            body,
            icon: '/icon-192.png',
            badge: '/icon-192.png',
            tag: 'test-notification',
            data: { url },
            requireInteraction: false
        });

        console.log('Test notification shown');
    } catch (error) {
        console.error('Failed to show test notification:', error);
        throw error;
    }
}
