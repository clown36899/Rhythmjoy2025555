import React, { useState } from 'react';
import { supabase } from '../../../lib/supabase';
import { resizeImage } from '../../../utils/imageResize';
import { useAuth } from '../../../contexts/AuthContext';
import { useModal } from '../../../hooks/useModal';
import { useModalHistory } from '../../../hooks/useModalHistory';
const VenueSelectModal = React.lazy(() => import('../../v2/components/VenueSelectModal'));
import '../../../styles/domains/events.css';
import '../../../styles/components/SocialEventModal.css';

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
          image_url: imageUrl,
          image_thumbnail: imageUrl, // Fallback since we only have one URL here
          image_full: imageUrl,
          image_medium: imageUrl,
          image_micro: imageUrl
        })
        .select()
        .maybeSingle();

      if (insertError) throw insertError;
      if (!insertedData) throw new Error('스케줄 생성에 실패했습니다.');

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
      <div className="SocialEventModal" onClick={onClose}>
        <div className="SEM-container" onClick={(e) => e.stopPropagation()}>
          {!user ? (
            <div className="SEM-loginPrompt">
              <h2 className="SEM-title">로그인 필요</h2>
              <p className="SEM-description">
                일정을 등록하려면 로그인이 필요합니다.<br />
                간편하게 로그인하고 계속하세요!
              </p>
              <button onClick={handleLogin} className="SEM-btn-kakao">
                <i className="ri-kakao-talk-fill"></i>
                카카오로 로그인
              </button>
              <button onClick={onClose} className="SEM-btn-cancel">
                닫기
              </button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="SEM-form">
              <h2 className="SEM-title">요일별 스케줄 등록</h2>

              <div className="SEM-formGroup">
                <label className="SEM-label">제목 (동호회/모임명) *</label>
                <input
                  type="text"
                  placeholder="예: 강남 텐덤 정모"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  className="SEM-input"
                />
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">요일 선택 *</label>
                <select
                  value={dayOfWeek}
                  onChange={(e) => setDayOfWeek(e.target.value === '' ? '' : Number(e.target.value))}
                  required
                  className="SEM-select"
                  disabled={preselectedDay !== undefined}
                >
                  <option value="">요일 선택 *</option>
                  <option value="1">월요일</option>
                  <option value="2">화요일</option>
                  <option value="3">수요일</option>
                  <option value="4">목요일</option>
                  <option value="5">금요일</option>
                  <option value="6">토요일</option>
                  <option value="0">일요일</option>
                </select>
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">장소 *</label>
                <div className="SEM-inputGroup">
                  <input
                    type="text"
                    value={placeName}
                    readOnly
                    placeholder="장소 선택 *"
                    className="SEM-input"
                    onClick={() => venueSelectModal.open({
                      onSelect: handleVenueSelect,
                      onManualInput: (venueName: string) => {
                        setVenueId(null);
                        setPlaceName(venueName);
                        setAddress('');
                      }
                    })}
                    required
                  />
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
                    className="SEM-btn-search"
                  >
                    <i className="ri-map-pin-line"></i>
                  </button>
                </div>
                {address && <div className="SEM-infoText-sm">{address}</div>}
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">카테고리</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as 'club' | 'swing-bar' | '')}
                  className="SEM-select"
                >
                  <option value="">카테고리 선택 (선택사항)</option>
                  <option value="club">클럽</option>
                  <option value="swing-bar">스윙바</option>
                </select>
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">간단한 설명</label>
                <textarea
                  placeholder="설명을 입력하세요"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="SEM-textarea"
                  rows={2}
                />
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">문의 연락처</label>
                <input
                  type="text"
                  placeholder="연락처 또는 카톡ID"
                  value={inquiryContact}
                  onChange={(e) => setInquiryContact(e.target.value)}
                  className="SEM-input"
                />
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">관련 링크</label>
                <div className="SEM-inputGroup">
                  <input
                    type="text"
                    placeholder="링크 이름 (예: 신청하기)"
                    value={linkName}
                    onChange={(e) => setLinkName(e.target.value)}
                    className="SEM-input"
                  />
                  <input
                    type="text"
                    placeholder="URL (https://...)"
                    value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    className="SEM-input"
                  />
                </div>
              </div>

              <div className="SEM-formGroup">
                <label className="SEM-label">대표 이미지 (선택)</label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    setImageUploading(true);
                    try {
                      const fullImage = await resizeImage(file, 500, 0.75, 'image.webp', 'width');
                      const thumbImage = await resizeImage(file, 100, 0.75, 'thumb.webp', 'min');

                      const timestamp = Date.now();
                      const randomStr = Math.random().toString(36).substring(2, 9);
                      const fileName = `${timestamp}-${randomStr}.webp`;
                      const basePath = `social`;

                      await supabase.storage.from('images').upload(`${basePath}/full/${fileName}`, fullImage, { contentType: 'image/webp', upsert: true });
                      await supabase.storage.from('images').upload(`${basePath}/thumbnail/${fileName}`, thumbImage, { contentType: 'image/webp', upsert: true });

                      const { data: { publicUrl } } = supabase.storage.from('images').getPublicUrl(`${basePath}/full/${fileName}`);
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
                <label
                  htmlFor="social-image-upload"
                  className={`SEM-imageUploadLabel ${imageUploading ? 'is-uploading' : ''}`}
                >
                  {imageUploading ? (
                    <span className="SEM-infoText">업로드 중...</span>
                  ) : imageUrl ? (
                    <img src={imageUrl} alt="Preview" className="SEM-imagePreview-rect" />
                  ) : (
                    <span className="SEM-infoText-gray">+ 이미지 추가</span>
                  )}
                </label>
              </div>

              {error && <p className="SEM-error">{error}</p>}

              <div className="SEM-buttonGroup">
                <button type="button" onClick={onClose} className="SEM-btn-cancel">취소</button>
                <button
                  type="submit"
                  disabled={loading || imageUploading}
                  className="SEM-btn-submit"
                >
                  {imageUploading ? '이미지 업로드 중...' : loading ? '등록 중...' : '등록'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={venueSelectModal.isOpen}
          onClose={venueSelectModal.close}
          onSelect={handleVenueSelect}
        />
      </React.Suspense>
    </>
  );
}
