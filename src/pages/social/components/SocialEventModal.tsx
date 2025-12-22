import { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { resizeImage } from '../../../utils/imageResize';
import { useAuth } from '../../../contexts/AuthContext';
import { useModal } from '../../../hooks/useModal';
import { useModalHistory } from '../../../hooks/useModalHistory';
import './SocialEventModal.css';

interface SocialEventModalProps {
  onClose: () => void;
  onEventCreated: (data: any) => void;
  preselectedDay?: number;
}

export default function SocialEventModal({ onClose, onEventCreated, preselectedDay }: SocialEventModalProps) {
  // Check if Mobile Back Gesture support is needed. Usually these modals are full screen or significant overlays.
  // Adding history support for consistency.
  useModalHistory(true, onClose);

  const [title, setTitle] = useState('');
  const [dayOfWeek, setDayOfWeek] = useState<number | ''>(preselectedDay ?? ''); // 0-6
  const [placeName, setPlaceName] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState<'club' | 'swing-bar' | ''>('');
  const [description, setDescription] = useState('');
  const [inquiryContact, setInquiryContact] = useState('');
  const [linkName, setLinkName] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [venueId, setVenueId] = useState<string | null>(null);
  const venueSelectModal = useModal('venueSelect');

  const { user, signInWithKakao } = useAuth();

  const handleLogin = () => {
    signInWithKakao();
  };

  const [loading, setLoading] = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || dayOfWeek === '' || !placeName) {
      setError('제목, 요일, 장소명은 필수 항목입니다.');
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
          venue_id: venueId,
          description,
          inquiry_contact: inquiryContact,
          link_name: linkName || null,
          link_url: linkUrl || null,
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

  const handleVenueSelect = (venue: any) => {
    setVenueId(venue?.id || null);
    setPlaceName(venue.name);
    setAddress(venue?.address || '');
  };

  return (
    <>
      <div className="sem-modal-overlay" onClick={onClose}>
        <div className="sem-modal-container" onClick={(e) => e.stopPropagation()}>
          {!user ? (
            <div style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '2rem',
              textAlign: 'center',
              height: '100%',
              backgroundColor: 'rgba(30, 41, 59, 1)', // Background matching the theme
              borderRadius: 'inherit'
            }}>
              <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>로그인 필요</h2>
              <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                일정을 등록하려면 로그인이 필요합니다.<br />
                간편하게 로그인하고 계속하세요!
              </p>
              <button
                onClick={handleLogin}
                style={{
                  width: '100%',
                  padding: '1rem',
                  background: '#FEE500',
                  color: '#000000',
                  border: 'none',
                  borderRadius: '0.5rem',
                  fontSize: '1rem',
                  fontWeight: '600',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '0.5rem',
                  marginBottom: '1rem'
                }}
              >
                <i className="ri-kakao-talk-fill" style={{ fontSize: '1.5rem' }}></i>
                카카오로 로그인
              </button>
              <button
                onClick={onClose}
                style={{
                  width: '100%',
                  padding: '0.75rem',
                  background: 'transparent',
                  color: '#9ca3af',
                  border: '1px solid rgba(255, 255, 255, 0.1)',
                  borderRadius: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                취소
              </button>
            </div>
          ) : (
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

              {/* Venue Selection Button */}
              <button
                type="button"
                onClick={() => venueSelectModal.open({
                  onSelect: handleVenueSelect,
                  onManualInput: (venueName: string) => {
                    setVenueId(null);
                    setPlaceName(venueName);
                    setAddress('');
                  }
                })}
                className="sem-form-input"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  cursor: 'pointer',
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <span style={{ color: placeName ? '#fff' : '#888' }}>
                  {placeName || '장소 선택 *'}
                </span>
                <i className="ri-map-pin-line" style={{ fontSize: '1.2rem', color: '#3b82f6' }}></i>
              </button>

              {address && (
                <div style={{ fontSize: '0.85rem', color: '#9ca3af', marginTop: '-0.5rem', paddingLeft: '0.5rem' }}>
                  {address}
                </div>
              )}

              <select value={category} onChange={(e) => setCategory(e.target.value as 'club' | 'swing-bar' | '')} className="sem-form-select">
                <option value="">카테고리 선택 (선택사항)</option>
                <option value="club">클럽</option>
                <option value="swing-bar">스윙바</option>
              </select>

              <textarea placeholder="간단한 설명" value={description} onChange={(e) => setDescription(e.target.value)} className="sem-form-textarea" rows={2}></textarea>

              <input type="text" placeholder="문의 연락처" value={inquiryContact} onChange={(e) => setInquiryContact(e.target.value)} className="sem-form-input" />

              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <input
                  type="text"
                  placeholder="링크 이름 (예: 신청하기)"
                  value={linkName}
                  onChange={(e) => setLinkName(e.target.value)}
                  className="sem-form-input"
                  style={{ flex: 1 }}
                />
                <input
                  type="text"
                  placeholder="링크 URL (https://...)"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  className="sem-form-input"
                  style={{ flex: 2 }}
                />
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

                    setImageUploading(true);
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
                    } finally {
                      setImageUploading(false);
                    }
                  }}
                  style={{ display: 'none' }}
                  id="social-image-upload"
                />
                <label htmlFor="social-image-upload" className="sem-form-input" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: imageUploading ? 'wait' : 'pointer', minHeight: '100px', border: '1px dashed #555', opacity: imageUploading ? 0.6 : 1 }}>
                  {imageUploading ? (
                    <span style={{ color: '#3b82f6' }}>업로드 중...</span>
                  ) : imageUrl ? (
                    <img src={imageUrl} alt="Preview" style={{ maxHeight: '100px', objectFit: 'contain' }} />
                  ) : (
                    <span style={{ color: '#888' }}>+ 이미지 추가</span>
                  )}
                </label>
              </div>


              {error && <p className="sem-error-message">{error}</p>}

              <div className="sem-button-group">
                <button type="button" onClick={onClose} className="sem-cancel-button">취소</button>
                <button type="submit" disabled={loading || imageUploading} className="sem-submit-button">
                  {imageUploading ? '이미지 업로드 중...' : loading ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </>
  );
}
