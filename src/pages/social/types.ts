// 1. 소셜 집단 (Group) 타입
export interface SocialGroup {
  id: number;
  name: string;
  type: 'club' | 'bar' | 'etc';
  image_url?: string;
  description?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  is_favorite?: boolean; // UI 용
}

// 2. 소셜 일정 (Schedule) 타입
export interface SocialSchedule {
  id: number;
  group_id: number;
  title: string;
  date?: string; // 특정 날짜 (YYYY-MM-DD)
  day_of_week?: number; // 0:일 ~ 6:토
  start_time?: string;
  description?: string;
  image_url?: string;
  image_micro?: string;
  image_thumbnail?: string;
  image_medium?: string;
  image_full?: string;
  venue_id?: string;
  place_name?: string;
  address?: string;
  user_id: string;
  created_at: string;
  updated_at: string;
}

export interface UnifiedSocialEvent {
  id: string;
  type: 'event' | 'schedule';
  originalId: number;
  title: string;
  placeName?: string;
  dayOfWeek?: number;
  startTime?: string;
  date?: string;
  imageUrl?: string;
  imageUrlThumbnail?: string;
  imageUrlMedium?: string;
  inquiryContact?: string;
  linkName?: string;
  linkUrl?: string;
  description?: string;
  placeId?: number;
  venueId?: string;
}