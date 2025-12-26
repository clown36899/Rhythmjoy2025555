import { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase'; // Import value for update
import type { Event as BaseEvent } from '../../../lib/supabase';
import { useDefaultThumbnail } from '../../../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { parseMultipleContacts, copyToClipboard } from '../../../utils/contactLink';
import { useModalHistory } from '../../../hooks/useModalHistory';
import { logEvent, logPageView } from '../../../lib/analytics';
import "../../../styles/components/EventDetailModal.css";
import "../../../pages/v2/styles/components/EventDetailModal.css"; // Ensure V2 styles are imported
import { useAuth } from '../../../contexts/AuthContext';
import VenueSelectModal from './VenueSelectModal';
import ImageCropModal from '../../../components/ImageCropModal';
import { createResizedImages } from '../../../utils/imageResize';
import GlobalLoadingOverlay from '../../../components/GlobalLoadingOverlay';


interface Event extends BaseEvent {
  storage_path?: string | null;
  genre?: string | null;
}

const genreColorPalette = [
  'genre-color-red',
  'genre-color-orange',
  'genre-color-amber',
  'genre-color-yellow',
  'genre-color-lime',
  'genre-color-green',
  'genre-color-emerald',
  'genre-color-teal',
  'genre-color-cyan',
  'genre-color-sky',
  'genre-color-blue',
  'genre-color-indigo',
  'genre-color-violet',
  'genre-color-purple',
  'genre-color-fuchsia',
  'genre-color-pink',
  'genre-color-rose',
];

function getGenreColor(genre: string): string {
  if (!genre) return 'genre-color-gray';
  let hash = 0;
  for (let i = 0; i < genre.length; i++) {
    hash = genre.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash % genreColorPalette.length);
  return genreColorPalette[index];
}

interface EventDetailModalProps {
  event: Event | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit: (event: Event, arg?: React.MouseEvent | string) => void;
  onDelete: (event: Event, e?: React.MouseEvent) => void;
  isAdminMode?: boolean;
  currentUserId?: string; // Add currentUserId prop
  isFavorite?: boolean;
  onToggleFavorite?: (e: React.MouseEvent) => void;
  onOpenVenueDetail?: (venueId: string) => void;
  allGenres?: { class: string[]; event: string[] } | string[]; // Backwards compatibility if needed, but we'll cast to structured
}

export default function EventDetailModal({
  event,
  isOpen,
  onClose,
  onEdit: _onEdit,
  onDelete: _onDelete,
  isAdminMode = false,
  currentUserId,
  isFavorite = false,
  onToggleFavorite,
  onOpenVenueDetail,
  allGenres = { class: [], event: [] },
}: EventDetailModalProps) {
  // Safe cast or normalization
  const structuredGenres = Array.isArray(allGenres)
    ? { class: [], event: [] } // Fallback or logic to distribute if we really needed, but generally we expect structured now
    : allGenres;

  const { user, signInWithKakao } = useAuth();
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);


  const handleOverlayClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };
  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Draft State for Local Edits
  const [draftEvent, setDraftEvent] = useState<Event | null>(event);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  useEffect(() => {
    setDraftEvent(event);

    // On-Demand Fetching: description이나 link1이 없으면 상세 데이터 조회
    if (event?.id && (event.description === undefined || event.link1 === undefined)) {
      const fetchDetail = async () => {
        try {
          setIsFetchingDetail(true);

          // [최적화] DB 외래키 설정을 통해 한 번의 요청(Join)으로 닉네임까지 가져옴
          const selectFields = isAdminMode ? '*, board_users(nickname)' : '*';
          const { data, error } = await supabase
            .from('events')
            .select(selectFields)
            .eq('id', event.id)
            .maybeSingle();

          if (!error && data) {
            setDraftEvent(prev => ({ ...(prev || event), ...(data as any) } as Event));

            // 조인된 데이터에서 닉네임 추출
            const nickname = (data as any).board_users?.nickname;
            if (nickname) setAuthorNickname(nickname);
          }
        } catch (err) {
          console.error('Failed to fetch event detail:', err);
        } finally {
          setIsFetchingDetail(false);
        }
      };
      fetchDetail();
    }
  }, [event]);

  const { defaultThumbnailClass, defaultThumbnailEvent } = useDefaultThumbnail();

  // Smooth Transition State
  const [isHighResLoaded, setIsHighResLoaded] = useState(false);

  // Derive sources from Draft if available
  const displayEvent = draftEvent || event;

  const thumbnailSrc = displayEvent ? (displayEvent.image_micro || displayEvent.image_thumbnail ||
    getEventThumbnail(displayEvent, defaultThumbnailClass, defaultThumbnailEvent)) : null;

  // Prioritize Medium for faster loading, Fallback to others. This prevents loading 5MB images in a 400px modal.
  const highResSrc = useMemo(() => {
    if (!displayEvent) return null;

    // 1. Smart Derivation (If path implies medium exists, derive it from full/original)
    const sourceImage = displayEvent.image;
    if (sourceImage && typeof sourceImage === 'string') {
      if (sourceImage.includes('/event-posters/full/')) {
        return sourceImage.replace('/event-posters/full/', '/event-posters/medium/');
      }
    }

    // 2. Explicit Medium (Most Optimized)
    if (displayEvent.image_medium) return displayEvent.image_medium;

    // 3. Fallbacks - use thumbnail or original, but avoid image_full (too large)
    return displayEvent.image_thumbnail || displayEvent.image;
  }, [displayEvent]);


  // Effect to preload high-res image
  useEffect(() => {
    setIsHighResLoaded(false);

    if (highResSrc && highResSrc !== thumbnailSrc) {
      const img = new Image();
      img.src = highResSrc;
      img.onload = () => {
        setIsHighResLoaded(true);
      };
    } else if (!highResSrc && thumbnailSrc) {
      // 고화질 없고 썸네일만 있는 경우 로딩 완료 처리 (사실상 변화 없음)
      setIsHighResLoaded(true);
    }
  }, [highResSrc, thumbnailSrc]);
  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  // Analytics: Log virtual page view for better reporting (Pages and Screens)
  useEffect(() => {
    if (isOpen && event) {
      // 1. 이벤트성 로그 (기존)
      logEvent('Event', 'View Detail', `${event.title} (ID: ${event.id})`);

      // 2. 가상 페이지뷰 로그 (신규 - 페이지 보고서 용)
      // 실제 URL은 변하지 않지만, GA4에는 페이지가 바뀐 것처럼 전송
      logPageView(`/event/${event.id}`, event.title);
    }
  }, [isOpen, event]);

  const handleLogin = () => {
    signInWithKakao();
  };

  // Reset selection mode and draft state when modal closes
  useEffect(() => {
    if (!isOpen) {
      setIsSelectionMode(false);
      setDraftEvent(event);
      setImageFile(null);
      setTempImageSrc(null);
      setOriginalImageUrl(null); // 원본 이미지 URL 리셋
    }
  }, [isOpen, event]);
  useEffect(() => {
    setDraftEvent(event);
  }, [event]);


  // Image Edit State


  // Image Edit State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);



  // 원본 이미지 정보 보관 (DB 저장 전까지 유지)
  const [originalImageUrl, setOriginalImageUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to read file as Data URL
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target?.result as string);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const handleImageClick = async () => {
    if (!isSelectionMode) return;

    // 1. Open Modal Immediately
    setIsCropModalOpen(true);
    // 2. Start Loading State (Passed to modal)
    setIsImageLoading(true);

    // Yield to UI to ensure modal opens

    // Yield to UI to ensure modal opens
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      if (imageFile) {
        setTempImageSrc(await fileToDataURL(imageFile));
      } else if (draftEvent?.image) {
        // 원본 이미지 URL 저장 (첫 편집 시에만)
        if (!originalImageUrl) {
          setOriginalImageUrl(draftEvent.image);
        }
        setTempImageSrc(draftEvent.image);
      } else {
        setTempImageSrc(null);
      }
    } catch (e) {
      console.error('Failed to prepare image for edit:', e);
      setTempImageSrc(null);
    } finally {
      setIsImageLoading(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Ensure modal is open immediately
      setIsCropModalOpen(true);
      setIsImageLoading(true);

      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        const dataUrl = await fileToDataURL(file);
        setTempImageSrc(dataUrl);
        // setIsCropModalOpen(true); // Already opened above
      } catch (error) {
        console.error("Failed to load image:", error);
        alert("이미지를 불러오는데 실패했습니다.");
      } finally {
        setIsImageLoading(false);
      }
      e.target.value = ''; // Reset input
    }
  };

  const handleCropComplete = (croppedFile: File, previewUrl: string) => {
    if (!draftEvent) return;

    setImageFile(croppedFile);
    // Update draft event with preview URL to show immediately
    setDraftEvent({
      ...draftEvent,
      image: previewUrl,
      image_medium: undefined,
      image_full: undefined,
      image_thumbnail: undefined
    } as any);
  };

  const handleImageUpdate = async (file: File) => {
    if (!draftEvent) return;

    // 파일을 Data URL로 변환하여 미리보기
    const dataUrl = await fileToDataURL(file);
    setImageFile(file);
    setDraftEvent({
      ...draftEvent,
      image: dataUrl,
      image_medium: undefined,
      image_full: undefined,
      image_thumbnail: undefined
    } as any);
    setTempImageSrc(dataUrl);
  };

  // Bottom Sheet Edit State
  // Bottom Sheet Edit State
  const [activeEditField, setActiveEditField] = useState<string | null>(null);
  const [showVenueSelect, setShowVenueSelect] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [editCategory, setEditCategory] = useState<'event' | 'class' | 'club'>('event'); // Added 'club' type
  // const [useDirectInput, setUseDirectInput] = useState(false); // Removed

  const [linkEditValues, setLinkEditValues] = useState({
    link1: '', link_name1: '',
    link2: '', link_name2: '',
    link3: '', link_name3: ''
  });
  const [isSaving, setIsSaving] = useState(false);
  const [isImageLoading, setIsImageLoading] = useState(false);
  const [authorNickname, setAuthorNickname] = useState<string | null>(null);

  // Genre Management State (Moved down to access editCategory/editValue)
  const [allHistoricalGenres, setAllHistoricalGenres] = useState<string[]>([]);
  // const [localCustomGenres, setLocalCustomGenres] = useState<string[]>([]); // Removed
  // const [customGenreInput, setCustomGenreInput] = useState(''); // Removed

  // Fetch ALL historical genres on mount
  useEffect(() => {
    const fetchGenres = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('genre');

      if (!error && data) {
        // 1. Extract all non-null genres
        const rawGenres = data.map(d => d.genre).filter(Boolean) as string[];
        // 2. Split by comma to ensure atomicity (Fixing the duplication bug)
        const atomicGenres = rawGenres.flatMap(g => g.split(',').map(s => s.trim()));
        // 3. Unique set
        const unique = Array.from(new Set(atomicGenres)).sort();
        setAllHistoricalGenres(unique);
      }
    };
    fetchGenres();
  }, []);

  // Compute final unique genres for display
  const uniqueGenres = useMemo(() => {
    // Start with prop-provided genres (if any)
    // For 'club' category, use 'class' genres as they share the same genre list
    const propGenres = editCategory === 'club'
      ? (structuredGenres['class'] || [])
      : (structuredGenres[editCategory] || []);

    // Combine all sources: Prop + Historical + Local Custom
    const combined = [
      ...propGenres,
      ...allHistoricalGenres,
      // ...localCustomGenres // Removed
    ];

    console.log('[EventDetailModal] uniqueGenres recalc. Category:', editCategory);
    console.log('[EventDetailModal] structuredGenres:', structuredGenres);


    // Filter, Flatten, Unique, Sort
    // Enforce strict genres based on category
    if (editCategory === 'event') {
      return ['파티', '대회', '워크샵'];
    }
    if (editCategory === 'class') {
      return ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집'];
    }
    if (editCategory === 'club') {
      return ['린디합', '솔로재즈', '발보아', '블루스', '팀원모집'];
    }

    // Fallback for other potential categories (though currently only event/class exist)
    return Array.from(new Set(
      combined
        .flatMap(g => g.split(',')) // Crucial: Flatten any accidental comma-strings
        .map(s => s.trim())
        .filter(s => s && s.length > 0) // Remove empty
    )).sort();
  }, [editCategory, structuredGenres, allHistoricalGenres]);

  useEffect(() => {
    if (activeEditField && draftEvent) {
      if (activeEditField === 'title') setEditValue(draftEvent.title);
      if (activeEditField === 'genre') {
        setEditValue(draftEvent.genre || '');
        setEditCategory(draftEvent.category === 'class' ? 'class' : 'event');
        // setUseDirectInput(false); // Removed
      }
      // Location moved to VenueSelectModal
      if (activeEditField === 'description') setEditValue(draftEvent.description || '');
      if (activeEditField === 'links') {
        setLinkEditValues({
          link1: draftEvent.link1 || '',
          link_name1: draftEvent.link_name1 || '',
          link2: draftEvent.link2 || '',
          link_name2: draftEvent.link_name2 || '',
          link3: draftEvent.link3 || '',
          link_name3: draftEvent.link_name3 || ''
        });
      }
    }
  }, [activeEditField, draftEvent]);

  const handleVenueSelect = (venue: any) => {
    if (!draftEvent) return;
    setDraftEvent({
      ...draftEvent,
      location: venue.name,
      location_link: venue.map_url,
      venue_id: venue.id
    });
  };

  const handleManualVenueInput = (name: string, link: string) => {
    if (!draftEvent) return;
    setDraftEvent({
      ...draftEvent,
      location: name,
      location_link: link,
      venue_id: null,
      venue_name: null
    });
  };

  const handleSaveField = () => {
    if (!draftEvent || !activeEditField) return;

    const updates: Partial<Event> = {};

    if (activeEditField === 'title') updates.title = editValue;
    if (activeEditField === 'genre') {
      updates.genre = editValue;
      updates.category = editCategory;
    }
    if (activeEditField === 'description') updates.description = editValue;
    if (activeEditField === 'links') {
      updates.link1 = linkEditValues.link1;
      updates.link_name1 = linkEditValues.link_name1;
      updates.link2 = linkEditValues.link2;
      updates.link_name2 = linkEditValues.link_name2;
      updates.link3 = linkEditValues.link3;
      updates.link_name3 = linkEditValues.link_name3;
    }

    setDraftEvent({ ...draftEvent, ...updates });
    setActiveEditField(null);
  };

  // 변경사항 감지 함수
  const hasChanges = () => {
    if (!event || !draftEvent) return false;

    // 이미지 변경 확인
    if (imageFile) return true;

    // 필드 변경 확인
    const fieldsToCheck = [
      'title', 'description', 'location', 'location_link', 'venue_id', 'genre', 'category',
      'link1', 'link_name1', 'link2', 'link_name2', 'link3', 'link_name3'
    ];
    return fieldsToCheck.some(field => {
      const originalValue = event[field as keyof Event];
      const draftValue = draftEvent[field as keyof Event];
      // null vs undefined vs empty string check could be needed but direct comparison usually works if initialized consistent
      // Treat null, undefined, empty string as equivalent for comparison if needed, but strict equality is safer for now
      return originalValue !== draftValue;
    });
  };

  const handleFinalSave = async () => {
    if (!draftEvent) return;



    try {
      setIsSaving(true);
      console.log("🌀 EventDetailModal 스피너 실행됨 (isSaving: true)");

      // UI 렌더링을 위해 양보 (0ms)
      await new Promise(resolve => setTimeout(resolve, 0));

      // Initialize updates with current draft state
      const updates: any = {
        title: draftEvent.title,
        genre: draftEvent.genre,
        category: draftEvent.category,
        description: draftEvent.description,
        location: draftEvent.location,
        location_link: draftEvent.location_link,
        venue_id: draftEvent.venue_id,
        // Add link fields
        link1: draftEvent.link1,
        link_name1: draftEvent.link_name1,
        link2: draftEvent.link2,
        link_name2: draftEvent.link_name2,
        link3: draftEvent.link3,
        link_name3: draftEvent.link_name3
      };

      // Upload image if changed
      if (imageFile) {
        const timestamp = Date.now();
        const fileName = `${timestamp}_${Math.random().toString(36).substring(2)}.webp`;
        const basePath = `event-posters`;

        // Resize images
        const resizedImages = await createResizedImages(imageFile);

        // Upload Full Size
        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(`${basePath}/full/${fileName}`, resizedImages.full, {
            contentType: 'image/webp',
            upsert: true
          });

        if (uploadError) throw uploadError;

        // Upload Medium (50% reduction)
        if (resizedImages.medium) {
          await supabase.storage
            .from('images')
            .upload(`${basePath}/medium/${fileName}`, resizedImages.medium, {
              contentType: 'image/webp',
              upsert: true
            });
        }

        // Upload Thumbnail
        if (resizedImages.thumbnail) {
          await supabase.storage
            .from('images')
            .upload(`${basePath}/thumbnail/${fileName}`, resizedImages.thumbnail, {
              contentType: 'image/webp',
              upsert: true
            });
        }

        // Upload Micro (100px) - ADDED
        if (resizedImages.micro) {
          await supabase.storage
            .from('images')
            .upload(`${basePath}/micro/${fileName}`, resizedImages.micro, {
              contentType: 'image/webp',
              upsert: true
            });
        }

        const publicUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/full/${fileName}`).data.publicUrl;

        const mediumUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/medium/${fileName}`).data.publicUrl;

        const thumbnailUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/thumbnail/${fileName}`).data.publicUrl;

        const microUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/micro/${fileName}`).data.publicUrl;

        // Update draft fields
        updates.image = publicUrl;
        updates.image_full = publicUrl;
        updates.image_medium = mediumUrl;
        updates.image_thumbnail = thumbnailUrl;
        updates.image_micro = microUrl;
      }

      // DB Update
      const { error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', draftEvent.id);

      if (error) throw error;

      // 업데이트된 이벤트 데이터를 가져오기
      const { data: updatedEvent } = await supabase
        .from('events')
        .select('*')
        .eq('id', draftEvent.id)
        .single();

      window.dispatchEvent(new CustomEvent('eventUpdated', {
        detail: {
          id: draftEvent.id,
          event: updatedEvent || draftEvent // 업데이트된 전체 이벤트 데이터
        }
      }));
      setIsSelectionMode(false);
      setImageFile(null);
      setTempImageSrc(null);
      alert('저장되었습니다.');

    } catch (error) {
      console.error('Save failed:', error);
      alert('저장에 실패했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen || !event) {
    return null;
  }

  const selectedEvent = draftEvent || event;

  return (
    <>
      {createPortal(
        <div
          className="event-detail-modal-overlay"
          onClick={handleOverlayClick}
          onTouchStartCapture={(e) => {
            e.stopPropagation();
          }}
          onTouchEndCapture={(e) => {
            e.stopPropagation();
          }}
        >
          <div
            className="event-detail-modal-container"
            style={{ borderColor: "rgb(89, 89, 89)", position: 'relative' }} // relative for login overlay
            onClick={(e) => e.stopPropagation()}
          >
            {/* 데이터 로딩 인디케이터 (상세 데이터 없을 때) */}
            {isFetchingDetail && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '4px',
                background: 'linear-gradient(90deg, transparent, rgba(59, 130, 246, 0.5), transparent)',
                zIndex: 50,
                animation: 'pulse 1.5s infinite'
              }} />
            )}

            {/* 로그인 유도 오버레이 */}
            {showLoginPrompt && (
              <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(30, 41, 59, 0.95)',
                zIndex: 100,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '2rem',
                textAlign: 'center',
                borderRadius: 'inherit'
              }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', color: 'white', marginBottom: '1rem' }}>로그인 필요</h2>
                <p style={{ color: '#cbd5e1', marginBottom: '1.5rem', lineHeight: '1.5' }}>
                  수정/삭제하려면 로그인이 필요합니다.<br />
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
                  onClick={() => setShowLoginPrompt(false)}
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
            )}

            {/* 스크롤 가능한 전체 영역 */}
            <div
              className={`modal-scroll-container ${isSelectionMode ? 'selection-mode' : ''}`}
              style={{
                overscrollBehavior: 'contain',
                WebkitOverflowScrolling: 'touch'
              }}
            >
              {/* 이미지 영역 (스크롤과 함께 사라짐) */}
              {/* 이미지 영역 (스크롤과 함께 사라짐) */}
              {(() => {
                // Progressive Loading: thumbnail priority logic removed here as it is handled by state above
                // We will render up to two images: Thumbnail (Base) and HighRes (Overlay)

                const hasImage = !!(thumbnailSrc || highResSrc);
                const isDefaultThumbnail = !selectedEvent.image_thumbnail && !highResSrc && !!thumbnailSrc;

                // Transform style (shared)
                const imageStyle = {
                  transform: `translate3d(${(selectedEvent as any).image_position_x || 0}%, ${(selectedEvent as any).image_position_y || 0}%, 0)`
                };

                return (
                  <div
                    className={`image-area ${hasImage ? "bg-black" : "bg-pattern"}`}
                    style={{
                      ...(!hasImage
                        ? { backgroundImage: "url(/grunge.png)" }
                        : {}),
                      // Ensure relative positioning for absolute children
                      position: 'relative',
                      justifyContent: 'center',
                      alignItems: 'center',
                      display: 'flex'
                    }}
                  >
                    {hasImage ? (
                      <>
                        {/* 1. Base Layer: Thumbnail */}
                        {thumbnailSrc && (
                          <img
                            src={thumbnailSrc}
                            alt={selectedEvent.title}
                            className="detail-image"
                            loading="eager"
                            style={{
                              ...imageStyle,
                              width: '100%', // Force full width to dictate container height
                              opacity: 1, // Always visible underneath
                              position: 'relative', // Dictates the container size
                              zIndex: 1
                            }}
                          />
                        )}

                        {/* 2. Overlay Layer: HighRes (Cross-fade) */}
                        {highResSrc && highResSrc !== thumbnailSrc && (
                          <img
                            src={highResSrc}
                            alt={selectedEvent.title}
                            className="detail-image"
                            loading="eager"
                            decoding="async"
                            style={{
                              ...imageStyle,
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              objectFit: 'contain',
                              opacity: isHighResLoaded ? 1 : 0,
                              transition: 'opacity 0.4s ease-in-out',
                              zIndex: 2
                            }}
                          />
                        )}

                        {/* Fallback if only HighRes exists and no thumbnail (Rare) */}
                        {!thumbnailSrc && highResSrc && (
                          <img
                            src={highResSrc}
                            alt={selectedEvent.title}
                            className="detail-image"
                            loading="eager"
                            style={{ ...imageStyle, zIndex: 1 }}
                          />
                        )}

                        {/* Gradient Overlay */}
                        <div className="image-gradient-overlay" style={{ zIndex: 10 }} />

                        {isDefaultThumbnail && (
                          <div className="default-thumbnail-overlay">
                            <span className="default-thumbnail-text">
                              {selectedEvent.category === "class"
                                ? "강습"
                                : "행사"}
                            </span>
                          </div>
                        )}

                        {isSelectionMode && (
                          <div
                            className="image-edit-overlay-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleImageClick();
                            }}
                            style={{
                              position: 'absolute',
                              top: 0,
                              left: 0,
                              width: '100%',
                              height: '100%',
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'center',
                              backgroundColor: 'rgba(0,0,0,0.5)',
                              color: 'white',
                              zIndex: 20,
                              cursor: 'pointer'
                            }}
                          >
                            <i className="ri-image-edit-line" style={{ fontSize: '48px', marginBottom: '8px' }}></i>
                            <span style={{ fontSize: '16px', fontWeight: 600 }}>이미지 수정</span>
                          </div>
                        )}
                        {/* 크게보기 버튼 */}
                        <button
                          onClick={() => setShowFullscreenImage(true)}
                          className="fullscreen-button"
                        >
                          크게 보기
                        </button>

                        {/* 즐겨찾기 버튼 (이미지 좌측 하단) */}
                        {onToggleFavorite && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onToggleFavorite(e);
                            }}
                            className={`card-favorite-btn ${isFavorite ? 'is-active' : ''}`}
                            title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                            style={{
                              top: 'auto',
                              bottom: '20px',
                              left: '20px',
                              right: 'auto',
                              width: '72px',
                              height: '72px'
                            }}
                          >
                            <i className={`card-favorite-icon ${isFavorite ? "ri-star-fill" : "ri-star-line"}`} style={{ fontSize: '40px' }}></i>
                          </button>
                        )}
                      </>
                    ) : (
                      <>
                        <div
                          className={`category-bg-overlay ${selectedEvent.category === "class" ? "class" : "event"}`}
                        ></div>
                        <span className="category-bg-text">
                          {selectedEvent.category === "class" ? "강습" : "행사"}
                        </span>
                      </>
                    )}

                    {/* 카테고리 배지 - 좌측 하단 */}
                    <div
                      className={`category-badge ${selectedEvent.category === "class" ? "class" : "event"}`}
                    >
                      {selectedEvent.category === "class" ? "강습" : "행사"}
                    </div>
                  </div>
                );
              })()}

              {/* Right Column: Header + Info */}
              <div className="info-column">
                {/* 제목 - Sticky Header */}
                <div
                  className="sticky-header"
                >
                  {/* 장르 표시 */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <h2 className="modal-title">
                      {selectedEvent.title}
                    </h2>

                    {isSelectionMode && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveEditField('title');
                        }}
                        className="edm-edit-trigger-btn"
                        style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                        title="제목 수정"
                      >
                        <i className="ri-pencil-line" style={{ fontSize: '14px' }}></i>
                      </button>
                    )}
                  </div>

                  {/* 장르 표시 */}
                  {(selectedEvent.genre || isSelectionMode) && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginBottom: '8px' }}>
                      {selectedEvent.genre ? (
                        <p className={`genre-text ${getGenreColor(selectedEvent.genre)}`}>
                          {selectedEvent.genre}
                        </p>
                      ) : (
                        <span style={{ color: '#9ca3af', fontSize: '14px' }}>장르 미지정</span>
                      )}
                      {isSelectionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEditField('genre');
                          }}
                          className="edm-edit-trigger-btn"
                          style={{ background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '50%', width: '20px', height: '20px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
                          title="장르 수정"
                        >
                          <i className="ri-pencil-line" style={{ fontSize: '12px' }}></i>
                        </button>
                      )}
                    </div>
                  )}
                </div>

                {/* 세부 정보 */}
                <div className="info-section">
                  <div className="info-item">
                    <i className="ri-calendar-line info-icon"></i>
                    <span>
                      {(() => {
                        // 특정 날짜 모드: event_dates 배열이 있으면 개별 날짜 표시
                        if (
                          selectedEvent.event_dates &&
                          selectedEvent.event_dates.length > 0
                        ) {
                          const dates = selectedEvent.event_dates.map(
                            (dateStr) => new Date(dateStr),
                          );
                          const firstDate = dates[0];
                          const year = firstDate.getFullYear();
                          const month = firstDate.toLocaleDateString("ko-KR", {
                            month: "long",
                          });

                          // 같은 년월인지 확인
                          const sameYearMonth = dates.every(
                            (d) =>
                              d.getFullYear() === year &&
                              d.toLocaleDateString("ko-KR", { month: "long" }) ===
                              month,
                          );

                          if (sameYearMonth) {
                            // 같은 년월: "2025년 10월 11일, 25일, 31일"
                            const days = dates
                              .map((d) => d.getDate())
                              .join("일, ");
                            return `${year}년 ${month} ${days}일`;
                          } else {
                            // 다른 년월: "10/11, 11/25, 12/31"
                            return dates
                              .map((d) => `${d.getMonth() + 1}/${d.getDate()}`)
                              .join(", ");
                          }
                        }

                        // 연속 기간 모드
                        const startDate =
                          selectedEvent.start_date || selectedEvent.date;
                        const endDate = selectedEvent.end_date;

                        if (!startDate) return "날짜 미정";

                        const start = new Date(startDate);
                        const startYear = start.getFullYear();
                        const startMonth = start.toLocaleDateString("ko-KR", {
                          month: "long",
                        });
                        const startDay = start.getDate();

                        if (endDate && endDate !== startDate) {
                          const end = new Date(endDate);
                          const endYear = end.getFullYear();
                          const endMonth = end.toLocaleDateString("ko-KR", {
                            month: "long",
                          });
                          const endDay = end.getDate();

                          if (startYear === endYear && startMonth === endMonth) {
                            return `${startYear}년 ${startMonth} ${startDay}~${endDay}일`;
                          } else if (startYear === endYear) {
                            return `${startYear}년 ${startMonth} ${startDay}일~${endMonth} ${endDay}일`;
                          } else {
                            return `${startYear}년 ${startMonth} ${startDay}일~${endYear}년 ${endMonth} ${endDay}일`;
                          }
                        }

                        return `${startYear}년 ${startMonth} ${startDay}일`;
                      })()}
                    </span>
                  </div>

                  {/* {selectedEvent.organizer && (
                    <div className="info-item">
                      <i className="ri-user-line info-icon"></i>
                      <span>{selectedEvent.organizer}</span>
                    </div>
                  )} */}

                  {selectedEvent.location && (
                    <div className="info-item">
                      <i className="ri-map-pin-line info-icon"></i>
                      <div className="info-flex-gap-1" style={{ flex: 1, alignItems: 'center', display: 'flex' }}>
                        {(selectedEvent as any).venue_id ? (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              const venueId = (selectedEvent as any).venue_id;
                              onOpenVenueDetail?.(venueId);
                            }}
                            className="venue-link-button"
                          >
                            <span>{selectedEvent.location}</span>
                            <i className="ri-arrow-right-s-line" style={{ fontSize: '1.1em' }}></i>
                          </button>
                        ) : (
                          <span>{selectedEvent.location}</span>
                        )}
                        {!(selectedEvent as any).venue_id && (selectedEvent.location_link || (selectedEvent as any).venue_custom_link) && (
                          <a
                            href={(selectedEvent as any).venue_custom_link || selectedEvent.location_link}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="location-link"
                            title="지도 보기"
                          >
                            <i className="ri-external-link-line location-link-icon"></i>
                          </a>
                        )}
                        {isSelectionMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setShowVenueSelect(true);
                            }}
                            style={{ marginLeft: 'auto', background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                            title="장소 수정"
                          >
                            <i className="ri-pencil-line" style={{ fontSize: '14px' }}></i>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {(selectedEvent.description || isSelectionMode) && (
                    <div className="info-divider">
                      <div className="info-item">
                        <i className="ri-file-text-line info-icon"></i>
                        <div className="info-item-content" style={{ width: '100%' }}>
                          <div style={{ position: 'relative' }}>
                            {isSelectionMode && <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveEditField('description');
                              }}
                              style={{ position: 'absolute', right: 0, top: 0, background: 'rgba(59, 130, 246, 0.2)', color: '#3b82f6', border: '1px solid #3b82f6', borderRadius: '50%', width: '24px', height: '24px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', zIndex: 10 }}
                              title="내용 수정"
                            >
                              <i className="ri-pencil-line" style={{ fontSize: '14px' }}></i>
                            </button>
                            }
                            <p>
                              {selectedEvent.description ? (
                                selectedEvent.description
                                  .split(/(\bhttps?:\/\/[^\s]+)/g)
                                  .map((part, idx) => {
                                    if (part.match(/^https?:\/\//)) {
                                      return (
                                        <a
                                          key={idx}
                                          href={part}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="info-link"
                                          onClick={(e) => e.stopPropagation()}
                                        >
                                          {part}
                                        </a>
                                      );
                                    }
                                    return <span key={idx}>{part}</span>;
                                  })
                              ) : (
                                <span style={{ color: '#9ca3af' }}>내용 없음</span>
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {selectedEvent.contact &&
                    (() => {
                      const contactInfos = parseMultipleContacts(
                        selectedEvent.contact,
                      );

                      return (
                        <div className="edm-space-y-2">
                          <span className="contact-label">
                            문의
                          </span>
                          <div className="contact-buttons-container">
                            {contactInfos.map((contactInfo, index) => {
                              const handleContactClick = async () => {
                                if (contactInfo.link) {
                                  window.open(contactInfo.link, "_blank");
                                } else {
                                  try {
                                    await copyToClipboard(contactInfo.value);
                                    alert(`복사되었습니다: ${contactInfo.value}`);
                                  } catch (err) {
                                    console.error("복사 실패:", err);
                                    alert("복사에 실패했습니다.");
                                  }
                                }
                              };

                              return (
                                <button
                                  key={index}
                                  onClick={handleContactClick}
                                  className="contact-button"
                                >
                                  <i
                                    className={`${contactInfo.icon} contact-icon`}
                                  ></i>
                                  <div className="edm-text-left">
                                    <div className="contact-text">
                                      {contactInfo.displayText}
                                    </div>
                                    <div className="contact-subtext">
                                      {contactInfo.link
                                        ? "탭하여 열기"
                                        : "탭하여 복사"}
                                    </div>
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                  {isAdminMode &&
                    (selectedEvent.organizer_name ||
                      selectedEvent.organizer_phone) && (
                      <div className="admin-info-section">
                        <div className="admin-info-header">
                          <i className="ri-admin-line"></i>
                          <span>등록자 정보 (관리자 전용)</span>
                        </div>
                        {selectedEvent.organizer_name && (
                          <div className="admin-info-item">
                            <i className="ri-user-star-line"></i>
                            <span>{selectedEvent.organizer_name}</span>
                          </div>
                        )}
                        {selectedEvent.organizer_phone && (
                          <div className="admin-info-item">
                            <i className="ri-phone-line"></i>
                            <span>{selectedEvent.organizer_phone}</span>
                          </div>
                        )}
                      </div>
                    )}

                  {/* Link section removed as per user request */}

                  {isAdminMode && selectedEvent.created_at && (
                    <div className="created-at-text">
                      <span>
                        등록:{" "}
                        {new Date(selectedEvent.created_at).toLocaleDateString(
                          "ko-KR",
                          {
                            year: "numeric",
                            month: "2-digit",
                            day: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          },
                        )}
                        {authorNickname && ` | 계정: ${authorNickname}`}
                      </span>
                    </div>
                  )}
                </div>
              </div> {/* End of info-column */}
            </div>

            <div className="modal-footer">
              <div className="footer-links-container">
                {selectedEvent.link1 && (
                  <a
                    href={selectedEvent.link1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                    title={selectedEvent.link_name1 || "바로가기 1"}
                  >
                    <i className="ri-external-link-line footer-link-icon"></i>
                    <span className="footer-link-text">
                      {selectedEvent.link_name1 || "링크1"}
                    </span>
                  </a>
                )}
                {selectedEvent.link2 && (
                  <a
                    href={selectedEvent.link2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                    title={selectedEvent.link_name2 || "바로가기 2"}
                  >
                    <i className="ri-external-link-line footer-link-icon"></i>
                    <span className="footer-link-text">
                      {selectedEvent.link_name2 || "링크2"}
                    </span>
                  </a>
                )}
                {selectedEvent.link3 && (
                  <a
                    href={selectedEvent.link3}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="footer-link"
                    title={selectedEvent.link_name3 || "바로가기 3"}
                  >
                    <i className="ri-external-link-line footer-link-icon"></i>
                    <span className="footer-link-text">
                      {selectedEvent.link_name3 || "링크3"}
                    </span>
                  </a>
                )}
                {isSelectionMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setActiveEditField('links');
                    }}
                    className="edm-edit-trigger-btn"
                    style={{
                      background: 'rgba(59, 130, 246, 0.2)',
                      color: '#3b82f6',
                      border: '1px solid #3b82f6',
                      borderRadius: !selectedEvent.link1 ? '4px' : '50%',
                      width: !selectedEvent.link1 ? 'auto' : '24px',
                      height: '24px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      flexShrink: 0,
                      marginLeft: '8px',
                      padding: !selectedEvent.link1 ? '0 8px' : '0'
                    }}
                    title="링크 수정"
                  >
                    {!selectedEvent.link1 && (
                      <span style={{ fontSize: '12px', marginRight: '4px', fontWeight: 600 }}>링크 추가</span>
                    )}
                    <i className="ri-pencil-line" style={{ fontSize: '14px' }}></i>
                  </button>
                )}
              </div>

              <div className="footer-actions-container">
                <button
                  onClick={async (e) => {
                    e.stopPropagation();
                    const url = new URL(window.location.href);
                    url.searchParams.set('event', selectedEvent.id.toString());
                    const shareUrl = url.toString();

                    const shareTitle = selectedEvent.title;
                    const shareText = `${selectedEvent.title}\n📍 ${selectedEvent.location}\n📅 ${selectedEvent.date || selectedEvent.start_date}`;

                    try {
                      if (navigator.share) {
                        await navigator.share({
                          title: shareTitle,
                          text: shareText,
                          url: shareUrl,
                        });
                      } else {
                        await navigator.clipboard.writeText(shareUrl);
                        const button = e.currentTarget;
                        button.classList.remove('share');
                        button.classList.add('share', 'copied');
                        const icon = button.querySelector('i');
                        if (icon) {
                          icon.classList.remove('ri-share-line');
                          icon.classList.add('ri-check-line');
                        }
                        setTimeout(() => {
                          button.classList.remove('copied');
                          if (icon) {
                            icon.classList.remove('ri-check-line');
                            icon.classList.add('ri-share-line');
                          }
                        }, 2000);
                      }
                    } catch (err) {
                      if ((err as Error).name !== 'AbortError') {
                        console.error("공유 실패:", err);
                        alert("카카오톡에서는 공유 기능이 제한됩니다.\n\n우측 상단 메뉴(⋮)에서\n'다른 브라우저로 열기'를 선택한 후\n공유해주세요.");
                      }
                    }
                  }}
                  className="action-button share"
                  title="공유하기"
                >
                  <i className="ri-share-line action-icon"></i>
                </button>

                {/* Delete Button (Only in Selection/Edit Mode) */}
                {isSelectionMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (window.confirm('정말로 이 이벤트를 삭제하시겠습니까?')) {
                        _onDelete(selectedEvent, e);
                      }
                    }}
                    className="action-button delete"
                    title="삭제하기"
                    style={{ backgroundColor: '#ef4444', color: 'white', marginRight: '8px' }}
                  >
                    <i className="ri-delete-bin-line action-icon"></i>
                  </button>
                )}

                {/* Edit/Save Button - Only show if authorized */}
                {(isAdminMode || (currentUserId && selectedEvent.user_id === currentUserId) || !selectedEvent.user_id) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!user) {
                        setShowLoginPrompt(true);
                        return;
                      }

                      if (isSelectionMode) {
                        // In Edit Mode -> Check for changes
                        if (!hasChanges()) {
                          // No changes -> Exit edit mode directly
                          setIsSelectionMode(false);
                          return;
                        }

                        // Has changes -> Confirm and save
                        if (window.confirm('변경사항을 저장하시겠습니까?')) {
                          handleFinalSave();
                        }
                        // If canceled, stay in edit mode
                      } else {
                        // Not in Edit Mode -> Enter Edit Mode
                        setIsSelectionMode(true);
                      }
                    }}
                    className={`action-button ${isSelectionMode ? 'save active-mode' : 'edit'}`}
                    title={isSelectionMode ? "변경사항 저장" : "이벤트 수정"}
                    style={isSelectionMode ? { backgroundColor: '#3b82f6', color: 'white' } : {}}
                  >
                    <i className={`ri-${isSelectionMode ? 'save-3-line' : 'edit-line'} action-icon`}></i>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  className="close-button"
                  title="닫기"
                >
                  <i className="ri-close-line action-icon"></i>
                </button>
              </div>
            </div>
          </div>
          <GlobalLoadingOverlay
            isLoading={isSaving || (isImageLoading && !isCropModalOpen)}
            message={isSaving ? "저장 중입니다..." : "이미지 불러오는 중..."}
          />
        </div>
        , document.body
      )}

      {
        showFullscreenImage &&
        (selectedEvent.image_medium ||
          selectedEvent.image ||
          getEventThumbnail(
            selectedEvent,
            defaultThumbnailClass,
            defaultThumbnailEvent,
          )) && (
          createPortal(
            <div
              className="fullscreen-overlay"
              onClick={() => setShowFullscreenImage(false)}
              onTouchStartCapture={(e) => e.stopPropagation()}
              onTouchMoveCapture={(e) => {
                if (e.target === e.currentTarget) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              }}
              onTouchEndCapture={(e) => e.stopPropagation()}
            >
              <button
                onClick={() => setShowFullscreenImage(false)}
                className="fullscreen-close-button"
              >
                <i className="ri-close-line action-icon"></i>
              </button>
              <img
                src={
                  selectedEvent.image_medium ||
                  selectedEvent.image ||
                  getEventThumbnail(
                    selectedEvent,
                    defaultThumbnailClass,
                    defaultThumbnailEvent,
                  )
                }
                alt={selectedEvent.title}
                loading="lazy"
                className="fullscreen-image"
                onClick={(e) => e.stopPropagation()}
              />
            </div>, document.body
          ))
      }
      {/* Venue Select Modal */}
      <VenueSelectModal
        isOpen={showVenueSelect}
        onClose={() => setShowVenueSelect(false)}
        onSelect={handleVenueSelect}
        onManualInput={handleManualVenueInput}
      />

      {/* Bottom Sheets Portal */}
      {
        activeEditField && createPortal(
          <div className="bottom-sheet-portal">
            <div
              className="bottom-sheet-backdrop"
              onClick={() => setActiveEditField(null)}
            />
            <div className="bottom-sheet-content">
              <div className="bottom-sheet-handle"></div>
              <h3 className="bottom-sheet-header">
                {activeEditField === 'title' && <><i className="ri-text"></i>제목 수정</>}
                {activeEditField === 'genre' && <><i className="ri-price-tag-3-line"></i>장르 수정</>}
                {activeEditField === 'description' && <><i className="ri-file-text-line"></i>오픈톡방/내용 수정</>}
                {activeEditField === 'links' && <><i className="ri-link"></i>링크 수정</>}
              </h3>

              <div className="bottom-sheet-body">
                <div className="bottom-sheet-input-group">
                  {activeEditField === 'links' ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ fontSize: '0.9rem', fontWeight: 600, color: '#e2e8f0' }}>링크</label>
                        <input
                          type="text"
                          className="bottom-sheet-input"
                          value={linkEditValues.link_name1}
                          onChange={(e) => setLinkEditValues({ ...linkEditValues, link_name1: e.target.value })}
                          placeholder="링크 이름 (예: 신청하기)"
                          style={{ minHeight: '40px', marginBottom: '0.25rem' }}
                        />
                        <input
                          type="text"
                          className="bottom-sheet-input"
                          value={linkEditValues.link1}
                          onChange={(e) => setLinkEditValues({ ...linkEditValues, link1: e.target.value })}
                          placeholder="URL (https://...)"
                          style={{ minHeight: '40px' }}
                        />
                      </div>
                    </div>
                  ) : (
                    <>
                      {activeEditField === 'genre' ? (
                        <div className="genre-edit-container">
                          {/* 1. Category Selection */}
                          <div className="genre-category-toggle" style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
                            <button
                              onClick={() => {
                                setEditCategory('event');
                                setEditValue(''); // Reset genre when switching category
                              }}
                              className={`category-toggle-btn ${editCategory === 'event' ? 'active' : ''}`}
                              style={{
                                flex: 1,
                                padding: '12px',
                                background: editCategory === 'event' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                border: editCategory === 'event' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              행사
                            </button>
                            <button
                              onClick={() => {
                                setEditCategory('class');
                                setEditValue(''); // Reset genre when switching category
                              }}
                              className={`category-toggle-btn ${editCategory === 'class' ? 'active' : ''}`}
                              style={{
                                flex: 1,
                                padding: '12px',
                                background: editCategory === 'class' ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                border: editCategory === 'class' ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              강습
                            </button>
                            <button
                              onClick={() => {
                                setEditCategory('club');
                                setEditValue(''); // Reset genre when switching category
                              }}
                              className={`category-toggle-btn ${editCategory === 'club' ? 'active' : ''}`}
                              style={{
                                flex: 1,
                                padding: '12px',
                                background: editCategory === 'club' ? '#10b981' : 'rgba(255,255,255,0.05)',
                                border: editCategory === 'club' ? '1px solid #10b981' : '1px solid rgba(255,255,255,0.1)',
                                color: 'white',
                                borderRadius: '8px',
                                cursor: 'pointer',
                                fontWeight: 600
                              }}
                            >
                              동호회
                            </button>
                          </div>

                          {/* 2. Genre Chips */}
                          <div className="genre-chips-container" style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', marginBottom: '16px' }}>
                            {/* Fixed Club Lesson Option removed from separate button and added to list below */}

                            {uniqueGenres
                              .map(genre => (
                                <button
                                  key={genre}
                                  onClick={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    console.log(`[EventDetailModal] Genre Click: ${genre}`);

                                    const current = editValue ? editValue.split(',').map(s => s.trim()).filter(Boolean) : [];

                                    // LOGIC:
                                    // 1. Class/Club: Single Selection Only
                                    // 2. Event: Mutual Exclusivity (Party vs Competition)

                                    let newGenres: string[];

                                    if (editCategory === 'class' || editCategory === 'club') {
                                      // FORCE SINGLE SELECT for Class/Club
                                      // If clicking the already selected one, allow toggle off (or keep? usually toggle off is fine)
                                      // User said "Class is not multi-selectable".
                                      if (current.includes(genre)) {
                                        newGenres = []; // Toggle off
                                      } else {
                                        newGenres = [genre]; // Replace
                                      }
                                    } else {
                                      // EVENT logic (Multi-select with constraints)
                                      if (current.includes(genre)) {
                                        newGenres = current.filter(g => g !== genre);
                                      } else {
                                        let temp = [...current];
                                        // Mutual Exclusivity: '파티' vs '대회'
                                        if (genre === '파티') {
                                          temp = temp.filter(g => g !== '대회');
                                        } else if (genre === '대회') {
                                          temp = temp.filter(g => g !== '파티');
                                        }
                                        newGenres = [...temp, genre];
                                      }
                                    }

                                    const newValue = newGenres.join(',');
                                    console.log(`[EventDetailModal] New Value: ${newValue}`);

                                    setEditValue(newValue);
                                    // setUseDirectInput(false); // Removed
                                  }}
                                  className={`genre-chip ${editValue.split(',').map(s => s.trim()).includes(genre) ? 'active' : ''}`}
                                  style={{
                                    padding: '8px 16px',
                                    borderRadius: '9999px',
                                    background: editValue.split(',').map(s => s.trim()).includes(genre) ? '#3b82f6' : 'rgba(255,255,255,0.05)',
                                    border: editValue.split(',').map(s => s.trim()).includes(genre) ? '1px solid #3b82f6' : '1px solid rgba(255,255,255,0.1)',
                                    color: 'white',
                                    cursor: 'pointer',
                                    fontSize: '14px'
                                  }}
                                >
                                  {genre}
                                </button>
                              ))}
                            {/* Direct Input Removed */}
                          </div>

                          {/* 3. Direct Input Field (Conditional) - REMOVED to avoid confusion */}
                        </div>
                      ) : (
                        // Normal text input for other fields
                        <textarea
                          className="bottom-sheet-input"
                          value={editValue}
                          onChange={(e) => setEditValue(e.target.value)}
                          placeholder={activeEditField === 'title' ? "행사 제목을 입력하세요" : "내용을 입력하세요"}
                          rows={activeEditField === 'title' ? 3 : 8}
                          style={{ resize: 'none', minHeight: activeEditField === 'title' ? '80px' : '200px' }}
                          autoFocus
                        />
                      )}
                    </>
                  )}
                </div>
                <div className="bottom-sheet-actions">
                  <button
                    onClick={handleSaveField}
                    className="bottom-sheet-button"
                    disabled={isSaving}
                  >
                    {isSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            </div>
          </div >,
          document.body
        )
      }
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageUrl={tempImageSrc}
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={handleCropComplete}
        onChangeImage={() => fileInputRef.current?.click()}
        originalImageUrl={originalImageUrl}
        onImageUpdate={handleImageUpdate}
        isLoading={isImageLoading}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        style={{ display: 'none' }}
      />
    </>
  );
}