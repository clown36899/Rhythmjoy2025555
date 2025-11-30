import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './SocialEventModal.css';

interface SocialEventModalProps {
  onClose: () => void;
  onEventCreated: () => void;
}

export default function SocialEventModal({ onClose, onEventCreated }: SocialEventModalProps) {
  const [title, setTitle] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [placeId, setPlaceId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState(''); // 비밀번호 상태 추가
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
    if (!title || !eventDate || !placeId || !imageFile || !password) {
      setError('제목, 날짜, 장소, 이미지, 비밀번호는 필수 항목입니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // 현재 로그인한 사용자 정보 가져오기
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('로그인이 필요합니다.');
      }

      const imageUrl = await uploadImage(imageFile);
      const { error: insertError } = await supabase.from('social_events').insert({
        user_id: user.id, // user_id 추가
        title,
        event_date: eventDate,
        place_id: placeId,
        description,
        image_url: imageUrl,
        password, // 비밀번호 추가
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
    <div className="sem-modal-overlay" onClick={onClose}>
      <div className="sem-modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="sem-modal-form">
          <h2 className="sem-modal-title">새 소셜 일정 등록</h2>
          
          <input type="text" placeholder="일정 제목 *" value={title} onChange={(e) => setTitle(e.target.value)} required className="sem-form-input" />
          <input type="date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} required className="sem-form-input" />
          
          <select value={placeId} onChange={(e) => setPlaceId(Number(e.target.value))} required className="sem-form-select">
            <option value="" disabled>장소 선택 *</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="sem-form-textarea" rows={2}></textarea>
          
          <input type="password" placeholder="비밀번호 (수정/삭제 시 필요) *" value={password} onChange={(e) => setPassword(e.target.value)} required className="sem-form-input" />

          <div>
            <label className="sem-form-label">일정 이미지 (1:1 비율) *</label>
            <input type="file" accept="image/*" onChange={handleImageChange} required className="sem-form-input" style={{padding: '0.3rem'}} />
            {imagePreview && <img src={imagePreview} alt="이미지 미리보기" className="sem-image-preview" />}
          </div>

          {error && <p className="sem-error-message">{error}</p>}

          <div className="sem-button-group">
            <button type="button" onClick={onClose} className="sem-cancel-button">취소</button>
            <button type="submit" disabled={loading} className="sem-submit-button">
              {loading ? '등록 중...' : '등록'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}