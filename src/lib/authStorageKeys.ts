export const isLocalSupabaseRuntime = () =>
  typeof window !== 'undefined'
  && ['localhost', '127.0.0.1', '0.0.0.0'].includes(window.location.hostname)
  && import.meta.env.VITE_FORCE_PROD_SUPABASE !== 'true';

export const getSupabaseStorageKey = () =>
  isLocalSupabaseRuntime() ? 'sb-local-auth-token' : 'sb-auth-token';

export const getSupabaseValidationKey = () =>
  isLocalSupabaseRuntime() ? 'sb-local-validation-time' : 'sb-validation-time';

export const getSupabasePkceVerifierKey = () =>
  `${getSupabaseStorageKey()}-code-verifier`;

const SUPABASE_STORAGE_KEYS = [
  'sb-auth-token',
  'sb-local-auth-token',
];

export const removeSupabaseStorageKeys = () => {
  const keysToRemove: string[] = [];
  const activeStorageKey = getSupabaseStorageKey();

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (
      key === activeStorageKey
      || key.startsWith(`${activeStorageKey}-`)
      || SUPABASE_STORAGE_KEYS.includes(key)
      || SUPABASE_STORAGE_KEYS.some((storageKey) => key.startsWith(`${storageKey}-`))
      || key.includes('supabase.auth.token')
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem('sb-validation-time');
  localStorage.removeItem('sb-local-validation-time');

  return keysToRemove.length;
};
