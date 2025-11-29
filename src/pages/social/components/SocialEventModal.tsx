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
      const { data } = await supabase.from('social_places').select('id:place_id, name').order('name');
      setPlaces(data as { id: number; name: string; }[] || []);
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
        place_id: placeId,
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="modal-form">
          <h2 className="modal-title">새 소셜 일정 등록</h2>
          
          <input type="text" placeholder="일정 제목 *" value={title} onChange={(e) => setTitle(e.target.value)} required className="form-input" />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className="form-input" />
          
          <select value={placeId} onChange={(e) => setPlaceId(Number(e.target.value))} required className="form-select">
            <option value="" disabled>장소 선택 *</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="form-textarea" rows={2}></textarea>
          
          <div>
            <label className="form-label">일정 이미지 (1:1 비율) *</label>
            <input type="file" accept="image/*" onChange={handleImageChange} required className="form-input" style={{padding: '0.3rem'}} />
            {imagePreview && <img src={imagePreview} alt="이미지 미리보기" className="mt-2 w-24 h-24 object-cover rounded-lg" />}
          </div>

          {error && <p className="error-message">{error}</p>}

          <div className="form-button-group">
            <button type="button" onClick={onClose} className="cancel-button">취소</button>
            <button type="submit" disabled={loading} className="submit-button">
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}