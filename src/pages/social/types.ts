export interface SocialPlace {
  id: number;
  dbId: number; // 실제 DB의 primary key (수정 시 사용)
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact?: string;
  description?: string;
  imageUrl?: string;
  created_at?: string;
}

// 소셜 일정 데이터 타입
export interface SocialEvent {
  id: number;
  title: string;
  event_date: string;
  image_url: string;
  social_place_id: number;
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
  inquiryContact?: string;
  linkName?: string;
  linkUrl?: string;
  description?: string;
  placeId?: number;
  venueId?: string;
}