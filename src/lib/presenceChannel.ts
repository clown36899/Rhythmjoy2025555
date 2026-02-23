import { supabase } from './supabase';
import type { RealtimeChannel } from '@supabase/supabase-js';
import { generateUUID } from '../utils/uuid';

// 세션 고유 ID
export const sessionId = generateUUID();

// 전역 단일 채널 인스턴스
let channel: RealtimeChannel | null = null;

export const getPresenceChannel = () => {
    if (!channel) {
        // v2로 채널명 변경 (캐시 회피)
        console.log('[Presence] 🛰️ 새로운 채널 생성 (v2):', sessionId);
        channel = supabase.channel('online-users-v2', {
            config: {
                presence: {
                    key: sessionId,
                },
            },
        });
    }
    return channel;
};
