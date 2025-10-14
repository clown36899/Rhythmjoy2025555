
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
