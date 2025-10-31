import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao, getKakaoAccessToken } from '../utils/kakaoAuth';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithKakao: () => Promise<{ email: string; name: string }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
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

    const response = await fetch('/.netlify/functions/kakao-auth', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        kakaoAccessToken: accessToken,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || error.message || '인증에 실패했습니다');
    }

    const authData = await response.json();

    if (authData.needsOtpVerification) {
      const otp = window.prompt(
        `${authData.email}로 인증 코드를 발송했습니다.\n` +
        '이메일에서 6자리 코드를 확인하여 입력하세요:'
      );

      if (!otp) {
        throw new Error('인증 코드 입력이 취소되었습니다');
      }

      const { error } = await supabase.auth.verifyOtp({
        email: authData.email,
        token: otp,
        type: 'magiclink',
      });

      if (error) throw new Error('인증 코드가 올바르지 않습니다');
    }

    return authData;
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
