import { createContext, useContext, useEffect, useState, useRef, useCallback } from 'react';
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

  // 관리자 권한 계산 헬퍼 함수 (비동기) - useCallback으로 메모이제이션
  const refreshAdminStatus = useCallback(async (currentUser: User | null) => {
    if (!currentUser) {
      if (isAdmin) setIsAdmin(false);
      return;
    }

    // 1순위: 환경변수 이메일 체크 (즉시 판단 가능)
    const adminEmail = import.meta.env.VITE_ADMIN_EMAIL;
    if (currentUser.email && adminEmail && currentUser.email === adminEmail) {
      if (!isAdmin) setIsAdmin(true);
      return;
    }

    // 2순위: DB 및 RPC 체크
    try {
      // RPC 시도
      const { data: rpcData } = await supabase.rpc('is_admin_user');
      if (rpcData) {
        if (!isAdmin) setIsAdmin(true);
        return;
      }

      // board_admins 테이블 직접 확인
      const { data: tableData } = await supabase
        .from('board_admins')
        .select('user_id')
        .eq('user_id', currentUser.id)
        .maybeSingle();

      const isTableAdmin = !!tableData;
      if (isAdmin !== isTableAdmin) {
        setIsAdmin(isTableAdmin);
      }
    } catch (e) {
      console.error('[AuthContext] Admin check failed:', e);
      if (isAdmin) setIsAdmin(false);
    }
  }, [isAdmin]);

  // 프로필 데이터 가져오기 - useCallback으로 메모이제이션
  const refreshUserProfile = useCallback(async () => {
    if (!user) return;

    // Prevent duplicate profile loads
    if (profileLoadInProgress.current) {
      console.log('[AuthContext] Profile load already in progress, skipping');
      return;
    }

    profileLoadInProgress.current = true;
    try {
      // 🔥 프로필 로딩에 3초 타임아웃 추가 (DB 지연 시 무한 로딩 방지)
      const fetchProfileWithTimeout = Promise.race([
        supabase
          .from('board_users')
          .select('nickname, profile_image')
          .eq('user_id', user.id)
          .maybeSingle(),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Profile fetch timeout')), 3000)
        )
      ]);

      const result = await fetchProfileWithTimeout as any;
      const data = result.data;

      if (data) {
        setUserProfile({
          nickname: data.nickname || user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: data.profile_image || user.user_metadata?.avatar_url || null
        });
      } else {
        // Fallback to metadata if no board_user record yet or timeout
        setUserProfile({
          nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: user.user_metadata?.avatar_url || null
        });
      }
    } catch (e) {
      console.warn('[AuthContext] Profile load failed or timed out, using fallback:', e);
      // Fallback on error/timeout
      setUserProfile({
        nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
        profile_image: user.user_metadata?.avatar_url || null
      });
    } finally {
      profileLoadInProgress.current = false;
    }
  }, [user]);

  // Load profile and admin status when user changes
  useEffect(() => {
    if (user) {
      // Only refresh if user actually changed
      if (lastProcessedUserId.current !== user.id) {
        lastProcessedUserId.current = user.id;
        refreshUserProfile();
        refreshAdminStatus(user);
      }
    } else {
      lastProcessedUserId.current = null;
      setUserProfile(null);
      setIsAdmin(false);
    }
  }, [user]);

  // 수동 세션 검증 메서드 - useCallback으로 감싸서 리렌더링 시 참조 유지 (무한 루프 방지)
  const validateSession = useCallback(async () => {
    console.log('[AuthContext] 🕵️‍♂️ Manual session validation requested');
    const validSession = await validateAndRecoverSession();
    if (!validSession) {
      console.warn('[AuthContext] 🕵️‍♂️ Session became invalid during validation');
      await cleanupStaleSession();
    } else {
      console.log('[AuthContext] 🕵️‍♂️ Session is valid');
    }
  }, []);

  // 1. 초기 세션 마운트 시 검증
  useEffect(() => {
    let isMounted = true;

    const isLoggingOut = localStorage.getItem('isLoggingOut');
    if (isLoggingOut) {
      localStorage.removeItem('isLoggingOut');
      setLoading(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (isMounted && loading) {
        console.warn('[AuthContext] ⏱️ Session check timeout (10s)');
        await cleanupStaleSession();
        setLoading(false);
      }
    }, 10000);

    validateAndRecoverSession()
      .then(async (recoveredSession: Session | null) => {
        if (!isMounted) return;
        clearTimeout(timeoutId);

        if (recoveredSession) {
          const currentUser = recoveredSession.user;
          setSession(recoveredSession);
          setUser(currentUser);
          await refreshAdminStatus(currentUser);
          setUserId(currentUser.id);
        } else {
          setSession(null);
          setUser(null);
          setIsAdmin(false);
          setUserId(null);
        }
        setLoading(false);
      })
      .catch(async (error: any) => {
        if (!isMounted) return;
        clearTimeout(timeoutId);
        console.error('[AuthContext] 💥 Session init error:', error);
        await cleanupStaleSession();
        setLoading(false);
      });

    return () => {
      isMounted = false;
      clearTimeout(timeoutId);
    };
  }, []); // 의존성 없음 - 초기 마운트 시 1회 실행

  // 2. Auth State Change 구독 (별도 분리)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user ?? null;

      console.log('[AuthContext] 🔄 Auth state changed:', { event, userEmail: currentUser?.email });

      if (event === 'SIGNED_OUT') {
        wipeLocalData();
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const eventKey = `${event}-${currentUser?.id || 'none'}`;
        if (lastProcessedEvent.current === eventKey) return;
        lastProcessedEvent.current = eventKey;

        setSession(session);
        setUser(currentUser);
        await refreshAdminStatus(currentUser);

        if (currentUser) {
          setUserProperties({ login_status: 'logged_in' });
          setUserId(currentUser.id);
          if (event === 'SIGNED_IN') logEvent('Auth', 'Login', 'Success');
        }
      } else if (event === 'USER_UPDATED' && !session) {
        await cleanupStaleSession();
      } else {
        setSession(session);
        setUser(currentUser);
        if (currentUser) {
          setUserId(currentUser.id);
          await refreshAdminStatus(currentUser);
        } else {
          setUserId(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshAdminStatus]); // refreshAdminStatus가 useCallback 덕분에 안정적임



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
      // [정석 해결] 서비스 워커 등록을 해제하지 않고, 인증 정보가 담겼을 수 있는 캐시만 비웁니다.
      logToStorage('[AuthContext.signOut] 6단계: 서비스 워커 캐시 정리 시작');
      if ('serviceWorker' in navigator && 'caches' in window) {
        try {
          const cacheNames = await caches.keys();
          await Promise.all(
            cacheNames.map(cacheName => caches.delete(cacheName))
          );
          logToStorage('[AuthContext.signOut] 6단계: 캐시 삭제 완료: ' + cacheNames.length + '개');
        } catch (e) {
          console.warn('[AuthContext.signOut] SW cache cleanup failed:', e);
        }
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
