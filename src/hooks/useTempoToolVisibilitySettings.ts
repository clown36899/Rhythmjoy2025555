import { useCallback, useEffect, useState } from 'react';
import { cafe24 } from '../lib/cafe24Client';

export interface TempoToolVisibilitySettings {
  hidden: boolean;
  hiddenItemIds: string[];
}

export const TEMPO_TOOL_VISIBILITY_SETTINGS_KEY = 'tempo_tool_visibility';
export const DEFAULT_TEMPO_TOOL_VISIBILITY_SETTINGS: TempoToolVisibilitySettings = {
  hidden: false,
  hiddenItemIds: [],
};

const TEMPO_TOOL_VISIBILITY_CHANGE_EVENT = 'tempo-tool-visibility-change';

export const normalizeTempoToolVisibilitySettings = (
  value?: Partial<TempoToolVisibilitySettings> | null,
): TempoToolVisibilitySettings => {
  const hiddenItemIds = Array.isArray(value?.hiddenItemIds)
    ? Array.from(new Set(value.hiddenItemIds.filter((itemId): itemId is string => typeof itemId === 'string' && itemId.length > 0)))
    : [];

  return {
    hidden: value?.hidden === true,
    hiddenItemIds,
  };
};

export const isTempoToolItemHidden = (
  settings: TempoToolVisibilitySettings,
  itemId: string,
) => (
  itemId === 'tempo-tool'
    ? settings.hidden || settings.hiddenItemIds.includes(itemId)
    : settings.hiddenItemIds.includes(itemId)
);

export async function saveTempoToolVisibilitySettings(
  settings: Partial<TempoToolVisibilitySettings>,
) {
  const normalizedSettings = normalizeTempoToolVisibilitySettings(settings);
  const { error } = await cafe24
    .from('app_settings')
    .upsert(
      {
        key: TEMPO_TOOL_VISIBILITY_SETTINGS_KEY,
        value: normalizedSettings,
        description: '홈 메뉴 앱 숨김 설정',
      },
      { onConflict: 'key' },
    );

  if (error) throw error;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(TEMPO_TOOL_VISIBILITY_CHANGE_EVENT, {
      detail: normalizedSettings,
    }));
  }

  return normalizedSettings;
}

export function useTempoToolVisibilitySettings() {
  const [settings, setSettings] = useState<TempoToolVisibilitySettings>(DEFAULT_TEMPO_TOOL_VISIBILITY_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);

  const reload = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data } = await cafe24
        .from('app_settings')
        .select('value')
        .eq('key', TEMPO_TOOL_VISIBILITY_SETTINGS_KEY)
        .maybeSingle();

      setSettings(normalizeTempoToolVisibilitySettings(data?.value));
    } catch {
      setSettings(DEFAULT_TEMPO_TOOL_VISIBILITY_SETTINGS);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const saveSettings = useCallback(async (nextSettings: Partial<TempoToolVisibilitySettings>) => {
    const savedSettings = await saveTempoToolVisibilitySettings(nextSettings);
    setSettings(savedSettings);
    return savedSettings;
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const handleVisibilityChange = (event: Event) => {
      const detail = (event as CustomEvent<TempoToolVisibilitySettings>).detail;
      if (detail) setSettings(normalizeTempoToolVisibilitySettings(detail));
    };

    window.addEventListener(TEMPO_TOOL_VISIBILITY_CHANGE_EVENT, handleVisibilityChange);
    return () => window.removeEventListener(TEMPO_TOOL_VISIBILITY_CHANGE_EVENT, handleVisibilityChange);
  }, []);

  return {
    settings,
    isLoading,
    reload,
    saveSettings,
  };
}
