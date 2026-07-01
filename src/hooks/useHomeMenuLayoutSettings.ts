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

export const hasHomeMenuLayoutSettingsValue = (
  value?: Partial<HomeMenuLayoutSettings> | null,
) => {
  const normalized = normalizeHomeMenuLayoutSettings(value);
  return normalized.pinnedMenuIds.length > 0 || normalized.menuOrderIds.length > 0;
};

export const areHomeMenuLayoutSettingsEqual = (
  left?: Partial<HomeMenuLayoutSettings> | null,
  right?: Partial<HomeMenuLayoutSettings> | null,
) => {
  const normalizedLeft = normalizeHomeMenuLayoutSettings(left);
  const normalizedRight = normalizeHomeMenuLayoutSettings(right);
  return (
    normalizedLeft.pinnedMenuIds.join('|') === normalizedRight.pinnedMenuIds.join('|') &&
    normalizedLeft.menuOrderIds.join('|') === normalizedRight.menuOrderIds.join('|')
  );
};

const getRowValue = (row: unknown, key: string) => (
  row && typeof row === 'object'
    ? (row as Record<string, unknown>)[key]
    : undefined
);

const rowToHomeMenuLayoutSettings = (row: unknown): HomeMenuLayoutSettings | null => {
  const pinnedValue = getRowValue(row, 'pinned_menu_ids') ?? getRowValue(row, 'pinnedMenuIds');
  const orderValue = getRowValue(row, 'menu_order_ids') ?? getRowValue(row, 'menuOrderIds');

  if (!Array.isArray(pinnedValue) && !Array.isArray(orderValue)) return null;

  const normalizedSettings = normalizeHomeMenuLayoutSettings({
    pinnedMenuIds: pinnedValue,
    menuOrderIds: orderValue,
  });

  return hasHomeMenuLayoutSettingsValue(normalizedSettings) ? normalizedSettings : null;
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

export async function deleteUserHomeMenuLayoutSettings(userId: string) {
  const { error } = await cafe24
    .from(USER_HOME_MENU_SETTINGS_TABLE)
    .delete()
    .eq('user_id', userId);

  if (error) throw error;

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(HOME_MENU_LAYOUT_CHANGE_EVENT, {
      detail: {
        userId,
        deleted: true,
        settings: null,
      },
    }));
  }
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
        customized_at: now,
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
