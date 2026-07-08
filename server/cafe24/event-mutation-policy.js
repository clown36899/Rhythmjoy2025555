export const EVENT_UPDATE_PROTECTED_FIELDS = Object.freeze([
  'id',
  'user_id',
  'created_at',
  'organizer_name',
  'organizer_phone',
  'board_users',
  'password',
]);

export function stripProtectedEventUpdateFields(values = {}, now = new Date().toISOString()) {
  const next = { ...(values || {}) };
  for (const field of EVENT_UPDATE_PROTECTED_FIELDS) {
    delete next[field];
  }
  next.updated_at = now;
  return next;
}

export function preserveProtectedEventMetadata(values = {}, existing = {}) {
  const next = { ...(values || {}) };
  for (const field of EVENT_UPDATE_PROTECTED_FIELDS) {
    if (Object.prototype.hasOwnProperty.call(existing || {}, field)) {
      next[field] = existing[field];
    } else {
      delete next[field];
    }
  }
  return next;
}

export function protectedEventMetadataValue(source = {}, existing = null, key, fallback = null) {
  if (existing && Object.prototype.hasOwnProperty.call(existing, key)) {
    return existing[key];
  }
  if (source && Object.prototype.hasOwnProperty.call(source, key)) {
    return source[key];
  }
  return fallback;
}
