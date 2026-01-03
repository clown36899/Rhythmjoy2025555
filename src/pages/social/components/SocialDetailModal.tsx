import React from 'react';
import { createPortal } from 'react-dom';
import type { SocialSchedule } from '../types';
import './SocialDetailModal.css';
import { useModalHistory } from '../../../hooks/useModalHistory';
import { useAuth } from '../../../contexts/AuthContext';

import { getDayName } from '../../v2/utils/eventListUtils';
import { sanitizeAddressForMap } from '../../../utils/mapUtils';

interface SocialDetailModalProps {
    isOpen: boolean;
    onClose: () => void;
    schedule: SocialSchedule | null;
    onCopy: (schedule: SocialSchedule) => void;
    onEdit: (schedule: SocialSchedule) => void;
    isAdmin: boolean;
    showCopyButton?: boolean;
}

const SocialDetailModal: React.FC<SocialDetailModalProps> = ({
    isOpen,
    onClose,
    schedule,
    onCopy,
    onEdit,
    isAdmin,
    showCopyButton = false
}) => {
    const { user, isAdmin: isActualAdmin } = useAuth();
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
    const thumbnailSrc = schedule.image_micro || schedule.image_thumbnail || schedule.image_medium || schedule.image_url;
    const highResSrc = schedule.image_medium || schedule.image_url;

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
        <div className="social-detail-overlay">
            <div className="social-detail-container" onClick={(e) => e.stopPropagation()}>
                {/* 고정된 버튼 영역 (스크롤 안됨) */}
                <button className="detail-close-btn" onClick={onClose}>
                    <i className="ri-close-line"></i>
                </button>
                <div className="detail-share-box">
                    <button
                        className="icon-btn-circle"
                        onClick={handleShare}
                        data-analytics-id={schedule.id}
                        data-analytics-type="share"
                        data-analytics-title={schedule.title}
                        data-analytics-section="social_detail_header"
                    >
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
                            {/* 작성자 정보 표시 (전체 공개) */}
                            {/* 관리자 및 작성자 본인에게만 작성자 정보 표시 */}
                            {(() => {
                                const shouldShow = isActualAdmin || (user && user.id === schedule.user_id);
                                console.log('[SocialDetailModal] Author info visibility check:', {
                                    isActualAdmin,
                                    userId: user?.id,
                                    scheduleUserId: schedule.user_id,
                                    shouldShow
                                });
                                return shouldShow;
                            })() && (
                                    <div className="detail-admin-author">
                                        <i className="ri-user-settings-line"></i>
                                        <span>
                                            등록: {schedule.created_at ? new Date(schedule.created_at).toLocaleDateString() : '날짜 없음'} | 계정: {schedule.board_users?.nickname || '정보 없음'}
                                        </span>
                                    </div>
                                )}
                        </div>

                        <div className="detail-description">
                            {schedule.description ? (
                                <p>{schedule.description}</p>
                            ) : (
                                <p className="no-desc">상세 설명이 등록되지 않았습니다.</p>
                            )}
                        </div>

                        <div
                            className="detail-place-box"
                            style={{ cursor: 'default' }} // Remove pointer cursor from container
                        >
                            <div className="place-icon">
                                <i className="ri-map-pin-2-fill"></i>
                            </div>
                            <div className="place-info">
                                <div className="place-name">{schedule.place_name}</div>
                                <div className="place-addr">{schedule.address || '주소 정보가 없습니다.'}</div>

                                <div className="detail-map-buttons">
                                    <button
                                        onClick={openMap}
                                        className="detail-map-btn naver"
                                        data-analytics-id={schedule.id}
                                        data-analytics-type="map_link_naver"
                                    >
                                        <i className="ri-map-pin-line"></i> 네이버지도
                                    </button>
                                    <button
                                        onClick={() => {
                                            if (schedule.address) {
                                                const query = sanitizeAddressForMap(schedule.address);
                                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, '_blank');
                                            } else if (schedule.place_name) {
                                                window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(schedule.place_name)}`, '_blank');
                                            }
                                        }}
                                        className="detail-map-btn google"
                                        data-analytics-id={schedule.id}
                                        data-analytics-type="map_link_google"
                                    >
                                        <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                        </svg> Google Map
                                    </button>
                                </div>
                            </div>
                        </div>

                        {schedule.link_url && (
                            <div
                                className="detail-place-box detail-link-box"
                                onClick={() => window.open(schedule.link_url, '_blank')}
                                data-analytics-id={schedule.id}
                                data-analytics-type="external_link"
                                data-analytics-title={schedule.link_name || '관련 링크'}
                                data-analytics-section="social_detail_content"
                            >
                                <div className="place-icon link-icon">
                                    <i className="ri-link"></i>
                                </div>
                                <div className="place-info">
                                    <div className="place-name link-title">
                                        {schedule.link_name || '관련 링크'}
                                    </div>
                                    <div className="place-addr link-url">
                                        {schedule.link_url}
                                    </div>
                                </div>
                                <div className="place-map-arrow">
                                    <i className="ri-arrow-right-up-line"></i>
                                </div>
                            </div>
                        )}

                        {/* Admin Actions */}
                        {isAdmin && (
                            <div className="detail-admin-actions">
                                {showCopyButton && (
                                    <button className="admin-btn copy" onClick={() => onCopy(schedule)}>
                                        <i className="ri-file-copy-line"></i> 일정 복사
                                    </button>
                                )}
                                <button className="admin-btn edit" onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onEdit(schedule);
                                }}>
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
