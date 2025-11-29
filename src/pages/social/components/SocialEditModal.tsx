import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';

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
    setFormData(prev => ({ ...prev, [name]: value }));
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
    const fileExt = file.name.split('.').pop();
    const fileName = `social-event-images/${Date.now()}.${fileExt}`;
    const { error: uploadError } = await supabase.storage.from('images').upload(fileName, file);
    if (uploadError) throw uploadError;
    const { data } = supabase.storage.from('images').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    console.log('[수정 시도]', {
      itemType,
      itemId: item.id,
      formData,
    });

    try {
      if (itemType === 'event') {
        let imageUrl = (item as SocialEvent).image_url;
        if (imageFile) {
          imageUrl = await uploadImage(imageFile);
        } else if (!imagePreview) {
          imageUrl = undefined;
        }

        const updatePayload = {
          title: formData.title,
          event_date: formData.event_date,
          place_id: formData.place_id,
          description: formData.description,
          image_url: imageUrl,
        };

        console.log('[social_events] 업데이트 페이로드:', updatePayload);

        const { data, error: updateError } = await supabase
          .from('social_events')
          .update(updatePayload)
          .eq('id', item.id)
          .select();

        console.log('[social_events] Supabase 응답:', { data, updateError });
        if (updateError) throw updateError;
        if (!data || data.length === 0) {
          throw new Error('DB에서 일치하는 일정을 찾지 못해 업데이트에 실패했습니다.');
        }
      } else {
        const updatePayload = {
          title: formData.title,
          date: formData.date,
          start_time: formData.start_time || null,
          end_time: formData.end_time || null,
          description: formData.description,
        };

        console.log('[social_schedules] 업데이트 페이로드:', updatePayload);

        const { data, error: updateError } = await supabase
          .from('social_schedules')
          .update(updatePayload)
          .eq('id', item.id)
          .select();

        console.log('[social_schedules] Supabase 응답:', { data, updateError });
        if (updateError) throw updateError;
        if (!data || data.length === 0) {
          throw new Error('DB에서 일치하는 스케줄을 찾지 못해 업데이트에 실패했습니다.');
        }
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
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-container" onClick={(e) => e.stopPropagation()}>
        <form onSubmit={handleSubmit} className="modal-form">
          <h2 className="modal-title">일정 수정</h2>
          
          <input type="text" name="title" placeholder="일정 제목 *" value={formData.title || ''} onChange={handleInputChange} required className="form-input" />
          
          {itemType === 'event' ? (
            <>
              <input type="date" name="event_date" value={formData.event_date || ''} onChange={handleInputChange} required className="form-input" />
              <select name="place_id" value={formData.place_id || ''} onChange={handleInputChange} required className="form-select">
                <option value="" disabled>장소 선택 *</option>
                {places.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </>
          ) : (
            <>
              <input type="date" name="date" value={formData.date || ''} onChange={handleInputChange} required className="form-input" />
              {placeName && <div className="form-input bg-gray-700 text-gray-300 cursor-not-allowed">장소: {placeName}</div>}
              <div className="grid grid-cols-2 gap-2">
                <input type="time" name="start_time" placeholder="시작 시간" value={formData.start_time || ''} onChange={handleInputChange} className="form-input" />
                <input type="time" name="end_time" placeholder="종료 시간" value={formData.end_time || ''} onChange={handleInputChange} className="form-input" />
              </div>
            </>
          )}

          <textarea name="description" placeholder="간단한 설명" value={formData.description || ''} onChange={handleInputChange} className="form-textarea" rows={2}></textarea>
          
          {itemType === 'event' && (
            <div>
              <label className="form-label">일정 이미지 (1:1 비율)</label>
              <input type="file" accept="image/*" onChange={handleImageChange} className="form-input" style={{padding: '0.3rem'}} />
              {imagePreview && (
                <div className="relative mt-2 w-24 h-24">
                  <img src={imagePreview} alt="이미지 미리보기" className="w-full h-full object-cover rounded-lg" />
                  <button type="button" onClick={() => setImagePreview('')} className="absolute -top-1 -right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">&times;</button>
                </div>
              )}
            </div>
          )}

          {error && <p className="error-message">{error}</p>}

          <div className="form-button-group justify-between">
            <button type="button" onClick={handleDelete} disabled={loading} className="delete-button">
              {loading ? '...' : '삭제'}
            </button>
            <div className="flex gap-2">
              <button type="button" onClick={onClose} className="cancel-button">취소</button>
              <button type="submit" disabled={loading} className="submit-button">
                {loading ? '수정 중...' : '수정'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}