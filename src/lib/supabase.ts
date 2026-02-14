
console.log('%c[Supabase] 🚀 supabase.ts module execution started', 'background: #ff00ff; color: white; font-weight: bold;');
import { createClient } from '@supabase/supabase-js'
import { authLogger } from '../utils/authLogger';
import { isPWAMode } from './pwaDetect';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// 환경변수 디버깅 (외부 브라우저 확인용)
// console.log('[Supabase] 환경변수 확인:', {
//   url: supabaseUrl,
//   hasAnonKey: !!supabaseAnonKey && supabaseAnonKey !== 'placeholder-anon-key',
//   adminEmail: import.meta.env.VITE_ADMIN_EMAIL || '없음'
// });

// [Critical Fix] Safari/iOS 및 PWA 환경의 navigator.locks 결함 대응
// 락 지연으로 인한 앱 부팅 중단을 막기 위해 모든 환경에서 락을 우회합니다.
console.log('%c[Supabase] 🔓 Unconditional Lock Bypass Active (v48)', 'background: #ff00ff; color: white; font-weight: bold;');

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    storageKey: 'sb-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    // 락 지연 방지: 더미 락 제공
    lockTerminatedContext: false,
    lock: function (name, timeout, fn) {
      return fn();
    }
  } as any,
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

authLogger.log('[Supabase] ✅ Client initialized');

export interface Event {
  id: number | string;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  event_dates?: string[]; // 특정 날짜들 (예: ["2025-01-11", "2025-01-25", "2025-01-31"])
  time: string;
  location: string;
  location_link?: string;
  category: string;
  genre?: string | null; // [New] 장르 추가
  price: string;
  image: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string | null;
  description?: string | null;
  organizer: string;
  organizer_name?: string;
  organizer_phone?: string | null;
  contact?: string;
  capacity?: number | null;
  registered?: number | null;
  link1?: string | null;
  link2?: string | null;
  link3?: string | null;
  link_name1?: string | null;
  link_name2?: string | null;
  link_name3?: string | null;
  password?: string | null;
  created_at?: string;
  updated_at?: string;
  user_id?: string | null;
  show_title_on_billboard?: boolean | null; // 👈 이 줄을 추가해주세요
  venue_id?: string | null;
  venue_name?: string | null;
  venue_custom_link?: string | null;
  storage_path?: string | null;
  scope?: string;
  views?: number; // Added for analytics
}

export interface BillboardUser {
  id: string;
  name: string;
  password_hash: string;
  auth_user_id?: string;
  email?: string;
  created_at: string;
  is_active: boolean;
}

export interface BillboardUserSettings {
  id: number;
  billboard_user_id: string;
  excluded_weekdays: number[];
  excluded_event_ids: number[];
  auto_slide_interval: number;
  transition_duration: number;
  play_order: 'sequential' | 'random';
  date_filter_start: string | null;
  date_filter_end: string | null;
  video_play_duration: number;
  effect_type?: string;
  effect_speed?: number;
  auto_slide_interval_video?: number;
  created_at: string;
  updated_at: string;
}

export interface BillboardSettings {
  id: number;
  enabled: boolean;
  auto_slide_interval: number;
  inactivity_timeout: number;
  auto_open_on_load: boolean;
  transition_duration: number;
  date_range_start: string | null;
  date_range_end: string | null;
  show_date_range: boolean;
  play_order: 'sequential' | 'random';
  excluded_weekdays: number[];
  excluded_event_ids: number[];
  default_thumbnail_url?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  email: string;
  invited_by: string;
  role: string;
  token: string;
  expires_at: string;
  used: boolean;
  created_at: string;
  updated_at: string;
}

export interface BoardComment {
  id: string;
  post_id: number;
  user_id: string;
  author_name: string;
  author_nickname?: string;
  author_profile_image?: string;
  content: string;
  created_at: string;
  updated_at: string;
  password?: string;
  likes?: number;
  dislikes?: number;
}

export interface EventFavorite {
  id: number;
  user_id: string;
  event_id: number;
  created_at: string;
}

export interface MetronomePreset {
  id: string;
  user_id: string;
  name: string;
  bpm: number;
  beats: number;
  subdivision: number;
  swing_factor: number;
  offbeat_13_accent: number;
  offbeat_24_accent: number;
  downbeat_13_accent: number;
  backbeat_accent: number;
  triplet_2nd_accent: number;
  triplet_3rd_swing: number;
  sound_id: string;
  beat_volumes: number[];
  created_at: string;
}

// 세션 검증 결과 캐싱 및 락킹을 위한 변수
let lastValidationTime = 0;
const VALIDATION_CACHE_TIME = 60000; // 60초
let validationPromise: Promise<any> | null = null;

/**
 * 세션 유효성 검증 및 자동 복구
 * @returns 유효한 세션 또는 null
 */
