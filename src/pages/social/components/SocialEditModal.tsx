import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../contexts/AuthContext';
import { useModal } from '../../../hooks/useModal';
import { useModalHistory } from '../../../hooks/useModalHistory';
import { resizeImage } from '../../../utils/imageResize';
import './SocialEditModal.css';

interface SocialEditModalProps {
  item: any;
  itemType: 'schedule';
  onClose: () => void;
  onSuccess: (data?: any, isDelete?: boolean) => void;
}

interface FormDataType {
  title?: string;
  day_of_week?: number;
  place_name?: string;
  address?: string;
  category?: 'club' | 'swing-bar' | '';
  description?: string;
  inquiry_contact?: string;
  link_name?: string;
  link_url?: string;
  image?: string;
  venue_id?: string | null;
}

export default function SocialEditModal({ item, itemType, onClose, onSuccess }: SocialEditModalProps) {
  // Add mobile back gesture support
  useModalHistory(true, onClose);

  const [formData, setFormData] = useState<FormDataType>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const venueSelectModal = useModal('venueSelect');

  const { isAdmin } = useAuth();

  useEffect(() => {
    if (item) {
      let dow = item.day_of_week;
      if ((dow === null || dow === undefined) && item.date) {
        dow = new Date(item.date).getDay();
      }

      setFormData({
        title: item.title,
        day_of_week: dow,
        place_name: item.place_name || '',
        address: item.address || '',
        category: item.category || '',
        description: item.description || '',
        inquiry_contact: item.inquiry_contact || '',
        link_name: item.link_name || '',
        link_url: item.link_url || '',
        image: item.image || '',
        venue_id: item.venue_id || null,
      });
    }
  }, [item, itemType]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    if (name === 'day_of_week') {
      setFormData(prev => ({ ...prev, [name]: Number(value) }));
    } else {
      setFormData(prev => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      // Verify permission: user_id must match OR user is admin
      if (item.user_id !== user?.id && !isAdmin) {
        throw new Error('수정 권한이 없습니다.');
      }

      // Then update
      const { data: updatedData, error: updateError } = await supabase
        .from('social_schedules')
        .update({
          title: formData.title,
          place_name: formData.place_name || null,
          address: formData.address || null,
          category: formData.category || null,
          description: formData.description || null,
          day_of_week: formData.day_of_week,
          inquiry_contact: formData.inquiry_contact || null,
          link_name: formData.link_name || null,
          link_url: formData.link_url || null,
          image: formData.image || null,
          venue_id: formData.venue_id || null,
        })
        .eq('id', item.id)
        .select()
        .single();

      if (updateError) throw updateError;

      onSuccess(updatedData, false); // false = not deleted
      onClose(); // Close modal after successful update
      alert('수정되었습니다.');
    } catch (err: any) {
      setError(err.message || '수정 중 오류가 발생했습니다.');
      console.error('[수정 실패]', err);
    } finally {
      setLoading(false);
    }
  };

  const handleVenueSelect = (venue: any) => {
    setFormData(prev => ({
      ...prev,
      venue_id: venue?.id || null,
      place_name: venue.name,
      address: venue?.address || '',
    }));
  };

  const handleDelete = async () => {
    // Get current user
    const { data: { user } } = await supabase.auth.getUser();

    // Verify permission
    if (item.user_id !== user?.id && !isAdmin) {
      alert('삭제 권한이 없습니다.');
      return;
    }

    if (!confirm('정말로 삭제하시겠습니까?')) return;

    setLoading(true);
    try {
      const { error: deleteError } = await supabase
        .from('social_schedules')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      onSuccess(null, true); // true = deleted
      onClose(); // Close modal after successful delete
      alert('삭제되었습니다.');
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

          {/* Scrollable Content Area */}
          <div className="sed-modal-content">
            <input type="text" name="title" placeholder="제목 *" value={formData.title || ''} onChange={handleInputChange} required className="sed-form-input" />

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

            <input type="text" name="address" placeholder="주소" value={formData.address || ''} onChange={handleInputChange} className="sed-form-input" />

            <select name="category" value={formData.category || ''} onChange={handleInputChange} className="sed-form-select">
              <option value="">카테고리 선택 (선택사항)</option>
              <option value="club">클럽</option>
              <option value="swing-bar">스윙바</option>
            </select>

            <button
              type="button"
              onClick={() => venueSelectModal.open({
                onSelect: handleVenueSelect,
                onManualInput: (venueName: string) => {
                  setFormData(prev => ({
                    ...prev,
                    venue_id: null,
                    place_name: venueName,
                    address: '',
                  }));
                }
              })}
              className="sed-form-input"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                marginBottom: '1rem'
              }}
            >
              <span style={{ color: formData.place_name ? '#fff' : '#888' }}>
                {formData.place_name || '장소 선택 *'}
              </span>
              <i className="ri-map-pin-line" style={{ fontSize: '1.2rem', color: '#3b82f6' }}></i>
            </button>
            <input type="text" name="inquiry_contact" placeholder="문의 연락처" value={formData.inquiry_contact || ''} onChange={handleInputChange} className="sed-form-input" />

            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
              <input
                type="text"
                name="link_name"
                placeholder="링크 이름 (예: 신청하기)"
                value={formData.link_name || ''}
                onChange={handleInputChange}
                className="sed-form-input"
                style={{ flex: 1, marginBottom: 0 }}
              />
              <input
                type="text"
                name="link_url"
                placeholder="링크 URL (https://...)"
                value={formData.link_url || ''}
                onChange={handleInputChange}
                className="sed-form-input"
                style={{ flex: 2, marginBottom: 0 }}
              />
            </div>

            <div style={{ marginBottom: '10px' }}>
              <label className="sed-form-label" style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>
                대표 이미지 (선택)
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;

                  try {
                    // Generate 2 sizes: Full (500px, Q:0.75) and Thumbnail (100px, Q:0.75)
                    const fullImage = await resizeImage(file, 500, 0.75, 'image.webp', 'width');
                    const thumbImage = await resizeImage(file, 100, 0.75, 'thumb.webp', 'min');

                    const timestamp = Date.now();
                    const randomStr = Math.random().toString(36).substring(2, 9);
                    const fileName = `${timestamp}-${randomStr}.webp`;
                    const basePath = `social`;

                    // Upload Full
                    const { error: fullError } = await supabase.storage
                      .from('images')
                      .upload(`${basePath}/full/${fileName}`, fullImage, {
                        contentType: 'image/webp',
                        upsert: true
                      });

                    if (fullError) throw fullError;

                    // Upload Thumbnail (32px)
                    const { error: thumbError } = await supabase.storage
                      .from('images')
                      .upload(`${basePath}/thumbnail/${fileName}`, thumbImage, {
                        contentType: 'image/webp',
                        upsert: true
                      });

                    if (thumbError) throw thumbError;

                    // Get Public URL for Full image
                    const { data: { publicUrl } } = supabase.storage
                      .from('images')
                      .getPublicUrl(`${basePath}/full/${fileName}`);

                    setFormData(prev => ({ ...prev, image: publicUrl }));
                  } catch (error) {
                    console.error('Image upload failed:', error);
                    alert('이미지 업로드에 실패했습니다.');
                  }
                }}
                style={{ display: 'none' }}
                id="social-edit-image-upload"
              />
              <label htmlFor="social-edit-image-upload" className="sed-form-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: '100px', border: '1px dashed #555' }}>
                {formData.image ? (
                  <img src={formData.image} alt="Preview" style={{ maxHeight: '100px', objectFit: 'contain' }} />
                ) : (
                  <span style={{ color: '#888' }}>+ 이미지 변경</span>
                )}
              </label>
              {formData.image && (
                <button
                  type="button"
                  onClick={() => setFormData(prev => ({ ...prev, image: '' }))}
                  style={{
                    marginTop: '5px',
                    background: 'none',
                    border: 'none',
                    color: '#ff6b6b',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    textDecoration: 'underline'
                  }}
                >
                  이미지 삭제
                </button>
              )}
            </div>

            <textarea name="description" placeholder="설명" value={formData.description || ''} onChange={handleInputChange} className="sed-form-textarea" rows={6}></textarea>
          </div>


          {/* Fixed Bottom Section */}
          <div className="sed-modal-bottom">
            {error && <p className="sed-error-message">{error}</p>}

            <div className="sed-bottom-row">
              <div className="sed-button-group">
                <button type="button" onClick={handleDelete} disabled={loading} className="sed-delete-button">삭제</button>
                <button type="button" onClick={onClose} className="sed-close-button" title="닫기">
                  <i className="ri-close-line"></i>
                </button>
                <button type="submit" disabled={loading} className="sed-submit-button">수정</button>
              </div>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
