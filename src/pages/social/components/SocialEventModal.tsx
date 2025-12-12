import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { resizeImage } from '../../../utils/imageResize';
import './SocialEventModal.css';

interface SocialEventModalProps {
  onClose: () => void;
  onEventCreated: (data: any) => void;
  preselectedDay?: number;
}

export default function SocialEventModal({ onClose, onEventCreated, preselectedDay }: SocialEventModalProps) {
  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>(preselectedDay ?? ''); // 0-6
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<'club' | 'swing-bar' | ''>('');
  const [description, setDescription] = useState('');
  const [password, setPassword] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || dayOfWeek === '' || !placeName || !password) {
      setError('제목, 요일, 장소명, 비밀번호는 필수 항목입니다.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      // Get current user (optional)
      const { data: { user } } = await supabase.auth.getUser();

      // Insert into social_schedules
      const { data: insertedData, error: insertError } = await supabase
        .from('social_schedules')
        .insert({
          title,
          day_of_week: Number(dayOfWeek),
          place_name: placeName,
          address: address || null,
          category: category || null,
          user_id: user?.id || null,
          description,
          password,
          inquiry_contact: inquiryContact,
          link_name: linkName,
          link_url: linkUrl,
          image: imageUrl
        })
        .select()
        .single();

      if (insertError) throw insertError;

      alert('요일별 스케줄이 등록되었습니다.');
      // 부모에게 데이터 전달하여 즉시 반영
      onEventCreated(insertedData);
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

          <select
            value={dayOfWeek}
            onChange={(e) => setDayOfWeek(Number(e.target.value))}
            required
            className="sem-form-select"
            disabled={preselectedDay !== undefined}
          >
            <option value="" disabled>요일 선택 *</option>
            <option value="1">월요일</option>
            <option value="2">화요일</option>
            <option value="3">수요일</option>
            <option value="4">목요일</option>
            <option value="5">금요일</option>
            <option value="6">토요일</option>
            <option value="0">일요일</option>
          </select>

          <input type="text" placeholder="장소명 (예: 강남 스윙클럽) *" value={placeName} onChange={(e) => setPlaceName(e.target.value)} required className="sem-form-input" />

          <input type="text" placeholder="주소" value={address} onChange={(e) => setAddress(e.target.value)} className="sem-form-input" />

          <select value={category} onChange={(e) => setCategory(e.target.value as 'club' | 'swing-bar' | '')} className="sem-form-select">
            <option value="">카테고리 선택 (선택사항)</option>
            <option value="club">클럽</option>
            <option value="swing-bar">스윙바</option>
          </select>

          <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="sem-form-textarea" rows={2}></textarea>

          <input type="text" placeholder="문의 연락처" value={inquiryContact} onChange={(e) => setInquiryContact(e.target.value)} className="sem-form-input" />

          <div className="sem-link-group" style={{ display: 'flex', gap: '5px' }}>
            <input type="text" placeholder="링크명 (예: 오픈카톡)" value={linkName} onChange={(e) => setLinkName(e.target.value)} className="sem-form-input half" style={{ flex: 1 }} />
            <input type="text" placeholder="링크 URL" value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="sem-form-input half" style={{ flex: 1 }} />
          </div>

          <div style={{ marginBottom: '10px' }}>
            <label className="sem-form-label" style={{ display: 'block', marginBottom: '5px', fontSize: '0.9rem', color: '#ccc' }}>
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

                  setImageUrl(publicUrl);
                } catch (error) {
                  console.error('Image upload failed:', error);
                  alert('이미지 업로드에 실패했습니다.');
                }
              }}
              style={{ display: 'none' }}
              id="social-image-upload"
            />
            <label htmlFor="social-image-upload" className="sem-form-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', minHeight: '100px', border: '1px dashed #555' }}>
              {imageUrl ? (
                <img src={imageUrl} alt="Preview" style={{ maxHeight: '100px', objectFit: 'contain' }} />
              ) : (
                <span style={{ color: '#888' }}>+ 이미지 추가</span>
              )}
            </label>
          </div>

          <input type="password" placeholder="비밀번호 (수정/삭제 시 필요) *" value={password} onChange={(e) => setPassword(e.target.value)} required className="sem-form-input" autoComplete="current-password" />

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