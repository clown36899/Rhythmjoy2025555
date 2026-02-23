import { memo } from 'react';
import { createPortal } from 'react-dom';
import './SocialNoticeModal.css';

interface SocialNoticeModalProps {
    isOpen: boolean;
    onClose: () => void;
}

const SocialNoticeModal = memo(function SocialNoticeModal({ isOpen, onClose }: SocialNoticeModalProps) {
    if (!isOpen) return null;

    return createPortal(
        <div className="social-notice-modal-overlay" onClick={onClose}>
            <div className="social-notice-modal-content" onClick={e => e.stopPropagation()}>
                <div className="social-notice-modal-header">
                    <div className="header-left">
                        <i className="ri-information-line header-icon"></i>
                        <h2>소셜 서비스 이용 안내</h2>
                    </div>
                    <button className="sn-modal-close-btn" onClick={onClose}>
                        <i className="ri-close-line"></i>
                    </button>
                </div>

                <div className="social-notice-modal-body">
                    <div className="notice-icon-box">
                        <i className="ri-add-circle-fill"></i>
                    </div>
                    <div className="notice-text-content">
                        <p className="main-notice">
                            이제 단체 등록 없이도<br />
                            <strong>소셜 일정</strong>을 바로 등록하실 수 있습니다!
                        </p>
                        <p className="sub-notice">
                            하단 메뉴 중앙의 <strong>+ 버튼</strong>을 누른 후<br />
                            '소셜 이벤트 등록'을 선택해 주세요.
                        </p>
                    </div>
                </div>

                <div className="social-notice-modal-footer">
                    <button className="sn-modal-confirm-btn" onClick={onClose}>
                        확인
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
});

export default SocialNoticeModal;
