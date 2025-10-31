import { useState } from 'react';
import type { SocialPlace } from '../page';
import PlaceModal from './PlaceModal';
import { useAuth } from '../../../contexts/AuthContext';

interface PlaceListProps {
  places: SocialPlace[];
  onPlaceSelect: (place: SocialPlace) => void;
  onPlaceUpdate: () => void;
}

export default function PlaceList({ places, onPlaceSelect, onPlaceUpdate }: PlaceListProps) {
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

  return (
    <div className="px-4 pb-4">
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-4 relative">
        <h2 className="text-lg font-bold text-white">목록</h2>
        <button
          onClick={handleAddClick}
          className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          <i className="ri-add-line mr-1"></i>
          장소 등록
        </button>

        {/* 관리자 아닐 때 안내 모달 */}
        {showAuthWarning && (
          <div 
            className="fixed inset-0 flex items-center justify-center z-50"
            onClick={() => setShowAuthWarning(false)}
            style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
          >
            <div 
              className="bg-gray-800 rounded-lg p-6 mx-4 max-w-sm border border-gray-700"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="text-center">
                <i className="ri-lock-line text-4xl text-yellow-500 mb-3"></i>
                <h3 className="text-white text-lg font-bold mb-2">관리자 권한 필요</h3>
                <p className="text-gray-400 text-sm mb-4">
                  장소 등록은 관리자만 가능합니다.<br/>
                  문의: <span className="text-blue-400">010-4801-7180</span>
                </p>
                <button
                  onClick={() => setShowAuthWarning(false)}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors w-full"
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
        <div className="text-center py-12 text-gray-400">
          등록된 장소가 없습니다.
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-2">
          {places.map((place) => (
            <div
              key={place.id}
              className="bg-gray-800 rounded-lg px-4 py-3 border border-gray-700"
            >
              <div className="flex items-center justify-between">
                <div 
                  onClick={() => onPlaceSelect(place)}
                  className="flex-1 cursor-pointer hover:bg-gray-700 -mx-2 px-2 py-1 rounded transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <h3 className="text-white font-medium text-sm flex-shrink-0">{place.name}</h3>
                    <div className="flex items-center gap-2 ml-3">
                      <p className="text-gray-400 text-xs truncate max-w-[120px]">
                        {place.address.split(' ').slice(0, 3).join(' ')}
                      </p>
                      <i className="ri-arrow-right-s-line text-gray-400 text-lg flex-shrink-0"></i>
                    </div>
                  </div>
                </div>
                
                {/* 네이버지도 바로가기 */}
                <a
                  href={`https://map.naver.com/v5/search/${encodeURIComponent(place.name + ' ' + place.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="p-1.5 hover:bg-green-500/20 rounded transition-colors ml-2"
                  title="네이버지도에서 보기"
                >
                  <i className="ri-map-pin-line text-green-500 text-lg"></i>
                </a>
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
