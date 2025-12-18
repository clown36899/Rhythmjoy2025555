import { createPortal } from 'react-dom';
import './userreg.css';

interface UserRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRegistered: (userData: UserData) => void;
}

export interface UserData {
  nickname: string;
  profile_image?: string; // Profile image URL
}

export default function UserRegistrationModal({
  isOpen,
  onClose,
  onRegistered
}: UserRegistrationModalProps) {

  const handleSubmit = async () => {
    onRegistered({ nickname: '(automatic)' });
    onClose();
  };



  if (!isOpen) return null;

  const modalContent = (
    <div className="userreg-overlay">
      <div className="userreg-modal" style={{ maxWidth: '360px' }}>

        <div className="userreg-header" style={{ textAlign: 'center' }}>
          <button
            onClick={onClose}
            className="userreg-close-btn"
            style={{ position: 'absolute', right: '16px', top: '16px' }}
          >
            <i className="ri-close-line text-2xl"></i>
          </button>

          <h2 className="userreg-title" style={{ fontSize: '1.25rem', marginTop: '20px' }}>
            환영합니다!
          </h2>
        </div>

        {/* Content */}
        <div className="userreg-form">
          <div style={{ marginTop: '20px' }}>
            <button
              onClick={handleSubmit}
              className="userreg-submit-btn"
              style={{
                backgroundColor: '#FEE500',
                color: '#000000',
                fontWeight: 600,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                cursor: 'pointer'
              }}
            >
              <i className="ri-kakao-talk-fill" style={{ fontSize: '1.2rem' }}></i>
              카카오로 1초 만에 시작하기
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
