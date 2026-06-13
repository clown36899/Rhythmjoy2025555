export const getAuthStorageKey = () => 'cafe24-auth-token';

export const getAuthValidationKey = () => 'cafe24-validation-time';

export const getAuthPkceVerifierKey = () =>
  `${getAuthStorageKey()}-code-verifier`;

const LEGACY_AUTH_STORAGE_KEYS = [
  'sb-auth-token',
  'sb-local-auth-token',
  'cafe24-auth-token',
];

export const removeLegacyAuthStorageKeys = () => {
  const keysToRemove: string[] = [];
  const activeStorageKey = getAuthStorageKey();

  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    if (!key) continue;

    if (
      key === activeStorageKey
      || key.startsWith(`${activeStorageKey}-`)
      || LEGACY_AUTH_STORAGE_KEYS.includes(key)
      || LEGACY_AUTH_STORAGE_KEYS.some((storageKey) => key.startsWith(`${storageKey}-`))
      || key.includes('.auth.token')
    ) {
      keysToRemove.push(key);
    }
  }

  keysToRemove.forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem('cafe24-validation-time');
  localStorage.removeItem('sb-validation-time');
  localStorage.removeItem('sb-local-validation-time');

  return keysToRemove.length;
};
