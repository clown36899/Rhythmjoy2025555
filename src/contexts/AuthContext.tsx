import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao, getKakaoAccessToken } from '../utils/kakaoAuth';

interface KakaoAuthResult {
  email: string;
  name: string;
  isAdmin: boolean;
  isBillboardUser: boolean;
  billboardUserId: string | null;
  billboardUserName: string | null;
}

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithKakao: () => Promise<KakaoAuthResult>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // 5초 timeout 설정 (모바일 네트워크 느릴 때 대응)
    const timeoutId = setTimeout(() => {
      console.warn('[AuthContext] getSession timeout - loading false로 설정');
      setLoading(false);
    }, 5000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeoutId);
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      })
      .catch((error) => {
        console.error('[AuthContext] getSession error:', error);
        clearTimeout(timeoutId);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => {
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signInWithKakao = async () => {
    await initKakaoSDK();
    await loginWithKakao();
    
    const accessToken = getKakaoAccessToken();
    if (!accessToken) {
      throw new Error('카카오 액세스 토큰을 가져올 수 없습니다');
    }

    // 개발 환경(Replit)에서는 Vite 프록시(/api), 프로덕션(Netlify)에서는 Netlify Functions
    const authEndpoint = import.meta.env.DEV 
      ? '/api/auth/kakao'
      : '/.netlify/functions/kakao-auth';
    
    // 재시도 로직 (2단계 인증 대응)
    let lastError: Error | null = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        // 60초 타임아웃 설정
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 60000);
        
        const response = await fetch(authEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            kakaoAccessToken: accessToken,
          }),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || error.message || '인증에 실패했습니다');
        }

        const authData = await response.json();

        // 서버에서 받은 세션으로 자동 로그인
        if (authData.session) {
          const { error } = await supabase.auth.setSession({
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
          });

          if (error) {
            console.error('세션 설정 실패:', error);
            throw new Error('로그인에 실패했습니다');
          }
        }

        return authData;
      } catch (error: any) {
        lastError = error;
        console.warn(`카카오 인증 시도 ${attempt}/3 실패:`, error.message);
        
        // 마지막 시도가 아니면 1초 대기 후 재시도
        if (attempt < 3) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }
    }

    // 3번 모두 실패
    throw lastError || new Error('인증에 실패했습니다');
  };

  const signOut = async () => {
    // 카카오 로그아웃
    await logoutKakao();
    
    // Supabase 로그아웃
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  const isAdmin = user?.email === import.meta.env.VITE_ADMIN_EMAIL || false;

  // 디버깅 로그
  useEffect(() => {
    console.log('[AuthContext] 상태:', {
      user: user?.email,
      isAdmin,
      loading,
      session: !!session
    });
  }, [user, isAdmin, loading, session]);

  return (
    <AuthContext.Provider value={{ user, session, isAdmin, loading, signIn, signInWithKakao, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
