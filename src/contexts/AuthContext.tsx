import { createContext, useContext, useEffect, useState, useRef, useCallback, useMemo } from 'react';
import type { ReactNode } from 'react';
import { supabase, validateAndRecoverSession } from '../lib/supabase';
import type { User, Session, AuthChangeEvent } from '@supabase/supabase-js';
import { initKakaoSDK, loginWithKakao, logoutKakao } from '../utils/kakaoAuth';
import { authLogger } from '../utils/authLogger';

import { setUserProperties, logEvent, setUserId, setAdminStatus } from '../lib/analytics';
import { isPWAMode } from '../lib/pwaDetect';



interface AuthContextType {
  user: User | null;
  session: Session | null;
  isAdmin: boolean;
  loading: boolean;
  isAuthCheckComplete: boolean;
  isAuthProcessing: boolean;
  setIsAuthProcessing: (value: boolean) => void;
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
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(false); // Always false to prevent black screen/delay
  const [isAuthCheckComplete, setIsAuthCheckComplete] = useState(false); // Track initial session check completion

  const [isAuthProcessing, setIsAuthProcessing] = useState(() => {
    // Check if login is in progress from sessionStorage (Kakao or Google)
    const kakaoInProgress = sessionStorage.getItem('kakao_login_in_progress') === 'true';
    const googleInProgress = sessionStorage.getItem('google_login_in_progress') === 'true';
    const inProgress = kakaoInProgress || googleInProgress;

    if (inProgress) {
      // Check if login has been stuck for too long (> 60 seconds)
      const startTime = sessionStorage.getItem(kakaoInProgress ? 'kakao_login_start_time' : 'google_login_start_time');
      if (startTime) {
        const elapsed = Date.now() - parseInt(startTime);
        if (elapsed > 60000) {
          // Clear stuck login state
          sessionStorage.removeItem('kakao_login_in_progress');
          sessionStorage.removeItem('google_login_in_progress');
          sessionStorage.removeItem('kakao_login_start_time');
          sessionStorage.removeItem('google_login_start_time');
          return false;
        }
      }
    }
    return inProgress;
  });

  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);

  if (typeof window !== 'undefined') {
    authLogger.log(`[AuthContext Init] Mode: ${isPWAMode() ? 'PWA' : 'Browser'}`);
  }

  const [billboardUserId, setBillboardUserId] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserId');
  });
  const [billboardUserName, setBillboardUserName] = useState<string | null>(() => {
    return localStorage.getItem('billboardUserName');
  });

  // helper to ensure board_users exists and is up to date
  const ensureBoardUser = async (userObj: User) => {
    if (!userObj) return;

    try {
      // 🔍 DEBUG: Log all metadata to understand what Supabase provides


      const metadata = userObj.user_metadata || {};
      const nickname = metadata.name || metadata.full_name || userObj.email?.split('@')[0] || 'User';
      const profileImage = metadata.avatar_url || metadata.picture || null;

      // [FIX] Provider detection logic - Use tiered priority to handle social logins correctly
      let provider = 'email'; // Default

      // 1. Check Identities (Official Supabase social link)
      const identities = userObj.identities || [];
      const socialIdentity = identities.find(i => i.provider !== 'email');

      if (socialIdentity) {
        provider = socialIdentity.provider;

      }
      // 2. Check App Metadata Providers array
      else if (userObj.app_metadata?.providers) {
        const providers = userObj.app_metadata.providers;
        const socialProvider = providers.find((p: string) => p !== 'email');
        if (socialProvider) {
          provider = socialProvider;

        }
      }

      // 3. Fallback: If still 'email', check metadata and profile image for social hints
      if (provider === 'email') {
        if (userObj.app_metadata?.provider && userObj.app_metadata.provider !== 'email') {
          provider = userObj.app_metadata.provider;

        } else if (metadata.kakao_id || metadata.iss?.includes('kakao') || userObj.email?.includes('kakao')) {
          provider = 'kakao';

        } else if (profileImage?.includes('googleusercontent.com')) {
          provider = 'google';

        } else if (profileImage?.includes('kakaocdn.net') || profileImage?.includes('kakao.com')) {
          provider = 'kakao';

        } else if (metadata.iss && metadata.iss.includes('google')) {
          provider = 'google';

        }
      }



      // Capture personal info from metadata - real_name, phone_number removed



      const { data: existingUser } = await supabase
        .from('board_users')
        .select('user_id, status, nickname, provider, profile_image, kakao_id, gender')
        .eq('user_id', userObj.id)
        .maybeSingle();

      if (existingUser) {
        // [CASE 1] Update existing user (SYNC metadata)
        const isWithdrawn = existingUser.status === 'deleted' || existingUser.nickname === '탈퇴한 사용자';

        const updateData: any = {
          email: userObj.email,
          updated_at: new Date().toISOString()
        };

        // 🛡️ Data Preservation & Correction Logic

        // 1. 프로바이더 확정 및 보정
        // - DB에 kakao_id가 이미 있다면 얘는 무조건 kakao입니다.
        // - 혹은 현재 감지된 프로바이더가 'email'이 아닌 소셜 프로바이더이고, DB가 'email'이거나 없으면 업데이트합니다.
        const hasKakaoIdInDB = (existingUser as any).kakao_id;
        const effectiveProvider = hasKakaoIdInDB ? 'kakao' : provider;

        if (effectiveProvider !== 'email' && (!existingUser.provider || existingUser.provider === 'email')) {
          updateData.provider = effectiveProvider;

        }

        // 4. 프로필 이미지 보충
        if (profileImage && !existingUser.profile_image) {
          updateData.profile_image = profileImage;
        }



        // [추가] kakao_id가 DB에 없는데 메타데이터에 있다면 동기화 (기존 유저 대응)
        if (metadata.kakao_id && !(existingUser as any).kakao_id) {
          updateData.kakao_id = metadata.kakao_id;
        }

        // If user was withdrawn, RESURRECT them
        if (isWithdrawn) {

          updateData.status = 'active';
          updateData.deleted_at = null;
          updateData.nickname = nickname + '_' + Math.floor(Math.random() * 10000);
          if (profileImage) updateData.profile_image = profileImage;
        }

        // Check if there are actual changes before updating
        const hasChanges = Object.keys(updateData).some(key =>
          key !== 'updated_at' && updateData[key] !== (existingUser as any)[key]
        );

        if (hasChanges || isWithdrawn) {

          const { error: updateError } = await supabase
            .from('board_users')
            .update(updateData)
            .eq('user_id', userObj.id);

          if (updateError) console.error('[AuthContext] Error updating board_users:', updateError);
        }

      } else {
        // [CASE 2] Insert new user
        const insertData = {
          user_id: userObj.id,
          nickname: nickname + '_' + Math.floor(Math.random() * 10000),
          profile_image: profileImage,
          email: userObj.email,
          provider: provider,
          kakao_id: metadata.kakao_id || null,
          updated_at: new Date().toISOString()
        };
        // Clean undefined
        Object.keys(insertData).forEach(key => (insertData as any)[key] === undefined && delete (insertData as any)[key]);

        const { error: insertError } = await supabase
          .from('board_users')
          .insert([insertData]);

        if (insertError) console.error('[AuthContext] Error inserting board_users:', insertError);
      }
    } catch (e) {
      console.error('[AuthContext] ensureBoardUser execution error:', e);
    }
  };

  // User Profile State - 초기값 localStorage에서 로드 (깜빡임 방지)
  const [userProfile, setUserProfile] = useState<{ nickname: string; profile_image: string | null } | null>(() => {
    const cached = localStorage.getItem('userProfile');
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
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
    sessionStorage.removeItem('kakao_login_in_progress');
    sessionStorage.removeItem('google_login_in_progress');
    sessionStorage.removeItem('kakao_login_start_time');
    sessionStorage.removeItem('google_login_start_time');
  };

  // 로컬 데이터 및 상태 완전 초기화 (signOut 호출 없음)
  const wipeLocalData = () => {
    // 1. Supabase 세션 키 결정 (통합 키 사용)
    const currentStorageKey = 'sb-auth-token';

    // 2. localStorage에서 Supabase 관련 항목 제거
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && (key === currentStorageKey || key.startsWith(currentStorageKey) || key.includes('supabase.auth.token'))) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
    });

    // 프로필 및 특수 캐시 제거
    localStorage.removeItem('userProfile');
    localStorage.removeItem('is_registered');
    localStorage.removeItem('billboardUserId');
    localStorage.removeItem('billboardUserName');
    localStorage.removeItem('isLoggingOut');
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
    setIsAuthProcessing(false); // 🔥 로딩 상태 강제 해제 추가
  };

  // 만료되거나 손상된 세션 정리 (좀비 토큰 제거)
  const cleanupStaleSession = async (forceReload = false) => {


    try {
      authLogger.log('[AuthContext] 🧹 Cleaning up stale session (Zombie Token Removal)');
      // 1. Supabase 세션 제거 (로컬만) -> 이게 SIGNED_OUT 이벤트를 발생시킬 수 있음
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('[AuthContext] SignOut during cleanup failed (expected):', e);
    }

    // 2. 데이터 및 상태 삭제
    wipeLocalData();



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

    // JWT 메타데이터 체크 제거 - RPC만 사용
    // (이유: JWT에 잘못된 is_admin 값이 박혀있을 수 있음)

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
          setTimeout(() => reject(new Error('Admin check timeout')), 5000) // 1초 -> 5초
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
        // console.warn('[AuthContext] Admin check timeout - skipping');
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
          setTimeout(() => reject(new Error('Profile fetch timeout')), 5000)
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
        localStorage.setItem('userProfile', JSON.stringify(newProfile));
      }
    } catch {
      // console.warn('[AuthContext] Profile load delayed, using fallback:', e.message);
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
      setAdminStatus(false);
    }
  }, [user]);

  const validateSession = useCallback(async () => {
    // console.log('[AuthContext] 🕵️‍♂️ Manual session validation requested');
    const validSession = await validateAndRecoverSession();
    if (!validSession) {
      console.warn('[AuthContext] 🕵️‍♂️ Session became invalid during validation');
      await cleanupStaleSession();
    }
  }, []);

  // 1. 초기 세션 검증 및 PWA/로그아웃 상태 복구
  useEffect(() => {
    authLogger.log('[AuthContext] 🔌 Initializing AuthContext useEffect...');
    let isMounted = true;
    let safetyTimeoutId: NodeJS.Timeout | null = null;

    // 로그아웃 직후 리로드된 상태인지 확인
    const isLoggingOutFromStorage = localStorage.getItem('isLoggingOut') === 'true';

    if (isLoggingOutFromStorage) {
      authLogger.log('[AuthContext] 🛫 Logout redirect detected - cleaning up...');
      setIsLoggingOut(true);
      setIsAuthProcessing(false);
      localStorage.removeItem('isLoggingOut');

      supabase.auth.signOut({ scope: 'local' }).then(() => {
        if (isMounted) {
          setIsLoggingOut(false);
          setLoading(false);
          setIsAuthCheckComplete(true);
        }
      });
      return () => { isMounted = false; };
    }

    // 🛡️ Safety Net
    const urlParams = new URLSearchParams(window.location.search);
    const hash = window.location.hash;
    const hasAuthParams = urlParams.has('code') || urlParams.has('error') || hash.includes('access_token=') || hash.includes('refresh_token=');
    const safetyTimeoutMillis = hasAuthParams ? 15000 : 8000;

    authLogger.log('[AuthContext] 🛡️ Initial URL Analysis:', {
      path: window.location.pathname,
      hasCode: urlParams.has('code'),
      hasError: urlParams.has('error'),
      hasTokenInHash: hash.includes('access_token='),
      hasAuthParams,
      userAgent: navigator.userAgent
    });

    authLogger.log('[AuthContext] 🛡️ Setting safety net timer:', { safetyTimeoutMillis });

    safetyTimeoutId = setTimeout(() => {
      if (isMounted && (isAuthProcessing || isLoggingOut)) {
        authLogger.log(`[AuthContext] 🛡️ Safety Net triggered (${safetyTimeoutMillis}ms) - Forcing all spinners off`);
        setIsAuthProcessing(false);
        setIsLoggingOut(false);
        sessionStorage.removeItem('kakao_login_in_progress');
        sessionStorage.removeItem('google_login_in_progress');
      }
    }, safetyTimeoutMillis);

    const checkInitialSession = async () => {
      authLogger.log('[AuthContext] 🔍 Starting validateAndRecoverSession()...');
      try {
        const recoveredSession = await validateAndRecoverSession();
        if (!isMounted) return;

        authLogger.log('[AuthContext] 📥 Recovery result:', { hasSession: !!recoveredSession, userId: recoveredSession?.user?.id });

        if (recoveredSession) {
          setSession(recoveredSession);
          setUser(recoveredSession.user);
          refreshAdminStatus(recoveredSession.user);
          setUserId(recoveredSession.user.id);
        }

        if (!hasAuthParams) {
          setIsAuthProcessing(false);
        }
      } catch (error) {
        if (!isMounted) return;
        authLogger.log('[AuthContext] 💥 Session init error:', error);
        await cleanupStaleSession();
        setIsAuthProcessing(false);
      } finally {
        if (isMounted) {
          setLoading(false);
          setIsAuthCheckComplete(true);
        }
      }
    };

    checkInitialSession();

    return () => {
      isMounted = false;
      if (safetyTimeoutId) clearTimeout(safetyTimeoutId);
    };
  }, []); // 의존성 없음 - 초기 마운트 시 1회 실행

  // 2. Auth State Change 구독 (별도 분리)
  useEffect(() => {
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event: AuthChangeEvent, session: Session | null) => {
      const currentUser = session?.user ?? null;

      authLogger.log('[AuthContext] 🔄 Auth state changed:', { event, userEmail: currentUser?.email });

      if (event === 'SIGNED_OUT') {
        wipeLocalData();
        setIsLoggingOut(false);
      } else if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        // [Safety Fix] 어떤 시그널이든 세션 관련 확정이 오면 로딩은 풉니다.
        if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
          setIsAuthProcessing(false);
          setIsLoggingOut(false);
          sessionStorage.removeItem('kakao_login_in_progress');
          sessionStorage.removeItem('google_login_in_progress');
        }

        const eventKey = `${event}-${currentUser?.id || 'none'}`;
        if (lastProcessedEvent.current === eventKey) return;
        lastProcessedEvent.current = eventKey;

        setSession(session);
        setUser(currentUser);

        if (currentUser) {
          refreshAdminStatus(currentUser);
          setUserId(currentUser.id);
          setUserProperties({ login_status: 'logged_in' });

          if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
            logEvent('Auth', 'Login', 'Success');
            ensureBoardUser(currentUser)
              .then(() => refreshUserProfile())
              .catch(err => {
                console.warn('[AuthContext] Background user sync failed:', err);
              });
          }
        }
      } else if (event === 'USER_UPDATED' && !session) {
        await cleanupStaleSession();
      } else {
        setSession(session);
        setUser(currentUser);
        if (currentUser) {
          setUserId(currentUser.id);
          refreshAdminStatus(currentUser);
        } else {
          setUserId(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [refreshAdminStatus]);



  const setBillboardUser = useCallback((userId: string | null, userName: string | null) => {
    setBillboardUserId(userId);
    setBillboardUserName(userName);
    if (userId) {
      localStorage.setItem('billboardUserId', userId);
    } else {
      localStorage.removeItem('billboardUserId');
    }
    if (userName) {
      localStorage.setItem('billboardUserName', userName);
    } else {
      localStorage.removeItem('billboardUserName');
    }
  }, []);

  const signOut = useCallback(async () => {
    // localStorage에 로그 저장 (새로고침 후에도 확인 가능)
    const logToStorage = (msg: string) => {
      const logs = JSON.parse(localStorage.getItem('logout_debug_logs') || '[]');
      logs.push(`${new Date().toISOString().split('T')[1].slice(0, 12)} - ${msg}`);
      localStorage.setItem('logout_debug_logs', JSON.stringify(logs));

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

      // 4. localStorage 정리 (통합 Supabase 관련 항목)
      logToStorage('[AuthContext.signOut] 4단계: localStorage 정리 시작 (통합 키)');
      const currentStorageKey = 'sb-auth-token';

      const keysToRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key === currentStorageKey || key.startsWith(currentStorageKey) || key.includes('supabase.auth.token'))) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(key => localStorage.removeItem(key));

      // 사용자 프로필 및 기타 캐시 명시적 제거
      localStorage.removeItem('userProfile');
      localStorage.removeItem('is_registered');
      localStorage.removeItem('billboardUserId');
      localStorage.removeItem('billboardUserName');

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
    }
  }, [setBillboardUser]);

  const signInWithKakao = useCallback(async () => {
    setIsAuthProcessing(true); // 즉시 스피너 표시
    sessionStorage.setItem('kakao_login_in_progress', 'true'); // Persist across page navigation
    sessionStorage.setItem('kakao_login_start_time', String(Date.now())); // Track start time
    try {
      // 로그인 전에 스크롤 위치 저장 (익명 게시판은 내부 컨테이너 스크롤 사용)



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


    setIsAuthProcessing(true);
    sessionStorage.setItem('google_login_in_progress', 'true');
    sessionStorage.setItem('google_login_start_time', String(Date.now()));

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




      // [DEBUG] 모바일 환경 리다이렉트 문제 확인용
      // if (window.innerWidth < 768) {
      //   alert(`Login Redirect URL:\n${authOptions.options.redirectTo}`);
      // }

      const { error } = await supabase.auth.signInWithOAuth(authOptions);



      if (error) {
        console.error('[signInWithGoogle] ❌ Supabase returned error:', {
          message: error.message,
          status: error.status,
          name: error.name,
          stack: error.stack
        });
        sessionStorage.removeItem('google_login_in_progress');
        sessionStorage.removeItem('google_login_start_time');
        throw error;
      }


    } catch (error: any) {
      console.error('[signInWithGoogle] 💥 Caught error:', {
        message: error.message,
        status: error.status,
        name: error.name,
        fullError: error
      });
      alert(`구글 로그인 실패:\n${error.message || '알 수 없는 오류'}`);
      setIsAuthProcessing(false);
      sessionStorage.removeItem('google_login_in_progress');
      sessionStorage.removeItem('google_login_start_time');
    }
  }, []);

  const signInAsDevAdmin = useMemo(() => {
    if (import.meta.env.DEV) {
      return () => {
        // 실제 로그인은 하지 않고, UI에서 관리자 모드 활성화만 트리거

      };
    }
    return undefined;
  }, []);

  const contextValue: AuthContextType = useMemo(() => ({
    user,
    session,
    isAdmin,
    loading,
    isAuthCheckComplete,
    isAuthProcessing,
    setIsAuthProcessing,
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
    ...(import.meta.env.DEV && { signInAsDevAdmin }),
  }), [
    user, session, isAdmin, loading, isAuthCheckComplete, isAuthProcessing, isLoggingOut,
    billboardUserId, billboardUserName, userProfile,
    setBillboardUser, refreshUserProfile,
    signInWithKakao, signInWithGoogle, signOut,
    cancelAuth, validateSession,
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
