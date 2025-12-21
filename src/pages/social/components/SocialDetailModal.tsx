import { useState } from 'react';
import './SocialPlaceDetailModal.css'; // 통일된 모달 스타일 사용
import type { UnifiedSocialEvent } from '../types';
import { useAuth } from '../../../contexts/AuthContext';

interface SocialDetailModalProps {
    item: UnifiedSocialEvent;
    onClose: () => void;
    onEdit: () => void;
    readonly?: boolean;
    onVenueClick?: (venueId: string) => void;
}

export default function SocialDetailModal({ item, onClose, onEdit, readonly: _readonly = false, onVenueClick }: SocialDetailModalProps) {
    const { user, signInWithKakao } = useAuth();
    const [showLoginPrompt, setShowLoginPrompt] = useState(false);

    const handleLogin = () => {
        signInWithKakao();
    };

    return (
        <div className="spdm-overlay" onClick={onClose}>
            <div className="spdm-container" onClick={(e) => e.stopPropagation()}>

                {/* 로그인 유도 화면 */}
                {showLoginPrompt ? (
                    <div style={{
                        padding: '2rem',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        height: '100%',
                        textAlign: 'center'
                    }}>
                        <h2 className="spdm-title" style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>로그인 필요</h2>
                        <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                            수정/삭제하려면 로그인이 필요합니다.<br />
                            간편하게 로그인하고 계속하세요!
                        </p>
                        <button
                            onClick={handleLogin}
                            style={{
                                width: '100%',
                                padding: '1rem',
                                background: '#FEE500',
                                color: '#000000',
                                border: 'none',
                                borderRadius: '0.5rem',
                                fontSize: '1rem',
                                fontWeight: '600',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: '0.5rem',
                                marginBottom: '1rem'
                            }}
                        >
                            <i className="ri-kakao-talk-fill" style={{ fontSize: '1.5rem' }}></i>
                            카카오로 로그인
                        </button>
                        <button
                            onClick={() => setShowLoginPrompt(false)}
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'transparent',
                                color: '#9ca3af',
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                borderRadius: '0.5rem',
                                cursor: 'pointer'
                            }}
                        >
                            취소
                        </button>
                    </div>
                ) : (
                    <>
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
                                    <span className="spdm-category-badge">
                                        <i className="ri-calendar-check-line" style={{ marginRight: '4px', fontSize: '0.85rem' }}></i>
                                        정기 스케줄
                                    </span>
                                )}
                                <h2 className="spdm-title">{item.title}</h2>

                                {item.placeName && (
                                    <div
                                        onClick={() => {
                                            if (item.venueId && onVenueClick) {
                                                onVenueClick(item.venueId);
                                            }
                                        }}
                                        style={{
                                            color: item.venueId ? '#3b82f6' : '#3b82f6',
                                            fontWeight: 600,
                                            marginBottom: '0.75rem',
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.5rem',
                                            cursor: item.venueId ? 'pointer' : 'default',
                                            textDecoration: item.venueId ? 'underline' : 'none'
                                        }}
                                    >
                                        <i className="ri-map-pin-2-fill" style={{ fontSize: '1.1rem' }}></i>
                                        <span>{item.placeName}</span>
                                    </div>
                                )}

                                {item.description && (
                                    <div className="spdm-description">
                                        {item.description}
                                    </div>
                                )}
                            </div>

                            {/* 상세 정보 아이콘 리스트 */}
                            {item.inquiryContact && (
                                <div className="spdm-section">
                                    <div className="spdm-info-row">
                                        <i className="ri-customer-service-2-line spdm-icon"></i>
                                        <span className="spdm-text">{item.inquiryContact}</span>
                                    </div>
                                </div>
                            )}

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

                                <button
                                    onClick={() => {
                                        if (!user) {
                                            setShowLoginPrompt(true);
                                        } else {
                                            onEdit();
                                        }
                                    }}
                                    className="spdm-btn spdm-btn-secondary"
                                >
                                    <i className="ri-edit-line"></i> 수정/삭제
                                </button>
                            </div>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
