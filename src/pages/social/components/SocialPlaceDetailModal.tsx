import './SocialPlaceDetailModal.css'; // 전용 스타일 사용
import type { SocialPlace } from '../types';

interface SocialPlaceDetailModalProps {
    place: SocialPlace;
    onClose: () => void;
}

export default function SocialPlaceDetailModal({ place, onClose }: SocialPlaceDetailModalProps) {
    return (
        <div className="spdm-overlay" onClick={onClose}>
            <div className="spdm-container" onClick={(e) => e.stopPropagation()}>
                {/* 닫기 FAB (이미지 위 오버레이) */}
                <button onClick={onClose} className="spdm-close-fab" title="닫기">
                    <i className="ri-close-line"></i>
                </button>

                {/* 이미지 영역 */}
                <div className="spdm-image-wrapper">
                    {place.imageUrl ? (
                        <img src={place.imageUrl} alt={place.name} className="spdm-image" />
                    ) : (
                        <div className="spdm-image-placeholder">
                            <i className="ri-image-line"></i>
                        </div>
                    )}
                </div>

                <div className="spdm-content">
                    {/* 헤더 정보 */}
                    <div className="spdm-header">
                        {/* 카테고리는 아직 데이터에 없지만, 있으면 뱃지로 표시 가능 */}
                        {/* <span className="spdm-category-badge">Swing Bar</span> */}
                        <h2 className="spdm-title">{place.name}</h2>

                        {place.description && (
                            <div className="spdm-description">
                                {place.description}
                            </div>
                        )}
                    </div>

                    {/* 상세 정보 아이콘 리스트 */}
                    <div className="spdm-section">
                        <div className="spdm-info-row">
                            <i className="ri-map-pin-line spdm-icon"></i>
                            <span className="spdm-text">{place.address || '주소 정보가 없습니다.'}</span>
                        </div>

                        {place.contact && (
                            <div className="spdm-info-row">
                                <i className="ri-phone-line spdm-icon"></i>
                                <span className="spdm-text">{place.contact}</span>
                            </div>
                        )}
                    </div>

                    {/* 하단 액션 버튼 */}
                    <div className="spdm-actions">
                        <a
                            href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name + ' ' + place.address)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="spdm-btn spdm-btn-primary"
                        >
                            <i className="ri-map-2-line"></i>
                            네이버 지도
                        </a>
                        {/* 
                         추후 찜하기나 공유하기 버튼 추가 가능
                         <button className="spdm-btn spdm-btn-secondary">
                             <i className="ri-share-line"></i> 공유
                         </button> 
                        */}
                    </div>
                </div>
            </div>
        </div>
    );
}
