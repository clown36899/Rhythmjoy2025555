import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './SocialEventModal.css';

interface SocialEventModalProps {
  onClose: () => void;
  onEventCreated: () => void;
}

export default function SocialEventModal({ onClose, onEventCreated }: SocialEventModalProps) {
  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>(''); // 0-6
  const [placeId, setPlaceId] = useState<number | ''>('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || dayOfWeek === '' || !placeId || !password) {
      setError('제목, 요일, 장소, 비밀번호는 필수 항목입니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Insert into social_schedules
      const { error: insertError } = await supabase.from('social_schedules').insert({
        title,
        day_of_week: Number(dayOfWeek),
        place_id: placeId,
        description,
        password,
        inquiry_contact: inquiryContact,
        link_name: linkName,
        link_url: linkUrl,
      });

      if (insertError) throw insertError;
      alert('요일별 스케줄이 등록되었습니다.');
      onEventCreated();
    } catch (err: any) {
      setError(err.message || '등록 중 오류가 발생했습니다.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sem-modal-overlay" onClick={onClose}>
      <div className="sem-modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="sem-modal-form">
          <h2 className="sem-modal-title">정기 스케줄 등록</h2>

          <input type="text" placeholder="제목 (동호회/모임명) *" value={title} onChange={(e) => setTitle(e.target.value)} required className="sem-form-input" />

          <select value={dayOfWeek} onChange={(e) => setDayOfWeek(Number(e.target.value))} required className="sem-form-select">
            <option value="" disabled>요일 선택 *</option>
            <option value="1">월요일</option>
            <option value="2">화요일</option>
            <option value="3">수요일</option>
            <option value="4">목요일</option>
            <option value="5">금요일</option>
            <option value="6">토요일</option>
            <option value="0">일요일</option>
          </select>

          <select value={placeId} onChange={(e) => setPlaceId(Number(e.target.value))} required className="sem-form-select">
            <option value="" disabled>장소 선택 *</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="sem-form-textarea" rows={2}></textarea>

          <input type="text" placeholder="문의 연락처" value={inquiryContact} onChange={(e) => setInquiryContact(e.target.value)} className="sem-form-input" />

          <div className="sem-link-group" style={{ display: 'flex', gap: '5px' }}>
            <input type="text" placeholder="링크명 (예: 오픈카톡)" value={linkName} onChange={(e) => setLinkName(e.target.value)} className="sem-form-input half" style={{ flex: 1 }} />
            <input type="text" placeholder="링크 URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="sem-form-input half" style={{ flex: 1 }} />
          </div>

          <input type="password" placeholder="비밀번호 (수정/삭제 시 필요) *" value={password} onChange={(e) => setPassword(e.target.value)} required className="sem-form-input" />

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