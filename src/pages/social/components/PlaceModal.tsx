import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

declare global {
  interface Window {
    kakao: any;
  }
}

interface PlaceModalProps {
  onClose: () => void;
  onPlaceCreated: () => void;
}

export default function PlaceModal({ onClose, onPlaceCreated }: PlaceModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [description, setDescription] = useState('');
  const [contact, setContact] = useState('');
  
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isKakaoReady, setIsKakaoReady] = useState(false);

  useEffect(() => {
    if (window.kakao && window.kakao.maps && window.kakao.maps.services) {
      window.kakao.maps.load(() => {
        setIsKakaoReady(true);
      });
    }
  }, []);

  const getCoordsFromAddress = (address: string): Promise<{ lat: number; lng: number }> => {
    return new Promise((resolve, reject) => {
      if (!isKakaoReady) {
        reject(new Error('카카오맵 서비스가 준비되지 않았습니다.'));
        return;
      }
      const geocoder = new window.kakao.maps.services.Geocoder();
      geocoder.addressSearch(address, (result: any, status: any) => {
        if (status === window.kakao.maps.services.Status.OK && result.length > 0) {
          resolve({ lat: parseFloat(result[0].y), lng: parseFloat(result[0].x) });
        } else {
          reject(new Error('유효한 주소를 찾을 수 없습니다. 주소를 다시 확인해주세요.'));
        }
      });
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !address) {
      setError('장소 이름과 주소는 필수입니다.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { lat, lng } = await getCoordsFromAddress(address);

      const { error: insertError } = await supabase.from('social_places').insert({
        name,
        address,
        description,
        contact,
        latitude: lat,
        longitude: lng,
      });

      if (insertError) throw insertError;

      alert('장소가 등록되었습니다.');
      onPlaceCreated(); // 성공 시 부모에게 알림
    } catch (err: any) {
      setError(err.message || '장소 등록 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="fixed inset-0 flex items-center justify-center z-50"
      style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
      onClick={onClose}
    >
      <div 
        className="bg-gray-800 rounded-lg p-6 mx-4 w-full max-w-md border border-gray-700"
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-4">새 장소 등록</h2>
          
          <input type="text" placeholder="장소 이름 *" value={name} onChange={(e) => setName(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="text" placeholder="주소 *" value={address} onChange={(e) => setAddress(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <textarea placeholder="장소 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={3}></textarea>
          <input type="text" placeholder="연락처 (선택)" value={contact} onChange={(e) => setContact(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          
          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">
              취소
            </button>
            <button type="submit" disabled={loading || !isKakaoReady} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}