import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import './SocialEditModal.css';

interface SocialPlace {
  id: number;
  name: string;
}

interface SocialEvent {
  id: number;
  title: string;
  event_date: string;
  place_id: number;
  description?: string;
  password?: string;
  image_url?: string;
  social_places?: { name: string };
}

interface Schedule {
  id: number;
  place_id: number;
  title: string;
  date: string;
  start_time?: string;
  end_time?: string;
  description?: string;
  password?: string;
  social_places?: { name: string };
}

interface SocialEditModalProps {
  item: SocialEvent | Schedule;
  itemType: 'event' | 'schedule';
  onClose: () => void;
  onSuccess: () => void;
}

interface FormDataType {
  title?: string;
  event_date?: string;
  place_id?: number | string;
  description?: string;
  date?: string;
  start_time?: string;
  end_time?: string;
}

export default function SocialEditModal({ item, itemType, onClose, onSuccess }: SocialEditModalProps) {
  const [formData, setFormData] = useState<FormDataType>({});
  const [places, setPlaces] = useState<SocialPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState('');
  const [passwordInput, setPasswordInput] = useState(''); // 비밀번호 확인용 상태

  useEffect(() => {
    if (itemType === 'event') {
      const fetchPlaces = async () => {
        const { data } = await supabase.from('social_places').select('id:place_id, name').order('name');
        setPlaces(data as { id: number; name: string; }[] || []);
      };
      fetchPlaces();
    }
  }, [itemType]);

  useEffect(() => {
    if (item) {
      if (itemType === 'event') {
        const event = item as SocialEvent;
        setFormData({
          title: event.title,
          event_date: event.event_date,
          place_id: event.place_id,
          description: event.description || '',
        });
        setImagePreview(event.image_url || '');
      } else {
        const schedule = item as Schedule;
        setFormData({
          title: schedule.title,
          date: schedule.date,
          start_time: schedule.start_time || '',
          end_time: schedule.end_time || '',
          description: schedule.description || '',
        });
      }
    }
  }, [item, itemType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'place_id') {
      setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImageFile(file);
    const reader = new FileReader();
    reader.onloadend = () => setImagePreview(reader.result as string);
    reader.readAsDataURL(file);
  };

  const uploadImage = async (file: File): Promise<string> => {
    // 이미지 리사이징 (트래픽 최적화)
    const { createResizedImages } = await import('../../../utils/imageResize');
    const resized = await createResizedImages(file);

    // 소셜 이벤트는 단일 이미지만 사용하므로 medium(1080px) 또는 full(1280px) 사용
    const targetImage = resized.medium || resized.full || resized.thumbnail;

    if (!targetImage) throw new Error("Image resizing failed");

    const fileName = `social-event-images/${Date.now()}.webp`;
    const { error: uploadError } = await supabase.storage.from('images').upload(fileName, targetImage, {
      contentType: 'image/webp',
      upsert: true
    });

    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    // --- 추가된 상세 로깅 ---
    console.log('[수정 시도] 전달된 원본 데이터:', { id: item.id, password: item.password, title: (item as any).title });
    console.log('[수정 시도] 사용자가 입력한 비밀번호:', passwordInput);
    // --- 여기까지 ---

    // --- 비밀번호 확인 로직으로 변경 ---
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

    console.log('[수정 시도] ✅ 비밀번호 일치 확인. DB 업데이트를 시작합니다.');
    // --- 여기까지 ---

    try {
      if (itemType === 'event') {
        let imageUrl: string | null | undefined = (item as SocialEvent).image_url;
        if (imageFile) {
          imageUrl = await uploadImage(imageFile);
        } else if (!imagePreview) {
          imageUrl = null; // 이미지를 제거할 때 undefined 대신 null을 할당
        }

        const updatePayload = {
          title: formData.title,
          event_date: formData.event_date,
          place_id: formData.place_id,
          description: formData.description || null, // 빈 문자열일 경우 null로 보냄
          image_url: imageUrl,
        };

        console.log('[social_events] 업데이트 페이로드:', updatePayload);

        const { data, error: updateError } = await supabase.rpc('update_social_event_with_password', {
          p_event_id: item.id,
          p_password: passwordInput,
          p_title: updatePayload.title,
          p_event_date: updatePayload.event_date,
          p_place_id: updatePayload.place_id,
          p_description: updatePayload.description,
          p_image_url: updatePayload.image_url,
        });

        console.log('[social_events] Supabase 응답:', { data, updateError });
        if (updateError) throw updateError;
      } else {
        const updatePayload = {
          title: formData.title,
          date: formData.date,
          start_time: formData.start_time || null,
          end_time: formData.end_time || null,
          description: formData.description || null, // 빈 문자열일 경우 null로 보내도록 수정
        };

        console.log('[social_schedules] 업데이트 페이로드:', updatePayload);

        const { data, error: updateError } = await supabase.rpc('update_social_schedule_with_password', {
          p_schedule_id: item.id,
          p_password: passwordInput,
          p_title: updatePayload.title,
          p_date: updatePayload.date,
          p_start_time: updatePayload.start_time,
          p_end_time: updatePayload.end_time,
          p_description: updatePayload.description,
        });

        console.log('[social_schedules] Supabase 응답:', { data, updateError });
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

    if (inputPassword === null) { // 사용자가 '취소'를 누른 경우
      return;
    }

    if (inputPassword !== item.password) {
      alert('비밀번호가 올바르지 않습니다.');
      return;
    }

    // 비밀번호 확인 후, 최종 삭제 여부 확인
    if (!confirm('정말로 이 일정을 삭제하시겠습니까?')) return;

    setLoading(true);
    setError('');
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
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const placeName = itemType === 'schedule' ? (item as Schedule).social_places?.name : undefined;

  return (
    <div className="sed-modal-overlay" onClick={onClose}>
      <div className="sed-modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="sed-modal-form">
          <h2 className="sed-modal-title">일정 수정</h2>

          <input type="text" name="title" placeholder="일정 제목 *" value={formData.title || ''} onChange={handleInputChange} required className="sed-form-input" />

          {itemType === 'event' ? (
            <>
              <input type="date" name="event_date" value={formData.event_date || ''} onChange={handleInputChange} required className="sed-form-input" />
              <select name="place_id" value={formData.place_id || ''} onChange={handleInputChange} required className="sed-form-select">
                <option value="" disabled>장소 선택 *</option>
                {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" name="date" value={formData.date || ''} onChange={handleInputChange} required className="sed-form-input" />
              {placeName && <div className="sed-place-display">장소: {placeName}</div>}
              <div className="sed-time-grid">
                <input type="time" name="start_time" placeholder="시작 시간" value={formData.start_time || ''} onChange={handleInputChange} className="sed-form-input" />
                <input type="time" name="end_time" placeholder="종료 시간" value={formData.end_time || ''} onChange={handleInputChange} className="sed-form-input" />
              </div>
            </>
          )}

          <textarea name="description" placeholder="간단한 설명" value={formData.description || ''} onChange={handleInputChange} className="sed-form-textarea" rows={2}></textarea>

          <input type="password" name="password" placeholder="비밀번호 확인 *" value={passwordInput} onChange={(e) => setPasswordInput(e.target.value)} required className="sed-password-input" />

          {itemType === 'event' && (
            <div>
              <label className="sed-form-label">일정 이미지 (1:1 비율)</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="sed-form-input" style={{ padding: '0.3rem' }} />
              {imagePreview && (
                <div className="sed-image-preview-container">
                  <img src={imagePreview} alt="이미지 미리보기" className="sed-image-preview" />
                  <button type="button" onClick={() => setImagePreview('')} className="sed-image-remove-btn">&times;</button>
                </div>
              )}
            </div>
          )}

          {error && <p className="sed-error-message">{error}</p>}

          <div className="sed-button-group">
            <button type="button" onClick={handleDelete} disabled={loading} className="sed-delete-button">
              {loading ? '...' : '삭제'}
            </button>
            <div className="sed-button-group-right">
              <button type="button" onClick={onClose} className="sed-cancel-button">취소</button>
              <button type="submit" disabled={loading} className="sed-submit-button">
                {loading ? '수정 중...' : '수정'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}