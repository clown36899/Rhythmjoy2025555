import React from 'react';
import { createPortal } from 'react-dom';
import type { SocialSchedule } from '../types';
import './SocialDetailModal.css';
import { useModalHistory } from '../../../hooks/useModalHistory';

import { getDayName } from '../../v2/utils/eventListUtils';

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
    // Enable mobile back gesture to close modal
    useModalHistory(isOpen, onClose);

    // Progressive Loading State
    const [isHighResLoaded, setIsHighResLoaded] = React.useState(false);

    // Reset loading state when schedule changes
    React.useEffect(() => {
        setIsHighResLoaded(false);
    }, [schedule]);

    if (!isOpen || !schedule) return null;

    // Image Source Logic
    const thumbnailSrc = schedule.image_thumbnail || schedule.image_medium || schedule.image_micro || schedule.image_url;
    const highResSrc = schedule.image_full || schedule.image_url;

    // Preload HighRes
    React.useEffect(() => {
        if (highResSrc && highResSrc !== thumbnailSrc) {
            const img = new Image();
            img.src = highResSrc;
            img.onload = () => setIsHighResLoaded(true);
        } else {
            // If only one source, consider loaded immediately
            setIsHighResLoaded(true);
        }
    }, [highResSrc, thumbnailSrc]);

    const handleShare = async () => {
        const s = schedule as any;
        let realId = s.originalId;
        if (!realId && typeof s.id === 'string' && s.id.startsWith('schedule-')) {
            realId = Number(s.id.replace('schedule-', ''));
        }
        if (!realId) realId = Number(s.id);

        const url = `${window.location.origin}/social?scheduleId=${realId}`;
        const shareData = {
            title: s.title,
            text: `${s.title} @ ${s.place_name || ''}\n`,
            url: url
        };

        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else {
                await navigator.clipboard.writeText(url);
                alert('일정 링크가 복사되었습니다!');
            }
        } catch (err) {
            console.error('공유 실패:', err);
            if ((err as Error).name !== 'AbortError') {
                try {
                    await navigator.clipboard.writeText(url);
                    alert('일정 링크가 복사되었습니다!');
                } catch (copyErr) {
                    alert('공유 기능을 사용할 수 없습니다.');
                }
            }
        }
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
                        {highResSrc ? (
                            <>
                                {/* 1. Thumbnail (Base Layer) */}
                                <img
                                    src={thumbnailSrc || highResSrc}
                                    alt={schedule.title}
                                    style={{
                                        display: 'block',
                                        width: '100%',
                                        height: '100%',
                                        objectFit: 'cover',
                                        opacity: 1,
                                        position: 'relative',
                                        zIndex: 1
                                    }}
                                />

                                {/* 2. HighRes (Overlay Layer) */}
                                {highResSrc !== thumbnailSrc && (
                                    <img
                                        src={highResSrc}
                                        alt={schedule.title}
                                        style={{
                                            position: 'absolute',
                                            top: 0,
                                            left: 0,
                                            width: '100%',
                                            height: '100%',
                                            objectFit: 'cover',
                                            opacity: isHighResLoaded ? 1 : 0,
                                            transition: 'opacity 0.3s ease-in-out',
                                            zIndex: 2
                                        }}
                                    />
                                )}
                            </>
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
                                    {schedule.date ? `${schedule.date} (${getDayName(schedule.date)})` :
                                        schedule.day_of_week !== undefined && schedule.day_of_week !== null ?
                                            ['일', '월', '화', '수', '목', '금', '토'][schedule.day_of_week] + '요일' : ''}
                                    {' '}
                                    {schedule.start_time ? schedule.start_time.substring(0, 5) : ''}
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
