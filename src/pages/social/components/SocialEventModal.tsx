import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

interface SocialEventModalProps {
  onClose: () => void;
  onEventCreated: () => void;
}

export default function SocialEventModal({ onClose, onEventCreated }: SocialEventModalProps) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [placeId, setPlaceId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  
  const [places, setPlaces] = useState<{ id: number; name: string; }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchPlaces = async () => {
      const { data } = await supabase.from('social_places').select('id, name').order('name');
      setPlaces(data || []);
    };
    fetchPlaces();
  }, []);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `social-event-images/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !eventDate || !placeId || !imageFile) {
      setError('제목, 날짜, 장소, 이미지는 필수 항목입니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const imageUrl = await uploadImage(imageFile);
      const { error: insertError } = await supabase.from('social_events').insert({
        title,
        event_date: eventDate,
        social_place_id: placeId,
        description,
        image_url: imageUrl,
      });
      if (insertError) throw insertError;
      alert('소셜 일정이 등록되었습니다.');
      onEventCreated();
    } catch (err: any) {
      setError(err.message || '일정 등록 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div className="bg-gray-800 rounded-lg p-6 mx-4 w-full max-w-md border border-gray-700" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <h2 className="text-xl font-bold text-white mb-4">새 소셜 일정 등록</h2>
          
          <input type="text" placeholder="일정 제목 *" value={title} onChange={(e) => setTitle(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" />
          
          <select value={placeId} onChange={(e) => setPlaceId(Number(e.target.value))} required className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="" disabled>장소 선택 *</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500" rows={2}></textarea>
          
          <div>
            <label className="block text-sm font-medium text-gray-300 mb-1">일정 이미지 (1:1 비율) *</label>
            <input type="file" accept="image/*" onChange={handleImageChange} required className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700" />
            {imagePreview && <img src={imagePreview} alt="이미지 미리보기" className="mt-2 w-24 h-24 object-cover rounded-lg" />}
          </div>

          {error && <p className="text-red-400 text-sm text-center">{error}</p>}

          <div className="flex justify-end gap-3 pt-4">
            <button type="button" onClick={onClose} className="bg-gray-600 hover:bg-gray-500 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors">취소</button>
            <button type="submit" disabled={loading} className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}