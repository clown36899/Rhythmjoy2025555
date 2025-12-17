import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao, getKakaoAccessToken } from '../utils/kakaoAuth';
import { setUserProperties, logEvent } from '../lib/analytics';

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
  const [isAdmin, setIsAdmin] = useState(false);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserId');
  });
  const [billboardUserName, setBillboardUserName] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserName');
  });

  // 관리자 권한 계산 헬퍼 함수
  const computeIsAdmin = (currentUser: User | null): boolean => {
    if (!currentUser) return false;

    // 1순위: app_metadata의 is_admin 플래그 확인
    if (currentUser.app_metadata?.is_admin === true) {
      return true;
    }

    // 2순위: 이메일 비교 (fallback)
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    return !!(currentUser.email && adminEmail && currentUser.email === adminEmail);
  };

  useEffect(() => {
    let isMounted = true; // 마운트 상태 추적

    // 로그아웃 직후라면 세션 체크 스킵 (캐시/세션 꼬임 방지)
    const isLoggingOut = localStorage.getItem('isLoggingOut');
    if (isLoggingOut) {
      console.log('[AuthContext] 로그아웃 진행 중 - 세션 체크 스킵');
      localStorage.removeItem('isLoggingOut');
      if (isMounted) {
        setLoading(false);
      }
      return;
    }

    // 2초 timeout 설정 (빠른 실패로 UX 개선)
    const timeoutId = setTimeout(() => {
      if (isMounted) {
        console.warn('[AuthContext] getSession timeout - loading false로 설정');
        setLoading(false);
      }
    }, 2000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        if (!isMounted) return; // 언마운트 후 실행 방지

        clearTimeout(timeoutId);
        const currentUser = session?.user ?? null;
        const adminStatus = computeIsAdmin(currentUser);

        console.log('[AuthContext] 초기 세션:', {
          hasSession: !!session,
          userEmail: currentUser?.email,
          appMetadataIsAdmin: currentUser?.app_metadata?.is_admin,
          isAdmin: adminStatus,
          adminEmail: import.meta.env.VITE_ADMIN_EMAIL,
          isProduction: import.meta.env.PROD
        });

        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);
        setLoading(false);
      })
      .catch((error) => {
        if (!isMounted) return; // 언마운트 후 실행 방지

        console.error('[AuthContext] getSession error:', error);
        clearTimeout(timeoutId);
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMounted) return; // 언마운트 후 실행 방지

      const currentUser = session?.user ?? null;
      const adminStatus = computeIsAdmin(currentUser);

      console.log('[AuthContext] Auth state changed:', {
        event,
        hasSession: !!session,
        userEmail: currentUser?.email,
        appMetadataIsAdmin: currentUser?.app_metadata?.is_admin,
        isAdmin: adminStatus,
        sessionExpiry: session?.expires_at
      });

      if (event === 'SIGNED_OUT') {
        // 로그아웃 시 명확히 상태 초기화
        console.log('[AuthContext] 로그아웃 처리');
        setSession(null);
        setUser(null);
        setIsAdmin(false);
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') {
        console.log('[AuthContext] 세션 설정:', currentUser?.email);
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);

        // Analytics: Set user properties
        if (currentUser) {
          setUserProperties({
            user_type: adminStatus ? 'admin' : 'user',
            login_status: 'logged_in'
          });
          if (event === 'SIGNED_IN') {
            logEvent('Auth', 'Login', 'Success');
          }
        }
      } else {
        // 기타 이벤트
        console.log('[AuthContext] 기타 이벤트 처리');
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);
      }
    });

    return () => {
      isMounted = false; // cleanup 시 마운트 상태 false
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
    // localStorage에 로그 저장 (새로고침 후에도 확인 가능)
    const logToStorage = (msg: string) => {
      const logs = JSON.parse(localStorage.getItem('login_debug_logs') || '[]');
      logs.push(`${new Date().toISOString().split('T')[1].slice(0, 12)} - ${msg}`);
      localStorage.setItem('login_debug_logs', JSON.stringify(logs));
      console.log(msg);
    };

    // 이전 로그 초기화
    localStorage.removeItem('login_debug_logs');

    logToStorage('[signInWithKakao] ========== 로그인 시작 ==========');

    try {
      logToStorage('[signInWithKakao] 1단계: 카카오 SDK 초기화');
      await initKakaoSDK();
      logToStorage('[signInWithKakao] 1단계: 카카오 SDK 초기화 완료');

      logToStorage('[signInWithKakao] 2단계: 카카오 로그인 팝업');
      await loginWithKakao();
      logToStorage('[signInWithKakao] 2단계: 카카오 로그인 완료');

      const accessToken = getKakaoAccessToken();
      if (!accessToken) {
        logToStorage('[signInWithKakao] ❌ 액세스 토큰 없음');
        throw new Error('카카오 액세스 토큰을 가져올 수 없습니다');
      }
      logToStorage('[signInWithKakao] 3단계: 액세스 토큰 획득 완료');

      // 개발 환경(Replit)에서는 Vite 프록시(/api), 프로덕션(Netlify)에서는 Netlify Functions
      // 함수 이름을 kakao-auth -> kakao-login으로 변경하여 캐시/빌드 문제 회피
      const authEndpoint = import.meta.env.DEV
        ? '/.netlify/functions/kakao-login'
        : '/.netlify/functions/kakao-login';

      logToStorage('[signInWithKakao] 4단계: 서버 인증 시작 - ' + authEndpoint);

      // 재시도 로직 (2단계 인증 대응)
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          logToStorage(`[signInWithKakao] 시도 ${attempt}/3`);

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
          logToStorage(`[signInWithKakao] 서버 응답: ${response.status} ${response.statusText}`);

          if (!response.ok) {
            let errorMessage = '인증에 실패했습니다';
            try {
              const error = await response.json();
              errorMessage = error.error || error.message || errorMessage;
              logToStorage('[signInWithKakao] 서버 에러: ' + errorMessage);

              // 디버그 정보가 있으면 포함
              if (error.debug) {
                errorMessage += '\n\n[Debug Info]\n' + JSON.stringify(error.debug, null, 2);
              }
            } catch (e) {
              // JSON 파싱 실패 시 HTTP 상태 코드로 메시지 생성
              // HTML 응답일 수 있으니 텍스트로 읽어보기
              try {
                const text = await response.text();
                console.error('[카카오 로그인] 서버 에러 본문:', text);
                logToStorage('[signInWithKakao] 서버 에러 본문 길이: ' + text.length);
                if (text.includes('Task timed out')) {
                  errorMessage = '서버 응답 시간 초과 (10초)';
                } else {
                  errorMessage = `서버 오류 (${response.status})\n서버 로그를 확인해주세요.`;
                }
              } catch (textError) {
                errorMessage = `서버 오류 (${response.status}): ${response.statusText}`;
              }
            }
            throw new Error(errorMessage);
          }

          let authData;
          try {
            authData = await response.json();
            logToStorage('[signInWithKakao] 5단계: 서버 응답 파싱 완료');
          } catch (e) {
            console.error('[카카오 로그인] JSON 파싱 실패:', e);
            logToStorage('[signInWithKakao] ❌ JSON 파싱 실패');
            throw new Error('서버 응답을 처리할 수 없습니다. 네트워크 연결을 확인해주세요.');
          }

          // 서버에서 받은 세션으로 자동 로그인
          if (authData.session) {
            logToStorage('[signInWithKakao] 6단계: Supabase 세션 설정 시작');
            const { data, error } = await supabase.auth.setSession({
              access_token: authData.session.access_token,
              refresh_token: authData.session.refresh_token,
            });

            if (error) {
              console.error('[카카오 로그인] 세션 설정 실패:', error);
              logToStorage('[signInWithKakao] ❌ 세션 설정 실패: ' + error.message);
              throw new Error('로그인에 실패했습니다');
            }

            logToStorage('[signInWithKakao] 6단계: Supabase 세션 설정 완료');
            logToStorage('[signInWithKakao] ========== 로그인 성공 ==========');
          } else {
            console.error('[카카오 로그인] 서버에서 세션 데이터를 받지 못함');
            logToStorage('[signInWithKakao] ❌ 서버에서 세션 데이터 없음');
          }

          return authData;
        } catch (error: any) {
          lastError = error;
          logToStorage(`[signInWithKakao] 시도 ${attempt}/3 실패: ${error.message}`);
          console.warn(`카카오 인증 시도 ${attempt}/3 실패:`, error.message);

          // 마지막 시도가 아니면 1초 대기 후 재시도
          if (attempt < 3) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      // 3번 모두 실패
      logToStorage('[signInWithKakao] ❌ 모든 시도 실패');
      throw lastError || new Error('인증에 실패했습니다');
    } catch (error: any) {
      logToStorage('[signInWithKakao] ❌ 최종 에러: ' + error.message);
      throw error;
    }
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
    // localStorage에 로그 저장 (새로고침 후에도 확인 가능)
    const logToStorage = (msg: string) => {
      const logs = JSON.parse(localStorage.getItem('logout_debug_logs') || '[]');
      logs.push(`${new Date().toISOString().split('T')[1].slice(0, 12)} - ${msg}`);
      localStorage.setItem('logout_debug_logs', JSON.stringify(logs));
      console.log(msg);
    };

    // 이전 로그 초기화
    localStorage.removeItem('logout_debug_logs');

    logToStorage('[AuthContext.signOut] ========== 로그아웃 시작 ==========');
    logToStorage('[AuthContext.signOut] User Agent: ' + navigator.userAgent);
    logToStorage('[AuthContext.signOut] 현재 URL: ' + window.location.href);

    try {
      // 1. 카카오 로그아웃
      logToStorage('[AuthContext.signOut] 1단계: 카카오 로그아웃 시작');
      await logoutKakao();
      logToStorage('[AuthContext.signOut] 1단계: 카카오 로그아웃 완료');

      // 2. Supabase 로그아웃
      logToStorage('[AuthContext.signOut] 2단계: Supabase 로그아웃 시작');
      const { error } = await supabase.auth.signOut();
      if (error) {
        // "Auth session missing" 에러는 이미 로그아웃된 상태이므로 무시
        if (error.message === 'Auth session missing!') {
          logToStorage('[AuthContext.signOut] 2단계: 세션 없음 (이미 로그아웃 상태) - 계속 진행');
        } else {
          logToStorage('[AuthContext.signOut] Supabase 로그아웃 실패: ' + error.message);
          throw error;
        }
      } else {
        logToStorage('[AuthContext.signOut] 2단계: Supabase 로그아웃 완료');
      }

      // 3. Billboard 사용자 정보 초기화
      logToStorage('[AuthContext.signOut] 3단계: Billboard 사용자 정보 초기화');
      setBillboardUser(null, null);

      // 4. localStorage 완전 정리 (Supabase 관련 항목)
      logToStorage('[AuthContext.signOut] 4단계: localStorage 정리 시작');
      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('sb-') || key.includes('supabase'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));
      logToStorage('[AuthContext.signOut] 4단계: localStorage 정리 완료: ' + keysToRemove.length + '개 항목');

      // 5. sessionStorage 완전 정리
      logToStorage('[AuthContext.signOut] 5단계: sessionStorage 정리');
      sessionStorage.clear();

      // 6. Service Worker 캐시 정리 (PWA)
      logToStorage('[AuthContext.signOut] 6단계: 캐시 정리 시작');
      if ('serviceWorker' in navigator && 'caches' in window) {
        const cacheNames = await caches.keys();
        await Promise.all(
          cacheNames.map(cacheName => caches.delete(cacheName))
        );
        logToStorage('[AuthContext.signOut] 6단계: 캐시 정리 완료: ' + cacheNames.length + '개');
      }

      logToStorage('[AuthContext.signOut] 7단계: Analytics 로깅');
      logEvent('Auth', 'Logout', 'Success');

      // 7. 페이지 강제 리로드 (React 상태 완전 초기화)
      logToStorage('[AuthContext.signOut] 8단계: 페이지 리다이렉트 실행 - window.location.replace("/")');
      logToStorage('[AuthContext.signOut] ========== 리다이렉트 직전 ==========');
      window.location.replace('/');
    } catch (error) {
      logToStorage('[AuthContext.signOut] ❌ 에러 발생: ' + (error as Error).message);
      // 실패해도 페이지 리로드로 강제 초기화
      window.location.replace('/');
    }
  };

  // 개발 환경 전용 - 단순 플래그 (UI에서만 사용)
  const signInAsDevAdmin = import.meta.env.DEV ? () => {
    // 실제 로그인은 하지 않고, UI에서 관리자 모드 활성화만 트리거
    console.log('[개발 프리패스] 활성화됨 - UI 전용 모드');
  } : undefined;

  // 디버깅 로그 (상세)
  useEffect(() => {
    console.log('[AuthContext] 상태 업데이트:', {
      userEmail: user?.email,
      appMetadataIsAdmin: user?.app_metadata?.is_admin,
      isAdmin,
      loading,
      hasSession: !!session,
      adminEmail: import.meta.env.VITE_ADMIN_EMAIL
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
