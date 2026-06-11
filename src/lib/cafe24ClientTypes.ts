import { createCafe24DataCompat } from './cafe24DataCompat';

export type AuthChangeEvent = string;
export type RealtimeChannel = ReturnType<ReturnType<typeof createCafe24DataCompat>['channel']>;
export type Session = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: User | null;
};
export type SupabaseClient = ReturnType<typeof createCafe24DataCompat>;
export type User = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string }>;
  [key: string]: unknown;
};

export function createClient(): SupabaseClient {
  return createCafe24DataCompat();
}
