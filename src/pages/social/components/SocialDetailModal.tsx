import React from 'react';
import { createPortal } from 'react-dom';
import type { SocialSchedule } from '../types';
import './SocialDetailModal.css';

interface SocialDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: SocialSchedule | null;
    onCopy: (schedule: SocialSchedule) => void;
    onEdit: (schedule: SocialSchedule) => void;
    isAdmin: boolean;
}

const SocialDetailModal: React.FC<SocialDetailModalProps> = ({
    isOpen,
    onClose,
    schedule,
    onCopy,
    onEdit,
    isAdmin
}) => {
    if (!isOpen || !schedule) return null;

    const handleShare = () => {
        const url = `${window.location.origin}/social?scheduleId=${schedule.id}`;
        navigator.clipboard.writeText(url).then(() => {
            alert('일정 링크가 복사되었습니다!');
        });
    };

    const openMap = () => {
        if (schedule.address) {
            window.open(`https://map.naver.com/p/search/${encodeURIComponent(schedule.address)}`, '_blank');
        } else if (schedule.place_name) {
            window.open(`https://map.naver.com/p/search/${encodeURIComponent(schedule.place_name)}`, '_blank');
        }
    };

    return createPortal(
        <div className="social-detail-overlay" onClick={onClose}>
            <div className="social-detail-container" onClick={(e) => e.stopPropagation()}>
                {/* 고정된 버튼 영역 (스크롤 안됨) */}
                <button className="detail-close-btn" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>
                <div className="detail-share-box">
                    <button className="icon-btn-circle" onClick={handleShare}>
                        <i className="ri-share-forward-line"></i>
                    </button>
                </div>

                {/* 스크롤되는 영역 (이미지 + 내용) */}
                <div className="social-detail-scroller">
                    <div className="social-detail-image-box">
                        {schedule.image_full || schedule.image_url ? (
                            <img src={schedule.image_full || schedule.image_url} alt={schedule.title} />
                        ) : (
                            <div className="detail-placeholder">
                                <i className="ri-calendar-event-fill"></i>
                            </div>
                        )}
                    </div>

                    <div className="social-detail-content">
                        <div className="detail-header-info">
                            <h2 className="detail-title">{schedule.title}</h2>
                            <div className="detail-time-row">
                                <i className="ri-time-line"></i>
                                <span>
                                    {schedule.date || ''}
                                    {schedule.day_of_week !== undefined && ` (${['일', '월', '화', '수', '목', '금', '토'][schedule.day_of_week]}) `}
                                    {schedule.start_time?.substring(0, 5)}
                                </span>
                            </div>
                        </div>

                        <div className="detail-description">
                            {schedule.description ? (
                                <p>{schedule.description}</p>
                            ) : (
                                <p className="no-desc">상세 설명이 등록되지 않았습니다.</p>
                            )}
                        </div>

                        <div className="detail-place-box" onClick={openMap}>
                            <div className="place-icon">
                                <i className="ri-map-pin-2-fill"></i>
                            </div>
                            <div className="place-info">
                                <div className="place-name">{schedule.place_name}</div>
                                <div className="place-addr">{schedule.address || '주소 정보가 없습니다.'}</div>
                            </div>
                            <div className="place-map-arrow">
                                <i className="ri-external-link-line"></i>
                            </div>
                        </div>

                        {/* Admin Actions */}
                        {isAdmin && (
                            <div className="detail-admin-actions">
                                <button className="admin-btn copy" onClick={() => onCopy(schedule)}>
                                    <i className="ri-file-copy-line"></i> 일정 복사
                                </button>
                                <button className="admin-btn edit" onClick={() => onEdit(schedule)}>
                                    <i className="ri-edit-line"></i> 일정 수정
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
};

export default SocialDetailModal;
