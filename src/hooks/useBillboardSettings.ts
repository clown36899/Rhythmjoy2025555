import { useState, useEffect } from "react";

export interface BillboardSettings {
  enabled: boolean;
  autoSlideInterval: number; // milliseconds
  inactivityTimeout: number; // milliseconds (0 = disabled)
  autoOpenOnLoad: boolean;
  transitionDuration: number; // milliseconds
}

const DEFAULT_SETTINGS: BillboardSettings = {
  enabled: true,
  autoSlideInterval: 5000, // 5초
  inactivityTimeout: 600000, // 10분
  autoOpenOnLoad: true,
  transitionDuration: 300, // 0.3초
};

const STORAGE_KEY = "billboard_settings";

export function useBillboardSettings() {
  const [settings, setSettings] = useState<BillboardSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    const loadSettings = () => {
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          setSettings({ ...DEFAULT_SETTINGS, ...parsed });
        }
      } catch (error) {
        console.error("Error loading billboard settings:", error);
      }
    };

    loadSettings();
  }, []);

  const updateSettings = (updates: Partial<BillboardSettings>) => {
    const newSettings = { ...settings, ...updates };
    setSettings(newSettings);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSettings));
    } catch (error) {
      console.error("Error saving billboard settings:", error);
    }
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error("Error resetting billboard settings:", error);
    }
  };

  return {
    settings,
    updateSettings,
    resetSettings,
  };
}
