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
  address?: string; // Optional: 장소/모임 위치
  link?: string;    // Optional: 관련 링크
  recruit_content?: string; // 신규 모집 내용
  recruit_contact?: string; // 신규 모집 연락처
  recruit_link?: string;    // 신규 모집 링크
  recruit_image?: string;   // 신규 모집 이미지 URL
}

// 2. 소셜 일정 (Schedule) 타입
export interface SocialSchedule {
  id: number | string;
  group_id: number;
  title: string;
  date?: string; // 'YYYY-MM-DD'
  end_date?: string; // 종료일 (기간 행사용)
  event_dates?: string[]; // 다중 날짜 (개별 선택용)
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
  v2_genre?: string;
  v2_category?: string;
  scope?: string;
}

export interface UnifiedSocialEvent {
  id: string; // 'schedule-123' 형태 상속
  originalId: number;
  title: string;
  date?: string;
  dayOfWeek?: number;
  startTime?: string;
  time?: string;
  place_name?: string;
  placeName?: string; // Alias for consistency
  type: 'social';
  image_url?: string;
  imageUrl?: string; // Alias
  image_thumbnail?: string;
  imageUrlThumbnail?: string; // Alias
  image_medium?: string;
  group_id?: number;
  venueId?: number;
  inquiryContact?: string;
  linkName?: string;
  linkUrl?: string;
  description?: string;
  author_nickname?: string;
  created_at?: string;
  scope?: string;
}