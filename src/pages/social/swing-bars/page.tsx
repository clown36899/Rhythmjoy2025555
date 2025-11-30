import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import SocialSubMenu from '../components/SocialSubMenu';
import PlaceModal from '../components/PlaceModal';
import type { SocialPlace } from '../page';
import './swingbars.css';

export default function SwingBarsPage() {
  const { isAdmin } = useAuth();
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(true);
  const [showPlaceModal, setShowPlaceModal] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<SocialPlace | null>(null);
  const [map, setMap] = useState<any>(null);

  useEffect(() => {
    loadPlaces();
    initMap();
  }, []);

  const loadPlaces = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('social_places')
        .select('*')
        .order('name');

      if (error) throw error;
      setPlaces(data || []);
    } catch (error) {
      console.error('장소 로딩 실패:', error);
    } finally {
      setLoading(false);
    }
  };

  const initMap = () => {
    const container = document.getElementById('swing-bars-map');
    if (!container) {
      console.error('지도 컨테이너를 찾을 수 없습니다.');
      setLoading(false);
      return;
    }

    let attempts = 0;
    const maxAttempts = 30;

    const tryInit = () => {
      if (!window.kakao || !window.kakao.maps) {
        attempts++;
        if (attempts < maxAttempts) {
          setTimeout(tryInit, 200);
        } else {
          console.error('카카오맵 SDK 로드 시간 초과');
          setLoading(false);
        }
        return;
      }

      // SDK가 로드되었다면, load()를 사용하여 내부 클래스 등록을 보장
      window.kakao.maps.load(() => {
        try {
          const center = new window.kakao.maps.LatLng(37.5665, 126.978);
          const options = {
            center,
            level: 8,
          };

          const newMap = new window.kakao.maps.Map(container, options);
          setMap(newMap);
          setLoading(false);
          console.log('카카오맵 초기화 성공 (스윙바)');
        } catch (error) {
          console.error('카카오맵 초기화 실패:', error);
          setLoading(false);
        }
      });
    };

    tryInit();
  };

  useEffect(() => {
    if (!map || !window.kakao || places.length === 0) return;

    const kakao = window.kakao;
    const bounds = new kakao.maps.LatLngBounds();
    const overlayData: Array<{ overlay: any; element: HTMLElement; position: any; place: any; marker: any }> = [];

    places.forEach((place) => {
      const position = new kakao.maps.LatLng(place.latitude, place.longitude);
      bounds.extend(position);
      
      const marker = new kakao.maps.Marker({
        position,
        map,
      });

      const labelDiv = document.createElement('div');
      labelDiv.style.cssText = `
        background: rgba(34, 34, 34, 0.95);
        color: white;
        padding: 4px 10px;
        border-radius: 6px;
        font-size: 11px;
        font-weight: bold;
        white-space: nowrap;
        cursor: pointer;
        display: flex;
        align-items: center;
        gap: 4px;
        box-shadow: 0 2px 6px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
      `;
      labelDiv.innerHTML = `${place.name} <i class="ri-arrow-right-s-line" style="font-size: 12px;"></i>`;

      const customOverlay = new kakao.maps.CustomOverlay({
        position,
        content: labelDiv,
        yAnchor: 2.0,
      });
      customOverlay.setMap(map);

      overlayData.push({ overlay: customOverlay, element: labelDiv, position, place, marker });

      const handleClick = () => {
        const currentLevel = map.getLevel();
        if (currentLevel > 4) {
          map.setLevel(4);
        }
        map.panTo(position);
        setSelectedPlace(place);
      };

      kakao.maps.event.addListener(marker, 'click', handleClick);
      labelDiv.onclick = handleClick;
    });

    const adjustOverlaps = () => {
      const projection = map.getProjection();
      const level = map.getLevel();
      const fontSize = level > 6 ? '9px' : level > 4 ? '11px' : '13px';
      const padding = level > 6 ? '3px 8px' : level > 4 ? '4px 10px' : '5px 12px';
      
      const labelData = overlayData.map((data, index) => {
        data.element.style.fontSize = fontSize;
        data.element.style.padding = padding;
        
        const point = projection.pointFromCoords(data.position);
        const rect = data.element.getBoundingClientRect();
        return {
          index,
          x: point.x,
          y: point.y,
          width: rect.width,
          height: rect.height,
          element: data.element,
          data: data,
        };
      });

      const groups: number[][] = [];
      const visited = new Set<number>();

      labelData.forEach((label, i) => {
        if (visited.has(i)) return;
        
        const group = [i];
        visited.add(i);

        labelData.forEach((other, j) => {
          if (i === j || visited.has(j)) return;
          
          const dx = Math.abs(label.x - other.x);
          const dy = Math.abs(label.y - other.y);
          
          if (dx < (label.width + other.width) / 2 + 5 && dy < 30) {
            group.push(j);
            visited.add(j);
          }
        });

        groups.push(group);
      });

      groups.forEach(group => {
        if (group.length === 1) {
          const data = labelData[group[0]].data;
          const element = labelData[group[0]].element;
          element.style.position = 'relative';
          element.style.top = '0px';
          element.style.zIndex = '1000';
          element.style.display = 'flex';
          element.style.flexDirection = 'row';
          data.marker.setMap(map);
          element.innerHTML = `${data.place.name} <i class="ri-arrow-right-s-line" style="font-size: 12px;"></i>`;
          element.onclick = () => {
            const currentLevel = map.getLevel();
            if (currentLevel > 4) {
              map.setLevel(4);
            }
            map.panTo(data.position);
            setSelectedPlace(data.place);
          };
        } else {
          const firstIndex = group[0];
          const firstElement = labelData[firstIndex].element;
          const firstData = labelData[firstIndex].data;
          
          firstElement.style.position = 'relative';
          firstElement.style.top = '0px';
          firstElement.style.zIndex = '10000';
          firstElement.style.display = 'flex';
          firstElement.style.flexDirection = 'column';
          firstElement.style.gap = '2px';
          firstElement.style.padding = '6px 10px';
          firstElement.innerHTML = '';
          
          firstData.marker.setMap(map);
          
          group.forEach(index => {
            const placeData = labelData[index].data;
            const itemDiv = document.createElement('div');
            itemDiv.style.cssText = `
              display: flex;
              align-items: center;
              gap: 4px;
              cursor: pointer;
              padding: 2px 0;
              transition: opacity 0.2s;
            `;
            itemDiv.innerHTML = `${placeData.place.name} <i class="ri-arrow-right-s-line" style="font-size: 12px;"></i>`;
            itemDiv.onclick = () => {
              const currentLevel = map.getLevel();
              if (currentLevel > 4) {
                map.setLevel(4);
              }
              map.panTo(placeData.position);
              setSelectedPlace(placeData.place);
            };
            itemDiv.onmouseenter = () => itemDiv.style.opacity = '0.7';
            itemDiv.onmouseleave = () => itemDiv.style.opacity = '1';
            firstElement.appendChild(itemDiv);
          });

          group.slice(1).forEach(index => {
            const element = labelData[index].element;
            const data = labelData[index].data;
            element.style.display = 'none';
            data.marker.setMap(null);
          });
        }
      });
    };

    const debouncedAdjust = (() => {
      let timeout: any;
      return () => {
        clearTimeout(timeout);
        timeout = setTimeout(adjustOverlaps, 150);
      };
    })();

    kakao.maps.event.addListener(map, 'zoom_changed', debouncedAdjust);
    kakao.maps.event.addListener(map, 'center_changed', debouncedAdjust);
    kakao.maps.event.addListener(map, 'bounds_changed', debouncedAdjust);

    setTimeout(adjustOverlaps, 300);
    map.setBounds(bounds);

    return () => {
      kakao.maps.event.removeListener(map, 'zoom_changed', debouncedAdjust);
      kakao.maps.event.removeListener(map, 'center_changed', debouncedAdjust);
      kakao.maps.event.removeListener(map, 'bounds_changed', debouncedAdjust);
      overlayData.forEach(data => data.overlay.setMap(null));
    };
  }, [map, places]);

  const handleClosePlaceInfo = () => {
    setSelectedPlace(null);
  };

  const handleCopyAddress = () => {
    if (selectedPlace?.address) {
      navigator.clipboard.writeText(selectedPlace.address);
      alert('주소가 복사되었습니다');
    }
  };

  const handleOpenNaverMap = () => {
    if (selectedPlace) {
      const url = `https://map.naver.com/v5/search/${encodeURIComponent(selectedPlace.address)}`;
      window.open(url, '_blank');
    }
  };

  const handleShare = async () => {
    if (selectedPlace) {
      const shareData = {
        title: selectedPlace.name,
        text: `${selectedPlace.name}\n${selectedPlace.address}`,
      };
      
      if (navigator.share) {
        try {
          await navigator.share(shareData);
        } catch (err) {
          console.log('공유 취소');
        }
      } else {
        navigator.clipboard.writeText(`${selectedPlace.name}\n${selectedPlace.address}`);
        alert('정보가 복사되었습니다');
      }
    }
  };

  return (
    <div className="swingbars-page-container" style={{ backgroundColor: 'var(--page-bg-color)' }}>
      <div
        className="swingbars-header"
        style={{
          backgroundColor: 'var(--header-bg-color)',
        }}
      >
        <h1 className="swingbars-title">스윙바</h1>
      </div>

      <SocialSubMenu />

      <div className="swingbars-content">
        <div className="swingbars-map-wrapper">
          <div id="swing-bars-map" className="swingbars-map" />
          
          {loading && (
            <div className="swingbars-loading">
              <div className="swingbars-loading-text">지도 로딩 중...</div>
            </div>
          )}

          {isAdmin && (
            <button
              onClick={() => setShowPlaceModal(true)}
              className="swingbars-add-btn"
            >
              <i className="ri-add-line"></i>
              장소 등록
            </button>
          )}

          {selectedPlace && (
            <div className="swingbars-info-card">
              <div className="swingbars-info-header">
                <div>
                  <h3 className="swingbars-place-name">{selectedPlace.name}</h3>
                  <p className="swingbars-place-address">{selectedPlace.address}</p>
                </div>
                <button
                  onClick={handleClosePlaceInfo}
                  className="swingbars-close-btn"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="swingbars-action-buttons">
                <button
                  onClick={handleCopyAddress}
                  className="swingbars-action-btn swingbars-action-btn-copy"
                >
                  <i className="ri-file-copy-line"></i>
                  주소복사
                </button>
                <button
                  onClick={handleOpenNaverMap}
                  className="swingbars-action-btn swingbars-action-btn-map"
                >
                  <i className="ri-map-pin-line"></i>
                  지도보기
                </button>
                <button
                  onClick={handleShare}
                  className="swingbars-action-btn swingbars-action-btn-share"
                >
                  <i className="ri-share-line"></i>
                  공유
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {showPlaceModal && (
        <PlaceModal
          category="swing-bars"
          onClose={() => setShowPlaceModal(false)}
          onSaved={loadPlaces}
        />
      )}
    </div>
  );
}
