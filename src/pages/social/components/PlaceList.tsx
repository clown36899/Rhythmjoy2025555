import { useState } from 'react';
import type { SocialPlace } from '../types';
import './PlaceList.css';

interface PlaceListProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
  // onViewCalendar: (place: SocialPlace) => void;
  // onPlaceUpdate: () => void;
  onViewCalendar?: any; // 호환성 유지
  onPlaceUpdate?: any; // 호환성 유지
}

export default function PlaceList({ places, onPlaceSelect }: PlaceListProps) {
  // const [showAddModal, setShowAddModal] = useState(false); // Add 기능은 관리자 페이지 등으로 이동 권장
  // const { isAdmin } = useAuth();

  // The `showAuthWarning` state variable is not declared, but its usage remains.
  // To make the code syntactically correct and align with the removal of unused elements,
  // `useState` import is kept, and `showAuthWarning` is declared as `false` initially.
  // If the intention was to remove the entire `showAuthWarning` block, that would be a separate instruction.
  const [showAuthWarning, setShowAuthWarning] = useState(false);

  return (
    <div className="pl-container">
      {/* 헤더 */}
      <div className="pl-header">
        <h2 className="pl-title">목록</h2>
        {/* <button onClick={handleAddClick} className="pl-add-button">
          <i className="ri-add-line pl-add-icon"></i>
          장소 등록
        </button> */}

        {/* 관리자 아닐 때 안내 모달 */}
        {showAuthWarning && (
          <div
            className="pl-modal-overlay"
            onClick={() => setShowAuthWarning(false)}
          >
            <div
              className="pl-modal-container"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="pl-modal-content">
                <i className="ri-lock-line pl-modal-icon"></i>
                <h3 className="pl-modal-title">관리자 권한 필요</h3>
                <p className="pl-modal-text">
                  장소 등록/수정은 관리자만 가능합니다.<br />
                  문의: <span className="pl-modal-contact">010-4801-7180</span>
                </p>
                <button
                  onClick={() => setShowAuthWarning(false)}
                  className="pl-modal-button"
                >
                  확인
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 장소 리스트 - Slim Card & Image Support */}
      {places.length === 0 ? (
        <div className="pl-empty-state">
          등록된 장소가 없습니다.
        </div>
      ) : (
        <div className="pl-grid">
          {places.map((place) => (
            <div
              key={place.id}
              className="pl-card"
              onClick={() => onPlaceSelect(place)}
            >
              {/* 이미지 영역 */}
              {place.imageUrl ? (
                <img src={place.imageUrl} alt={place.name} className="pl-card-image" />
              ) : (
                <div className="pl-card-placeholder">
                  <i className="ri-map-pin-2-line"></i>
                </div>
              )}

              {/* 텍스트 정보 */}
              <div className="pl-card-content">
                <h3 className="pl-card-name">{place.name}</h3>
                <p className="pl-card-address">
                  {place.address}
                </p>
              </div>

              {/* 화살표 아이콘 */}
              <div className="pl-card-arrow">
                <i className="ri-arrow-right-s-line"></i>
              </div>
            </div>
          ))}
        </div>
      )}


    </div>
  );
}
