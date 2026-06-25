import { cafe24 } from '../lib/cafe24Client';

export interface HomeMenuLayoutSettings {
  pinnedMenuIds: string[];
  menuOrderIds: string[];
}

export const USER_HOME_MENU_SETTINGS_TABLE = 'user_home_menu_settings';
export const HOME_MENU_LAYOUT_DEFAULTS_TABLE = 'home_menu_layout_defaults';
export const HOME_MENU_LAYOUT_DEFAULT_ID = 'default';

const HOME_MENU_LAYOUT_CHANGE_EVENT = 'home-menu-layout-change';

const uniqueStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value.filter((item): item is string => (
    typeof item === 'string' && item.trim().length > 0
  ))));
};

export const normalizeHomeMenuLayoutSettings = (
  value?: Partial<HomeMenuLayoutSettings> | null,
): HomeMenuLayoutSettings => ({
  pinnedMenuIds: uniqueStringArray(value?.pinnedMenuIds),
  menuOrderIds: uniqueStringArray(value?.menuOrderIds),
});

const getRowValue = (row: unknown, key: string) => (
  row && typeof row === 'object'
    ? (row as Record<string, unknown>)[key]
    : undefined
);

const rowToHomeMenuLayoutSettings = (row: unknown): HomeMenuLayoutSettings | null => {
  const pinnedValue = getRowValue(row, 'pinned_menu_ids') ?? getRowValue(row, 'pinnedMenuIds');
  const orderValue = getRowValue(row, 'menu_order_ids') ?? getRowValue(row, 'menuOrderIds');

  if (!Array.isArray(pinnedValue) && !Array.isArray(orderValue)) return null;

  return normalizeHomeMenuLayoutSettings({
    pinnedMenuIds: pinnedValue,
    menuOrderIds: orderValue,
  });
};

export async function loadDefaultHomeMenuLayoutSettings() {
  const { data, error } = await cafe24
    .from(HOME_MENU_LAYOUT_DEFAULTS_TABLE)
    .select('*')
    .eq('id', HOME_MENU_LAYOUT_DEFAULT_ID)
    .maybeSingle();

  if (error) throw error;
  return rowToHomeMenuLayoutSettings(data);
}

export async function loadUserHomeMenuLayoutSettings(userId: string) {
  const { data, error } = await cafe24
    .from(USER_HOME_MENU_SETTINGS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  return rowToHomeMenuLayoutSettings(data);
}

export async function saveHomeMenuLayoutSettings(
  settings: HomeMenuLayoutSettings,
  options: { userId: string; isAdmin?: boolean },
) {
  const normalizedSettings = normalizeHomeMenuLayoutSettings(settings);
  const now = new Date().toISOString();

  const { error: userError } = await cafe24
    .from(USER_HOME_MENU_SETTINGS_TABLE)
    .upsert(
      {
        user_id: options.userId,
        pinned_menu_ids: normalizedSettings.pinnedMenuIds,
        menu_order_ids: normalizedSettings.menuOrderIds,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );

  if (userError) throw userError;

  if (options.isAdmin) {
    const { error: defaultError } = await cafe24
      .from(HOME_MENU_LAYOUT_DEFAULTS_TABLE)
      .upsert(
        {
          id: HOME_MENU_LAYOUT_DEFAULT_ID,
          pinned_menu_ids: normalizedSettings.pinnedMenuIds,
          menu_order_ids: normalizedSettings.menuOrderIds,
          updated_at: now,
        },
        { onConflict: 'id' },
      );

    if (defaultError) throw defaultError;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOME_MENU_LAYOUT_CHANGE_EVENT, {
      detail: {
        userId: options.userId,
        isAdmin: Boolean(options.isAdmin),
        settings: normalizedSettings,
      },
    }));
  }

  return normalizedSettings;
}
