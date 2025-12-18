import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import './userreg.css';

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (userData: UserData) => void;
  userId?: string; // Optional for pre-login mode
  kakaoInitialNickname?: string; // 카카오에서 받은 닉네임 (있다면)
  previewMode?: boolean;
}

export interface UserData {
  nickname: string;
  real_name: string; // Deprecated, but keeping structure for compatibility
  phone: string;     // Deprecated
  gender: string;    // Deprecated
  profile_image?: string; // Profile image URL
}

export default function UserRegistrationModal({
  isOpen,
  onClose,
  onRegistered,
  userId,
  kakaoInitialNickname = '',
  previewMode = false
}: UserRegistrationModalProps) {
  // 초기 닉네임은 카카오 닉네임으로 설정
  const [nickname, setNickname] = useState(kakaoInitialNickname);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nicknameStatus, setNicknameStatus] = useState<{
    isAvailable: boolean;
    message: string;
    checking: boolean;
  } | null>(null);

  // Debounced check
  useEffect(() => {
    const timer = setTimeout(() => {
      if (nickname.trim()) {
        checkNicknameAvailability(nickname.trim());
      } else {
        setNicknameStatus(null);
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [nickname]);

  const checkNicknameAvailability = async (name: string) => {
    if (!name || name.length < 2) {
      setNicknameStatus({ isAvailable: false, message: '2자 이상 입력해주세요', checking: false });
      return;
    }

    setNicknameStatus(prev => ({ ...prev, isAvailable: false, message: '확인 중...', checking: true }));

    try {
      const { data, error } = await supabase
        .from('board_users')
        .select('user_id')
        .eq('nickname', name)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // 이미 존재하는 닉네임인 경우
        if (userId && data.user_id === userId) {
          // 본인의 현재 닉네임인 경우
          setNicknameStatus({ isAvailable: true, message: '현재 사용 중인 닉네임입니다', checking: false });
        } else {
          setNicknameStatus({ isAvailable: false, message: '이미 사용 중인 닉네임입니다', checking: false });
        }
      } else {
        setNicknameStatus({ isAvailable: true, message: '사용 가능한 닉네임입니다', checking: false });
      }
    } catch (err) {
      console.error('닉네임 중복 체크 실패:', err);
      setNicknameStatus(null);
    }
  };

  // 카카오 닉네임이 늦게 들어올 경우를 대비해 effect 추가
  useEffect(() => {
    if (kakaoInitialNickname) {
      setNickname(kakaoInitialNickname);
    }
  }, [kakaoInitialNickname]);

  const handleSubmit = async () => {
    // 미리보기 모드면 실제 저장하지 않음
    if (previewMode) {
      alert('미리보기 모드입니다. 실제 가입은 되지 않습니다.');
      return;
    }

    if (!nickname.trim()) {
      alert('닉네임을 입력해주세요.');
      return;
    }

    // Pre-login mode: Trigger Kakao login and then save
    if (!userId) {
      setIsSubmitting(true);
      try {
        // 상위에서 전달된 signInWithKakao 같은 것을 쓰거나, 직접 호출
        // 여기서는 MobileShell에서 이 모달을 띄울 때 onRegistered를 통해 결과를 처리하도록 함
        // 하지만 사용자의 요구사항은 "카톡버튼 누르면 카톡에서 가입절차 진행"임.
        // 따라서 여기서 직접 로그인을 트리거하는 것이 자연스러움.

        // 하지만 UserRegistrationModal은 순수 UI 컴포넌트로 남겨두고, 
        // MobileShell에서 전달받은 로직을 실행하는 것이 좋음.
        // props에 onLoginAndRegister 추가 고려.

        onRegistered({
          nickname: nickname,
          real_name: '',
          phone: '',
          gender: 'other'
        });
      } catch (error) {
        console.error('로그인 중 오류:', error);
      } finally {
        setIsSubmitting(false);
      }
      return;
    }

    // Post-login mode: Save to database
    setIsSubmitting(true);

    try {
      const { error } = await supabase
        .from('board_users')
        .upsert({
          user_id: userId,
          nickname: nickname,
          gender: 'other', // Required field in schema
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id' });

      if (error) throw error;

      // No success alert as per user request

      onRegistered({
        nickname: nickname,
        real_name: '',
        phone: '',
        gender: 'other'
      });

      onClose();
    } catch (error: any) {
      console.error('가입 실패:', error);
      alert(`가입 중 오류가 발생했습니다: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="userreg-overlay">
      <div className="userreg-modal" style={{ maxWidth: '360px' }}>

        {/* Header */}
        <div className="userreg-header" style={{ textAlign: 'center', paddingBottom: '10px' }}>
          <button
            onClick={onClose}
            className="userreg-close-btn"
            style={{ position: 'absolute', right: '16px', top: '16px' }}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>

          <h2 className="userreg-title" style={{ fontSize: '1.25rem' }}>
            환영합니다!
          </h2>
          <p className="userreg-subtitle" style={{ marginTop: '8px' }}>
            닉네임만 정하면 가입이 완료됩니다.
          </p>


        </div>

        {/* Content */}
        <div className="userreg-form">
          <div className="userreg-field">
            <label className="userreg-label">
              닉네임
            </label>
            <input
              type="text"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              className="userreg-input"
              placeholder="멋진 닉네임을 지어주세요"
              autoFocus
            />
            <p style={{
              fontSize: '12px',
              color: nicknameStatus ? (nicknameStatus.isAvailable ? '#4ade80' : '#f87171') : '#666',
              marginTop: '4px'
            }}>
              {nicknameStatus ? nicknameStatus.message : '* 추후 내 정보에서 언제든 변경할 수 있습니다.'}
            </p>
          </div>

          <div style={{ marginTop: '20px' }}>
            <button
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="userreg-submit-btn"
              style={{
                backgroundColor: '#FEE500',
                color: '#000000',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px'
              }}
            >
              <i className="ri-kakao-talk-fill" style={{ fontSize: '1.2rem' }}></i>
              {isSubmitting ? '처리 중...' : userId ? '가입 완료하기' : '카카오로 1초 만에 시작하기'}
            </button>
          </div>


        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
