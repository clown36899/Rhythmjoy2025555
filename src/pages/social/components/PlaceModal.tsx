import { useState } from 'react';
import { supabase } from '../../../lib/supabase';

interface PlaceModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Nominatim (무료 지오코딩) API로 주소 → 좌표 변환
async function geocodeAddress(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    // 1차 시도: 원본 주소 그대로
    let response = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&countrycodes=kr&limit=1`,
      {
        headers: {
          'User-Agent': 'SocialPlaceApp/1.0',
        },
      }
    );
    let data = await response.json();
    
    if (data && data.length > 0) {
      return {
        lat: parseFloat(data[0].lat),
        lng: parseFloat(data[0].lon),
      };
    }

    // 2차 시도: 상세 주소 제거 (지하, 층, 호 등)
    const simplifiedAddress = address
      .replace(/\s*지하\d+층?/g, '')
      .replace(/\s*\d+층/g, '')
      .replace(/\s*\d+호/g, '')
      .replace(/\s*[가-힣]+\s*$/g, '') // 마지막 건물명 제거
      .trim();

    if (simplifiedAddress !== address) {
      console.log('간소화된 주소로 재시도:', simplifiedAddress);
      response = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(simplifiedAddress)}&countrycodes=kr&limit=1`,
        {
          headers: {
            'User-Agent': 'SocialPlaceApp/1.0',
          },
        }
      );
      data = await response.json();

      if (data && data.length > 0) {
        return {
          lat: parseFloat(data[0].lat),
          lng: parseFloat(data[0].lon),
        };
      }
    }

    return null;
  } catch (error) {
    console.error('주소 변환 실패:', error);
    return null;
  }
}

export default function PlaceModal({ onClose, onSuccess }: PlaceModalProps) {
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [contact, setContact] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 주소 → 좌표 변환
      const coords = await geocodeAddress(address);
      if (!coords) {
        throw new Error('주소를 찾을 수 없습니다. 정확한 주소를 입력해주세요.');
      }

      // 장소 저장
      const { error: insertError } = await supabase
        .from('social_places')
        .insert({
          name,
          address,
          latitude: coords.lat,
          longitude: coords.lng,
          contact: contact || null,
          description: description || null,
        });

      if (insertError) throw insertError;

      onSuccess();
    } catch (err: any) {
      setError(err.message || '장소 등록에 실패했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
      <div className="bg-gray-800 rounded-lg w-full max-w-md max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-4">장소 등록</h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* 장소명 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                장소명 *
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
            </div>

            {/* 주소 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                주소 *
              </label>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                placeholder="예: 서울특별시 강남구 테헤란로 123"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                required
              />
              <p className="text-xs text-gray-400 mt-1">
                정확한 주소를 입력하면 지도에 자동으로 표시됩니다
              </p>
            </div>

            {/* 연락처 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                연락처
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="예: 010-1234-5678"
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>

            {/* 설명 */}
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1">
                설명
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />
            </div>

            {/* 에러 메시지 */}
            {error && (
              <div className="bg-red-900/20 border border-red-700/50 rounded-lg p-3 text-red-400 text-sm">
                {error}
              </div>
            )}

            {/* 버튼 */}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-2 px-4 rounded-lg font-medium transition-colors"
                disabled={loading}
              >
                취소
              </button>
              <button
                type="submit"
                className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 px-4 rounded-lg font-medium transition-colors disabled:bg-gray-600 disabled:cursor-not-allowed"
                disabled={loading}
              >
                {loading ? '등록 중...' : '등록'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
