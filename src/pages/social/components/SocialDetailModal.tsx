import './SocialEditModal.css'; // Reuse container styles or create new ones
import { UnifiedSocialEvent } from './SocialCalendar';

interface SocialDetailModalProps {
    item: UnifiedSocialEvent;
    onClose: () => void;
    onEdit: () => void;
}

export default function SocialDetailModal({ item, onClose, onEdit }: SocialDetailModalProps) {
    return (
        <div className="sed-modal-overlay" onClick={onClose}>
            <div className="sed-modal-container" onClick={(e) => e.stopPropagation()}>
                <div className="detail-content">
                    <h2 className="sed-modal-title">{item.placeName || '장소 미정'}</h2>

                    <div className="detail-section">
                        <h3 className="detail-subtitle">{item.title}</h3>
                        {item.description && <p className="detail-desc">{item.description}</p>}
                    </div>

                    <div className="detail-info-grid">
                        {item.startTime && (
                            <div className="info-row">
                                <span className="info-label">시간</span>
                                <span className="info-value">{item.startTime.substring(0, 5)} ~</span>
                            </div>
                        )}

                        {item.inquiryContact && (
                            <div className="info-row">
                                <span className="info-label">문의</span>
                                <span className="info-value">{item.inquiryContact}</span>
                            </div>
                        )}
                    </div>

                    {item.linkUrl && (
                        <a href={item.linkUrl} target="_blank" rel="noopener noreferrer" className="detail-link-btn">
                            {item.linkName || '링크 열기'}
                        </a>
                    )}

                    <div className="detail-actions">
                        <button onClick={onEdit} className="detail-edit-btn">수정/삭제</button>
                        <button onClick={onClose} className="detail-close-btn">닫기</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
