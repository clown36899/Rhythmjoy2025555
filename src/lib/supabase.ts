
import { createClient } from '@supabase/supabase-js'
import { authLogger } from '../utils/authLogger';

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

// 환경변수 디버깅 (외부 브라우저 확인용)
console.log('[Supabase] 환경변수 확인:', {
  url: supabaseUrl,
  hasAnonKey: !!supabaseAnonKey && supabaseAnonKey !== 'placeholder-anon-key',
  adminEmail: import.meta.env.VITE_ADMIN_EMAIL || '없음'
});

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    // 🔥 PWA와 브라우저 세션 분리: 스토리지를 공유하면서 발생하는 좀비 세션 문제 해결
    storageKey: typeof window !== 'undefined' ?
      (() => {
        const isStandalone = (
          window.matchMedia('(display-mode: standalone)').matches ||
          window.matchMedia('(display-mode: fullscreen)').matches ||
          window.matchMedia('(display-mode: minimal-ui)').matches ||
          (window.navigator as any).standalone
        );
        const key = isStandalone ? 'sb-pwa-auth-token' : 'sb-browser-auth-token';
        console.log(`[Supabase Init] Mode: ${isStandalone ? 'PWA' : 'Browser'}, Key: ${key}`);
        // Cannot use authLogger here because it might not be safe in all contexts, sticking to console
        return key;
      })()
      : 'sb-auth-token',
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce', // 프로덕션 환경에서 세션 유지를 위해 필수
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

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

// 세션 검증 결과 캐싱 및 락킹을 위한 변수
let lastValidationTime = 0;
const VALIDATION_CACHE_TIME = 60000; // 60초
let validationPromise: Promise<any> | null = null;

/**
 * 세션 유효성 검증 및 자동 복구
 * @returns 유효한 세션 또는 null
 */
export const validateAndRecoverSession = async (): Promise<any> => {
  // 1. 이미 검증이 진행 중이라면 해당 프로미스 반환 (중복 호출 방지/락킹)
  if (validationPromise) {
    authLogger.log('[Supabase] 🔄 Waiting for existing validation promise...');
    return validationPromise;
  }

  // 검증 프로세스를 프로미스 변수에 할당하여 락킹 시작
  validationPromise = (async () => {
    try {
      const now = Date.now();

      // 1. 단기 캐시 확인 (60초 이내면 서버 호출 없이 로컬 세션 반환)
      const { data: { session: localSession } } = await supabase.auth.getSession();

      if (localSession && (now - lastValidationTime < VALIDATION_CACHE_TIME)) {
        authLogger.log('[Supabase] ⚡ Using cached session validation (Short-circuit)');
        return localSession;
      }

      console.log('[Supabase] 🔍 Validating session with server...');

      // 🔥 getSession()에도 타임아웃 추가 (모바일에서 무한 대기 방지)
      const getSessionWithTimeout = Promise.race([
        supabase.auth.getSession(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getSession timeout')), 5000)
        )
      ]);

      let session = localSession;
      let error;
      try {
        const result = await getSessionWithTimeout as any;
        if (result.data?.session) {
          session = result.data.session;
        }
        error = result.error;
      } catch (timeoutError) {
        console.warn('[Supabase] ⏱️ getSession() timeout - utilizing local session');
        session = localSession;
      }

      // 에러 발생 시 세션 정리 (Refresh 한도 초과 등)
      if (error) {
        authLogger.log('[Supabase] ❌ Session validation error:', error);
        if (error.message?.includes('token_revoked') || error.message?.includes('Refresh Token has been revoked')) {
          console.error('[Supabase] 🗑️ Token revoked - clearing local session');
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }
        return session; // 일반 에러는 일단 로컬 세션 유지
      }

      // 세션이 없으면 null 반환
      if (!session) {
        console.log('[Supabase] ℹ️ No session found');
        return null;
      }

      // 세션 만료 체크
      if (session.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000);
        const now = new Date();

        // 만료되었거나 곧 만료(1분 이내)되면 갱신 시도
        if (expiresAt.getTime() - now.getTime() < 60000) {
          authLogger.log('[Supabase] ⏰ Session expiring soon, attempting refresh...');
          const { data, error: refreshError } = await supabase.auth.refreshSession();

          if (refreshError) {
            authLogger.log('[Supabase] ❌ Session refresh failed:', refreshError);
            if (refreshError.message?.includes('token_revoked') || refreshError.message?.includes('Refresh Token has been revoked')) {
              await supabase.auth.signOut({ scope: 'local' });
              return null;
            }
            return session;
          }

          console.log('[Supabase] ✅ Session refreshed successfully');
          lastValidationTime = Date.now();
          return data.session;
        }
      }

      // [중요] 로컬 스토리지의 토큰 위변조 여부 확인을 위해 getUser() 호출
      console.log('[Supabase] 🔐 Verifying token with server (getUser)...');

      const getUserWithTimeout = Promise.race([
        supabase.auth.getUser(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('getUser timeout')), 10000)
        )
      ]);

      try {
        const { error: userError } = await getUserWithTimeout as any;

        if (userError) {
          console.error('[Supabase] ❌ Token validation failed on server:', userError);
          const isAuthError = (userError as any).status === 401 ||
            (userError as any).status === 403 ||
            userError.message?.toLowerCase().includes('invalid') ||
            userError.message?.toLowerCase().includes('expired') ||
            userError.message?.toLowerCase().includes('not found') ||
            userError.message?.toLowerCase().includes('revoked');

          if (isAuthError) {
            authLogger.log('[Supabase] 🗑️ Clearing invalid/expired session', { message: userError.message });
            await supabase.auth.signOut({ scope: 'local' });
            return null;
          }
        }
      } catch (timeoutError) {
        console.warn('[Supabase] ⏱️ getUser() timeout - proceeding with local session');
        return session;
      }

      console.log('[Supabase] ✅ Session is valid and verified by server');
      lastValidationTime = Date.now();
      return session;
    } catch (e) {
      console.error('[Supabase] 💥 Session recovery failed:', e);
      return null;
    } finally {
      // 락 해제
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
