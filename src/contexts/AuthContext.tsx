import { createContext, useContext, useEffect, useState, useRef } from 'react';
import type { ReactNode } from 'react';
import { supabase, validateAndRecoverSession } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao } from '../utils/kakaoAuth';

import { setUserProperties, logEvent, setUserId } from '../lib/analytics';



interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  isAuthProcessing: boolean;
  billboardUserId: string | null;
  billboardUserName: string | null;
  setBillboardUser: (userId: string | null, userName: string | null) => void;
  // signIn: (email: string, password: string) => Promise<void>; // Removed
  signInWithKakao: () => Promise<void>;
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

  // Deduplication refs
  const lastProcessedUserId = useRef<string | null>(null);
  const lastProcessedEvent = useRef<string | null>(null);
  const profileLoadInProgress = useRef(false);

  const cancelAuth = () => {
    console.warn('[AuthContext] 인증 프로세스 수동 취소됨');
    setIsAuthProcessing(false);
  };

  // 로컬 데이터 및 상태 완전 초기화 (signOut 호출 없음)
  const wipeLocalData = () => {
    // 1. localStorage의 Supabase 관련 항목 제거 (더 강력하게)
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

    // 2. sessionStorage도 정리
    sessionStorage.clear();

    // 3. 상태 초기화
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setUserProfile(null);
    // User ID 제거
    setUserId(null);
  };

  // 만료되거나 손상된 세션 정리 (좀비 토큰 제거)
  const cleanupStaleSession = async (forceReload = false) => {
    console.log('[AuthContext] 🧹 Cleaning up stale session (Zombie Token Removal)');

    try {
      // 1. Supabase 세션 제거 (로컬만) -> 이게 SIGNED_OUT 이벤트를 발생시킬 수 있음
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[AuthContext] SignOut during cleanup failed (expected):', e);
    }

    // 2. 데이터 및 상태 삭제
    wipeLocalData();

    console.log('[AuthContext] ✅ Stale session cleaned up');

    // 3. 강제 리로드가 필요하면 실행 (심각한 오류 상황)
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

    // Prevent duplicate profile loads
    if (profileLoadInProgress.current) {
      console.log('[AuthContext] Profile load already in progress, skipping');
      return;
    }

    profileLoadInProgress.current = true;
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
    } finally {
      profileLoadInProgress.current = false;
    }
  };

  // Load profile when user changes (with deduplication)
  useEffect(() => {
    if (user) {
      // Only refresh if user actually changed
      if (lastProcessedUserId.current !== user.id) {
        lastProcessedUserId.current = user.id;
        refreshUserProfile();
      }
    } else {
      lastProcessedUserId.current = null;
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

          // User ID 설정 (초기 세션 복구 시)
          if (currentUser) {
            setUserId(currentUser.id);
          }
        } else {
          // 세션이 없거나 복구 실패 시
          console.log('[AuthContext] ℹ️ No valid session found or recovery failed');
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          // User ID 제거 (세션 복구 실패 시)
          setUserId(null);
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
        wipeLocalData();
      }
      // TOKEN_REFRESHED 처리
      else if (event === 'TOKEN_REFRESHED') {
        console.log('[AuthContext] 🔄 Token refreshed successfully');
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);

        // User ID 재설정 (토큰 갱신 시에도 유지)
        if (currentUser) {
          setUserId(currentUser.id);
        }
      }
      // 토큰 갱신 실패 처리 (User updated but no session)
      else if (event === 'USER_UPDATED' && !session) {
        console.warn('[AuthContext] ⚠️ User updated but no session - possible refresh failure');
        await cleanupStaleSession();
      }
      else if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        // Deduplicate: Check if we already processed this user+event
        const eventKey = `${event}-${currentUser?.id || 'none'}`;
        if (lastProcessedEvent.current === eventKey) {
          console.log('[AuthContext] ⏭️ Skipping duplicate event:', eventKey);
          return; // Skip duplicate processing
        }
        lastProcessedEvent.current = eventKey;

        console.log('[AuthContext] 👤 세션 설정:', currentUser?.email);
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);

        // Analytics: Set user properties and User ID
        if (currentUser) {
          setUserProperties({
            user_type: adminStatus ? 'admin' : 'user',
            login_status: 'logged_in'
          });
          // User ID 설정 (여러 기기에서 동일 사용자 추적)
          setUserId(currentUser.id);

          if (event === 'SIGNED_IN') {
            logEvent('Auth', 'Login', 'Success');
          }
        }
      } else {
        // 기타 이벤트 (안전장치)
        console.log('[AuthContext] 📝 기타 이벤트 처리');
        setSession(session);
        setUser(currentUser);
        setIsAdmin(adminStatus);

        // User ID 설정 (기타 이벤트에서도 안전하게 처리)
        if (currentUser) {
          setUserId(currentUser.id);
        } else {
          setUserId(null);
        }
      }
    });

    return () => {
      isMounted = false; // cleanup 시 마운트 상태 false
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);



  const signInWithKakao = async () => {
    setIsAuthProcessing(true); // 즉시 스피너 표시
    try {
      console.log('[signInWithKakao] 카카오 로그인 시작 (리다이렉트 방식)');

      // SDK 초기화 및 로그인 실행
      // loginWithKakao는 리다이렉트를 수행하므로, 여기서 await를 해도 돌아오지 않을 수 있음
      // 하지만 에러 발생 시를 대비해 try-catch를 유지
      await initKakaoSDK();

      // 리다이렉트 전까지 스피너 유지
      // loginWithKakao는 void를 반환하지만 내부적으로 location.href를 변경함
      loginWithKakao();

      // 리다이렉트가 일어나면 이 코드는 실행되지 않거나, 페이지가 언로드됨
      // 따라서 여기서 finally로 false를 주면 안 됨 (깜빡임 원인)

    } catch (error: any) {
      console.error('[signInWithKakao] 에러:', error);
      alert(error.message || '카카오 로그인에 실패했습니다.');
      // 에러가 났을 때만 스피너를 꺼줌
      setIsAuthProcessing(false);
      throw error; // MobileShell에서 잡아서 처리하도록 전달
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
      // User ID 제거
      setUserId(null);
      logEvent('Auth', 'Logout', 'Success');

      logToStorage('[AuthContext.signOut] 8단계: 로그아웃 플래그 설정');
      // 🔥 중요: 새로고침 후 세션 검증 스킵을 위한 플래그 설정
      localStorage.setItem('isLoggingOut', 'true');

      logToStorage('[AuthContext.signOut] 9단계: 페이지 새로고침 실행 - window.location.reload()');
      logToStorage('[AuthContext.signOut] ========== 리로드 직전 ==========');

      // ⚠️ [변경] 무조건 메인('/')으로 가던 로직을 현재 페이지 새로고침으로 변경
      // 이를 통해 게시판이나 특정 상세 페이지에서 로그아웃해도 튕기지 않고 해당 위치 유지
      window.location.reload();

    } catch (error) {
      logToStorage('[AuthContext.signOut] ❌ 에러 발생: ' + (error as Error).message);
      // 실패해도 페이지 리로드로 강제 초기화
      window.location.reload();
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
    // signIn, // Removed unused function
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
