import { createCafe24SupabaseCompat } from './cafe24SupabaseCompat';

export type AuthChangeEvent = string;
export type RealtimeChannel = ReturnType<ReturnType<typeof createCafe24SupabaseCompat>['channel']>;
export type Session = {
  access_token?: string;
  refresh_token?: string;
  expires_at?: number;
  user?: User | null;
};
export type SupabaseClient = ReturnType<typeof createCafe24SupabaseCompat>;
export type User = {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
  user_metadata?: Record<string, unknown>;
  identities?: Array<{ provider?: string }>;
  [key: string]: unknown;
};

export function createClient(): SupabaseClient {
  return createCafe24SupabaseCompat();
}
