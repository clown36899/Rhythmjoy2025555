import { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { supabase, validateAndRecoverSession } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao } from '../utils/kakaoAuth';
import { authLogger } from '../utils/authLogger';

import { setUserProperties, logEvent, setUserId, setAdminStatus } from '../lib/analytics';



interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  isAuthProcessing: boolean;
  isLoggingOut: boolean;
  billboardUserId: string | null;
  billboardUserName: string | null;
  setBillboardUser: (userId: string | null, userName: string | null) => void;
  // signIn: (email: string, password: string) => Promise<void>; // Removed
  signInWithKakao: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
  cancelAuth: () => void;
  userProfile: { nickname: string; profile_image: string | null } | null;
  refreshUserProfile: () => Promise<void>;
  signInAsDevAdmin?: () => void; // 개발 환경 전용 - UI 플래그만
  validateSession: () => Promise<void>; // 수동 세션 검증
  storagePrefix: string; // 저장소 접두사 노출 (PWA/브라우저 분리용)
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false); // Always false to prevent black screen
  const [isAuthProcessing, setIsAuthProcessing] = useState(() => {
    // Check if login is in progress from sessionStorage
    const inProgress = sessionStorage.getItem('kakao_login_in_progress') === 'true';
    if (inProgress) {
      // Check if login has been stuck for too long (> 60 seconds)
      const startTime = sessionStorage.getItem('kakao_login_start_time');
      if (startTime) {
        const elapsed = Date.now() - parseInt(startTime);
        if (elapsed > 60000) {
          // Clear stuck login state
          sessionStorage.removeItem('kakao_login_in_progress');
          sessionStorage.removeItem('kakao_login_start_time');
          return false;
        }
      }
    }
    return inProgress;
  });
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  // 🔥 [개선] 모든 저장소 키에 환경별 접두사 부여 (완전 격리)
  const isStandalone = typeof window !== 'undefined' && window.matchMedia('(display-mode: standalone)').matches;
  const storagePrefix = isStandalone ? 'pwa-' : 'browser-';

  if (typeof window !== 'undefined') {
    authLogger.log(`[AuthContext Init] Mode: ${isStandalone ? 'PWA' : 'Browser'}, Prefix: ${storagePrefix}`);
  }

  const [billboardUserId, setBillboardUserId] = useState<string | null>(() => {
    return localStorage.getItem(`${storagePrefix}billboardUserId`);
  });
  const [billboardUserName, setBillboardUserName] = useState<string | null>(() => {
    return localStorage.getItem(`${storagePrefix}billboardUserName`);
  });

  // helper to ensure board_users exists
  const ensureBoardUser = async (userObj: User) => {
    if (!userObj) return;

    try {
      const { data } = await supabase
        .from('board_users')
        .select('user_id')
        .eq('user_id', userObj.id)
        .maybeSingle();

      if (!data) {
        console.log('[AuthContext] board_users record missing for', userObj.email, '- Creating now...');
        // 2. Insert default
        // 구글 로그인 등의 경우 메타데이터에서 이름/아바타 추출
        const metadata = userObj.user_metadata || {};
        const nickname = metadata.name || metadata.full_name || userObj.email?.split('@')[0] || 'User';
        const profileImage = metadata.avatar_url || metadata.picture || null;

        // nickname 중복 방지를 위해 간단한 suffix 로직 필요할 수 있으나, 
        // 우선은 충돌 시 DB 오류 나면 handle 해야 함. 
        // 여기서는 간단히 타임스탬프 붙이거나, 그냥 시도.
        // board_users의 nickname이 unique라면 충돌 가능성 있음.
        // 임시로 random suffix
        const randomSuffix = Math.floor(Math.random() * 10000).toString();
        const safeNickname = `${nickname}_${randomSuffix}`;

        const { error: insertError } = await supabase
          .from('board_users')
          .insert([
            {
              user_id: userObj.id,
              nickname: safeNickname, // Unique key constraint avoidance
              profile_image: profileImage,
              // database.types.ts 안에는 email 컬럼이 board_users에 없음. (auth.users에만 있음)
              // 따라서 email은 제외.
            }
          ]);

        if (insertError) {
          console.error('[AuthContext] Error creating board_users record:', insertError);
          // 닉네임 중복 에러일 경우 재시도 로직 등이 필요할 수 있음
        } else {
          console.log('[AuthContext] Successfully created board_users record.');
        }
      }
    } catch (e) {
      console.error('[AuthContext] ensureBoardUser execution error:', e);
    }
  };

  // User Profile State - 초기값 localStorage에서 로드 (깜빡임 방지)
  const [userProfile, setUserProfile] = useState<{ nickname: string; profile_image: string | null } | null>(() => {
    const cached = localStorage.getItem(`${storagePrefix}userProfile`);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch (e) {
        return null;
      }
    }
    return null;
  });

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
    // 1. 현재 환경에 맞는 Supabase 세션 키 결정
    const isStandalone = typeof window !== 'undefined' &&
      (window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone);
    const currentStorageKey = isStandalone ? 'sb-pwa-auth-token' : 'sb-browser-auth-token';

    // 2. localStorage에서 현재 프로세스의 Supabase 관련 항목만 제거
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      // 내 서랍(currentStorageKey)이거나, supabase-js에서 생성한 공용 유틸리티 키만 제거
      if (key && (key === currentStorageKey || key.startsWith(currentStorageKey) || key.includes('supabase.auth.token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      console.log('[AuthContext] 🗑️ Removing process-specific key:', key);
      localStorage.removeItem(key);
    });

    // 프로필 및 특수 캐시 제거 (prefix 사용)
    localStorage.removeItem(`${storagePrefix}userProfile`);
    localStorage.removeItem(`${storagePrefix}is_registered`);
    localStorage.removeItem(`${storagePrefix}billboardUserId`);
    localStorage.removeItem(`${storagePrefix}billboardUserName`);
    localStorage.removeItem(`${storagePrefix}isLoggingOut`);
    localStorage.removeItem('ga-admin-shield');

    // 2. sessionStorage도 정리
    sessionStorage.clear();

    // 3. 상태 초기화
    setSession(null);
    setUser(null);
    setIsAdmin(false);
    setUserProfile(null);
    setUserId(null);
    setBillboardUserId(null);
    setBillboardUserName(null);
  };

  // 만료되거나 손상된 세션 정리 (좀비 토큰 제거)
  const cleanupStaleSession = async (forceReload = false) => {
    console.log('[AuthContext] 🧹 Cleaning up stale session (Zombie Token Removal)');

    try {
      authLogger.log('[AuthContext] 🧹 Cleaning up stale session (Zombie Token Removal)');
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

  // Admin 체크 캐시 (5분)
  const [adminCheckCache, setAdminCheckCache] = useState<{
    checked: boolean;
    isAdmin: boolean;
    timestamp: number;
  } | null>(null);

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

    // 1-1순위: JWT 메타데이터 체크 (DB 호출 없이 즉시 판단 가능)
    if (currentUser.app_metadata?.is_admin === true || currentUser.user_metadata?.is_admin === true) {
      if (!isAdmin) setIsAdmin(true);
      return;
    }

    // 2순위: 캐시 체크 (5분 이내면 캐시 사용)
    if (adminCheckCache && Date.now() - adminCheckCache.timestamp < 300000) {
      if (isAdmin !== adminCheckCache.isAdmin) {
        setIsAdmin(adminCheckCache.isAdmin);
      }
      return;
    }

    // 3순위: 최적화된 RPC 체크 (1초 타임아웃으로 단축)
    try {
      const adminCheckWithTimeout = Promise.race([
        supabase.rpc('get_user_admin_status'),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('Admin check timeout')), 1000) // 3초 → 1초
        )
      ]);

      const { data: isAdminUser, error } = await adminCheckWithTimeout as any;

      if (error) throw error;

      const adminStatus = !!isAdminUser;

      // 캐시 업데이트
      setAdminCheckCache({
        checked: true,
        isAdmin: adminStatus,
        timestamp: Date.now()
      });

      if (isAdmin !== adminStatus) {
        setIsAdmin(adminStatus);
      }
    } catch (e) {
      const errorMsg = (e as Error).message;
      if (errorMsg.includes('timeout')) {
        console.warn('[AuthContext] Admin check timeout - skipping');
      } else {
        console.error('[AuthContext] Admin check failed:', e);
      }
      if (isAdmin) setIsAdmin(false);
    }
  }, [isAdmin, adminCheckCache]);

  // 프로필 데이터 가져오기 - useCallback으로 메모이제이션
  const refreshUserProfile = useCallback(async () => {
    if (!user) {
      // console.log('[AuthContext.refreshUserProfile] user가 없어서 중단');
      return;
    }

    // console.log('[AuthContext.refreshUserProfile] 시작', { userId: user.id });

    // Prevent duplicate profile loads
    if (profileLoadInProgress.current) {
      // console.log('[AuthContext.refreshUserProfile] 이미 진행 중, 스킵');
      return;
    }

    profileLoadInProgress.current = true;
    try {
      // console.log('[AuthContext.refreshUserProfile] DB에서 프로필 조회 시작');
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

      // console.log('[AuthContext.refreshUserProfile] DB 조회 결과', {
      //   hasData: !!data,
      //   nickname: data?.nickname,
      //   profile_image: data?.profile_image
      // });

      let newProfile = null;
      if (data) {
        newProfile = {
          nickname: data.nickname || user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: data.profile_image || user.user_metadata?.avatar_url || null
        };
        // console.log('[AuthContext.refreshUserProfile] DB 데이터로 프로필 생성', newProfile);
      } else {
        // Fallback to metadata if no board_user record yet or timeout
        newProfile = {
          nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
          profile_image: user.user_metadata?.avatar_url || null
        };
        // console.log('[AuthContext.refreshUserProfile] 메타데이터로 폴백 프로필 생성', newProfile);
      }

      if (newProfile) {
        // console.log('[AuthContext.refreshUserProfile] 프로필 상태 업데이트 및 localStorage 저장', newProfile);
        setUserProfile(newProfile);
        localStorage.setItem(`${storagePrefix}userProfile`, JSON.stringify(newProfile));
      }
    } catch (e) {
      console.warn('[AuthContext.refreshUserProfile] 프로필 로드 실패 또는 타임아웃, 폴백 사용:', e);
      // Fallback on error/timeout
      const fallbackProfile = {
        nickname: user.user_metadata?.name || user.email?.split('@')[0] || '',
        profile_image: user.user_metadata?.avatar_url || null
      };
      // console.log('[AuthContext.refreshUserProfile] 폴백 프로필 설정', fallbackProfile);
      setUserProfile(fallbackProfile);
    } finally {
      // console.log('[AuthContext.refreshUserProfile] 완료');
      profileLoadInProgress.current = false;
    }
  }, [user, storagePrefix]);

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
      setAdminStatus(false);
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

    // 🔥 접두사 붙인 로그아웃 플래그 확인
    const isLoggingOut = localStorage.getItem(`${storagePrefix}isLoggingOut`);
    if (isLoggingOut) {
      console.log(`[AuthContext] 🧹 Enforcing cleanup after logout reload (${storagePrefix})`);
      authLogger.log(`[AuthContext] 🧹 Enforcing cleanup after logout reload (${storagePrefix})`);
      localStorage.removeItem(`${storagePrefix}isLoggingOut`);

      // 저장소에 좀비 토큰이 부활했더라도, 메모리상에서는 확실히 날려버림
      supabase.auth.signOut({ scope: 'local' }).then(() => {
        if (isMounted) setLoading(false);
      });
      return;
    }

    const timeoutId = setTimeout(async () => {
      if (isMounted && loading) {
        console.warn('[AuthContext] ⏱️ Session check timeout - keeping local session');
        // 타임아웃은 네트워크 지연일 뿐이므로 로그아웃하지 않음
        // 진짜 세션 에러는 .catch() 블록에서 처리됨
        authLogger.log('[AuthContext] ⏱️ Session check timeout - keeping local session');
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
          // Admin 체크를 백그라운드에서 실행 (await 제거)
          refreshAdminStatus(currentUser);
          setUserId(currentUser.id);
        }
        setLoading(false);
      })
      .catch(async (error: any) => {
        if (!isMounted) return;
        clearTimeout(timeoutId);
        authLogger.log('[AuthContext] 💥 Session init error:', error);
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

      authLogger.log('[AuthContext] 🔄 Auth state changed:', { event, userEmail: currentUser?.email });

      if (event === 'SIGNED_OUT') {
        wipeLocalData();
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        const eventKey = `${event}-${currentUser?.id || 'none'}`;
        if (lastProcessedEvent.current === eventKey) return;
        lastProcessedEvent.current = eventKey;

        setSession(session);
        setUser(currentUser);
        refreshAdminStatus(currentUser); // await 제거 - 백그라운드 실행

        if (currentUser) {
          setUserProperties({ login_status: 'logged_in' });
          setUserId(currentUser.id);
          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            logEvent('Auth', 'Login', 'Success');
            // Clear login in progress flag
            sessionStorage.removeItem('kakao_login_in_progress');
            sessionStorage.removeItem('kakao_login_start_time');
            setIsAuthProcessing(false);

            // [FIX] Ensure board_users record exists (especially for Google/Apple login)
            // 익명 함수 내부에서 비동기 호출
            (async () => {
              try {
                await ensureBoardUser(currentUser);
                await refreshUserProfile();
              } catch (err) {
                console.error('[AuthContext] Failed to ensure board user:', err);
              }
            })();
          }
        }
      } else if (event === 'USER_UPDATED' && !session) {
        await cleanupStaleSession();
      } else {
        setSession(session);
        setUser(currentUser);
        if (currentUser) {
          setUserId(currentUser.id);
          refreshAdminStatus(currentUser); // await 제거 - 백그라운드 실행
        } else {
          setUserId(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshAdminStatus]); // refreshAdminStatus가 useCallback 덕분에 안정적임



  const setBillboardUser = useCallback((userId: string | null, userName: string | null) => {
    setBillboardUserId(userId);
    setBillboardUserName(userName);
    if (userId) {
      localStorage.setItem(`${storagePrefix}billboardUserId`, userId);
    } else {
      localStorage.removeItem(`${storagePrefix}billboardUserId`);
    }
    if (userName) {
      localStorage.setItem(`${storagePrefix}billboardUserName`, userName);
    } else {
      localStorage.removeItem(`${storagePrefix}billboardUserName`);
    }
  }, [storagePrefix]);

  const signOut = useCallback(async () => {
    // localStorage에 로그 저장 (새로고침 후에도 확인 가능)
    const logToStorage = (msg: string) => {
      const logs = JSON.parse(localStorage.getItem('logout_debug_logs') || '[]');
      logs.push(`${new Date().toISOString().split('T')[1].slice(0, 12)} - ${msg}`);
      localStorage.setItem('logout_debug_logs', JSON.stringify(logs));
      console.log(msg);
    };

    // 이전 로그 초기화
    localStorage.removeItem('logout_debug_logs');

    setIsLoggingOut(true); // Mark as logging out
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

      // 4. localStorage 정리 (현재 프로세스의 Supabase 관련 항목만)
      logToStorage(`[AuthContext.signOut] 4단계: 프로세스별 localStorage 정리 시작 (${storagePrefix})`);
      const currentStorageKey = storagePrefix === 'pwa-' ? 'sb-pwa-auth-token' : 'sb-browser-auth-token';

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        // 내 서랍(currentStorageKey)이거나 공용 키만 수집
        if (key && (key === currentStorageKey || key.startsWith(currentStorageKey) || key.includes('supabase.auth.token'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // 사용자 프로필 및 기타 캐시 명시적 제거 (prefix 사용)
      localStorage.removeItem(`${storagePrefix}userProfile`);
      localStorage.removeItem(`${storagePrefix}is_registered`);
      localStorage.removeItem(`${storagePrefix}billboardUserId`);
      localStorage.removeItem(`${storagePrefix}billboardUserName`);

      logToStorage('[AuthContext.signOut] 4단계: localStorage 정리 완료: ' + (keysToRemove.length + 1) + '개 항목');

      // 5. sessionStorage 완전 정리
      logToStorage('[AuthContext.signOut] 5단계: sessionStorage 정리 및 스크롤 위치 보존');

      // 스크롤 위치 미리 캡처
      const boardContainer = document.querySelector('.board-posts-container');
      const scrollY = boardContainer ? boardContainer.scrollTop : window.scrollY;

      sessionStorage.clear();

      // 클리어 후 다시 저장 (리로딩 후 복원용)
      sessionStorage.setItem('kakao_login_scroll_y', String(scrollY));
      logToStorage(`[AuthContext.signOut] 스크롤 위치 다시 저장됨: ${scrollY}`);

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
      // 🔥 중요: 새로고침 후 세션 검증 스킵을 위한 플래그 설정 (접두사 포함)
      localStorage.setItem(`${storagePrefix}isLoggingOut`, 'true');

      logToStorage('[AuthContext.signOut] 9단계: 페이지 새로고침 실행 - window.location.reload()');
      logToStorage('[AuthContext.signOut] ========== 리로드 직전 ==========');

      // ⚠️ [변경] 무조건 메인('/')으로 가던 로직을 현재 페이지 새로고침으로 변경
      // 이를 통해 게시판이나 특정 상세 페이지에서 로그아웃해도 튕기지 않고 해당 위치 유지
      window.location.reload();

    } catch (error) {
      logToStorage('[AuthContext.signOut] ❌ 에러 발생: ' + (error as Error).message);
      // 실패해도 페이지 리로드로 강제 초기화
      window.location.reload();
    }
  }, [storagePrefix, setBillboardUser]);

  const signInWithKakao = useCallback(async () => {
    setIsAuthProcessing(true); // 즉시 스피너 표시
    sessionStorage.setItem('kakao_login_in_progress', 'true'); // Persist across page navigation
    sessionStorage.setItem('kakao_login_start_time', String(Date.now())); // Track start time
    try {
      // 로그인 전에 스크롤 위치 저장 (익명 게시판은 내부 컨테이너 스크롤 사용)
      const boardContainer = document.querySelector('.board-posts-container');
      const scrollY = boardContainer ? boardContainer.scrollTop : window.scrollY;
      console.log('[AuthContext] Saving scroll position before login:', scrollY, 'from:', boardContainer ? 'container' : 'window');

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
      sessionStorage.removeItem('kakao_login_in_progress');
      sessionStorage.removeItem('kakao_login_start_time');
      throw error; // MobileShell에서 잡아서 처리하도록 전달
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    console.log('[signInWithGoogle] 🚀 Starting Google login process');
    console.log('[signInWithGoogle] Current origin:', window.location.origin);

    setIsAuthProcessing(true);
    try {
      const authOptions = {
        provider: 'google' as const,
        options: {
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
          redirectTo: window.location.origin,
        },
      };

      console.log('[signInWithGoogle] Auth options:', JSON.stringify(authOptions, null, 2));

      const { data, error } = await supabase.auth.signInWithOAuth(authOptions);

      console.log('[signInWithGoogle] Response data:', data);
      console.log('[signInWithGoogle] Response error:', error);

      if (error) {
        console.error('[signInWithGoogle] ❌ Supabase returned error:', {
          message: error.message,
          status: error.status,
          name: error.name,
          stack: error.stack
        });
        throw error;
      }

      console.log('[signInWithGoogle] ✅ OAuth request successful, redirecting...');
    } catch (error: any) {
      console.error('[signInWithGoogle] 💥 Caught error:', {
        message: error.message,
        status: error.status,
        name: error.name,
        fullError: error
      });
      alert(`구글 로그인 실패:\n${error.message || '알 수 없는 오류'}`);
      setIsAuthProcessing(false);
    }
  }, []);

  const signInAsDevAdmin = useMemo(() => {
    if (import.meta.env.DEV) {
      return () => {
        // 실제 로그인은 하지 않고, UI에서 관리자 모드 활성화만 트리거
        console.log('[개발 프리패스] 활성화됨 - UI 전용 모드');
      };
    }
    return undefined;
  }, []);

  const contextValue: AuthContextType = useMemo(() => ({
    user,
    session,
    isAdmin,
    loading,
    isAuthProcessing,
    isLoggingOut,
    billboardUserId,
    billboardUserName,
    userProfile,
    setBillboardUser,
    refreshUserProfile,
    signInWithKakao,
    signInWithGoogle,
    signOut,
    cancelAuth,
    validateSession,
    storagePrefix,
    ...(import.meta.env.DEV && { signInAsDevAdmin }),
  }), [
    user, session, isAdmin, loading, isAuthProcessing, isLoggingOut,
    billboardUserId, billboardUserName, userProfile,
    setBillboardUser, refreshUserProfile,
    signInWithKakao, signInWithGoogle, signOut,
    cancelAuth, validateSession, storagePrefix,
    signInAsDevAdmin
  ]);

  // 로딩 중일 때는 앱 렌더링을 차단하여, 하위 컴포넌트가 불안정한 세션 상태(좀비 토큰 등)로 API를 호출하는 것을 방지
  // DISABLED for login optimization - no spinner during initial load
  /*
  if (loading) {
    return (
      <div style={{
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#000000'
      }}>
        <div className="auth-callback-spinner" style={{ width: '40px', height: '40px' }}></div>
      </div>
    );
  }
  */

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
