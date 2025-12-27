import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import '../../../styles/pages/auth-callback.css';

export default function KakaoCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    // Ref to track processing state within a single mount (still useful for manual double-invoke protection)
    const processingRef = useRef(false);

    useEffect(() => {
        let uniqueTimer: NodeJS.Timeout | null = null;
        let cancelled = false;

        const handleCallback = async () => {
            console.log('[Kakao Callback] 🚀 콜백 처리 시작');

            // Prevent execution if already processing (local guard)
            if (processingRef.current) {
                console.warn('[Kakao Callback] ⚠️ 이미 처리 중 - 중복 실행 방지');
                return;
            }
            processingRef.current = true;
            console.log('[Kakao Callback] processingRef 설정 완료');

            const code = searchParams.get('code');
            const error = searchParams.get('error');
            const errorDescription = searchParams.get('error_description');

            console.log('[Kakao Callback] URL 파라미터:', {
                hasCode: !!code,
                hasError: !!error,
                codePreview: code ? code.substring(0, 10) + '...' : null
            });

            if (error) {
                if (cancelled) return;
                console.error('[Kakao Callback] ❌ 카카오 에러 발생:', error, errorDescription);
                alert(errorDescription || '카카오 로그인에 실패했습니다.');
                navigate('/', { replace: true });
                return;
            }

            // 코드 존재 여부 체크
            if (!code) {
                if (cancelled) return;
                console.error('[Kakao Callback] ❌ 인증 코드 없음');
                alert('인증 코드가 없습니다.');
                navigate('/', { replace: true });
                return;
            }

            try {
                console.log('[Kakao Callback] ✅ 인증 코드 수신:', code.substring(0, 10) + '...');

                // 2. 서버로 인증 코드 전송
                const authEndpoint = '/.netlify/functions/kakao-login';
                const redirectUri = `${window.location.origin}/auth/kakao-callback`;

                console.log('[Kakao Callback] 📤 서버로 인증 코드 전송 시작');
                console.log('[Kakao Callback] Endpoint:', authEndpoint);
                console.log('[Kakao Callback] Redirect URI:', redirectUri);

                const response = await fetch(authEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        code: code,
                        redirectUri,
                    }),
                });

                console.log('[Kakao Callback] 📥 서버 응답 수신:', {
                    status: response.status,
                    statusText: response.statusText,
                    ok: response.ok
                });

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

                console.log('[Kakao Callback] ✅ 서버 응답 수신 성공');
                console.log('[Kakao Callback] 응답 데이터:', {
                    hasSession: !!authData.session,
                    email: authData.email,
                    name: authData.name,
                    isAdmin: authData.isAdmin
                });

                // 3. Supabase 세션 설정
                if (authData.session) {
                    console.log('[Kakao Callback] 🔐 Supabase 세션 설정 시작');
                    console.log('[Kakao Callback] Access Token 존재:', !!authData.session.access_token);
                    console.log('[Kakao Callback] Refresh Token 존재:', !!authData.session.refresh_token);

                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: authData.session.access_token,
                        refresh_token: authData.session.refresh_token,
                    });

                    if (cancelled) return;

                    if (sessionError) {
                        console.error('[Kakao Callback] ❌ 세션 설정 에러:', sessionError);
                        throw new Error('세션 설정에 실패했습니다: ' + sessionError.message);
                    }

                    console.log('[Kakao Callback] ✅ 세션 설정 완료');
                    console.log('[Kakao Callback] 🎉 로그인 성공!');

                    // 4. 원래 페이지로 즉시 복귀 (모달 없이)
                    const returnUrl = sessionStorage.getItem('kakao_login_return_url') || '/';
                    console.log('[Kakao Callback] 복귀 URL:', returnUrl);
                    sessionStorage.removeItem('kakao_login_return_url');

                    console.log('[Kakao Callback] ➡️ 페이지 리다이렉트 중...');
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

                // KOE320 에러는 이미 사용된 코드라는 뜻이므로, 사용자에게는 조용히 넘어가거나 재로그인 유도
                if (error.message?.includes('KOE320')) {
                    console.warn('[Kakao Callback] ⚠️ KOE320 에러 - 인증 코드 만료');
                    alert('인증 코드가 만료되었습니다. 다시 로그인해주세요.');
                } else {
                    alert(error.message || '알 수 없는 오류가 발생했습니다');
                }

                console.log('[Kakao Callback] ➡️ 홈으로 리다이렉트');
                navigate('/', { replace: true });
            }
        };

        // Strict Mode에서의 이중 호출 방지를 위한 Debounce
        // 개발 모드(import.meta.env.DEV)에서는 Strict Mode로 인해 300ms 지연 필요
        // 실제 배포 모드(PROD)에서는 지연 없이 즉시 실행하여 속도 향상
        const delay = import.meta.env.DEV ? 300 : 0;

        uniqueTimer = setTimeout(() => {
            handleCallback();
        }, delay);

        return () => {
            cancelled = true; // Cleanup: prevent state updates after unmount
            if (uniqueTimer) clearTimeout(uniqueTimer); // 취소된 Effect의 타이머 해제
        };
    }, [searchParams, navigate]);

    return (
        <div className="auth-callback-container">
            <div className="auth-callback-content">
                <div className="auth-callback-spinner"></div>
                <h2>로그인 처리 중...</h2>
                <p>잠시만 기다려주세요</p>
            </div>
        </div>
    );
}
