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
            // Prevent execution if already processing (local guard)
            if (processingRef.current) return;
            processingRef.current = true;

            const code = searchParams.get('code');
            const error = searchParams.get('error');
            const errorDescription = searchParams.get('error_description');

            if (error) {
                if (cancelled) return;
                console.error('[Kakao Callback] Error:', error, errorDescription);
                alert(errorDescription || '카카오 로그인에 실패했습니다.');
                navigate('/', { replace: true });
                return;
            }

            // 코드 존재 여부 체크
            if (!code) {
                if (cancelled) return;
                alert('인증 코드가 없습니다.');
                navigate('/', { replace: true });
                return;
            }

            try {
                console.log('[Kakao Callback] 인증 코드 수신 (Debounced):', code.substring(0, 10) + '...');

                // 2. 서버로 인증 코드 전송
                const authEndpoint = '/.netlify/functions/kakao-login';

                const response = await fetch(authEndpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        code: code,
                        redirectUri: `${window.location.origin}/auth/kakao-callback`,
                    }),
                });

                if (cancelled) return;

                if (!response.ok) {
                    let errorMsg = '인증에 실패했습니다';
                    try {
                        const errorData = await response.json();
                        errorMsg = errorData.error || errorData.message || errorMsg;
                    } catch (e) {
                        // JSON 파싱 실패
                    }
                    throw new Error(errorMsg);
                }

                const authData = await response.json();

                if (cancelled) return;

                // 3. Supabase 세션 설정
                if (authData.session) {
                    console.log('[Kakao Callback] Session data obtained successfully');
                    const { error: sessionError } = await supabase.auth.setSession({
                        access_token: authData.session.access_token,
                        refresh_token: authData.session.refresh_token,
                    });

                    if (cancelled) return;

                    if (sessionError) {
                        console.error('[Kakao Callback] Session error:', sessionError);
                        throw new Error('세션 설정에 실패했습니다: ' + sessionError.message);
                    }

                    console.log('[Kakao Callback] 로그인 성공');

                    // 4. 원래 페이지로 즉시 복귀 (모달 없이)
                    const returnUrl = sessionStorage.getItem('kakao_login_return_url') || '/';
                    sessionStorage.removeItem('kakao_login_return_url');

                    navigate(returnUrl, { replace: true });
                } else {
                    throw new Error('서버 응답에 세션 정보가 없습니다');
                }
            } catch (error: any) {
                if (cancelled) return;
                console.error('[Kakao Callback] Error:', error);

                // KOE320 에러는 이미 사용된 코드라는 뜻이므로, 사용자에게는 조용히 넘어가거나 재로그인 유도
                if (error.message?.includes('KOE320')) {
                    alert('인증 코드가 만료되었습니다. 다시 로그인해주세요.');
                } else {
                    alert(error.message || '알 수 없는 오류가 발생했습니다');
                }

                navigate('/', { replace: true });
            }
        };

        // Strict Mode에서의 이중 호출 방지를 위한 Debounce (300ms)
        // 첫 번째 마운트(Effect)는 즉시 Unmount되면서 cleanup에서 타이머를 해제하므로 실행되지 않음
        // 두 번째 마운트(Effect)만 타이머가 완료되어 실행됨
        uniqueTimer = setTimeout(() => {
            handleCallback();
        }, 300);

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
