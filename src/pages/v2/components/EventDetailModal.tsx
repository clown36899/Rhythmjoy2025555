import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../../../lib/supabase';
import type { Event as BaseEvent } from '../../../lib/supabase';
import { useDefaultThumbnail } from '../../../hooks/useDefaultThumbnail';
import { getEventThumbnail } from '../../../utils/getEventThumbnail';
import { formatDateForInput } from '../../../utils/fileUtils';
import { parseMultipleContacts, copyToClipboard } from '../../../utils/contactLink';
import { logEvent, logPageView } from '../../../lib/analytics';
import "../../../styles/domains/events.css";
import "../../../styles/components/EventDetailModal.css";
import { useAuth } from '../../../contexts/AuthContext';
import { useModalActions } from '../../../contexts/ModalContext';
const VenueSelectModal = React.lazy(() => import('./VenueSelectModal'));
import ImageCropModal from '../../../components/ImageCropModal';
import { createResizedImages } from '../../../utils/imageResize';
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import { useLoading } from '../../../contexts/LoadingContext';
import { retryOperation } from '../../../utils/asyncUtils';
import { useViewTracking } from '../../../hooks/useViewTracking';
import LocalLoading from '../../../components/LocalLoading';
import EventEditBottomSheet from './EventEditBottomSheet';
import { useHistoricalGenres } from '../hooks/useHistoricalGenres';

registerLocale("ko", ko);

// --- Main Modal Component ---


interface Event extends Omit<BaseEvent, 'date' | 'start_date' | 'end_date' | 'event_dates' | 'location' | 'location_link' | 'category'> {
  storage_path?: string | null;
  genre?: string | null;
  date?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  event_dates?: string[] | null;
  views?: number;
  // Venue fields
  venue_id?: string | null;
  venue_name?: string | null;
  address?: string | null;
  location_name?: string | null;
  location?: string | null;
  location_link?: string | null;
  category?: string | null;
}

import { getGenreColorClass } from '../../../constants/genreColors';


