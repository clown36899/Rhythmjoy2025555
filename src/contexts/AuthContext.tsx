import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao } from '../utils/kakaoAuth';

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
    // 카카오 SDK 초기화
    await initKakaoSDK();

    // 카카오 로그인
    const kakaoUser = await loginWithKakao();
    
    const email = kakaoUser.kakao_account.email;
    const name = kakaoUser.kakao_account.profile?.nickname || kakaoUser.kakao_account.name || '카카오 사용자';

    if (!email) {
      throw new Error('카카오 계정에서 이메일을 가져올 수 없습니다. 카카오 계정 설정을 확인해주세요.');
    }

    // 카카오 정보 반환 (회원가입 또는 로그인 프로세스로 연결)
    return { email, name };
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
