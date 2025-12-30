import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { useBoardData } from "../contexts/BoardDataContext";

export interface BillboardSettings {
  enabled: boolean;
  autoSlideInterval: number; // milliseconds
  inactivityTimeout: number; // milliseconds (0 = disabled)
  autoOpenOnLoad: boolean;
  transitionDuration: number; // milliseconds
  dateRangeStart: string | null; // YYYY-MM-DD
  dateRangeEnd: string | null; // YYYY-MM-DD
  showDateRange: boolean; // 날짜 범위 표시 여부
  playOrder: 'sequential' | 'random'; // 재생 순서
  excludedWeekdays: number[]; // 제외할 요일 (0=일요일 ~ 6=토요일)
  excludedEventIds: number[]; // 제외할 이벤트 ID 목록
  defaultThumbnailClass?: string; // 강습 기본 썸네일
  defaultThumbnailEvent?: string; // 행사 기본 썸네일
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
  dateRangeStart: getTodayString(), // 오늘 날짜
  dateRangeEnd: null,
  showDateRange: true,
  playOrder: 'random',
  excludedWeekdays: [],
  excludedEventIds: [],
};

export function useBillboardSettings() {
  const { data: boardData, loading, refreshData } = useBoardData();
  const [settings, setSettings] = useState<BillboardSettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (boardData?.billboard_settings) {
      const data = boardData.billboard_settings;
      // DB 데이터를 앱 설정 형식으로 변환 (Map snake_case to camelCase)
      // Note: The RPC returns `row_to_json` which preserves DB column names (snake_case)
      // But the interface in BoardDataContext defined `billboard_settings` with camelCase?
      // Wait, let me check BoardDataContext interface again. 
      // I defined it as CamelCase in previous turn? 
      // No, I pasted `BillboardSettings` interface into `BoardDataContext` which used camelCase?
      // Actually I copied the interface `BillboardSettings` from this file to `BoardDataContext`.
      // But the RPC returns snake_case rows. 
      // So `boardData.billboard_settings` will actually have snake_case keys at runtime despite the TS interface saying camelCase!
      // This is a TS/Runtime mismatch I need to be careful about. 
      // The RPC `row_to_json` returns the row as is. 
      // I should cast `data` to `any` or define a `BillboardSettingsDB` type to handle this safe mapping.

      const rawData = data as any;

      setSettings({
        enabled: rawData.enabled ?? DEFAULT_SETTINGS.enabled,
        autoSlideInterval: rawData.auto_slide_interval ?? rawData.autoSlideInterval ?? DEFAULT_SETTINGS.autoSlideInterval,
        inactivityTimeout: rawData.inactivity_timeout ?? rawData.inactivityTimeout ?? DEFAULT_SETTINGS.inactivityTimeout,
        autoOpenOnLoad: rawData.auto_open_on_load ?? rawData.autoOpenOnLoad ?? DEFAULT_SETTINGS.autoOpenOnLoad,
        transitionDuration: rawData.transition_duration ?? rawData.transitionDuration ?? DEFAULT_SETTINGS.transitionDuration,
        dateRangeStart: rawData.date_range_start ?? rawData.dateRangeStart ?? DEFAULT_SETTINGS.dateRangeStart,
        dateRangeEnd: rawData.date_range_end ?? rawData.dateRangeEnd ?? DEFAULT_SETTINGS.dateRangeEnd,
        showDateRange: rawData.show_date_range ?? rawData.showDateRange ?? DEFAULT_SETTINGS.showDateRange,
        playOrder: rawData.play_order ?? rawData.playOrder ?? DEFAULT_SETTINGS.playOrder,
        excludedWeekdays: rawData.excluded_weekdays ?? rawData.excludedWeekdays ?? DEFAULT_SETTINGS.excludedWeekdays,
        excludedEventIds: rawData.excluded_event_ids ?? rawData.excludedEventIds ?? DEFAULT_SETTINGS.excludedEventIds,
        defaultThumbnailClass: rawData.default_thumbnail_class ?? rawData.defaultThumbnailClass,
        defaultThumbnailEvent: rawData.default_thumbnail_event ?? rawData.defaultThumbnailEvent,
      });
      setIsLoading(false);
    } else if (!loading && !boardData) {
      // Fallback if no data yet (or error)
      setIsLoading(loading);
    }
  }, [boardData, loading]);

  const updateSettings = async (updates: Partial<BillboardSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);

    try {
      // DB 형식으로 변환
      const dbData = {
        id: 1,
        enabled: newSettings.enabled,
        auto_slide_interval: newSettings.autoSlideInterval,
        inactivity_timeout: newSettings.inactivityTimeout,
        auto_open_on_load: newSettings.autoOpenOnLoad,
        transition_duration: newSettings.transitionDuration,
        date_range_start: newSettings.dateRangeStart,
        date_range_end: newSettings.dateRangeEnd,
        show_date_range: newSettings.showDateRange,
        play_order: newSettings.playOrder,
        excluded_weekdays: newSettings.excludedWeekdays,
        excluded_event_ids: newSettings.excludedEventIds,
        default_thumbnail_class: newSettings.defaultThumbnailClass,
        default_thumbnail_event: newSettings.defaultThumbnailEvent,
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("billboard_settings")
        .upsert(dbData, { onConflict: 'id' });

      if (error) {
        console.error("Error saving billboard settings:", error);
      } else {
        // Update successful, refresh global context
        await refreshData();
      }
    } catch (error) {
      console.error("Error saving billboard settings:", error);
    }
  };

  const resetSettings = async () => {
    setSettings(DEFAULT_SETTINGS);

    try {
      const dbData = {
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
        updated_at: new Date().toISOString(),
      };

      const { error } = await supabase
        .from("billboard_settings")
        .upsert(dbData, { onConflict: 'id' });

      if (error) {
        console.error("Error resetting billboard settings:", error);
      } else {
        await refreshData();
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
