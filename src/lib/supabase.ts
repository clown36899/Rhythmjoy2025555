
import { createClient } from '@supabase/supabase-js'

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
  id: number;
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
  video_url?: string;
  description: string;
  organizer: string;
  organizer_name?: string;
  organizer_phone?: string;
  contact?: string;
  capacity: number;
  registered: number;
  link1?: string;
  link2?: string;
  link3?: string;
  link_name1?: string;
  link_name2?: string;
  link_name3?: string;
  password?: string;
  created_at?: string;
  updated_at?: string;
  user_id?: string | null;
  show_title_on_billboard?: boolean | null; // 👈 이 줄을 추가해주세요
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
}


/**
 * 세션 유효성 검증 및 자동 복구
 * @returns 유효한 세션 또는 null
 */
export const validateAndRecoverSession = async (): Promise<any> => {
  try {
    console.log('[Supabase] 🔍 Validating session...');
    const { data: { session }, error } = await supabase.auth.getSession();

    // 에러 발생 시 세션 정리
    if (error) {
      console.error('[Supabase] ❌ Session validation error:', error);
      await supabase.auth.signOut({ scope: 'local' });
      return null;
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

      // 만료되었으면 갱신 시도
      if (expiresAt < now) {
        console.warn('[Supabase] ⏰ Session expired, attempting refresh...');
        const { data, error: refreshError } = await supabase.auth.refreshSession();

        if (refreshError) {
          console.error('[Supabase] ❌ Session refresh failed:', refreshError);
          await supabase.auth.signOut({ scope: 'local' });
          return null;
        }

        console.log('[Supabase] ✅ Session refreshed successfully');
        return data.session;
      }
    }

    // [중요] 로컬 스토리지의 토큰이 위변조되었거나 서버에서 만료되었는지 확실히 검증하기 위해 getUser() 호출
    // getSession()은 로컬 상태만 확인할 수 있어 위변조된 토큰도 유효하다고 판단할 수 있음
    console.log('[Supabase] 🔐 Verifying token with server (getUser)...');
    const { error: userError } = await supabase.auth.getUser();

    if (userError) {
      console.error('[Supabase] ❌ Token validation failed on server:', userError);
      // 토큰 서명 불일치 등 서버에서 거부된 경우 -> 강제 로그아웃
      await supabase.auth.signOut({ scope: 'local' });
      return null;
    }

    console.log('[Supabase] ✅ Session is valid and verified by server');
    return session;
  } catch (e) {
    console.error('[Supabase] 💥 Session recovery failed:', e);
    // 복구 실패 시 세션 정리
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (signOutError) {
      console.warn('[Supabase] SignOut after recovery failure also failed:', signOutError);
    }
    return null;
  }
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
