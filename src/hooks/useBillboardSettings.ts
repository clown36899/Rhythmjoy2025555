import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";

export interface BillboardSettings {
  enabled: boolean;
  autoSlideInterval: number; // milliseconds
  inactivityTimeout: number; // milliseconds (0 = disabled)
  autoOpenOnLoad: boolean;
  transitionDuration: number; // milliseconds
  transitionEffect: 'none' | 'fade' | 'slide'; // 전환 효과 종류
  dateRangeStart: string | null; // YYYY-MM-DD
  dateRangeEnd: string | null; // YYYY-MM-DD
  showDateRange: boolean; // 날짜 범위 표시 여부
  playOrder: 'sequential' | 'random'; // 재생 순서
  excludedWeekdays: number[]; // 제외할 요일 (0=일요일 ~ 6=토요일)
  excludedEventIds: number[]; // 제외할 이벤트 ID 목록
}

// 오늘 날짜 (YYYY-MM-DD 형식)
const getTodayString = () => {
  const today = new Date();
  return today.toISOString().split('T')[0];
};

const DEFAULT_SETTINGS: BillboardSettings = {
  enabled: true,
  autoSlideInterval: 5000, // 5초
  inactivityTimeout: 300000, // 5분
  autoOpenOnLoad: true,
  transitionDuration: 300, // 0.3초
  transitionEffect: 'fade', // 기본: 페이드 효과
  dateRangeStart: getTodayString(), // 오늘 날짜
  dateRangeEnd: null,
  showDateRange: true,
  playOrder: 'random',
  excludedWeekdays: [],
  excludedEventIds: [],
};

export function useBillboardSettings() {
  const [settings, setSettings] = useState<BillboardSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const { data, error } = await supabase
          .from("billboard_settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (error) {
          console.error("Error loading billboard settings:", error);
          // 테이블이 비어있으면 기본 설정 삽입
          if (error.code === "PGRST116") {
            await supabase.from("billboard_settings").insert({
              id: 1,
              enabled: DEFAULT_SETTINGS.enabled,
              auto_slide_interval: DEFAULT_SETTINGS.autoSlideInterval,
              inactivity_timeout: DEFAULT_SETTINGS.inactivityTimeout,
              auto_open_on_load: DEFAULT_SETTINGS.autoOpenOnLoad,
              transition_duration: DEFAULT_SETTINGS.transitionDuration,
              date_range_start: DEFAULT_SETTINGS.dateRangeStart,
              date_range_end: DEFAULT_SETTINGS.dateRangeEnd,
              show_date_range: DEFAULT_SETTINGS.showDateRange,
              play_order: DEFAULT_SETTINGS.playOrder,
            });
          }
          setSettings(DEFAULT_SETTINGS);
        } else if (data) {
          // DB 데이터를 앱 설정 형식으로 변환
          setSettings({
            enabled: data.enabled ?? DEFAULT_SETTINGS.enabled,
            autoSlideInterval: data.auto_slide_interval ?? DEFAULT_SETTINGS.autoSlideInterval,
            inactivityTimeout: data.inactivity_timeout ?? DEFAULT_SETTINGS.inactivityTimeout,
            autoOpenOnLoad: data.auto_open_on_load ?? DEFAULT_SETTINGS.autoOpenOnLoad,
            transitionDuration: data.transition_duration ?? DEFAULT_SETTINGS.transitionDuration,
            transitionEffect: data.transition_effect ?? DEFAULT_SETTINGS.transitionEffect,
            dateRangeStart: data.date_range_start ?? DEFAULT_SETTINGS.dateRangeStart,
            dateRangeEnd: data.date_range_end ?? DEFAULT_SETTINGS.dateRangeEnd,
            showDateRange: data.show_date_range ?? DEFAULT_SETTINGS.showDateRange,
            playOrder: data.play_order ?? DEFAULT_SETTINGS.playOrder,
            excludedWeekdays: data.excluded_weekdays ?? DEFAULT_SETTINGS.excludedWeekdays,
            excludedEventIds: data.excluded_event_ids ?? DEFAULT_SETTINGS.excludedEventIds,
          });
        }
      } catch (error) {
        console.error("Error loading billboard settings:", error);
        setSettings(DEFAULT_SETTINGS);
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, []);

  const updateSettings = async (updates: Partial<BillboardSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    
    try {
      // RPC 함수를 사용하여 스키마 캐시 이슈 우회
      const { error } = await supabase.rpc('update_billboard_settings', {
        p_enabled: newSettings.enabled,
        p_auto_slide_interval: newSettings.autoSlideInterval,
        p_inactivity_timeout: newSettings.inactivityTimeout,
        p_auto_open_on_load: newSettings.autoOpenOnLoad,
        p_transition_duration: newSettings.transitionDuration,
        p_transition_effect: newSettings.transitionEffect,
        p_date_range_start: newSettings.dateRangeStart,
        p_date_range_end: newSettings.dateRangeEnd,
        p_show_date_range: newSettings.showDateRange,
        p_play_order: newSettings.playOrder,
        p_excluded_weekdays: newSettings.excludedWeekdays,
        p_excluded_event_ids: newSettings.excludedEventIds,
      });

      if (error) {
        console.error("Error saving billboard settings:", error);
      }
    } catch (error) {
      console.error("Error saving billboard settings:", error);
    }
  };

  const resetSettings = async () => {
    setSettings(DEFAULT_SETTINGS);
    
    try {
      // RPC 함수를 사용하여 스키마 캐시 이슈 우회
      const { error } = await supabase.rpc('update_billboard_settings', {
        p_enabled: DEFAULT_SETTINGS.enabled,
        p_auto_slide_interval: DEFAULT_SETTINGS.autoSlideInterval,
        p_inactivity_timeout: DEFAULT_SETTINGS.inactivityTimeout,
        p_auto_open_on_load: DEFAULT_SETTINGS.autoOpenOnLoad,
        p_transition_duration: DEFAULT_SETTINGS.transitionDuration,
        p_transition_effect: DEFAULT_SETTINGS.transitionEffect,
        p_date_range_start: DEFAULT_SETTINGS.dateRangeStart,
        p_date_range_end: DEFAULT_SETTINGS.dateRangeEnd,
        p_show_date_range: DEFAULT_SETTINGS.showDateRange,
        p_play_order: DEFAULT_SETTINGS.playOrder,
        p_excluded_weekdays: DEFAULT_SETTINGS.excludedWeekdays,
        p_excluded_event_ids: DEFAULT_SETTINGS.excludedEventIds,
      });

      if (error) {
        console.error("Error resetting billboard settings:", error);
      }
    } catch (error) {
      console.error("Error resetting billboard settings:", error);
    }
  };

  return {
    settings,
    updateSettings,
    resetSettings,
    isLoading,
  };
}
