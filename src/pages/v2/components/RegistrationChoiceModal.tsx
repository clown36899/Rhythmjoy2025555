import React from 'react';
import { useNavigate } from 'react-router-dom';
import './RegistrationChoiceModal.css';

interface RegistrationChoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSelectMain: () => void;
    onSelectSocial?: () => void;
    onSelectOneDay?: () => void;
}

const RegistrationChoiceModal: React.FC<RegistrationChoiceModalProps> = ({
    isOpen,
    onClose,
    onSelectMain,
    onSelectSocial,
    onSelectOneDay
}) => {
    const navigate = useNavigate();

    // Default handler if not provided
    const handleSocialSelect = () => {
        if (onSelectSocial) {
            onSelectSocial();
        } else {
            onClose();
            navigate('/social');
        }
    };

    const handleOneDaySelect = () => {
        if (onSelectOneDay) {
            onSelectOneDay();
            return;
        }
        onClose();
        navigate('/oneday-recruits');
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

                    <button className="choice-option-btn oneday" onClick={handleOneDaySelect}>
                        <div className="choice-icon-wrapper">
                            <i className="ri-links-line"></i>
                        </div>
                        <div className="choice-text-content">
                            <span className="choice-label">원데이 모집 링크 등록</span>
                            <span className="choice-desc">입문/체험 모집 페이지</span>
                        </div>
                        <i className="ri-arrow-right-s-line"></i>
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
