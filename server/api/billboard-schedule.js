import express from 'express';
import { createClient } from '@supabase/supabase-js';

const router = express.Router();

const supabaseUrl = process.env.VITE_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

// YouTube videoId 추출 함수
function extractYouTubeId(url) {
  if (!url || !url.trim()) return null;
  
  const patterns = [
    /embed\/([a-zA-Z0-9_-]{11})/,
    /v\/([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /watch\?v=([a-zA-Z0-9_-]{11})/,
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1] && match[1].length === 11) {
      return match[1];
    }
  }
  
  return null;
}

// 이벤트 필터링 함수 (프론트엔드 로직과 동일)
function filterEvents(allEvents, settings) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  return allEvents.filter((event) => {
    // 이미지나 영상이 없으면 제외
    if (!event?.image_full && !event?.image && !event?.video_url) return false;
    
    // 제외된 이벤트
    if (settings.excluded_event_ids.includes(event.id)) return false;
    
    // 요일 필터
    const eventDate = new Date(event.start_date || event.date || "");
    const weekday = eventDate.getDay();
    if (settings.excluded_weekdays.includes(weekday)) return false;
    
    // 날짜 범위 필터 (종료날짜 기준)
    const eventEndDate = new Date(
      event.end_date || event.start_date || event.date || ""
    );
    
    if (settings.date_filter_start && eventEndDate < new Date(settings.date_filter_start))
      return false;
    if (settings.date_filter_end && eventEndDate > new Date(settings.date_filter_end))
      return false;
    
    // 날짜 필터가 없으면 오늘 이후만
    if (!settings.date_filter_start && !settings.date_filter_end) {
      if (eventEndDate < today) return false;
    }
    
    return true;
  });
}

// 스케줄 API
router.get('/:userId/schedule', async (req, res) => {
  try {
    const { userId } = req.params;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId가 필요합니다' });
    }
    
    console.log(`[스케줄 API] 요청: userId=${userId}`);
    
    // 빌보드 사용자 조회
    const { data: user, error: userError } = await supabase
      .from('billboard_users')
      .select('*')
      .eq('id', userId)
      .eq('is_active', true)
      .single();
    
    if (userError || !user) {
      console.error('[스케줄 API] 사용자 조회 실패:', userError);
      return res.status(404).json({ error: '빌보드 사용자를 찾을 수 없습니다' });
    }
    
    // 빌보드 설정 조회
    const { data: settings, error: settingsError } = await supabase
      .from('billboard_user_settings')
      .select('*')
      .eq('billboard_user_id', userId)
      .single();
    
    if (settingsError || !settings) {
      console.error('[스케줄 API] 설정 조회 실패:', settingsError);
      return res.status(404).json({ error: '빌보드 설정을 찾을 수 없습니다' });
    }
    
    // 모든 이벤트 조회
    const { data: allEvents, error: eventsError } = await supabase
      .from('events')
      .select('*')
      .order('start_date', { ascending: true });
    
    if (eventsError) {
      console.error('[스케줄 API] 이벤트 조회 실패:', eventsError);
      return res.status(500).json({ error: '이벤트를 불러올 수 없습니다' });
    }
    
    // 필터링
    const filteredEvents = filterEvents(allEvents || [], settings);
    console.log(`[스케줄 API] 필터링 완료: ${filteredEvents.length}개`);
    
    // 정렬 (random은 APK에서 처리)
    let sortedEvents = [...filteredEvents];
    if (settings.play_order === 'time') {
      sortedEvents.sort((a, b) => 
        new Date(a.start_date || a.date).getTime() - new Date(b.start_date || b.date).getTime()
      );
    } else if (settings.play_order === 'title') {
      sortedEvents.sort((a, b) => a.title.localeCompare(b.title, 'ko'));
    } else if (settings.play_order === 'newest') {
      sortedEvents.sort((a, b) => b.id - a.id);
    }
    
    // 스케줄 생성
    const billboardUrl = `${req.protocol}://${req.get('host')}/billboard/${userId}`;
    const schedule = sortedEvents.map((event) => {
      const videoId = event.video_url ? extractYouTubeId(event.video_url) : null;
      
      if (videoId) {
        // 영상 슬라이드
        return {
          type: 'YOUTUBE',
          duration: settings.video_play_duration || 60,
          content_data: videoId,
          event_id: event.id,
          title: event.title
        };
      } else {
        // 이미지 슬라이드 (웹뷰)
        return {
          type: 'WEB',
          duration: settings.auto_slide_interval || 30,
          content_data: billboardUrl,
          event_id: event.id,
          title: event.title
        };
      }
    });
    
    // 응답
    res.json({
      billboard_user: {
        id: user.id,
        name: user.name
      },
      schedule,
      settings: {
        image_duration: settings.auto_slide_interval || 30,
        video_duration: settings.video_play_duration || 60,
        play_order: settings.play_order || 'sequential',
        total_events: filteredEvents.length
      },
      generated_at: new Date().toISOString()
    });
    
    console.log(`[스케줄 API] 성공: ${schedule.length}개 슬라이드`);
    
  } catch (error) {
    console.error('[스케줄 API] 오류:', error);
    res.status(500).json({ 
      error: '서버 오류가 발생했습니다',
      message: error.message 
    });
  }
});

export default router;
