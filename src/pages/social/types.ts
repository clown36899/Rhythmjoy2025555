// 1. 소셜 그룹 (Group) 타입
export interface SocialGroup {
  id: number;
  name: string;
  type: 'club' | 'bar' | 'other';
  image_url?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  description?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_favorite?: boolean; // UI 용
  password?: string; // 공동 관리 확인용 비밀번호
  board_users?: {
    nickname: string;
  };
}

// 2. 소셜 일정 (Schedule) 타입
export interface SocialSchedule {
  id: number;
  group_id: number;
  title: string;
  date?: string; // 'YYYY-MM-DD'
  day_of_week?: number; // 0 (일) ~ 6 (토)
  start_time?: string; // 'HH:mm:ss'
  place_name?: string;
  address?: string;
  description?: string;
  venue_id?: number;
  image_url?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  link_url?: string; // 외부 링크 URL
  link_name?: string; // 링크 표시 이름
  board_users?: {
    nickname: string;
  };
}

export interface UnifiedSocialEvent {
  id: string; // 'schedule-123' 형태 상속
  originalId: number;
  title: string;
  date: string;
  time?: string;
  place_name?: string;
  type: 'social';
  image_url?: string;
  image_thumbnail?: string;
  image_medium?: string;
  group_id: number;
  author_nickname?: string;
  created_at?: string;
}