// getGenreColor was removed in favor of getGenreColorClass from constants


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
  isDeleting?: boolean;
  deleteProgress?: number;
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
  isDeleting = false,
}: EventDetailModalProps) {
  // Safe cast or normalization
  const structuredGenres = Array.isArray(allGenres)
    ? { class: [], event: [] } // Fallback or logic to distribute if we really needed, but generally we expect structured now
    : allGenres;

  const { user, signInWithKakao, isAdmin: isActualAdmin } = useAuth();
  const { openModal } = useModalActions();
  const { showLoading, hideLoading } = useLoading();

  const [showLoginPrompt, setShowLoginPrompt] = useState(false);

  // View tracking Hook
  const eventId = event?.id ? String(event.id).replace('social-', '') : '';
  const itemType = event?.id && String(event.id).startsWith('social-') ? 'schedule' : 'event';
  const { incrementView } = useViewTracking(eventId, itemType as 'event' | 'schedule');

  // console.log('[EventDetailModal] 모달 열림 - event:', event?.title, 'isActualAdmin:', isActualAdmin, 'board_users:', (event as any)?.board_users);



  const [showFullscreenImage, setShowFullscreenImage] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Draft State for Local Edits
  const [draftEvent, setDraftEvent] = useState<Event | null>(event);
  // Source of truth for change detection (tracks full details fetched from DB)
  const [originalEvent, setOriginalEvent] = useState<Event | null>(event);
  const [isFetchingDetail, setIsFetchingDetail] = useState(false);

  useEffect(() => {
    setDraftEvent(event);
    setOriginalEvent(event); // Reset baseline to prop
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
  // useModalHistory(isOpen, onClose);

  // Analytics: Log virtual page view for better reporting (Pages and Screens)
  useEffect(() => {
    if (isOpen && event) {
      // 1. 이벤트성 로그 (기존)
      logEvent('Event', 'View Detail', `${event.title} (ID: ${event.id})`);

      // 2. 가상 페이지뷰 로그 (신규 - 페이지 보고서 용)
      // 실제 URL은 변하지 않지만, GA4에는 페이지가 바뀐 것처럼 전송
      logPageView(`/event/${event.id}`, event.title);

      // 3. 조회수 증가
      incrementView();
    }
  }, [isOpen, event, incrementView]);

  // Check if event has started (for hiding edit/delete buttons)
  const isPastEvent = useMemo(() => {
    if (!displayEvent) return false;
    const today = formatDateForInput(new Date()); // YYYY-MM-DD (Local)
    const startDate = displayEvent.start_date || displayEvent.date;
    return startDate ? startDate < today : false;
  }, [displayEvent]);


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
    setIsFetchingDetail(true);

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
      setIsFetchingDetail(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];

      // Ensure modal is open immediately
      setIsCropModalOpen(true);
      setIsFetchingDetail(true);

      await new Promise(resolve => setTimeout(resolve, 0));

      try {
        const dataUrl = await fileToDataURL(file);
        setTempImageSrc(dataUrl);
        // setIsCropModalOpen(true); // Already opened above
      } catch (error) {
        console.error("Failed to load image:", error);
        alert("이미지를 불러오는데 실패했습니다.");
      } finally {
        setIsFetchingDetail(false);
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
  const [isSaving, setIsSaving] = useState(false);

  // 전역 로딩 상태 연동
  useEffect(() => {
    if (isDeleting || isSaving) {
      showLoading('event-detail-save', isDeleting ? "삭제 중입니다..." : "저장 중입니다...");
    } else {
      hideLoading('event-detail-save');
    }
  }, [isDeleting, isSaving, showLoading, hideLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => hideLoading('event-detail-save');
  }, [hideLoading]);
  const [authorNickname, setAuthorNickname] = useState<string | null>(null);

  // Extract authorNickname from board_users if already present
  useEffect(() => {
    const nickname = (event as any)?.board_users?.nickname;
    if (nickname && !authorNickname) {
      setAuthorNickname(nickname);
    }
  }, [event, authorNickname]);

  console.log('[EventDetailModal] Render:', { isOpen, eventId: event?.id, hasEvent: !!event });

  useEffect(() => {
    if (isOpen) {
      console.log('[EventDetailModal] Modal opened with event:', event);
    }
  }, [isOpen, event]);

  // Moved fetching logic here to access authorNickname
  useEffect(() => {
    // On-Demand Fetching: 필수 필드 누락 시 또는 권한이 있는데 작성자 닉네임이 없을 때 조회
    const shouldFetch = event?.id && (
      event.description === undefined ||
      !event.user_id ||
      event.link1 === undefined ||
      // 관리자거나 본인인데 닉네임이 없으면 정보 조회를 위해 fetch
      ((isAdminMode || (user && user.id === event.user_id)) && !authorNickname && !(event as any).board_users)
    );

    if (shouldFetch) {
      const fetchDetail = async () => {
        try {
          setIsFetchingDetail(true);

          let isSocialIntegrated = String(event!.id).startsWith('social-');
          let originalId = isSocialIntegrated ? String(event!.id).replace('social-', '') : event!.id;

          // [FIX] FullCalendar Offset Handling (ID > 10,000,000)
          if (Number(event!.id) > 10000000) {
            isSocialIntegrated = true;
            originalId = String(Number(event!.id) - 10000000);
          }

          console.log('[EventDetailModal] Fetching detail for:', { originalId, isSocialIntegrated });

          // 통합된 events 테이블 데이터 조회
          const { data, error } = await supabase
            .from('events')
            .select('*, board_users(nickname)')
            .eq('id', originalId)
            .maybeSingle();

          if (error) throw error;
          console.log('[EventDetailModal] Unified Fetch Result:', data);
          if (data) {
            const fullEvent = { ...event, ...(data as any) } as Event;
            // 만약 group_id가 있다면 기존 UI 호환성을 위해 소셜 플래그 유지
            if (data.group_id) {
              (fullEvent as any).is_social_integrated = true;
              (fullEvent as any).id = `social-${data.id}`;
            }
            setDraftEvent(fullEvent);
            setOriginalEvent(fullEvent);
            const nickname = (data as any).board_users?.nickname;
            if (nickname) setAuthorNickname(nickname);
          }
        } catch (err) {
          console.error('[EventDetailModal] Fetch error:', err);
        } finally {
          setIsFetchingDetail(false);
        }
      };
      fetchDetail();
    }
  }, [event, isAdminMode, user, authorNickname, isOpen]);

  // Genre Management State
  const allHistoricalGenres = useHistoricalGenres();

  const handleVenueSelect = (venue: any) => {
    if (!draftEvent) return;
    setDraftEvent({
      ...draftEvent,
      venue_id: venue.id,
      venue_name: venue.name,
      address: venue.address || '',
      location_name: venue.address_city || ''
    });
  };

  const handleManualVenueInput = (venueName: string, address: string) => {
    if (!draftEvent) return;
    setDraftEvent({
      ...draftEvent,
      venue_name: venueName,
      address: address,
      venue_id: null
    });
  };

  // 🎯 [UPDATE] 데이터베이스 즉시 저장 함수 (모듈화)
  const saveChangesToDB = async (updates: Partial<Event>) => {
    if (!draftEvent) return;

    try {
      setIsSaving(true);

      // 🎯 [PAYLOAD CLEANUP] Remove undefined values
      Object.keys(updates).forEach(key => {
        if (updates[key as keyof Event] === undefined) {
          delete updates[key as keyof Event];
        }
      });

      const originalId = String(draftEvent.id).replace('social-', '');

      // [FIX] FullCalendar Offset Handling (ID > 10,000,000)
      const targetId = Number(originalId) > 10000000 ? String(Number(originalId) - 10000000) : originalId;

      const { data, error } = await supabase
        .from('events')
        .update(updates)
        .eq('id', targetId)
        .select()
        .maybeSingle();

      if (error) throw error;

      if (data) {
        // Update local state with latest DB data
        setDraftEvent({ ...draftEvent, ...data });
        setOriginalEvent({ ...originalEvent || draftEvent, ...data });

        // Dispatch update event so list updates immediately
        window.dispatchEvent(new CustomEvent('eventUpdated', {
          detail: {
            id: draftEvent.id,
            event: { ...draftEvent, ...data }
          }
        }));

        // alert('저장되었습니다.'); // 개별 저장 시 알림 생략 (UX 개선)
      }
    } catch (err) {
      console.error('[EventDetailModal] Auto-save failed:', err);
      alert('저장 중 오류가 발생했습니다.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveField = useCallback((value: any, category?: string) => {
    if (!draftEvent || !activeEditField) return;

    const updates: Partial<Event> = {};

    if (activeEditField === 'title') updates.title = value;
    if (activeEditField === 'genre') {
      if (typeof value === 'object' && value !== null) {
        updates.genre = value.genre;
        updates.scope = value.scope;
      } else {
        updates.genre = value;
      }
      updates.category = category as any;
    }
    if (activeEditField === 'description') updates.description = value;
    if (activeEditField === 'time') updates.time = value;
    if (activeEditField === 'date') {
      const dates = value.split(',').filter(Boolean).sort();
      if (dates.length > 1) {
        updates.event_dates = dates;
        updates.start_date = dates[0];
        updates.date = dates[0];
        updates.end_date = dates[dates.length - 1];
      } else {
        const singleDate = value || null;
        updates.start_date = singleDate;
        updates.date = singleDate;
        updates.end_date = singleDate;
        updates.event_dates = null;
      }
    }
    if (activeEditField === 'links') {
      updates.link1 = value.link1;
      updates.link_name1 = value.link_name1;
      updates.link2 = value.link2;
      updates.link_name2 = value.link_name2;
      updates.link3 = value.link3;
      updates.link_name3 = value.link_name3;
    }

    // 로컬 상태 즉시 반영 (낙관적 업데이트)
    setDraftEvent(prev => prev ? ({ ...prev, ...updates }) : null);
    setActiveEditField(null);

    // DB 비동기 저장 호출
    saveChangesToDB(updates);

  }, [draftEvent, activeEditField]);


  // 변경사항 감지 함수
  const hasChanges = () => {
    if (!event || !draftEvent) return false;

    // 이미지 변경 확인
    if (imageFile) return true;

    // Helper to normalize values for comparison (treat null/undefined/empty string as same)
    const normalize = (val: any) => {
      if (val === null || val === undefined) return '';
      if (typeof val === 'string') return val.trim();
      return val;
    };

    // 필드 변경 확인
    const fieldsToCheck = [
      'title', 'description', 'location', 'location_link', 'venue_id', 'genre', 'category',
      'link1', 'link_name1', 'link2', 'link_name2', 'link3', 'link_name3',
      'date', 'start_date', 'end_date', 'event_dates', 'time'
    ];

    console.log('[hasChanges] Checking for changes...');
    const changedFields: string[] = [];

    const hasChanged = fieldsToCheck.some(field => {
      // Use originalEvent (fetched full data) instead of event (partial prop)
      const originalValue = originalEvent ? originalEvent[field as keyof Event] : event[field as keyof Event];
      const draftValue = draftEvent[field as keyof Event];

      const isChanged = normalize(originalValue) !== normalize(draftValue);
      if (isChanged) {
        changedFields.push(field);
      }
      return isChanged;
    });

    return hasChanged;
  };

  const handleFinalSave = async () => {
    if (!draftEvent) return;


    try {
      setIsSaving(true);

      // Capture timestamp at the start of save for consistent folder naming
      const timestamp = Date.now();

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
        // Add date fields
        date: draftEvent.date,
        start_date: draftEvent.start_date,
        end_date: draftEvent.end_date,
        event_dates: draftEvent.event_dates,
        // Add link fields
        link1: draftEvent.link1,
        link_name1: draftEvent.link_name1,
        link2: draftEvent.link2,
        link_name2: draftEvent.link_name2,
        link3: draftEvent.link3,
        link_name3: draftEvent.link_name3,
        scope: draftEvent.scope
      };




      // Upload image if changed
      if (imageFile) {
        const randomString = Math.random().toString(36).substring(2, 7);
        const eventFolder = `${timestamp}_${randomString}`;
        const basePath = `event-posters/${eventFolder}`;
        const imageStoragePath = basePath;

        // Resize images
        const resizedImages = await createResizedImages(imageFile);

        // [최적화] 병렬 업로드 및 재시도 로직 적용
        console.log('[Image Upload] Starting parallel upload with retries:', basePath);

        const uploadTasks = [
          // Full Size
          retryOperation(() => supabase.storage
            .from('images')
            .upload(`${basePath}/full.webp`, resizedImages.full, {
              contentType: 'image/webp',
              upsert: true
            })
          ).then(({ error }) => { if (error) throw error; }),

          // Medium
          resizedImages.medium ? retryOperation(() => supabase.storage
            .from('images')
            .upload(`${basePath}/medium.webp`, resizedImages.medium!, {
              contentType: 'image/webp',
              upsert: true
            })
          ).then(({ error }) => { if (error) throw error; }) : Promise.resolve(),

          // Thumbnail
          resizedImages.thumbnail ? retryOperation(() => supabase.storage
            .from('images')
            .upload(`${basePath}/thumbnail.webp`, resizedImages.thumbnail!, {
              contentType: 'image/webp',
              upsert: true
            })
          ).then(({ error }) => { if (error) throw error; }) : Promise.resolve(),

          // Micro
          resizedImages.micro ? retryOperation(() => supabase.storage
            .from('images')
            .upload(`${basePath}/micro.webp`, resizedImages.micro!, {
              contentType: 'image/webp',
              upsert: true
            })
          ).then(({ error }) => { if (error) throw error; }) : Promise.resolve()
        ];

        try {
          await Promise.all(uploadTasks);
          console.log('[Image Upload] All versions uploaded successfully');
        } catch (uploadError) {
          console.error('[Image Upload] Failed to upload one or more versions:', uploadError);
          throw uploadError;
        }

        const publicUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/full.webp`).data.publicUrl;

        const mediumUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/medium.webp`).data.publicUrl;

        const thumbnailUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/thumbnail.webp`).data.publicUrl;

        const microUrl = supabase.storage
          .from('images')
          .getPublicUrl(`${basePath}/micro.webp`).data.publicUrl;

        // Update draft fields
        updates.image = publicUrl;
        updates.image_full = publicUrl;
        updates.image_medium = mediumUrl;
        updates.image_thumbnail = thumbnailUrl;
        updates.image_micro = microUrl;
        updates.storage_path = imageStoragePath;
      }

      // Capture old paths for cleanup if image is changed
      const oldStoragePath = originalEvent?.storage_path || event?.storage_path || null;
      const oldImageUrls = [
        originalEvent?.image,
        originalEvent?.image_micro,
        originalEvent?.image_thumbnail,
        originalEvent?.image_medium,
        originalEvent?.image_full
      ].filter(url => !!url);

      // 🎯 [PAYLOAD CLEANUP] Remove undefined values to prevent unexpected DB behavior
      // but keep null values to allow clearing fields in DB
      Object.keys(updates).forEach(key => {
        if (updates[key] === undefined) {
          delete updates[key];
        }
      });

      // 🎯 [DB UPDATE] 통합된 events 테이블만 사용
      let updatedEvent = null;
      let error = null;

      const originalId = String(draftEvent.id).replace('social-', '');

      const result = await retryOperation(async () =>
        await supabase
          .from('events')
          .update(updates)
          .eq('id', originalId)
          .select()
          .maybeSingle()
      ) as any;
      updatedEvent = result.data;
      error = result.error;


      if (error) {
        console.error('[Error] Supabase update failed after retries:', error);
        throw error;
      }

      // 🎯 [PERMISSION CHECK] If update returned null, it means RLS blocked the update (0 rows affected)
      if (!updatedEvent) {
        console.error('[Error] No rows updated. This usually means RLS permission denied.');
        const permError = new Error('수정 권한이 없습니다. (DB 관리자 명부 확인 필요)');
        (permError as any).code = 'PERMISSION_DENIED';
        throw permError;
      }

      // Verify if updates were actually applied
      if (updatedEvent) {
        if (updates.genre !== updatedEvent.genre) {
          console.warn('⚠️ CRITICAL: Genre update was NOT reflected in the DB response!');
        }
        if (updates.category !== updatedEvent.category) {
          // Attempt Force Update for Category
          const { data: retryData, error: retryError } = await supabase
            .from('events')
            .update({ category: updates.category })
            .eq('id', draftEvent.id)
            .select()
            .maybeSingle();

          if (!retryError && retryData && retryData.category === updates.category) {
            console.log('✅ Force update SUCCEEDED! Category is now:', retryData.category);
            // Correct the local event data reference
            const eventUpdatedEvent = new CustomEvent("eventUpdated", {
              detail: {
                id: draftEvent.id,
                event: retryData
              }
            });
            window.dispatchEvent(eventUpdatedEvent);
            setIsSaving(false);

            // Stay in modal, just exit edit mode
            setIsSelectionMode(false);
            setDraftEvent(retryData); // Update draft to new data
            setOriginalEvent(retryData); // Update baseline
            setImageFile(null);
            setTempImageSrc(null);
            setOriginalImageUrl(null);
            return;
          }
        }
      }

      // Dispatch update event so list updates immediately
      console.log('[Screen Update] Dispatching eventUpdated custom event');
      console.log('[Screen Update] Event data to dispatch:', updatedEvent || draftEvent);
      window.dispatchEvent(new CustomEvent('eventUpdated', {
        detail: {
          id: draftEvent.id,
          event: updatedEvent || draftEvent // 업데이트된 전체 이벤트 데이터
        }
      }));
      console.log('[Screen Update] Custom event dispatched');

      // 🎯 [CLEANUP] After successful DB update, remove old images if changed
      if (imageFile) {
        const performCleanup = async () => {
          console.log("🧹 [EventDetailModal] Starting cleanup of old images...");

          // 1. New style folder-based cleanup
          if (oldStoragePath) {
            try {
              const { data: files } = await supabase.storage.from("images").list(oldStoragePath);
              if (files && files.length > 0) {
                const filePaths = files.map(f => `${oldStoragePath}/${f.name}`);
                await supabase.storage.from("images").remove(filePaths);
                console.log(`✅ [CLEANUP] Deleted ${files.length} files from old folder: ${oldStoragePath}`);
              }
            } catch (e) {
              console.warn("⚠️ [CLEANUP] Failed to delete old folder content:", e);
            }
          }

          // 2. Legacy/Individual file cleanup
          const extractPath = (url: string | null | undefined) => {
            if (!url) return null;
            try {
              if (url.includes('/images/')) {
                return decodeURIComponent(url.split('/images/')[1]?.split('?')[0]);
              }
              return null;
            } catch (e) { return null; }
          };

          const individualPaths = oldImageUrls
            .map(url => extractPath(url))
            .filter((p): p is string => !!p);

          if (individualPaths.length > 0) {
            try {
              // 현재 새로 업로드한 경로는 제외하고 삭제
              const filteredPaths = individualPaths.filter(p => !p.startsWith(`event-posters/${timestamp}`));
              if (filteredPaths.length > 0) {
                await supabase.storage.from("images").remove(filteredPaths);
                console.log(`✅ [CLEANUP] Deleted ${filteredPaths.length} individual legacy files`);
              }
            } catch (e) {
              console.warn("⚠️ [CLEANUP] Failed to delete legacy individual files:", e);
            }
          }
        };

        // Run in background
        performCleanup().catch(err => console.error("❌ [CLEANUP] error:", err));
      }

      setIsSaving(false);

      // Stay in modal, just exit edit mode
      console.log('[Screen Update] Exiting edit mode');
      setIsSelectionMode(false);
      // Update local state to reflect saved data immediately
      if (updatedEvent) {
        console.log('[Screen Update] Updating local state with DB response');
        setDraftEvent(updatedEvent);
        setOriginalEvent(updatedEvent);
      } else {
        console.warn('[Screen Update] No updatedEvent from DB, keeping current draftEvent');
      }

      setImageFile(null);
      setTempImageSrc(null);
      setOriginalImageUrl(null); // 원본 이미지 URL 리셋
      console.log('[Screen Update] Save complete, showing alert');
      alert('저장되었습니다.');

    } catch (error) {
      console.error('Error saving event:', error);
      setIsSaving(false);
      alert('저장 중 오류가 발생했습니다.');
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
          className="EventDetailModal EDM-overlay"
          role="dialog"
          aria-modal="true"
          onTouchMove={(e) => {
            if (e.target === e.currentTarget) {
              e.preventDefault();
            }
          }}
          onClick={onClose}
        >
          <div
            className="EDM-container"
            onClick={(e) => e.stopPropagation()}
          >
            {/* 데이터 로딩 인디케이터 (상세 데이터 없을 때) */}
            {isFetchingDetail && (
              <div className="EDM-loadingBar" />
            )}

            {/* 로그인 유도 오버레이 */}
            {showLoginPrompt && (
              <div className="EDM-loginOverlay">
                <h2 className="EDM-loginTitle">로그인 필요</h2>
                <p className="EDM-loginDesc">
                  수정/삭제하려면 로그인이 필요합니다.<br />
                  간편하게 로그인하고 계속하세요!
                </p>
                <button
                  onClick={handleLogin}
                  className="EDM-btn-kakao"
                >
                  <i className="ri-kakao-talk-fill"></i>
                  카카오로 로그인
                </button>
                <button
                  onClick={() => setShowLoginPrompt(false)}
                  className="EDM-btn-close"
                >
                  취소
                </button>
              </div>
            )}

            {/* 스크롤 가능한 전체 영역 */}
            <div
              className={`EDM-scrollContainer ${isSelectionMode ? 'is-selection-mode' : ''}`}
            >
              <div className="EDM-content">
                {/* 이미지 영역 (스크롤과 함께 사라짐) */}
                {(() => {
                  // Progressive Loading: thumbnail priority logic handled by state
                  const hasImage = !!(thumbnailSrc || highResSrc);
                  const isDefaultThumbnail = !selectedEvent.image_thumbnail && !highResSrc && !!thumbnailSrc;

                  // Transform style (shared)
                  const imageStyle = {
                    transform: `translate3d(${(selectedEvent as any).image_position_x || 0}%, ${(selectedEvent as any).image_position_y || 0}%, 0)`
                  };

                  return (
                    <div
                      className={`EDM-imageArea ${hasImage ? "has-image" : "has-pattern"}`}
                    >
                      {hasImage ? (
                        <>
                          <div className="EDM-imageWrapper">
                            {/* 1. Base Layer: Thumbnail */}
                            {thumbnailSrc && (
                              <img
                                src={thumbnailSrc}
                                alt={selectedEvent.title}
                                className="EDM-imageContent"
                                loading="eager"
                                draggable={false}
                                style={{
                                  ...imageStyle,
                                  zIndex: 1,
                                  opacity: 1,
                                }}
                              />
                            )}

                            {/* 2. Overlay Layer: HighRes (Cross-fade) */}
                            {highResSrc && highResSrc !== thumbnailSrc && (
                              <img
                                src={highResSrc}
                                alt={selectedEvent.title}
                                className="EDM-imageContent"
                                loading="eager"
                                decoding="async"
                                draggable={false}
                                style={{
                                  ...imageStyle,
                                  zIndex: 2,
                                  opacity: isHighResLoaded ? 1 : 0,
                                  transition: "opacity 0.4s ease-in-out",
                                }}
                              />
                            )}

                            {/* Fallback if only HighRes exists and no thumbnail */}
                            {!thumbnailSrc && highResSrc && (
                              <img
                                src={highResSrc}
                                alt={selectedEvent.title}
                                className="EDM-imageContent"
                                loading="eager"
                              />
                            )}
                          </div>

                          {/* Gradient Overlay */}
                          <div className="EDM-imageGradient" />

                          {isDefaultThumbnail && (
                            <div className="EDM-defaultThumb">
                              <span className="EDM-thumbText manual-label-wrapper">
                                {selectedEvent.category === "class" ? (
                                  <>
                                    <span className="translated-part">Class</span>
                                    <span className="fixed-part ko" translate="no">강습</span>
                                    <span className="fixed-part en" translate="no">Class</span>
                                  </>
                                ) : "행사"}
                              </span>
                            </div>
                          )}

                          {isSelectionMode && (
                            <div
                              className="EDM-imageEditOverlay"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleImageClick();
                              }}
                            >
                              <i className="ri-image-edit-line"></i>
                              <span className="manual-label-wrapper">
                                <span className="translated-part">Edit Image</span>
                                <span className="fixed-part ko" translate="no">이미지 수정</span>
                                <span className="fixed-part en" translate="no">Edit Image</span>
                              </span>
                            </div>
                          )}


                          {/* 즐겨찾기 버튼 (이미지 좌측 하단 - 원본 위치 복구) */}
                          {onToggleFavorite && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onToggleFavorite(e);
                              }}
                              className={`EDM-favoriteBtn ${isFavorite ? 'is-active' : ''}`}
                              title={isFavorite ? "즐겨찾기 해제" : "즐겨찾기 추가"}
                            >
                              <i
                                className={isFavorite ? "ri-star-fill" : "ri-star-line"}
                              ></i>
                            </button>
                          )}
                        </>
                      ) : (
                        <>
                          <div
                            className={`EDM-categoryArea ${selectedEvent.category === "class" ? "is-class" : "is-event"}`}
                          ></div>
                          <span className="EDM-categoryAreaText manual-label-wrapper">
                            {selectedEvent.category === "class" ? (
                              <>
                                <span className="translated-part">Class</span>
                                <span className="fixed-part ko" translate="no">강습</span>
                                <span className="fixed-part en" translate="no">Class</span>
                              </>
                            ) : "행사"}
                          </span>
                        </>
                      )}

                      {/* 카테고리 배지 - 좌측 하단 (Mobile only behavior handles in CSS) */}
                      <div
                        className={`EDM-categoryBadge manual-label-wrapper ${selectedEvent.category === "class" ? "is-class" : "is-event"}`}
                      >
                        {selectedEvent.category === "class" ? (
                          <>
                            <span className="translated-part">Class</span>
                            <span className="fixed-part ko" translate="no">강습</span>
                            <span className="fixed-part en" translate="no">Class</span>
                          </>
                        ) : "행사"}
                      </div>
                    </div>
                  );
                })()}

                {/* Right Column: Header + Info */}
                <div className="EDM-infoColumn">
                  {/* 제목 - Sticky Header */}
                  <div
                    className="EDM-header"
                  >
                    <div className="EDM-titleGroup">
                      <h2 className="EDM-title">
                        {selectedEvent.title}
                      </h2>

                      {isSelectionMode && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setActiveEditField('title');
                          }}
                          className="EDM-editTrigger"
                          title="제목 수정"
                        >
                          <i className="ri-pencil-line"></i>
                        </button>
                      )}
                    </div>

                    {/* 장르 표시 */}
                    {(() => {
                      const isSocial = String(selectedEvent.id).startsWith('social-') ||
                        ['social', 'club_lesson', 'club_regular'].includes(selectedEvent.category || '');

                      let displayGenre = selectedEvent.genre || (isSocial ? '소셜' : null);
                      if (displayGenre === 'Social') displayGenre = '소셜';

                      if (!displayGenre && !isSelectionMode) return null;

                      return (
                        <div className="EDM-genreGroup">
                          {displayGenre ? (
                            <p className={`EDM-genreText ${getGenreColorClass(displayGenre, 'edm-text')}`}>
                              {displayGenre}
                              {selectedEvent.category === "event" && selectedEvent.scope && (
                                <span className={`EDM-scopeBadge ${selectedEvent.scope}`}>
                                  {selectedEvent.scope === 'domestic' ? '국내' : '해외'}
                                </span>
                              )}
                            </p>
                          ) : (
                            <span className="EDM-noInfo">장르 미지정</span>
                          )}
                          {isSelectionMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveEditField('genre');
                              }}
                              className="EDM-editTrigger"
                              title="장르 수정"
                            >
                              <i className="ri-pencil-line"></i>
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* 세부 정보 */}
                  <div className="EDM-infoSection">
                    <div className="EDM-infoItem">
                      <i className="ri-calendar-line EDM-infoIcon"></i>
                      <div className="EDM-infoContent-flex">
                        <span>
                          {(() => {
                            // Helper for safe date parsing
                            const safeDate = (d: string | null | undefined) => {
                              if (!d) return null;
                              const date = new Date(d);
                              return isNaN(date.getTime()) ? null : date;
                            };

                            // 특정 날짜 모드: event_dates 배열이 있으면 개별 날짜 표시
                            if (
                              selectedEvent.event_dates &&
                              selectedEvent.event_dates.length > 0
                            ) {
                              const dates = selectedEvent.event_dates
                                .map(d => safeDate(d))
                                .filter((d): d is Date => d !== null);

                              if (dates.length === 0) return "날짜 정보 없음";

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

                            const start = safeDate(startDate);
                            if (!start) return "날짜 형식 오류";

                            const startYear = start.getFullYear();
                            const startMonth = start.toLocaleDateString("ko-KR", {
                              month: "long",
                            });
                            const startDay = start.getDate();

                            if (endDate && endDate !== startDate) {
                              const end = safeDate(endDate);
                              if (end) {
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
                            }

                            return `${startYear}년 ${startMonth} ${startDay}일`;
                          })()}
                        </span>
                        {isSelectionMode && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveEditField('date');
                            }}
                            className="EDM-editTrigger"
                            title="날짜 수정"
                          >
                            <i className="ri-pencil-line"></i>
                          </button>
                        )}
                      </div>
                    </div>

                    {(selectedEvent.time || isSelectionMode) && (
                      <div className="EDM-infoItem">
                        <i className="ri-time-line EDM-infoIcon"></i>
                        <div className="EDM-infoContent-flex">
                          <span>{selectedEvent.time || "시간 미정"}</span>
                          {isSelectionMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setActiveEditField('time');
                              }}
                              className="EDM-editTrigger"
                              title="시간 수정"
                            >
                              <i className="ri-pencil-line"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {/* 조회수 표시 */}
                    {selectedEvent.views !== undefined && selectedEvent.views !== null && (
                      <div className="EDM-infoItem views-row">
                        <i className="ri-eye-line EDM-infoIcon"></i>
                        <span className="EDM-viewsText">
                          조회 {selectedEvent.views.toLocaleString()}
                        </span>
                      </div>
                    )}

                    {(selectedEvent.location || isSelectionMode) && (
                      <div className="EDM-infoItem">
                        <i className="ri-map-pin-line EDM-infoIcon"></i>
                        <div className="EDM-infoContent-flex">
                          {(selectedEvent as any).venue_id ? (
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                const venueId = (selectedEvent as any).venue_id;
                                if (venueId) {
                                  if (onOpenVenueDetail) {
                                    onOpenVenueDetail(String(venueId));
                                  } else {
                                    openModal('venueDetail', { venueId: String(venueId) });
                                  }
                                }
                              }}
                              className="EDM-venueLink"
                              style={{ position: 'relative', zIndex: 10 }}
                            >
                              <span>{selectedEvent.location}</span>
                              <i className="ri-arrow-right-s-line"></i>
                            </button>
                          ) : (
                            <span>{selectedEvent.location || "장소 미정"}</span>
                          )}
                          {!(selectedEvent as any).venue_id && (selectedEvent.location_link || (selectedEvent as any).venue_custom_link) && (
                            <a
                              href={(selectedEvent as any).venue_custom_link || selectedEvent.location_link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="EDM-locationLink"
                              title="지도 보기"
                            >
                              <i className="ri-external-link-line"></i>
                            </a>
                          )}
                          {isSelectionMode && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setShowVenueSelect(true);
                              }}
                              className="EDM-editTrigger"
                              title="장소 수정"
                            >
                              <i className="ri-pencil-line"></i>
                            </button>
                          )}
                        </div>
                      </div>
                    )}

                    {(selectedEvent.description || isSelectionMode) && (
                      <div className="EDM-divider">
                        <div className="EDM-infoItem">
                          <i className="ri-file-text-line EDM-infoIcon"></i>
                          <div className="EDM-infoItemContent">
                            <div className="EDM-descHeader">
                              <span className="EDM-sectionLabel">내용</span>
                              {isSelectionMode && (
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setActiveEditField('description');
                                  }}
                                  className="EDM-editTrigger"
                                  title="내용 수정"
                                >
                                  <i className="ri-pencil-line"></i>
                                </button>
                              )}
                            </div>
                            <div className="EDM-descWrapper">
                              <p>
                                {selectedEvent.description ? (
                                  selectedEvent.description
                                    .split(/(\bhttps?:\/\/[^\s]+)/g)
                                    .map((part: string, idx: number) => {
                                      if (part.match(/^https?:\/\//)) {
                                        return (
                                          <a
                                            key={idx}
                                            href={part}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="EDM-link"
                                            onClick={(e) => e.stopPropagation()}
                                            data-analytics-id={selectedEvent.id}
                                            data-analytics-type="bio_link"
                                            data-analytics-title={part}
                                            data-analytics-section="event_detail_bio"
                                          >
                                            {part}
                                          </a>
                                        );
                                      }
                                      return <span key={idx}>{part}</span>;
                                    })
                                ) : (
                                  <span className="EDM-noInfo">내용 없음</span>
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
                          <div className="EDM-contactSection">
                            <span className="EDM-contactLabel">
                              문의
                            </span>
                            <div className="EDM-contactGroup">
                              {contactInfos.map((contactInfo: any, index: number) => {
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
                                    className="EDM-contactBtn"
                                    data-analytics-id={selectedEvent.id}
                                    data-analytics-type="contact_click"
                                    data-analytics-title={contactInfo.displayText}
                                    data-analytics-section="event_detail_body"
                                  >
                                    <i
                                      className={`${contactInfo.icon} EDM-contactIcon`}
                                    ></i>
                                    <div className="EDM-contactTextGroup">
                                      <div className="EDM-contactValue">
                                        {contactInfo.displayText}
                                      </div>
                                      <div className="EDM-contactHint">
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


                    {(isAdminMode || ((currentUserId || user?.id) && selectedEvent.user_id === (currentUserId || user?.id))) &&
                      (selectedEvent.organizer_name ||
                        selectedEvent.organizer_phone) && (
                        <div className="EDM-adminSection">
                          <div className="EDM-adminHeader">
                            <i className="ri-admin-line"></i>
                            <span>등록자 정보 (관리자 전용)</span>
                          </div>
                          {selectedEvent.organizer_name && (
                            <div className="EDM-adminItem">
                              <i className="ri-user-star-line"></i>
                              <span>{selectedEvent.organizer_name}</span>
                            </div>
                          )}
                          {selectedEvent.organizer_phone && (
                            <div className="EDM-adminItem">
                              <i className="ri-phone-line"></i>
                              <span>{selectedEvent.organizer_phone}</span>
                            </div>
                          )}
                        </div>
                      )}

                    {/* Link section removed as per user request */}

                    {(isActualAdmin || ((currentUserId || user?.id) && selectedEvent.user_id === (currentUserId || user?.id))) && selectedEvent.created_at && (
                      <div className="EDM-createdAt">
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
                </div> {/* End of EDM-infoColumn */}
              </div> {/* End of EDM-content */}
            </div> {/* End of EDM-scrollContainer */}

            <div className="EDM-footer">
              <div className="EDM-footerLinks">
                {selectedEvent.link1 && (
                  <a
                    href={selectedEvent.link1}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="EDM-footerLink"
                    title={selectedEvent.link_name1 || "바로가기 1"}
                    data-analytics-id={selectedEvent.id}
                    data-analytics-type="external_link"
                    data-analytics-title={selectedEvent.link_name1 || "링크1"}
                    data-analytics-section="event_detail_footer"
                  >
                    <i className="ri-external-link-line EDM-footerLinkIcon"></i>
                    <span className="EDM-footerLinkText">
                      {selectedEvent.link_name1 || "링크1"}
                    </span>
                  </a>
                )}
                {selectedEvent.link2 && (
                  <a
                    href={selectedEvent.link2}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="EDM-footerLink"
                    title={selectedEvent.link_name2 || "바로가기 2"}
                    data-analytics-id={selectedEvent.id}
                    data-analytics-type="external_link"
                    data-analytics-title={selectedEvent.link_name2 || "링크2"}
                    data-analytics-section="event_detail_footer"
                  >
                    <i className="ri-external-link-line EDM-footerLinkIcon"></i>
                    <span className="EDM-footerLinkText">
                      {selectedEvent.link_name2 || "링크2"}
                    </span>
                  </a>
                )}
                {selectedEvent.link3 && (
                  <a
                    href={selectedEvent.link3}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="EDM-footerLink"
                    title={selectedEvent.link_name3 || "바로가기 3"}
                    data-analytics-id={selectedEvent.id}
                    data-analytics-type="external_link"
                    data-analytics-title={selectedEvent.link_name3 || "링크3"}
                    data-analytics-section="event_detail_footer"
                  >
                    <i className="ri-external-link-line EDM-footerLinkIcon"></i>
                    <span className="EDM-footerLinkText">
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
                    className={`EDM-editTrigger ${!selectedEvent.link1 ? 'is-pill' : ''}`}
                    title="링크 수정"
                  >
                    {!selectedEvent.link1 && (
                      <span className="EDM-addLabel">링크 추가</span>
                    )}
                    <i className="ri-pencil-line"></i>
                  </button>
                )}
              </div>

              <div className="EDM-actionGroup">
                {!isSelectionMode && (
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
                    className="EDM-actionBtn is-share"
                    title="공유하기"
                    data-analytics-id={selectedEvent.id}
                    data-analytics-type="share"
                    data-analytics-title={selectedEvent.title}
                    data-analytics-section="event_detail_footer"
                  >
                    <i className="ri-share-line EDM-actionIcon"></i>
                  </button>
                )}

                {/* Delete Button (Only in Selection/Edit Mode) */}
                {isSelectionMode && !isPastEvent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (isDeleting) return;

                      if (window.confirm('정말로 이 이벤트를 삭제하시겠습니까?')) {
                        if (typeof _onDelete === 'function') {
                          _onDelete(selectedEvent, e);
                        } else {
                          console.error('[EventDetailModal] _onDelete가 함수가 아닙니다! (삭제 불가)');
                          alert('삭제 기능을 호출할 수 없습니다. (핸들러 누락)');
                        }
                      }
                    }}
                    className={`EDM-actionBtn is-delete ${isDeleting ? 'is-loading' : ''}`}
                    title="삭제하기"
                    disabled={isDeleting}
                  >
                    {isDeleting ? <LocalLoading inline size="sm" color="white" /> : <i className="ri-delete-bin-line EDM-actionIcon"></i>}
                  </button>
                )}

                {/* Edit/Save Button - Only show if authorized (Admin or Owner) AND event hasn't started */}
                {(isAdminMode || ((currentUserId || user?.id) && selectedEvent.user_id === (currentUserId || user?.id))) && !isPastEvent && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!user) {
                        setShowLoginPrompt(true);
                        return;
                      }

                      // Special handling for social events: Delegate edit to parent (external modal)
                      // REMOVED: Now unified with inline edit
                      /*
                      const isSocial = String(selectedEvent.id).startsWith('social-') ||
                        (selectedEvent as any).is_social_integrated ||
                        (selectedEvent as any).group_id ||
                        selectedEvent.category === 'social' ||
                        selectedEvent.category === 'club_lesson' ||
                        selectedEvent.category === 'club_regular';
                      if (isSocial && _onEdit) {
                        _onEdit(selectedEvent);
                        return;
                      }
                      */

                      // [UPDATE] Toggle edit mode / Save image if changed
                      if (isSelectionMode) {
                        if (imageFile) {
                          // 이미지가 변경된 경우에만 전체 저장(업로드) 로직 실행
                          handleFinalSave();
                        } else {
                          // 그 외에는 이미 즉시 저장되었으므로 모드 종료
                          setIsSelectionMode(false);
                        }
                      } else {
                        setIsSelectionMode(true);
                      }
                    }}
                    className={`EDM-actionBtn ${isSelectionMode ? 'is-save is-active' : 'is-edit'}`}
                    title={isSelectionMode ? "수정 완료" : "이벤트 수정"}
                  >
                    <i className={`ri-${isSelectionMode ? 'check-line' : 'edit-line'} EDM-actionIcon`}></i>
                  </button>
                )}

                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onClose();
                  }}
                  className="EDM-closeBtn"
                  title="닫기"
                >
                  <i className="ri-close-line EDM-actionIcon"></i>
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showFullscreenImage &&
        (selectedEvent.image_medium ||
          selectedEvent.image ||
          getEventThumbnail(
            selectedEvent,
            defaultThumbnailClass,
            defaultThumbnailEvent,
          )) && (
          createPortal(
            <div
              className="EDM-fullscreenOverlay"
              onClick={() => setShowFullscreenImage(false)}
            >
              <button
                onClick={() => setShowFullscreenImage(false)}
                className="EDM-fullscreenCloseBtn"
              >
                <i className="ri-close-line"></i>
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
                className="EDM-fullscreenImage"
                onClick={(e) => e.stopPropagation()}
              />
            </div>,
            document.body
          )
        )}
      {/* Venue Select Modal */}
      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={showVenueSelect}
          onClose={() => setShowVenueSelect(false)}
          onSelect={handleVenueSelect}
          onManualInput={handleManualVenueInput}
        />
      </React.Suspense>

      {/* Bottom Sheets Portal (Optimized Component) */}
      <EventEditBottomSheet
        activeField={activeEditField}
        onClose={() => setActiveEditField(null)}
        initialValue={draftEvent || event}
        onSave={handleSaveField}
        isSaving={isSaving}
        event={draftEvent || event}
        structuredGenres={structuredGenres}
        allHistoricalGenres={allHistoricalGenres}
      />
      <ImageCropModal
        isOpen={isCropModalOpen}
        imageUrl={tempImageSrc}
        onClose={() => setIsCropModalOpen(false)}
        onCropComplete={handleCropComplete}
        onChangeImage={() => fileInputRef.current?.click()}
        originalImageUrl={originalImageUrl}
        onImageUpdate={handleImageUpdate}
        isLoading={isFetchingDetail}
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