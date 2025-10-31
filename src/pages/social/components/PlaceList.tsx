import { useState, useEffect } from 'react';
import type { SocialPlace } from '../page';
import PlaceModal from './PlaceModal';

interface PlaceListProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
  onPlaceUpdate: () => void;
}

export default function PlaceList({ places, onPlaceSelect, onPlaceUpdate }: PlaceListProps) {
  const [showAddModal, setShowAddModal] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);

  // 관리자 모드 체크 (localStorage에서)
  useEffect(() => {
    const checkAdminMode = () => {
      const adminPassword = localStorage.getItem('adminPassword');
      setIsAdminMode(!!adminPassword);
    };

    checkAdminMode();
    window.addEventListener('storage', checkAdminMode);
    return () => window.removeEventListener('storage', checkAdminMode);
  }, []);

  return (
    <div className="px-4 pb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold text-white">장소 목록</h2>
        {isAdminMode && (
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
          >
            <i className="ri-add-line mr-1"></i>
            장소 등록
          </button>
        )}
      </div>

      {/* 장소 리스트 */}
      {places.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          등록된 장소가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3">
          {places.map((place) => (
            <div
              key={place.id}
              onClick={() => onPlaceSelect(place)}
              className="bg-gray-800 rounded-lg p-4 cursor-pointer hover:bg-gray-700 transition-colors border border-gray-700"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h3 className="text-white font-medium mb-1">{place.name}</h3>
                  <p className="text-gray-400 text-sm mb-2">
                    <i className="ri-map-pin-line mr-1"></i>
                    {place.address}
                  </p>
                  {place.description && (
                    <p className="text-gray-500 text-xs line-clamp-2">
                      {place.description}
                    </p>
                  )}
                  {place.contact && (
                    <p className="text-blue-400 text-xs mt-2">
                      <i className="ri-phone-line mr-1"></i>
                      {place.contact}
                    </p>
                  )}
                </div>
                <div className="ml-4 text-gray-400">
                  <i className="ri-arrow-right-s-line text-xl"></i>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 장소 등록 모달 */}
      {showAddModal && (
        <PlaceModal
          onClose={() => setShowAddModal(false)}
          onSuccess={() => {
            setShowAddModal(false);
            onPlaceUpdate();
          }}
        />
      )}
    </div>
  );
}
