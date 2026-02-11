import React from 'react';
import { useNavigate } from 'react-router-dom';
import './RegistrationChoiceModal.css';

interface RegistrationChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMain: () => void;
    onSelectSocial?: () => void;
    onSelectPublic?: () => void; // Optional handler for public recruitment
}

const RegistrationChoiceModal: React.FC<RegistrationChoiceModalProps> = ({
    isOpen,
    onClose,
    onSelectMain,
    onSelectPublic
}) => {
    const navigate = useNavigate();

    // Default handler if not provided
    const handleSocialSelect = () => {
        onClose();
        navigate('/social');
    };

    const handlePublicSelect = () => {
        if (onSelectPublic) {
            onSelectPublic();
        } else {
            // 임시 알림
            alert('준비 중입니다.');
        }
    };

    if (!isOpen) return null;

    return (
        <div className="choice-modal-overlay" onClick={onClose}>
            <div className="choice-modal-content" onClick={e => e.stopPropagation()}>
                <div className="choice-modal-header">
                    <h2 className="choice-modal-title">등록 유형 선택</h2>
                    <p className="choice-modal-subtitle">등록하려는 일정의 종류를 선택해주세요.</p>
                </div>

                <div className="choice-options">
                    <button className="choice-option-btn main" onClick={onSelectMain}>
                        <div className="choice-icon-wrapper">
                            <i className="ri-calendar-event-line"></i>
                        </div>
                        <div className="choice-text-content">
                            <span className="choice-label">행사 ∙ 외강 ∙ 동호회강습 등록</span>
                            <span className="choice-desc">행사, 파티, 강습 등</span>
                        </div>
                        <i className="ri-arrow-right-s-line"></i>
                    </button>

                    <button className="choice-option-btn social" onClick={handleSocialSelect}>
                        <div className="choice-icon-wrapper">
                            <i className="ri-group-line"></i>
                        </div>
                        <div className="choice-text-content">
                            <span className="choice-label">소셜 일정 등록</span>
                            <span className="choice-desc">DJ 명 필수</span>
                        </div>
                        <i className="ri-arrow-right-s-line"></i>
                    </button>

                    <button className="choice-option-btn public" onClick={handlePublicSelect}>
                        <div className="choice-icon-wrapper">
                            <i className="ri-user-heart-line"></i>
                        </div>
                        <div className="choice-text-content">
                            <span className="choice-label">민간인 모집 원데이등록</span>
                            <span className="choice-desc">댄서대상이 아닌 신규모집등록</span>
                        </div>
                        <i className="ri-arrow-right-s-line" style={{ color: '#6b7280' }}></i>
                    </button>
                </div>

                <button className="choice-modal-close" onClick={onClose}>
                    닫기
                </button>
            </div>
        </div>
    );
};

export default RegistrationChoiceModal;
