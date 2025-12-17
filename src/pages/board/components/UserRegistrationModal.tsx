import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import './userreg.css';

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (userData: UserData) => void;
  userId: string;
  kakaoInitialNickname?: string; // 카카오에서 받은 닉네임 (있다면)
  previewMode?: boolean;
}

export interface UserData {
  nickname: string;
  real_name: string; // Deprecated, but keeping structure for compatibility
  phone: string;     // Deprecated
  gender: string;    // Deprecated
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

    setIsSubmitting(true);

    try {
      /* 
       * 카카오 로그인을 통해 이미 인증된 상태이므로, 
       * 추가적인 개인정보(실명, 전화번호 등)는 수집하지 않고 
       * 닉네임만 board_users 테이블에 저장합니다.
       * (나머지 필드는 빈 값 또는 기본값 처리) 
       */
      const { error } = await supabase
        .from('board_users')
        .upsert({
          user_id: userId,
          nickname: nickname,
          updated_at: new Date().toISOString()
          // real_name, phone, gender 등은 스키마에서 nullable처리 했거나 기본값 사용 권장
        }, { onConflict: 'user_id' }); // upsert to handle re-registration or update

      if (error) throw error;

      alert('환영합니다! 가입이 완료되었습니다.');

      // 상위 컴포넌트에 알림
      onRegistered({
        nickname: nickname,
        real_name: '',
        phone: '',
        gender: ''
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
      <div className="userreg-modal" style={{ maxWidth: '360px' }}> {/* 더 컴팩트하게 */}

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

          {previewMode && (
            <div style={{ backgroundColor: '#fef3c7', color: '#d97706', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', marginTop: '10px', display: 'inline-block' }}>
              관리자 미리보기 모드
            </div>
          )}
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
            <p style={{ fontSize: '12px', color: '#666', marginTop: '4px' }}>
              * 추후 내 정보에서 언제든 변경할 수 있습니다.
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
              {isSubmitting ? '처리 중...' : '카카오로 1초 만에 시작하기'}
            </button>
          </div>


        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
