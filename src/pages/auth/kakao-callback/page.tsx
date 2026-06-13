import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { cafe24 } from '../../../lib/cafe24Client';
import { useAuth } from '../../../contexts/AuthContext';
import { getAuthPkceVerifierKey, getAuthStorageKey, getAuthValidationKey } from '../../../lib/authStorageKeys';
import { consumeKakaoLoginReturnUrl } from '../../../utils/kakaoAuth';
import '../../../styles/pages/auth-callback.css';

const AUTH_SERVER_TIMEOUT_MS = 15000;
const SESSION_SETUP_TIMEOUT_MS = 10000;
const SESSION_CONFIRM_TIMEOUT_MS = 2500;
const SESSION_CONFIRM_INTERVAL_MS = 250;
const AUTH_STORAGE_KEY = getAuthStorageKey();
const SESSION_VALIDATION_KEY = getAuthValidationKey();
const CAFE24_AUTH_ENABLED =
    import.meta.env.VITE_CAFE24_AUTH_BACKEND !== 'disabled';

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const withTimeout = async <T,>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> => {
    let timer: NodeJS.Timeout | null = null;
    try {
        return await Promise.race([
            promise,
            new Promise<never>((_, reject) => {
                timer = setTimeout(() => reject(new Error(label)), timeoutMs);
            })
        ]);
    } finally {
        if (timer) clearTimeout(timer);
    }
};

const clearKakaoLoginFlags = () => {
    sessionStorage.removeItem('kakao_login_in_progress');
    sessionStorage.removeItem('kakao_login_start_time');
    sessionStorage.removeItem('kakao_callback_active');
};

const removeStaleAuthPkceVerifier = () => {
    try {
        localStorage.removeItem(getAuthPkceVerifierKey());
    } catch {
        // localStorage can be unavailable in some private/mobile contexts.
    }
};

const getJwtExpiry = (accessToken: string): number | null => {
    try {
        const encodedPayload = accessToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
        const paddedPayload = encodedPayload.padEnd(
            encodedPayload.length + ((4 - encodedPayload.length % 4) % 4),
            '='
        );
        const payload = JSON.parse(atob(paddedPayload));
        return typeof payload.exp === 'number' ? payload.exp : null;
    } catch {
        return null;
    }
};

const persistSessionDirectly = (session: any) => {
    if (!session?.access_token || !session?.refresh_token || !session?.user) {
        throw new Error('직접 저장할 세션 정보가 부족합니다');
    }

    const expiresAt = typeof session.expires_at === 'number'
        ? session.expires_at
        : getJwtExpiry(session.access_token);
    const nowSeconds = Math.floor(Date.now() / 1000);

    const normalizedSession = {
        ...session,
        token_type: session.token_type || 'bearer',
        expires_at: expiresAt || nowSeconds + Number(session.expires_in || 3600),
        expires_in: Number(session.expires_in || ((expiresAt || nowSeconds + 3600) - nowSeconds)),
    };

    localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(normalizedSession));
    localStorage.setItem(SESSION_VALIDATION_KEY, String(Date.now()));
};

