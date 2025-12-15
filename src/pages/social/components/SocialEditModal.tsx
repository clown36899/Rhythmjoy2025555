import { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabase';
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
}

export default function SocialEditModal({ item, itemType, onClose, onSuccess }: SocialEditModalProps) {
  const [formData, setFormData] = useState<FormDataType>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  useEffect(() => {
    if (item) {
      let dow = item.day_of_week;
      if (dow === null || dow === undefined && item.date) {
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
      // Schedule Update - Direct update instead of RPC
      // First verify password (double check with server)
      const { data: scheduleData, error: fetchError } = await supabase
        .from('social_schedules')
        .select('password')
        .eq('id', item.id)
        .single();

      if (fetchError) throw fetchError;

      if (scheduleData?.password !== passwordInput) {
        throw new Error('비밀번호가 올바르지 않습니다.');
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
        })
        .eq('id', item.id)
        .select()
        .single();

      if (updateError) throw updateError;

      onSuccess(updatedData, false); // false = not deleted
      alert('수정되었습니다.');
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
      const { error: deleteError } = await supabase
        .from('social_schedules')
        .delete()
        .eq('id', item.id);

      if (deleteError) throw deleteError;

      onSuccess(null, true); // true = deleted
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

            <input type="text" name="place_name" placeholder="장소명 *" value={formData.place_name || ''} onChange={handleInputChange} required className="sed-form-input" />

            <input type="text" name="address" placeholder="주소" value={formData.address || ''} onChange={handleInputChange} className="sed-form-input" />

            <select name="category" value={formData.category || ''} onChange={handleInputChange} className="sed-form-select">
              <option value="">카테고리 선택 (선택사항)</option>
              <option value="club">클럽</option>
              <option value="swing-bar">스윙바</option>
            </select>

            <input type="text" name="inquiry_contact" placeholder="문의 연락처" value={formData.inquiry_contact || ''} onChange={handleInputChange} className="sed-form-input" />
            <div className="sed-link-group" style={{ display: 'flex', gap: '5px' }}>
              <input type="text" name="link_name" placeholder="링크명" value={formData.link_name || ''} onChange={handleInputChange} className="sed-form-input half" style={{ flex: 1 }} />
              <input type="text" name="link_url" placeholder="링크 URL" value={formData.link_url || ''} onChange={handleInputChange} className="sed-form-input half" style={{ flex: 1 }} />
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
                    // WebP & Resize (Max width 1280px for efficiency)
                    const resizedFile = await resizeImage(file, 1280, 0.85);

                    // Use consistent naming
                    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}.webp`;
                    const filePath = `social/${fileName}`;

                    const { error: uploadError } = await supabase.storage
                      .from('images') // Changed to 'images' bucket
                      .upload(filePath, resizedFile);

                    if (uploadError) throw uploadError;

                    const { data: { publicUrl } } = supabase.storage
                      .from('images')
                      .getPublicUrl(filePath);

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
              <input
                type="password"
                name="password"
                placeholder="비밀번호 *"
                value={passwordInput}
                onChange={(e) => setPasswordInput(e.target.value)}
                required
                className="sed-password-input"
                autoComplete="current-password"
              />

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