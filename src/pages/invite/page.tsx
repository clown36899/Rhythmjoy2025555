import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { initKakaoSDK, loginWithKakao, getKakaoAccessToken } from '../../utils/kakaoAuth';

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [invitationValid, setInvitationValid] = useState(false);
  const [invitationEmail, setInvitationEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  const apiEndpoint = import.meta.env.DEV 
    ? '/api/invitations/validate' 
    : '/.netlify/functions/invitations-validate';

  const authEndpoint = import.meta.env.DEV 
    ? '/api/auth/kakao'
    : '/.netlify/functions/kakao-auth';

  useEffect(() => {
    if (user) {
      navigate('/');
      return;
    }

    validateInvitation();
  }, [token, user]);

  const validateInvitation = async () => {
    if (!token) {
      setError('초대 코드가 없습니다');
      setLoading(false);
      return;
    }

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ token })
      });

      if (response.ok) {
        const data = await response.json();
        setInvitationValid(true);
        setInvitationEmail(data.email);
      } else {
        const errorData = await response.json();
        setError(errorData.error || '유효하지 않은 초대입니다');
      }
    } catch (err) {
      setError('초대 확인 중 오류가 발생했습니다');
    } finally {
      setLoading(false);
    }
  };

  const handleKakaoLogin = async () => {
    setProcessing(true);
    setError('');

    try {
      await initKakaoSDK();
      await loginWithKakao();
      
      const accessToken = getKakaoAccessToken();
      if (!accessToken) {
        throw new Error('카카오 액세스 토큰을 가져올 수 없습니다');
      }

      const response = await fetch(authEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          kakaoAccessToken: accessToken,
          invitationToken: token
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || errorData.message || '인증에 실패했습니다');
      }

      const authData = await response.json();

      // 서버에서 받은 세션으로 자동 로그인
      if (authData.session) {
        const { supabase } = await import('../../lib/supabase');
        const { error: sessionError } = await supabase.auth.setSession({
          access_token: authData.session.access_token,
          refresh_token: authData.session.refresh_token,
        });

        if (sessionError) {
          throw new Error('로그인에 실패했습니다');
        }

        // 성공 페이지로 이동
        navigate('/', { replace: true });
      }
    } catch (err: any) {
      // 에러 메시지 개선
      let errorMessage = err.message || '가입 중 오류가 발생했습니다';
      
      if (errorMessage.includes('초대된 이메일') || errorMessage.includes('일치하지 않습니다')) {
        errorMessage = `❌ 이메일 불일치\n\n초대된 이메일: ${invitationEmail}\n\n카카오톡에서 반드시 ${invitationEmail} 계정으로 로그인하세요.`;
      } else if (errorMessage.includes('초대받지 않은')) {
        errorMessage = '❌ 초대받지 않은 사용자입니다.\n관리자에게 초대를 요청하세요.';
      }
      
      setError(errorMessage);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 rounded-2xl p-8 backdrop-blur-lg border border-white/20 text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-white mx-auto mb-4"></div>
          <p className="text-white text-lg">초대 확인 중...</p>
        </div>
      </div>
    );
  }

  if (error || !invitationValid) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
        <div className="bg-white/10 rounded-2xl p-8 backdrop-blur-lg border border-white/20 max-w-md w-full">
          <div className="text-center">
            <i className="ri-error-warning-line text-6xl text-red-400 mb-4"></i>
            <h2 className="text-2xl font-bold text-white mb-4">초대 오류</h2>
            <p className="text-white/80 mb-6">{error || '유효하지 않은 초대입니다'}</p>
            <button
              onClick={() => navigate('/')}
              className="px-6 py-3 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-semibold rounded-lg hover:from-purple-700 hover:to-blue-700 transition-all"
            >
              홈으로 돌아가기
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 via-blue-900 to-indigo-900 flex items-center justify-center p-4">
      <div className="bg-white/10 rounded-2xl p-8 backdrop-blur-lg border border-white/20 max-w-md w-full">
        <div className="text-center">
          <i className="ri-mail-check-line text-6xl text-green-400 mb-4"></i>
          <h2 className="text-3xl font-bold text-white mb-2">초대장이 도착했습니다!</h2>
          <p className="text-white/80 mb-2">다음 이메일로 초대되셨습니다:</p>
          <p className="text-xl font-semibold text-purple-300 mb-6">{invitationEmail}</p>
          
          <div className="bg-white/5 rounded-lg p-6 mb-6 border border-white/10">
            <h3 className="text-lg font-semibold text-white mb-3">가입 방법</h3>
            <ol className="text-left text-white/80 space-y-2 text-sm">
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">1</span>
                <span>아래 "카카오로 가입하기" 버튼을 클릭하세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">2</span>
                <span>카카오톡에서 <strong>{invitationEmail}</strong> 계정으로 로그인하세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>자동으로 가입 및 로그인이 완료됩니다!</span>
              </li>
            </ol>
          </div>

          <button
            onClick={handleKakaoLogin}
            disabled={processing}
            className="w-full py-4 bg-[#FEE500] text-[#000000] font-bold rounded-lg hover:bg-[#FDD835] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-lg"
          >
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-black"></div>
                가입 진행 중...
              </>
            ) : (
              <>
                <i className="ri-kakao-talk-fill text-2xl"></i>
                카카오로 가입하기
              </>
            )}
          </button>

          {error && (
            <div className="mt-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg">
              <p className="text-red-300 text-sm">{error}</p>
            </div>
          )}

          <p className="text-white/60 text-xs mt-6">
            초대받은 이메일과 카카오 이메일이 일치해야 합니다
          </p>
        </div>
      </div>
    </div>
  );
}
