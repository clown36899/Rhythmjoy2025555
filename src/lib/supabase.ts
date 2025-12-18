
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

