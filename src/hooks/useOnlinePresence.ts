import { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../contexts/AuthContext';
import type { RealtimeChannel } from '@supabase/supabase-js';

export let globalPresenceChannel: RealtimeChannel | null = null;
export let globalPresenceState: any = {};
const listeners = new Set<(state: any) => void>();

// 세션 ID는 모듈 레벨에서 고정 (새로고침 전까지 유지)
const sessionId = crypto.randomUUID();

export function useOnlinePresence() {
    const { user, userProfile } = useAuth();
    const [isSubscribed, setIsSubscribed] = useState(false);

    // 중복 전송 방지용 Ref
    const lastTrackedRef = useRef<string | null>(null);

    const notifyListeners = () => {
        if (!globalPresenceChannel) return;
        globalPresenceState = globalPresenceChannel.presenceState();
        listeners.forEach(listener => listener(globalPresenceState));
    };

    const trackUser = async () => {
        if (!globalPresenceChannel) return;

        const type = user ? 'logged_in' : 'anonymous';

        // 데이터 식별 키 생성 (타입이나 프로필이 바뀌었을 때만 전송)
        const dataKey = `${type}-${user?.id}-${userProfile?.nickname}`;

        if (lastTrackedRef.current === dataKey) {
            console.log('[Presence] 🚫 중복 트래킹 방지:', type);
            return;
        }

        const presenceData = {
            session_id: sessionId,
            user_id: user?.id || null,
            nickname: userProfile?.nickname || null,
            profile_image_url: userProfile?.profile_image || null,
            type: type,
            online_at: new Date().toISOString(),
        };

        try {
            console.log(`[Presence] 📤 트래킹 전송: ${type}`);
            const res = await globalPresenceChannel.track(presenceData);
            if (res === 'ok') {
                lastTrackedRef.current = dataKey; // 전송 성공 시에만 갱신
            }
        } catch (e) {
            console.error('[Presence] ❌ 트래킹 실패:', e);
        }
    };

    // 1. 채널 생성 및 구독
    useEffect(() => {
        if (!globalPresenceChannel) {
            console.log('[Presence] 🛰️ 채널 생성');
            globalPresenceChannel = supabase.channel('online-users');

            globalPresenceChannel
                .on('presence', { event: 'sync' }, () => notifyListeners())
                .on('presence', { event: 'join' }, () => notifyListeners())
                .on('presence', { event: 'leave' }, () => notifyListeners());

            globalPresenceChannel.subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    setIsSubscribed(true);
                }
            });
        } else {
            if (globalPresenceChannel.state === 'joined') {
                setIsSubscribed(true);
            }
        }
    }, []);

    // 2. 통합 트리거
    useEffect(() => {
        if (isSubscribed) {
            trackUser();
        }
    }, [isSubscribed, user, userProfile]);
}

export function subscribeToPresence(callback: (state: any) => void) {
    listeners.add(callback);
    // 구독 즉시 현재 상태 전달
    if (Object.keys(globalPresenceState).length > 0) {
        callback(globalPresenceState);
    }
    return () => listeners.delete(callback);
}
