import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { SocialGroup } from '../types';
import './SocialRecruitModal.css';

interface SocialRecruitModalProps {
    group: SocialGroup;
    onClose: () => void;
    onEdit?: (group: SocialGroup) => void;
}

export default function SocialRecruitModal({ group, onClose, onEdit }: SocialRecruitModalProps) {
    useEffect(() => {
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = 'unset';
            // 모달 히스토리 관리는 상위에서 하지 않으므로 여기서 직접 popState 처리 필요할 수도 있음
            // (간단하게 닫기만 구현)
        };
    }, []);

    if (!group.recruit_content) return null;

    return createPortal(
        <div className="srm-overlay" onClick={onClose}>
            <div className="srm-container" onClick={(e) => e.stopPropagation()}>
                <button className="srm-close-btn" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>

                <div className="srm-header">
                    <span className="srm-badge">new</span>
                    <h2 className="srm-title">{group.name} 신규 모집</h2>
                </div>

                <div className="srm-scroll-content">
                    {group.recruit_image && (
                        <div className="srm-image-wrapper">
                            <img src={group.recruit_image} alt="Recruit Poster" className="srm-image" />
                        </div>
                    )}

                    <div className="srm-content-box">
                        <p className="srm-text">{group.recruit_content}</p>
                    </div>

                    <div className="srm-info-section">
                        {group.recruit_contact && (
                            <div className="srm-info-item">
                                <span className="srm-label">연락처</span>
                                <span className="srm-value">{group.recruit_contact}</span>
                            </div>
                        )}
                        {group.recruit_link && (
                            <div className="srm-info-item">
                                <span className="srm-label">신청/문의</span>
                                <a href={group.recruit_link} target="_blank" rel="noopener noreferrer" className="srm-link">
                                    바로가기 <i className="ri-external-link-line"></i>
                                </a>
                            </div>
                        )}
                    </div>
                </div>

                <div className="srm-footer">
                    <button className="srm-edit-btn" onClick={() => onEdit?.(group)}>
                        <i className="ri-edit-line"></i> 수정
                    </button>
                    <button className="srm-confirm-btn" onClick={onClose}>
                        확인
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
