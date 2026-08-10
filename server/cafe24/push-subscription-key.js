import crypto from 'node:crypto';

const PUSH_SUBSCRIPTION_KEY_PREFIX = 'push:';

export function getPushSubscriptionRecordId(endpoint) {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  return `${PUSH_SUBSCRIPTION_KEY_PREFIX}${crypto.createHash('sha256').update(value).digest('hex')}`;
}

export function isPushSubscriptionRecordId(value) {
  return /^push:[a-f0-9]{64}$/i.test(String(value || ''));
}
