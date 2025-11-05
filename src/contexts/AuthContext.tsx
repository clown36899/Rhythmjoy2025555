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
  billboardUserId: string | null;
  billboardUserName: string | null;
  setBillboardUser: (userId: string | null, userName: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithKakao: () => Promise<KakaoAuthResult>;
  signOut: () => Promise<void>;
  signInAsDevAdmin?: () => void; // 개발 환경 전용 - UI 플래그만
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserId');
  });
  const [billboardUserName, setBillboardUserName] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserName');
  });

  useEffect(() => {
    // 로그아웃 직후라면 세션 체크 스킵 (캐시/세션 꼬임 방지)
    const isLoggingOut = localStorage.getItem('isLoggingOut');
    if (isLoggingOut) {
      console.log('[AuthContext] 로그아웃 진행 중 - 세션 체크 스킵');
      localStorage.removeItem('isLoggingOut');
      setLoading(false);
      return;
    }

    // 2초 timeout 설정 (빠른 실패로 UX 개선)
    const timeoutId = setTimeout(() => {
      console.warn('[AuthContext] getSession timeout - loading false로 설정');
      setLoading(false);
    }, 2000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeoutId);
        console.log('[AuthContext] 초기 세션:', {
          hasSession: !!session,
          userEmail: session?.user?.email,
          adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
          isProduction: import.meta.env.PROD
        });
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
    } = supabase.auth.onAuthStateChange((event, session) => {
      console.log('[AuthContext] Auth state changed:', {
        event,
        hasSession: !!session,
        userEmail: session?.user?.email,
        sessionExpiry: session?.expires_at
      });
      
      if (event === 'SIGNED_OUT') {
        // 로그아웃 시 명확히 상태 초기화
        console.log('[AuthContext] 로그아웃 처리');
        setSession(null);
        setUser(null);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        console.log('[AuthContext] 세션 설정:', session?.user?.email);
        setSession(session);
        setUser(session?.user ?? null);
      } else {
        // 기타 이벤트
        console.log('[AuthContext] 기타 이벤트 처리');
        setSession(session);
        setUser(session?.user ?? null);
      }
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
          console.log('[카카오 로그인] Supabase 세션 설정 시작');
          const { data, error } = await supabase.auth.setSession({
            access_token: authData.session.access_token,
            refresh_token: authData.session.refresh_token,
          });

          if (error) {
            console.error('[카카오 로그인] 세션 설정 실패:', error);
            throw new Error('로그인에 실패했습니다');
          }
          
          console.log('[카카오 로그인] Supabase 세션 설정 완료:', {
            hasSession: !!data.session,
            userEmail: data.session?.user?.email
          });
        } else {
          console.error('[카카오 로그인] 서버에서 세션 데이터를 받지 못함');
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

  const setBillboardUser = (userId: string | null, userName: string | null) => {
    setBillboardUserId(userId);
    setBillboardUserName(userName);
    if (userId && userName) {
      localStorage.setItem('billboardUserId', userId);
      localStorage.setItem('billboardUserName', userName);
    } else {
      localStorage.removeItem('billboardUserId');
      localStorage.removeItem('billboardUserName');
    }
  };

  const signOut = async () => {
    // 카카오 로그아웃
    await logoutKakao();
    
    // Supabase 로그아웃
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    
    // Billboard 사용자 정보도 초기화
    setBillboardUser(null, null);
  };

  // 개발 환경 전용 - 단순 플래그 (UI에서만 사용)
  const signInAsDevAdmin = import.meta.env.DEV ? () => {
    // 실제 로그인은 하지 않고, UI에서 관리자 모드 활성화만 트리거
    console.log('[개발 프리패스] 활성화됨 - UI 전용 모드');
  } : undefined;

  // 보안: user와 adminEmail이 모두 존재하고 일치할 때만 관리자
  const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
  const isAdmin = !!(user?.email && adminEmail && user.email === adminEmail);

  // 디버깅 로그 (상세)
  useEffect(() => {
    console.log('[AuthContext] 상태 업데이트:', {
      userEmail: user?.email,
      isAdmin,
      loading,
      hasSession: !!session,
      adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
      comparison: user?.email === import.meta.env.VITE_ADMIN_EMAIL
    });
  }, [user, isAdmin, loading, session]);

  const contextValue: AuthContextType = {
    user,
    session,
    isAdmin,
    loading,
    billboardUserId,
    billboardUserName,
    setBillboardUser,
    signIn,
    signInWithKakao,
    signOut,
    ...(import.meta.env.DEV && { signInAsDevAdmin }),
  };

  return (
    <AuthContext.Provider value={contextValue}>
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
