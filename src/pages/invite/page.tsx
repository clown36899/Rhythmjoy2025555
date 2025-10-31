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
  const [showError, setShowError] = useState(false);

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
    setShowError(false);

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
        errorMessage = `❌ 이메일 불일치\n\n초대된 이메일: ${invitationEmail}\n\n카카오톡에 ${invitationEmail} 이메일로 로그인하세요.\n현재 다른 이메일로 로그인하셨습니다.`;
      } else if (errorMessage.includes('초대받지 않은')) {
        errorMessage = '❌ 초대받지 않은 사용자입니다.\n\n관리자에게 초대를 요청하세요.';
      } else if (errorMessage.includes('카카오 계정에서 이메일')) {
        errorMessage = '❌ 카카오톡 이메일 없음\n\n카카오톡에 등록된 이메일이 없습니다.\n카카오톡 설정에서 이메일을 등록해주세요.';
      }
      
      setError(errorMessage);
      setShowError(true);
      
      // 에러 발생 시 카카오 로그아웃 (다시 시도할 수 있도록)
      try {
        const { logoutKakao } = await import('../../utils/kakaoAuth');
        await logoutKakao();
      } catch (logoutErr) {
        console.error('카카오 로그아웃 실패:', logoutErr);
      }
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
                <span>카카오톡에 <strong className="text-yellow-300">{invitationEmail}</strong> 이메일로 로그인하세요</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="flex-shrink-0 w-6 h-6 bg-purple-600 rounded-full flex items-center justify-center text-xs font-bold">3</span>
                <span>자동으로 가입 및 로그인이 완료됩니다!</span>
              </li>
            </ol>
          </div>

          <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 mb-6">
            <p className="text-yellow-200 text-sm flex items-start gap-2">
              <i className="ri-information-line text-lg flex-shrink-0 mt-0.5"></i>
              <span>카카오톡에 <strong className="text-yellow-100">{invitationEmail}</strong> 이메일이 등록되어 있어야 합니다. 다른 이메일로는 가입할 수 없습니다.</span>
            </p>
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

          {error && showError && (
            <div className="mt-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg relative">
              <button
                onClick={() => setShowError(false)}
                className="absolute top-2 right-2 text-red-300 hover:text-red-100 transition-colors"
              >
                <i className="ri-close-line text-xl"></i>
              </button>
              <p className="text-red-200 text-sm whitespace-pre-line pr-6">{error}</p>
              <button
                onClick={() => setShowError(false)}
                className="mt-3 w-full bg-red-500/30 hover:bg-red-500/40 text-red-100 py-2 px-4 rounded-lg font-semibold transition-colors text-sm"
              >
                닫기
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
