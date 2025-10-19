
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co'
const supabaseAnonKey = import.meta.env.VITE_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export interface Event {
  id: number;
  title: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  time: string;
  location: string;
  category: string;
  price: string;
  image: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  video_url?: string;
  description: string;
  organizer: string;
  organizer_name?: string;
  organizer_phone?: string;
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
}

export interface BillboardUser {
  id: string;
  name: string;
  password_hash: string;
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
  created_at: string;
  updated_at: string;
}

export interface ThemeSettings {
  id: number;
  background_color?: string;
  calendar_bg_color?: string;
  event_list_bg_color?: string;
  event_list_outer_bg_color?: string;
  header_bg_color?: string;
  page_bg_color?: string;
  default_thumbnail_url?: string | null;
  created_at?: string;
  updated_at?: string;
}