export default function KakaoCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const { setIsAuthProcessing } = useAuth();

    // Ref to track processing state within a single mount (still useful for manual double-invoke protection)
    const processingRef = useRef(false);

    useEffect(() => {
        let uniqueTimer: NodeJS.Timeout | null = null;
        let cancelled = false;

        const handleCallback = async () => {


            // Prevent execution if already processing (local guard)
            if (processingRef.current) {
                console.warn('[Kakao Callback] ⚠️ 이미 처리 중 - 중복 실행 방지');
                return;
            }
            processingRef.current = true;


            const code = searchParams.get('code');
            const error = searchParams.get('error');
            const errorDescription = searchParams.get('error_description');



            if (error) {
                if (cancelled) return;
                console.error('[Kakao Callback] ❌ 카카오 에러 발생:', error, errorDescription);
                clearKakaoLoginFlags();
                alert(errorDescription || '카카오 로그인에 실패했습니다.');
                navigate('/', { replace: true });
                return;
            }

            // 코드 존재 여부 체크
            if (!code) {
                if (cancelled) return;
                console.error('[Kakao Callback] ❌ 인증 코드 없음');
                clearKakaoLoginFlags();
                alert('인증 코드가 없습니다.');
                navigate('/', { replace: true });
                return;
            }

            try {
                setIsAuthProcessing(true);
                sessionStorage.setItem('kakao_callback_active', 'true');
                removeStaleAuthPkceVerifier();


                // 인증 코드는 1회용이므로 즉시 URL에서 제거 (중복 사용 방지)
                window.history.replaceState({}, '', '/auth/kakao-callback');


                // 2. 서버로 인증 코드 전송
                const authEndpoint = '/api/kakao-login';
                const redirectUri = `${window.location.origin}/auth/kakao-callback`;

                const controller = new AbortController();
                const fetchTimeoutId = setTimeout(() => controller.abort(), AUTH_SERVER_TIMEOUT_MS);
                let response: Response;

                try {
                    response = await fetch(authEndpoint, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            code: code,
                            redirectUri,
                        }),
                        signal: controller.signal
                    });
                } catch (fetchError: any) {
                    if (fetchError?.name === 'AbortError') {
                        throw new Error('로그인 서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.');
                    }
                    throw fetchError;
                } finally {
                    clearTimeout(fetchTimeoutId);
                }



                if (cancelled) return;

                if (!response.ok) {
                    console.error('[Kakao Callback] ❌ 서버 응답 실패:', response.status);
                    let errorMsg = '인증에 실패했습니다';
                    try {
                        const errorData = await response.json();
                        console.error('[Kakao Callback] 에러 데이터:', errorData);
                        errorMsg = errorData.error || errorData.message || errorMsg;
                    } catch (e) {
                        console.error('[Kakao Callback] 에러 응답 JSON 파싱 실패:', e);
                    }
                    throw new Error(errorMsg);
                }

                const authData = await response.json();

                if (cancelled) return;

                if (CAFE24_AUTH_ENABLED || authData.cafe24Session) {
                    clearKakaoLoginFlags();
                    removeStaleAuthPkceVerifier();
                    setIsAuthProcessing(false);
                    const returnUrl = consumeKakaoLoginReturnUrl();
                    navigate(returnUrl, { replace: true });
                    setTimeout(() => window.location.reload(), 80);
                    return;
                }


                // 3. Cafe24 세션 설정
                if (authData.session) {
                    const accessToken = authData.session.access_token;
                    const refreshToken = authData.session.refresh_token;

                    if (!accessToken || !refreshToken) {
                        throw new Error('서버 응답에 세션 토큰이 없습니다');
                    }

                    console.log('[Kakao Callback] Cafe24 세션 설정 시작');

                    let setSessionResult: Awaited<ReturnType<typeof cafe24.auth.setSession>> | null = null;
                    let usedDirectPersistFallback = false;

                    try {
                        setSessionResult = await withTimeout(cafe24.auth.setSession({
                            access_token: accessToken,
                            refresh_token: refreshToken,
                        }), SESSION_SETUP_TIMEOUT_MS, 'setSession timeout');
                    } catch (sessionError: any) {
                        if (sessionError?.message !== 'setSession timeout') {
                            throw sessionError;
                        }

                        console.warn('[Kakao Callback] ⚠️ setSession timeout - 직접 세션 저장 fallback 실행');
                        persistSessionDirectly(authData.session);
                        usedDirectPersistFallback = true;
                    }

                    if (cancelled) return;

                    if (setSessionResult?.error) {
                        console.error('[Kakao Callback] ❌ 세션 설정 에러:', setSessionResult.error);
                        throw new Error('세션 설정에 실패했습니다: ' + setSessionResult.error.message);
                    }

                    let confirmedSession = setSessionResult?.data?.session ?? (usedDirectPersistFallback ? authData.session : null);
                    const confirmDeadline = Date.now() + SESSION_CONFIRM_TIMEOUT_MS;

                    while (!usedDirectPersistFallback && !confirmedSession && Date.now() < confirmDeadline) {
                        const { data, error: confirmError } = await withTimeout(
                            cafe24.auth.getSession(),
                            4000,
                            'getSession confirm timeout'
                        );

                        if (cancelled) return;

                        if (confirmError) {
                            console.warn('[Kakao Callback] ⚠️ 세션 확인 지연:', confirmError.message);
                        }

                        confirmedSession = data.session;
                        if (!confirmedSession) await delay(SESSION_CONFIRM_INTERVAL_MS);
                    }

                    if (!confirmedSession?.user) {
                        throw new Error('세션 저장 확인에 실패했습니다. 네트워크 상태를 확인한 뒤 다시 로그인해주세요.');
                    }

                    console.log('[Kakao Callback] ✅ 세션 저장 확인 완료', {
                        userId: confirmedSession.user.id,
                        fallback: usedDirectPersistFallback,
                        elapsedMs: Date.now() - Number(sessionStorage.getItem('kakao_login_start_time') || Date.now())
                    });



                    // 4. 원래 페이지로 복귀
                    const returnUrl = consumeKakaoLoginReturnUrl();

                    // Set flag to prevent EventList spinner during login
                    sessionStorage.setItem('just_logged_in', 'true');

                    clearKakaoLoginFlags();

                    setIsAuthProcessing(false);

                    // 성공적으로 이동
                    console.log('[Kakao Callback] ✅ 로그인 성공, 이동:', returnUrl);
                    if (usedDirectPersistFallback) {
                        window.location.replace(returnUrl);
                        return;
                    }
                    navigate(returnUrl, { replace: true });
                } else {
                    console.error('[Kakao Callback] ❌ 세션 정보 없음');
                    throw new Error('서버 응답에 세션 정보가 없습니다');
                }
            } catch (error: any) {
                if (cancelled) return;
                console.error('[Kakao Callback] ❌ 에러 발생:', error);
                console.error('[Kakao Callback] 에러 메시지:', error.message);
                console.error('[Kakao Callback] 에러 스택:', error.stack);

                // Clear login in progress flag on error
                clearKakaoLoginFlags();
                setIsAuthProcessing(false);

                // KOE320 에러는 이미 사용된 코드라는 뜻이므로, 사용자에게는 조용히 넘어가거나 재로그인 유도
                if (error.message?.includes('KOE320')) {
                    console.warn('[Kakao Callback] ⚠️ KOE320 에러 - 인증 코드 만료');
                    alert('인증 코드가 만료되었습니다. 다시 로그인해주세요.');
                } else {
                    alert(error.message || '알 수 없는 오류가 발생했습니다');
                }


                navigate('/', { replace: true });
            }
        };

        // Strict Mode에서의 이중 호출 방지를 위한 Debounce였으나,
        // 사용자 경험을 위해 즉시 실행으로 변경 (Ref로 중복 방지됨)
        const delayMs = 0;

        uniqueTimer = setTimeout(() => {
            handleCallback();
        }, delayMs);

        return () => {
            cancelled = true; // Cleanup: prevent state updates after unmount
            if (uniqueTimer) clearTimeout(uniqueTimer); // 취소된 Effect의 타이머 해제
        };
    }, [searchParams, navigate]);

    return (
        <div className="auth-callback-container">
            <div className="auth-callback-content">
                {/* Spinner handled by MobileShell GlobalLoadingOverlay */}
            </div>
        </div>
    );
}
