import { useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../../lib/supabase';
import '../../../styles/pages/auth-callback.css';

export default function KakaoCallbackPage() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const processingRef = useRef(false); // Ref to track processing state across renders

    useEffect(() => {
        let cancelled = false;

        const handleCallback = async () => {
            // Prevent double execution in Strict Mode or if called multiple times
            if (processingRef.current) return;
            processingRef.current = true;

            try {
                // 1. URL에서 인증 코드 추출
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

                if (!code) {
                    if (cancelled) return;
                    alert('인증 코드가 없습니다.');
                    navigate('/', { replace: true });
                    return;
                }

                console.log('[Kakao Callback] 인증 코드 수신:', code.substring(0, 10) + '...');

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
                    console.log('[Kakao Callback] Session data:', JSON.stringify(authData.session, null, 2));
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
                alert(error.message || '알 수 없는 오류가 발생했습니다');
                navigate('/', { replace: true });
            }
        };

        handleCallback();

        return () => {
            cancelled = true; // Cleanup: prevent state updates after unmount
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
