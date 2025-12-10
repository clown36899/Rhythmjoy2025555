import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './SocialEditModal.css';

interface SocialEditModalProps {
  item: any;
  itemType: 'event' | 'schedule';
  onClose: () => void;
  onSuccess: () => void;
}

interface FormDataType {
  title?: string;
  day_of_week?: number;
  place_id?: number | string;
  description?: string;
  start_time?: string;
  end_time?: string;
  inquiry_contact?: string;
  link_name?: string;
  link_url?: string;
  // For legacy event support
  event_date?: string;
}

export default function SocialEditModal({ item, itemType, onClose, onSuccess }: SocialEditModalProps) {
  const [formData, setFormData] = useState<FormDataType>({});
  const [places, setPlaces] = useState<{ id: number; name: string; }[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    const fetchPlaces = async () => {
      const { data } = await supabase.from('social_places').select('id:place_id, name').order('name');
      setPlaces(data as { id: number; name: string; }[] || []);
    };
    fetchPlaces();
  }, [itemType]);

  useEffect(() => {
    if (item) {
      if (itemType === 'schedule') {
        let dow = item.day_of_week;
        if (dow === null || dow === undefined && item.date) {
          dow = new Date(item.date).getDay();
        }

        setFormData({
          title: item.title,
          day_of_week: dow,
          place_id: item.place_id,
          start_time: item.start_time || '',
          end_time: item.end_time || '',
          description: item.description || '',
          inquiry_contact: item.inquiry_contact || '',
          link_name: item.link_name || '',
          link_url: item.link_url || '',
        });
      } else {
        // Event fallback
        setFormData({
          title: item.title,
          event_date: item.event_date,
          place_id: item.place_id,
          description: item.description || '',
        });
      }
    }
  }, [item, itemType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'place_id' || name === 'day_of_week') {
      setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    if (!passwordInput) {
      setError('수정을 위해 비밀번호를 입력해주세요.');
      setLoading(false);
      return;
    }

    if (passwordInput !== item.password) {
      setError('비밀번호가 올바르지 않습니다.');
      setLoading(false);
      return;
    }

    try {
      if (itemType === 'event') {
        // Simple update for legacy events
        const { error: updateError } = await supabase.from('social_events').update({
          title: formData.title,
          event_date: formData.event_date,
          place_id: formData.place_id,
          description: formData.description,
        }).eq('id', item.id);
        if (updateError) throw updateError;

      } else {
        // Schedule Update with RPC
        const { error: updateError } = await supabase.rpc('update_social_schedule_with_password', {
          p_schedule_id: item.id,
          p_password: passwordInput,
          p_title: formData.title,
          p_date: null,
          p_start_time: formData.start_time || null,
          p_end_time: formData.end_time || null,
          p_description: formData.description || null,
          p_day_of_week: formData.day_of_week,
          p_inquiry_contact: formData.inquiry_contact || null,
          p_link_name: formData.link_name || null,
          p_link_url: formData.link_url || null,
        });

        if (updateError) throw updateError;
      }
      alert('수정되었습니다.');
      onSuccess();
    } catch (err: any) {
      setError(err.message || '수정 중 오류가 발생했습니다.');
      console.error('[수정 실패]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    const inputPassword = prompt('삭제를 위해 비밀번호를 입력하세요:');
    if (inputPassword === null) return;
    if (inputPassword !== item.password) {
      alert('비밀번호가 올바르지 않습니다.');
      return;
    }
    if (!confirm('정말로 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      const tableName = itemType === 'event' ? 'social_events' : 'social_schedules';
      const { error: deleteError } = await supabase
        .from(tableName)
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;
      alert('삭제되었습니다.');
      onSuccess();
    } catch (err: any) {
      setError(err.message || '삭제 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="sed-modal-overlay" onClick={onClose}>
      <div className="sed-modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="sed-modal-form">
          <h2 className="sed-modal-title">일정 수정</h2>

          <input type="text" name="title" placeholder="제목 *" value={formData.title || ''} onChange={handleInputChange} required className="sed-form-input" />

          {itemType === 'event' ? (
            <input type="date" name="event_date" value={formData.event_date || ''} onChange={handleInputChange} required className="sed-form-input" />
          ) : (
            <select name="day_of_week" value={formData.day_of_week ?? ''} onChange={handleInputChange} required className="sed-form-select">
              <option value="" disabled>요일 선택</option>
              <option value="1">월요일</option>
              <option value="2">화요일</option>
              <option value="3">수요일</option>
              <option value="4">목요일</option>
              <option value="5">금요일</option>
              <option value="6">토요일</option>
              <option value="0">일요일</option>
            </select>
          )}

          <select name="place_id" value={formData.place_id || ''} onChange={handleInputChange} className="sed-form-select">
            <option value="" disabled>장소 선택 (변경 시)</option>
            {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>

          {itemType === 'schedule' && (
            <>
              <input type="text" name="inquiry_contact" placeholder="문의 연락처" value={formData.inquiry_contact || ''} onChange={handleInputChange} className="sed-form-input" />
              <div className="sed-link-group" style={{ display: 'flex', gap: '5px' }}>
                <input type="text" name="link_name" placeholder="링크명" value={formData.link_name || ''} onChange={handleInputChange} className="sed-form-input half" style={{ flex: 1 }} />
                <input type="text" name="link_url" placeholder="링크 URL" value={formData.link_url || ''} onChange={handleInputChange} className="sed-form-input half" style={{ flex: 1 }} />
              </div>
              <div className="sed-time-grid">
                <input type="time" name="start_time" value={formData.start_time || ''} onChange={handleInputChange} className="sed-form-input" />
                <input type="time" name="end_time" value={formData.end_time || ''} onChange={handleInputChange} className="sed-form-input" />
              </div>
            </>
          )}

          <textarea name="description" placeholder="설명" value={formData.description || ''} onChange={handleInputChange} className="sed-form-textarea" rows={2}></textarea>

          <input type="password" name="password" placeholder="비밀번호 확인 *" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required className="sed-password-input" />

          {error && <p className="sed-error-message">{error}</p>}

          <div className="sed-button-group">
            <button type="button" onClick={handleDelete} disabled={loading} className="sed-delete-button">삭제</button>
            <div className="sed-button-group-right">
              <button type="button" onClick={onClose} className="sed-cancel-button">취소</button>
              <button type="submit" disabled={loading} className="sed-submit-button">수정</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}