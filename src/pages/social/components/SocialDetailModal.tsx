import './SocialPlaceDetailModal.css'; // 통일된 모달 스타일 사용
import type { UnifiedSocialEvent } from '../types';

interface SocialDetailModalProps {
    item: UnifiedSocialEvent;
    onClose: () => void;
    onEdit: () => void;
    readonly?: boolean;
}

export default function SocialDetailModal({ item, onClose, onEdit, readonly = false }: SocialDetailModalProps) {
    return (
        <div className="spdm-overlay" onClick={onClose}>
            <div className="spdm-container" onClick={(e) => e.stopPropagation()}>
                {/* 닫기 FAB */}
                <button onClick={onClose} className="spdm-close-fab" title="닫기">
                    <i className="ri-close-line"></i>
                </button>

                {/* 이미지 영역 */}
                <div className="spdm-image-wrapper">
                    {item.imageUrl ? (
                        <img src={item.imageUrl} alt={item.title} className="spdm-image" />
                    ) : (
                        <div className="spdm-image-placeholder">
                            <i className="ri-calendar-event-line"></i>
                        </div>
                    )}
                </div>

                <div className="spdm-content">
                    {/* 헤더 정보 */}
                    <div className="spdm-header">
                        {item.type === 'schedule' && (
                            <span className="spdm-category-badge">정기 스케줄</span>
                        )}
                        <h2 className="spdm-title">{item.title}</h2>

                        {item.placeName && (
                            <div style={{ color: 'var(--accent-color)', fontWeight: 600, marginBottom: '0.5rem' }}>
                                @ {item.placeName}
                            </div>
                        )}

                        {item.description && (
                            <div className="spdm-description">
                                {item.description}
                            </div>
                        )}
                    </div>

                    {/* 상세 정보 아이콘 리스트 */}
                    <div className="spdm-section">

                        {item.inquiryContact && (
                            <div className="spdm-info-row">
                                <i className="ri-customer-service-2-line spdm-icon"></i>
                                <span className="spdm-text">{item.inquiryContact}</span>
                            </div>
                        )}

                        {/* URL이 없더라도 장소명이 있으면 지도 검색 링크 제공 가능하나, 여기선 linkUrl 우선 */}
                    </div>

                    {/* 하단 액션 버튼 */}
                    <div className="spdm-actions">
                        {item.linkUrl && (
                            <a
                                href={item.linkUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="spdm-btn spdm-btn-primary"
                            >
                                <i className="ri-link"></i>
                                {item.linkName || '링크 열기'}
                            </a>
                        )}

                        {!readonly && (
                            <button
                                onClick={onEdit}
                                className="spdm-btn spdm-btn-secondary"
                            >
                                <i className="ri-edit-line"></i> 수정/삭제
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
