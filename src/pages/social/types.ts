export interface SocialPlace {
  id: number;
  name: string;
  address: string;
  latitude: number;
  longitude: number;
  contact?: string;
  description?: string;
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