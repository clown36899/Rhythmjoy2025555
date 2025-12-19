import { createContext, useContext, useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { supabase, validateAndRecoverSession } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao } from '../utils/kakaoAuth';

import { setUserProperties, logEvent } from '../lib/analytics';



interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  isAuthProcessing: boolean;
  billboardUserId: string | null;
  billboardUserName: string | null;
  setBillboardUser: (userId: string | null, userName: string | null) => void;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithKakao: () => void;
  signOut: () => Promise<void>;
  cancelAuth: () => void;
  userProfile: { nickname: string; profile_image: string | null } | null;
  refreshUserProfile: () => Promise<void>;
  signInAsDevAdmin?: () => void; // 개발 환경 전용 - UI 플래그만
  validateSession: () => Promise<void>; // 수동 세션 검증
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isAuthProcessing, setIsAuthProcessing] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [billboardUserId, setBillboardUserId] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserId');
  });
  const [billboardUserName, setBillboardUserName] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserName');
  });

  // User Profile State
  const [userProfile, setUserProfile] = useState<{ nickname: string; profile_image: string | null } | null>(null);

  const cancelAuth = () => {
    console.warn('[AuthContext] 인증 프로세스 수동 취소됨');
    setIsAuthProcessing(false);
  };

  // 만료되거나 손상된 세션 정리 (좀비 토큰 제거)
  const cleanupStaleSession = async (forceReload = false) => {
    console.log('[AuthContext] 🧹 Cleaning up stale session (Zombie Token Removal)');

    try {
      // 1. Supabase 세션 제거 (로컬만)
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[AuthContext] SignOut during cleanup failed (expected):', e);
    }

    // 2. localStorage의 Supabase 관련 항목 제거 (더 강력하게)
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key.startsWith('sb-') || key.includes('supabase') || key.includes('auth-token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      console.log('[AuthContext] 🗑️ Removing stale key:', key);
      localStorage.removeItem(key);
    });

    // 3. sessionStorage도 정리
    sessionStorage.clear();

    // 4. 상태 초기화
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setUserProfile(null);

    console.log('[AuthContext] ✅ Stale session cleaned up');

    // 5. 강제 리로드가 필요하면 실행 (심각한 오류 상황)
    if (forceReload) {
      console.warn('[AuthContext] 🔁 Force reloading page to clear memory state');
      window.location.reload();
    }
  };

  // 관리자 권한 계산 헬퍼 함수
  const computeIsAdmin = (currentUser: User | null): boolean => {
    if (!currentUser) return false;

    // 2순위: 이메일 비교 (fallback) -> 이제 유일한 확인 방법
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    return !!(currentUser.email && adminEmail && currentUser.email === adminEmail);
  };

  // 프로필 데이터 가져오기
  const refreshUserProfile = async () => {
    if (!user) return;
    try {
      const { data } = await supabase
        .from('board_users')
        .select('nickname, profile_image')
        .eq('user_id', user.id)
        .maybeSingle();

      if (data) {
        console.log('[AuthContext] User profile loaded:', data);
        setUserProfile({
          nickname: data.nickname || user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: data.profile_image || user.user_metadata?.avatar_url || null
        });
      } else if (user) {
        // Fallback to metadata if no board_user record yet
        setUserProfile({
          nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: user.user_metadata?.avatar_url || null
        });
      }
    } catch (e) {
      console.error('[AuthContext] Failed to load user profile:', e);
    }
  };

  // Load profile when user changes
  useEffect(() => {
    if (user) {
      refreshUserProfile();
    } else {
      setUserProfile(null);
    }
  }, [user]);

  // 수동 세션 검증 메서드
  const validateSession = async () => {
    console.log('[AuthContext] 🕵️‍♂️ Manual session validation requested');
    const validSession = await validateAndRecoverSession();
    if (!validSession) {
      console.warn('[AuthContext] 🕵️‍♂️ Session became invalid during validation');
      await cleanupStaleSession();
    } else {
      console.log('[AuthContext] 🕵️‍♂️ Session is valid');
    }
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

    // 3초 timeout 설정 (조금 더 여유있게) - 실패 시 강제 정리
    const timeoutId = setTimeout(async () => {
      if (isMounted && loading) {
        console.warn('[AuthContext] ⏱️ Session check timeout (3s) - Force cleaning stale session');
        // 타임아웃 발생 시 좀비 세션으로 간주하고 정리, 하지만 false로 세팅하여 앱 진입은 허용 (비로그인 상태)
        await cleanupStaleSession();
        setLoading(false);
      }
    }, 3000);

    // 개선된 세션 검증 및 복구 로직 사용
    validateAndRecoverSession()
      .then(async (recoveredSession: Session | null) => {
        if (!isMounted) return;
        clearTimeout(timeoutId);

        if (recoveredSession) {
          const currentUser = recoveredSession.user;
          const adminStatus = computeIsAdmin(currentUser);

          console.log('[AuthContext] ✨ Session recovered/verified:', {
            email: currentUser.email,
            expiresAt: recoveredSession.expires_at,
          });

          setSession(recoveredSession);
          setUser(currentUser);
          setIsAdmin(adminStatus);
        } else {
          // 세션이 없거나 복구 실패 시
          console.log('[AuthContext] ℹ️ No valid session found or recovery failed');
          setSession(null);
          setUser(null);
          setIsAdmin(false);
        }

        setLoading(false);
      })
      .catch(async (error: any) => {
        if (!isMounted) return;
        clearTimeout(timeoutId);

        console.error('[AuthContext] 💥 Critical session initialization error:', error);
        await cleanupStaleSession();
        setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return; // 언마운트 후 실행 방지

      const currentUser = session?.user ?? null;
      const adminStatus = computeIsAdmin(currentUser);

      console.log('[AuthContext] 🔄 Auth state changed:', {
        event,
        hasSession: !!session,
        userEmail: currentUser?.email,
        appMetadataIsAdmin: currentUser?.app_metadata?.is_admin,
        isAdmin: adminStatus,
        sessionExpiry: session?.expires_at
      });

      // 세션 만료 체크
      if (session?.expires_at) {
        const expiresAt = new Date(session.expires_at * 1000);
        if (expiresAt < new Date()) {
          console.warn('[AuthContext] ⚠️ Session expired in auth state change');
          await cleanupStaleSession();
          return;
        }
      }

      if (event === 'SIGNED_OUT') {
        // 로그아웃 시 명확히 상태 초기화
        console.log('[AuthContext] 👋 로그아웃 처리');
        setSession(null);
        setUser(null);
        setIsAdmin(false);
        setUserProfile(null); // Clear profile
      }
      // TOKEN_REFRESHED 처리
      else if (event === 'TOKEN_REFRESHED') {
        console.log('[AuthContext] 🔄 Token refreshed successfully');
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);
      }
      // 토큰 갱신 실패 처리 (User updated but no session)
      else if (event === 'USER_UPDATED' && !session) {
        console.warn('[AuthContext] ⚠️ User updated but no session - possible refresh failure');
        await cleanupStaleSession();
      }
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        console.log('[AuthContext] 👤 세션 설정:', currentUser?.email);
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
        console.log('[AuthContext] 📝 기타 이벤트 처리');
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

  const signInWithKakao = () => {
    try {
      console.log('[signInWithKakao] 카카오 로그인 시작 (리다이렉트 방식)');

      // SDK 초기화 (동기적으로 처리 - 이미 로드되어 있을 것으로 예상)
      initKakaoSDK().then(() => {
        // 리다이렉트 방식으로 로그인 (이 함수는 페이지를 이동시키므로 여기서 종료됨)
        loginWithKakao();
      }).catch((error) => {
        console.error('[signInWithKakao] SDK 초기화 실패:', error);
        alert(error.message || '카카오 SDK 초기화에 실패했습니다.');
      });

      // 리다이렉트되므로 아래 코드는 실행되지 않음
    } catch (error: any) {
      console.error('[signInWithKakao] 에러:', error);
      alert(error.message || '카카오 로그인에 실패했습니다.');
      // 리로드가 없다면 여기서 false로 해줘야 함!
      // 확인: signInWithKakao는 값을 반환하고 끝남. MobileShell에서는 별도 처리 없음.
      // AuthStateChange가 트리거되면서 UI가 업데이트됨. 
      // 따라서 성공 시에도 스피너를 꺼줘야 함.
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

    setIsAuthProcessing(true); // Start blocking UI
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

      logToStorage('[AuthContext.signOut] 8단계: 페이지 리다이렉트 실행 - window.location.replace("/")');
      logToStorage('[AuthContext.signOut] ========== 리다이렉트 직전 ==========');

      // 리다이렉트 직전에 false로 돌리면 리로드 전에 잠깐 UI가 풀릴 수 있음
      // 하지만 리로드가 실패하거나 늦어지면 영원히 도는 문제 발생
      // 타임아웃을 걸어서 강제로 끄는 방법 또는 그냥 두는 방법.
      // "안 없어지는데?" 라는 피드백을 받았으므로, 안전장치로 리로드 호출 후에도 혹시 모를 상황 대비는 어려움(페이지 넘어가니까)
      // 에러 발생 시 catch 블록에서 리로드함.

      window.location.replace('/');
    } catch (error) {
      logToStorage('[AuthContext.signOut] ❌ 에러 발생: ' + (error as Error).message);
      // 실패해도 페이지 리로드로 강제 초기화
      window.location.replace('/');
    } finally {
      // 성공하든 실패하든 리로드가 호출됨.
      // 브라우저가 리로드를 처리하는 동안 JS 실행이 멈추거나 페이지가 전환됨.
      // 만약 리로드가 즉시 되지 않는다면 Finally가 실행될 수 있음.
      // 안전하게 false로 설정
      // setIsAuthProcessing(false); <-- 이걸 하면 리로드 직전에 깜빡일 수 있음.
      // 하지만 사용자가 "안 없어진다"고 했으므로, signInWithKakao 쪽 문제일 가능성이 큼.
      // signOut은 window.location.replace('/')를 호출하므로 거의 무적.
      // signInWithKakao는 replace를 안함!
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
    isAuthProcessing,
    billboardUserId,
    billboardUserName,
    userProfile,
    setBillboardUser,
    refreshUserProfile,
    signIn,
    signInWithKakao,
    signOut,
    cancelAuth,
    validateSession, // 새로 추가된 메서드
    ...(import.meta.env.DEV && { signInAsDevAdmin }),
  };

  // 로딩 중일 때는 앱 렌더링을 차단하여, 하위 컴포넌트가 불안정한 세션 상태(좀비 토큰 등)로 API를 호출하는 것을 방지
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#ffffff'
      }}>
        <div className="auth-callback-spinner" style={{ width: '40px', height: '40px' }}></div>
      </div>
    );
  }

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