export const validateAndRecoverSession = async (): Promise<any> => {
  // 1. 이미 검증이 진행 중이라면 해당 프로미스 반환 (중복 호출 방지)
  if (validationPromise) {
    authLogger.log('[Supabase] 🔄 Already validating, returning existing promise');
    return validationPromise;
  }

  validationPromise = (async () => {
    let localSession: any = null;
    const now = Date.now();
    try {
      authLogger.log('[Supabase] 🚀 validateAndRecoverSession started');

      // [Safari Fix] 사파리에서 localStorage 로드가 늦어지는 'Ghost Storage' 현상 대응
      if (typeof window !== 'undefined') {
        const checkToken = () => !!localStorage.getItem('sb-auth-token');

        if (!checkToken()) {
          authLogger.log('[Supabase] ⏳ Safari: Token not found yet. Waiting 300ms and retrying...');
          await new Promise(resolve => setTimeout(resolve, 300));
        }

        if (checkToken()) {
          authLogger.log('[Supabase] ✅ Safari: Token ignited/detected successfully');
        } else {
          authLogger.log('[Supabase] ℹ️ Safari: No token in storage after wait');
        }
      }

      authLogger.log('[Supabase] 🔍 Calling supabase.auth.getSession() with 4s timeout...');
      const firstGetSession = Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Initial getSession timeout')), 4000))
      ]);

      let cachedSession = null;
      try {
        const result = await firstGetSession as any;
        cachedSession = result.data?.session;
      } catch (e) {
        authLogger.log('[Supabase] ⏱️ Initial getSession timed out/failed (Possible deadlock)');
      }

      localSession = cachedSession;
      authLogger.log('[Supabase] 📥 First getSession() result:', { hasSession: !!localSession });

      if (localSession && (now - lastValidationTime < VALIDATION_CACHE_TIME)) {
        authLogger.log('[Supabase] ⚡ Using short-circuit cache');
        return localSession;
      }

      // 3. 서버 실시간 세션 확인 (타임아웃 포함)
      authLogger.log('[Supabase] 🌐 Racing getSession() with 5s timeout...');
      const getSessionWithTimeout = Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        )
      ]);

      let session = localSession;
      let error = null;

      try {
        const result = await getSessionWithTimeout as any;
        if (result.data?.session) {
          session = result.data.session;
          authLogger.log('[Supabase] ✅ Server session retrieved');
        }
        error = result.error;
      } catch (timeoutErr) {
        authLogger.log('[Supabase] ⏱️ getSession timeout - using local session');
      }

      // 4. 에러 핸들링
      if (error) {
        authLogger.log('[Supabase) ❌ Session error:', error);
        const urlParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash;
        const hasAuthParams = urlParams.has('code') || urlParams.has('error') || hash.includes('access_token=') || hash.includes('refresh_token=');

        if (!hasAuthParams && (error.message?.includes('token_revoked') || error.message?.includes('Refresh Token has been revoked'))) {
          authLogger.log('[Supabase] 🗑️ Token revoked - clearing local');
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        return session;
      }

      if (!session) {
        authLogger.log('[Supabase] ℹ️ No session after all checks');
        return null;
      }

      // 5. 세션 만료 및 갱신 체크
      if (session.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000);
        if (expiresAt.getTime() - Date.now() < 60000) {
          authLogger.log('[Supabase) ⏰ Refreshing expiring session...');
          const { data, error: refreshError } = await supabase.auth.refreshSession();
          if (!refreshError && data.session) {
            authLogger.log('[Supabase] ✅ Session refreshed');
            lastValidationTime = Date.now();
            return data.session;
          }
        }
      }

      // 6. 최종 서버 유저 검증 (타임아웃 포함)
      authLogger.log('[Supabase] 🔐 Verifying user with server...');
      const getUserWithTimeout = Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getUser timeout')), 10000)
        )
      ]);

      try {
        const { error: userError } = await getUserWithTimeout as any;
        if (userError) {
          authLogger.log('[Supabase] ❌ User verification failed:', userError);
          const isFatal = (userError as any).status === 401 || (userError as any).status === 403;
          if (isFatal) {
            await supabase.auth.signOut({ scope: 'local' });
            return null;
          }
        }
      } catch (e) {
        authLogger.log('[Supabase] ⏱️ getUser timeout - proceeding');
      }

      lastValidationTime = Date.now();
      return session;
    } catch (e) {
      authLogger.log('[Supabase] 💥 recovery failed:', e);
      return localSession;
    } finally {
      validationPromise = null;
    }
  })();

  return validationPromise;
};

/**
 * 세션 에러인지 확인
 */
export const isSessionError = (error: any): boolean => {
  if (!error) return false;
  const message = error.message || error.toString() || '';
  return (
    message.includes('session') ||
    message.includes('JWT') ||
    message.includes('expired') ||
    message.includes('invalid') ||
    message.includes('unauthorized') ||
    message.includes('auth')
  );
};
