import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { initKakaoSDK, loginWithKakao, getKakaoAccessToken } from '../../utils/kakaoAuth';
import './invite.css';

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
  const [displayName, setDisplayName] = useState('');

  const getApiUrl = () => {
    if (import.meta.env.DEV) {
      const currentHost = window.location.hostname;
      const port = currentHost.includes('repl.co') || currentHost.includes('replit.dev')
        ? ''
        : ':3001';
      return `${window.location.protocol}//${currentHost}${port}`;
    }
    return '';
  };

  const apiEndpoint = import.meta.env.DEV
    ? `${getApiUrl()}/api/invitations/validate`
    : '/.netlify/functions/invitations-validate';

  const authEndpoint = import.meta.env.DEV
    ? `${getApiUrl()}/api/auth/kakao`
    : '/.netlify/functions/kakao-login';

  useEffect(() => {
    // 초대 코드가 있으면 기존 로그인 세션 무시하고 초대 검증
    validateInvitation();
  }, [token]);

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
      console.error('[초대 검증 오류]', err);
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
      // 기존 세션이 있으면 먼저 로그아웃 (재초대 대응)
      if (user) {
        const { supabase } = await import('../../lib/supabase');
        await supabase.auth.signOut();
      }

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
          invitationToken: token,
          displayName: displayName.trim() || undefined
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
      // 에러 메시지 개선 - 짧고 명확하게
      let errorMessage = err.message || '가입 중 오류가 발생했습니다';

      if (errorMessage.includes('초대된 이메일') || errorMessage.includes('일치하지 않습니다')) {
        errorMessage = '카카오톡에 등록된 이메일이 아닙니다';
      } else if (errorMessage.includes('초대받지 않은')) {
        errorMessage = '초대받지 않은 사용자입니다';
      } else if (errorMessage.includes('카카오 계정에서 이메일')) {
        errorMessage = '카카오톡에 이메일이 등록되지 않았습니다';
      }

      setError(errorMessage);
      setShowError(true);
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="invite-page-container">
        <div className="invite-card invite-text-center">
          <div className="invite-loading-spinner"></div>
          <p className="invite-loading-text">초대 확인 중...</p>
        </div>
      </div>
    );
  }

  if (error || !invitationValid) {
    // 에러 메시지 개선
    let displayError = error || '유효하지 않은 초대입니다';

    if (displayError.includes('유효하지 않은 초대')) {
      displayError = '카카오톡에 등록되지 않은 이메일입니다';
    } else if (displayError.includes('이미 사용된')) {
      displayError = '이미 사용된 초대 코드입니다';
    } else if (displayError.includes('만료')) {
      displayError = '만료된 초대 코드입니다';
    } else if (displayError.includes('초대 코드가 없습니다')) {
      displayError = '잘못된 초대 링크입니다';
    }

    return (
      <div className="invite-page-container">
        <div className="invite-card invite-card-full">
          <div className="invite-text-center">
            <i className="ri-error-warning-line invite-error-icon"></i>
            <h2 className="invite-title">초대 오류</h2>
            <p className="invite-error-message">{displayError}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="invite-page-container">
      <div className="invite-card invite-card-full">
        <div className="invite-text-center">
          <i className="ri-mail-check-line invite-success-icon"></i>
          <h2 className="invite-title-large">초대장이 도착했습니다!</h2>
          <p className="invite-subtitle">다음 이메일로 초대되셨습니다:</p>
          <p className="invite-email">{invitationEmail}</p>

          <div className="invite-instructions">
            <h3 className="invite-instructions-title">가입 방법</h3>
            <ol className="invite-instructions-list">
              <li className="invite-instruction-item">
                <span className="invite-step-number">1</span>
                <span>아래 "카카오로 가입하기" 버튼을 클릭하세요</span>
              </li>
              <li className="invite-instruction-item">
                <span className="invite-step-number">2</span>
                <span>카카오톡에 <strong className="invite-email-highlight">{invitationEmail}</strong> 이메일로 로그인하세요</span>
              </li>
              <li className="invite-instruction-item">
                <span className="invite-step-number">3</span>
                <span>자동으로 가입 및 로그인이 완료됩니다!</span>
              </li>
            </ol>
          </div>

          <div className="invite-warning-box">
            <p className="invite-warning-text">
              <i className="ri-information-line invite-warning-icon"></i>
              <span>카카오톡에 <strong className="invite-warning-email">{invitationEmail}</strong> 이메일이 등록되어 있어야 합니다. 다른 이메일로는 가입할 수 없습니다.</span>
            </p>
          </div>

          <div className="invite-input-container">
            <label className="invite-input-label">
              표시 이름 (선택)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="카카오 닉네임 사용 (비워두면 자동)"
              className="invite-input"
              maxLength={20}
            />
            <p className="invite-input-hint">관리자 화면에 표시될 이름입니다</p>
          </div>

          <button
            onClick={handleKakaoLogin}
            disabled={processing}
            className="invite-kakao-button"
          >
            {processing ? (
              <>
                <div className="invite-button-spinner"></div>
                가입 진행 중...
              </>
            ) : (
              <>
                <i className="ri-kakao-talk-fill invite-kakao-icon"></i>
                카카오로 가입하기
              </>
            )}
          </button>

          {error && showError && (
            <div className="invite-error-box">
              <button
                onClick={() => setShowError(false)}
                className="invite-error-close"
              >
                <i className="ri-close-line invite-error-close-icon"></i>
              </button>
              <p className="invite-error-content">{error}</p>
              <button
                onClick={() => setShowError(false)}
                className="invite-error-dismiss"
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
