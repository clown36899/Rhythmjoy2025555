import { useState } from 'react';
import type { SocialPlace } from '../types';
import PlaceModal from './PlaceModal';
import { useAuth } from '../../../contexts/AuthContext';
import './PlaceList.css';

interface PlaceListProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
  onViewCalendar: (place: SocialPlace) => void;
  onPlaceUpdate: () => void;
}

export default function PlaceList({ places, onPlaceSelect, onViewCalendar, onPlaceUpdate }: PlaceListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [showAuthWarning, setShowAuthWarning] = useState(false);
  const { isAdmin } = useAuth();

  const handleAddClick = () => {
    if (!isAdmin) {
      setShowAuthWarning(true);
      return;
    }
    setShowAddModal(true);
  };

  const handleShare = (place: SocialPlace) => {
    const url = `${window.location.origin}/social/${place.id}`;

    if (navigator.share) {
      // 모바일 네이티브 공유
      navigator.share({
        title: place.name,
        text: `${place.name} - ${place.address}`,
        url: url,
      }).catch(() => {
        // 공유 취소 시 무시
      });
    } else {
      // 데스크탑: URL 복사
      navigator.clipboard.writeText(url).then(() => {
        alert('링크가 복사되었습니다!');
      }).catch(() => {
        alert('링크 복사 실패');
      });
    }
  };

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
                  장소 등록은 관리자만 가능합니다.<br />
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

      {/* 장소 리스트 - 한 줄로 압축 */}
      {places.length === 0 ? (
        <div className="pl-empty-state">
          등록된 장소가 없습니다.
        </div>
      ) : (
        <div className="pl-grid">
          {places.map((place) => (
            <div key={place.id} className="pl-card">
              <div
                onClick={() => onPlaceSelect(place)}
                className="pl-card-main"
              >
                <h3 className="pl-card-name">{place.name}</h3>
                <p className="pl-card-address">
                  {place.address.split(' ').slice(0, 3).join(' ')}
                </p>
              </div>

              {/* 액션 버튼 */}
              <div className="pl-actions">
                <button onClick={(e) => { e.stopPropagation(); onViewCalendar(place); }} className="pl-action-button" title="일정 보기">
                  <i className="ri-calendar-2-line pl-icon-calendar"></i>
                </button>
                {/* 네이버지도 바로가기 */}
                <a
                  href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name + ' ' + place.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="pl-action-button"
                  title="네이버지도에서 보기"
                >
                  <i className="ri-road-map-line pl-icon-map"></i>
                </a>

                {/* 공유 버튼 */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleShare(place);
                  }}
                  className="pl-action-button"
                  title="공유하기"
                >
                  <i className="ri-share-line pl-icon-share"></i>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 장소 등록 모달 */}
      {showAddModal && (
        <PlaceModal
          onClose={() => setShowAddModal(false)}
          onPlaceCreated={() => {
            setShowAddModal(false);
            onPlaceUpdate();
          }}
        />
      )}
    </div>
  );
}
