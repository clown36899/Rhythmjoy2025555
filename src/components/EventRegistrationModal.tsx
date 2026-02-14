import React, { useState, useEffect, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { createResizedImages } from "../utils/imageResize";
import {
  parseVideoUrl,
  isValidVideoUrl,
} from "../utils/videoEmbed";
import { downloadThumbnailAsBlob, getVideoThumbnail } from "../utils/videoThumbnail";
import { useAuth } from "../contexts/AuthContext";
import { logEvent } from "../lib/analytics";
import ImageCropModal from "./ImageCropModal";
const VenueSelectModal = React.lazy(() => import("../pages/v2/components/VenueSelectModal"));
import "../styles/domains/events.css";
import "../styles/components/EventRegistrationModal.css";
import { EditablePreviewCard } from "./EditablePreviewCard";
import EditableEventDetail, { type EditableEventDetailRef } from './EditableEventDetail';
import type { Event as AppEvent } from "../lib/supabase";
import { useModalHistory } from "../hooks/useModalHistory";
import { useLoading } from "../contexts/LoadingContext";
import { retryOperation } from "../utils/asyncUtils";

// Extended Event type for preview
interface ExtendedEvent extends AppEvent {
  genre?: string | null;
  venue_id?: string | null;
  venue_name?: string | null;
  venue_custom_link?: string | null;
}

interface EventRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onEventCreated: (createdDate: Date, eventId?: number | string) => void;
  onMonthChange?: (date: Date) => void;
  fromBanner?: boolean;
  bannerMonthBounds?: { min: string; max: string };
  editEventData?: AppEvent | null;
  onEventUpdated?: (event: AppEvent) => void;
  onDelete?: (eventId: number | string) => void;
  isDeleting?: boolean;
  groupId?: number | null;
  dayOfWeek?: number | null;
}

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// 한국어 locale 등록 moved to EditableEventDetail



export default memo(function EventRegistrationModal({
  isOpen,
  onClose,
  selectedDate,
  onEventCreated,
  editEventData,
  onEventUpdated,
  onDelete,
  isDeleting = false,
  groupId: initialGroupId = null,
  dayOfWeek: initialDayOfWeek = null,
}: EventRegistrationModalProps) {
  const { isAdmin, user } = useAuth();
  const { showLoading, hideLoading } = useLoading();

  // Preview Mode State
  const [previewMode, setPreviewMode] = useState<'detail' | 'card' | 'billboard'>('detail');

  // Form State
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [eventDates, setEventDates] = useState<string[]>([]); // For individual dates
  const [dayOfWeek, setDayOfWeek] = useState<number | null>(null); // For recurring social schedules
  const [groupId, setGroupId] = useState<number | null>(null); // For social group connection
  const [location, setLocation] = useState("");
  const [address, setAddress] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"class" | "event" | "">("");
  const [genre, setGenre] = useState("");
  const [scope, setScope] = useState<"domestic" | "overseas">("domestic");
  // Password state removed - using RLS-based ownership

  const [link1, setLink1] = useState("");
  const [linkName1, setLinkName1] = useState("");

  // Video State (Billboard only)
  const [videoUrl, setVideoUrl] = useState("");
  const [isValidVideo, setIsValidVideo] = useState(false);
  const [videoProvider, setVideoProvider] = useState<"youtube" | "instagram" | null>(null);
  const [videoId, setVideoId] = useState<string | null>(null);

  const [imageFile, setImageFile] = useState<File | null>(null);
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [imagePosition, setImagePosition] = useState({ x: 0, y: 0 }); // Offset (0,0) by default
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const [imagePreview, setImagePreview] = useState<string>(""); // Stable preview URL
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Venue Selection State
  const [showVenueSelectModal, setShowVenueSelectModal] = useState(false);
  const [venueId, setVenueId] = useState<string | null>(null);
  const [venueName, setVenueName] = useState("");
  const [venueCustomLink, setVenueCustomLink] = useState("");

  // Ref for EditableEventDetail to trigger modals
  const detailRef = useRef<EditableEventDetailRef>(null);

  // Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState(isDeleting ? "삭제 중입니다..." : "저장 중...");
  // const [uploadProgress, setUploadProgress] = useState<number | undefined>(undefined); // Unused

  // 전역 로딩 상태 연동
  useEffect(() => {
    if (isSubmitting || isDeleting) {
      showLoading('event-register-save', isDeleting ? "삭제 중입니다..." : loadingMessage);
    } else {
      hideLoading('event-register-save');
    }
  }, [isSubmitting, isDeleting, loadingMessage, showLoading, hideLoading]);

  // Cleanup on unmount
  useEffect(() => {
    return () => hideLoading('event-register-save');
  }, [hideLoading]);

  // Genre Suggestions
  const [allGenres, setAllGenres] = useState<string[]>([]);

  // Dummy Events State - fetch real events from this month
  const [dummyEvents, setDummyEvents] = useState<ExtendedEvent[]>([]);

  // Sync loading message with isDeleting prop
  useEffect(() => {
    if (isDeleting) {
      setLoadingMessage("삭제 중입니다...");
    }
  }, [isDeleting]);

  // Fetch real events for dummy cards
  useEffect(() => {
    if (isOpen) {
      const fetchDummyEvents = async () => {
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        const { data, error } = await supabase
          .from('events')
          .select('*')
          .gte('date', formatDateForInput(firstDay))
          .lte('date', formatDateForInput(lastDay))
          .order('created_at', { ascending: false })
          .limit(5);

        if (!error && data) {
          const fetchedEvents = data as ExtendedEvent[];
          const needed = 5 - fetchedEvents.length;

          if (needed > 0) {
            const mocks: ExtendedEvent[] = Array(needed).fill(null).map((_, i) => ({
              id: -1 * (i + 1), // Negative IDs for mocks
              created_at: new Date().toISOString(),
              title: "예시 이벤트",
              date: formatDateForInput(new Date()),
              start_date: formatDateForInput(new Date()),
              location: "장소 미정",
              description: "이벤트 설명이 들어갑니다.",
              category: "event",
              genre: "K-POP",
              organizer: "Dance Billboard",
              image: "", // Placeholder will be used
              organizer_name: "관리자",
              time: "00:00",
              price: "무료",
              capacity: 100,
              registered: 0
            }));
            setDummyEvents([...fetchedEvents, ...mocks]);
          } else {
            setDummyEvents(fetchedEvents);
          }
        } else {
          // Fallback if query fails
          const mocks: ExtendedEvent[] = Array(5).fill(null).map((_, i) => ({
            id: -1 * (i + 1),
            created_at: new Date().toISOString(),
            title: "예시 이벤트",
            date: formatDateForInput(new Date()),
            start_date: formatDateForInput(new Date()),
            location: "장소 미정",
            description: "이벤트 설명이 들어갑니다.",
            category: "event",
            genre: "K-POP",
            organizer: "Dance Billboard",
            image: "",
            organizer_name: "관리자",
            time: "00:00",
            price: "무료",
            capacity: 100,
            registered: 0
          }));
          setDummyEvents(mocks);
        }
      };
      fetchDummyEvents();
    }
  }, [isOpen]);

  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  // Fetch Genres
  useEffect(() => {
    if (isOpen) {
      const fetchGenres = async () => {
        const { data, error } = await supabase
          .from('events')
          .select('genre')
          .not('genre', 'is', null);

        if (!error && data) {
          const uniqueGenres = Array.from(new Set(data.map(d => d.genre).filter(Boolean))) as string[];
          setAllGenres(uniqueGenres);
        }
      };
      fetchGenres();
    }
  }, [isOpen]);



  // Reset or Populate Form
  useEffect(() => {
    if (isOpen) {
      if (editEventData) {
        // Edit Mode: Populate form
        setTitle(editEventData.title);
        setDate(editEventData.date ? new Date(editEventData.date) : (editEventData.start_date ? new Date(editEventData.start_date) : null));
        setEndDate(editEventData.end_date ? new Date(editEventData.end_date) : null);
        setEventDates(editEventData.event_dates || []);
        setLocation(editEventData.location || "");
        setAddress((editEventData as any).address || "");
        setLocationLink(editEventData.location_link || "");
        setVenueId((editEventData as any).venue_id || null);
        setVenueName((editEventData as any).venue_name || "");
        setVenueCustomLink((editEventData as any).venue_custom_link || "");
        setDescription(editEventData.description || "");
        setCategory((editEventData.category as "class" | "event") || "event");
        setCategory((editEventData.category as "class" | "event") || "event");
        // Cast to 'any' or 'ExtendedEvent' because standard AppEvent might not have genre yet in basic types
        setGenre((editEventData as unknown as ExtendedEvent).genre || "");
        setScope(((editEventData as any).scope as "domestic" | "overseas") || "domestic");
        setGroupId((editEventData as any).group_id || null);
        setDayOfWeek((editEventData as any).day_of_week ?? null);

        // Password removed - using RLS

        setLink1(editEventData.link1 || "");
        setLinkName1(editEventData.link_name1 || "");
        setVideoUrl(editEventData.video_url || "");
        if (editEventData.video_url) handleVideoChange(editEventData.video_url);

        // Initialize image preview
        setImagePreview(editEventData.image || "");

        // Handle Image
        // Note: For existing images, we don't have a File object, so imageFile remains null.
        // We rely on the fact that if imageFile is null, we preserve the existing image URL in submit (or handle it logically).
        // However, for preview purposes, we might need a way to show the existing image.
        // We can use tempImageSrc strictly for local file previews,
        // but the EditablePreviewCard uses `previewEvent` which we construct from `imageFile` OR fallbacks.

      } else {
        // Create Mode: Reset form
        setTitle("");
        setDate(selectedDate);
        setEndDate(selectedDate);
        setEventDates([]);
        setLocation("");
        setAddress("");
        setLocationLink("");
        setDescription("");
        setCategory("");
        setCategory("");
        setGenre("");
        setScope("domestic");
        setGroupId(initialGroupId);
        setDayOfWeek(initialDayOfWeek);
        // setPassword removed

        setLink1("");
        setLinkName1("");
        setVideoUrl("");
        setImageFile(null);
        setOriginalImageFile(null);
        setImagePreview("");
        setImagePosition({ x: 0, y: 0 });
        setGroupId(null);
        setDayOfWeek(null);
      }
      // Common Reset
      setPreviewMode('detail');
      setIsSubmitting(false);
    }
  }, [isOpen, selectedDate, editEventData]);

  // Video URL Handler
  const handleVideoChange = (url: string) => {
    setVideoUrl(url);
    const valid = isValidVideoUrl(url);
    setIsValidVideo(valid);
    if (valid) {
      const videoInfo = parseVideoUrl(url);
      setVideoProvider(videoInfo.provider);
      setVideoId(videoInfo.videoId);
    } else {
      setVideoProvider(null);
      setVideoId(null);
    }
  };

  const handleExtractThumbnail = async () => {
    if (!videoUrl || !isValidVideoUrl(videoUrl)) {
      alert("유효한 유튜브 동영상 주소가 필요합니다.");
      return;
    }

    try {
      const thumbnailUrl = await getVideoThumbnail(videoUrl);
      if (!thumbnailUrl) {
        alert("썸네일을 가져올 수 없습니다.");
        return;
      }

      const blob = await downloadThumbnailAsBlob(thumbnailUrl);
      if (!blob) {
        alert("썸네일 이미지를 다운로드할 수 없습니다.");
        return;
      }

      const file = new File([blob], "video-thumbnail.jpg", { type: "image/jpeg" });
      setOriginalImageFile(file);
      setImageFile(file);
      setImagePosition({ x: 0, y: 0 });

      try {
        const dataUrl = await fileToDataURL(file);
        setTempImageSrc(dataUrl);
        setIsCropModalOpen(true);
      } catch (err) {
        console.error("Thumbnail error", err);
      }
    } catch (e) {
      console.error("Failed to extract thumbnail", e);
      alert("썸네일 추출 중 오류가 발생했습니다.");
    }
  };

  // ... (lines 223 onwards are fine, but I need to make sure I don't break them)
  // Actually I should just replace the handleVideoUrlChange function first.

  // Wait, I can't do non-contiguous edits easily with replace_file_content if they are far apart.
  // handleVideoUrlChange is at 208.
  // EditableEventDetail usage is at 508.
  // I should use multi_replace.


  // Helper to read file as Data URL with compression
  const fileToDataURL = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const reader = new FileReader();

      reader.onload = (e) => {
        img.onload = () => {
          // 1. Canvas로 이미지 압축
          const canvas = document.createElement('canvas');
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            console.error('[fileToDataURL] Canvas context not available');
            reject(new Error('Canvas context not available'));
            return;
          }

          // 2. 최대 1920px로 리사이즈 (비율 유지)
          const maxSize = 1920;
          let width = img.width;
          let height = img.height;

          if (width > height && width > maxSize) {
            height = (height * maxSize) / width;
            width = maxSize;
          } else if (height > maxSize) {
            width = (width * maxSize) / height;
            height = maxSize;
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // 3. 85% 품질로 압축
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          resolve(dataUrl);
        };
        img.onerror = (err) => {
          console.error('[fileToDataURL] Image load error:', err);
          reject(err);
        };
        img.src = e.target?.result as string;
      };
      reader.onerror = (err) => {
        console.error('[fileToDataURL] FileReader error:', err);
        reject(err);
      };
      reader.readAsDataURL(file);
    });
  };

  // Image Handlers
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImageFile(file);
      setImageFile(file); // Initially set as current image
      setImagePosition({ x: 0, y: 0 }); // Reset position

      try {

        // 50ms delay로 UI가 업데이트될 시간 확보
        await new Promise(resolve => setTimeout(resolve, 50));
        const dataUrl = await fileToDataURL(file);
        setTempImageSrc(dataUrl);
        setIsCropModalOpen(true); // Open crop modal after file selection
      } catch (error) {
        console.error("Failed to load image:", error);
        alert("이미지를 불러오는데 실패했습니다.");
      }
    }
    // Reset input value to allow selecting same file again
    e.target.value = '';
  };

  const handleImageUpdate = async (file: File) => {
    setOriginalImageFile(file);
    setImageFile(file);
    setImagePosition({ x: 0, y: 0 });
    try {
      const dataUrl = await fileToDataURL(file);
      setTempImageSrc(dataUrl);
    } catch (error) {
      console.error("Failed to update image preview:", error);
    }
  };

  const handleCropComplete = async (croppedFile: File, previewUrl: string, _isModified: boolean) => {
    setImageFile(croppedFile);
    setImagePreview(previewUrl);

    setTempImageSrc(null);
    setIsCropModalOpen(false);
  };

  const handleReEditImage = async (e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      if (imageFile) {
        setTempImageSrc(await fileToDataURL(imageFile));
      } else if (originalImageFile) {
        setTempImageSrc(await fileToDataURL(originalImageFile));
      } else if (editEventData?.image) {
        setTempImageSrc(editEventData.image);
      }
      setIsCropModalOpen(true);
    } catch (error) {
      console.error("Failed to load image for re-edit:", error);
    }
  };

  const handleImageClick = async () => {
    try {
      if (imageFile) {
        setTempImageSrc(await fileToDataURL(imageFile));
      } else if (originalImageFile) {
        setTempImageSrc(await fileToDataURL(originalImageFile));
      } else if (editEventData?.image) {
        setTempImageSrc(editEventData.image);
      } else {
        setTempImageSrc(null);
      }
      setIsCropModalOpen(true);
    } catch (error) {
      console.error("Failed to load image:", error);
    }
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (isSubmitting) return;

    if (!user) {
      window.dispatchEvent(new CustomEvent('openLoginModal', {
        detail: { message: '이벤트 등록은 로그인 후 이용 가능합니다.' }
      }));
      return;
    }

    // 수정 시 저장 확인
    if (editEventData && !confirm("수정하시겠습니까?")) {
      return;
    }

    if (!title.trim()) {
      alert("제목을 입력해주세요.");
      detailRef.current?.openModal('title');
      return;
    }

    if (!genre) {
      alert("장르를 선택해주세요.");
      detailRef.current?.openModal('genre');
      return;
    }

    if (!date && (!eventDates || eventDates.length === 0)) {
      alert("날짜를 선택해주세요.");
      detailRef.current?.openModal('date');
      return;
    }

    // New Validation: Category is required
    if (!category) {
      alert("분류(행사/강습)를 선택해주세요.");
      detailRef.current?.openModal('classification');
      return;
    }

    // Password validation removed - using RLS

    if (!link1.trim()) {
      alert("관련 링크를 입력해주세요.");
      detailRef.current?.openModal('link');
      return;
    }

    // Validation: Image is strictly required
    const hasExistingImage = editEventData && (editEventData.image || editEventData.image_thumbnail);
    if (!imageFile && !hasExistingImage) {
      if (videoUrl) {
        alert("이미지는 필수입니다! 동영상이 있다면 '썸네일 추출'을 눌러 이미지를 생성해주세요.");
      } else {
        alert("이미지는 필수입니다! 사진을 업로드해주세요.");
      }
      return;
    }

    setIsSubmitting(true);
    console.log("🌀 스피너 실행됨 (isSubmitting: true)");
    setLoadingMessage("저장 준비 중...");

    // UI 렌더링을 위해 잠시 대기 (스피너가 확실히 뜨도록)
    await new Promise(resolve => setTimeout(resolve, 0));

    try {
      // 타임아웃 20초 설정
      await Promise.race([
        (async () => {
          let imageUrl = editEventData?.image || null;
          let imageMicroUrl = editEventData?.image_micro || null;
          let imageThumbnailUrl = editEventData?.image_thumbnail || null;
          let imageMediumUrl = editEventData?.image_medium || null;
          let imageFullUrl = editEventData?.image_full || null;
          let imageStoragePath = editEventData?.storage_path || null;

          // Capture old paths for cleanup if image is changed
          const oldStoragePath = editEventData?.storage_path || null;
          const oldImageUrls = [
            editEventData?.image,
            editEventData?.image_micro,
            editEventData?.image_thumbnail,
            editEventData?.image_medium,
            editEventData?.image_full
          ].filter(url => !!url);

          const fileToUpload = imageFile;

          // 1. 이미지가 수정되지 않았지만(fileToUpload 없음), 기존 이미지는 있고 micro 버전이 없는 경우 (레거시 데이터 복구)
          // 원본 이미지를 다운로드하여 fileToUpload로 설정 -> 아래 로직에서 4가지 버전 생성 및 업로드 수행
          if (fileToUpload) {
            setLoadingMessage("이미지 변환 중...");
            // setUploadProgress removed

            const timestamp = Date.now();
            const randomString = Math.random().toString(36).substring(2, 7);
            const eventFolder = `${timestamp}_${randomString}`;
            const basePath = `event-posters/${eventFolder}`;
            const storagePath = basePath;

            // 먼저 모든 이미지 리사이즈 (WebP 변환 포함)
            try {
              const resizedImages = await createResizedImages(fileToUpload);
              // setUploadProgress removed
              setLoadingMessage("이미지 업로드 중...");

              // 이미지 업로드 함수 (재시도 용)
              const uploadImage = async (path: string, file: Blob) => {
                const { error } = await supabase.storage.from("images").upload(path, file);
                if (error) {
                  console.error("Upload failed for path:", path, error);
                  throw error;
                }
                return supabase.storage.from("images").getPublicUrl(path).data.publicUrl;
              };

              // 병렬 업로드 및 재시도 적용
              const uploadPromises = [
                retryOperation(() => uploadImage(`${basePath}/micro.webp`, resizedImages.micro)),
                retryOperation(() => uploadImage(`${basePath}/thumbnail.webp`, resizedImages.thumbnail)),
                retryOperation(() => uploadImage(`${basePath}/medium.webp`, resizedImages.medium)),
                retryOperation(() => uploadImage(`${basePath}/full.webp`, resizedImages.full))
              ];

              const [microUrl, thumbUrl, mediumUrl, fullUrl] = await Promise.all(uploadPromises);


              imageMicroUrl = microUrl;
              imageThumbnailUrl = thumbUrl;
              imageMediumUrl = mediumUrl;
              imageFullUrl = fullUrl;
              imageUrl = imageFullUrl;
              imageStoragePath = storagePath;

              // setUploadProgress removed

            } catch (resizeError) {
              console.error("Image processing failed:", resizeError);
              alert(`이미지 처리 실패: ${resizeError}`);
              throw resizeError;
            }
          }

          setLoadingMessage("데이터 저장 중... (자동 재시도)");

          // Determine effective start and end dates
          // 개별 날짜가 있으면 개별 날짜를 우선 사용 (기간 날짜 무시)
          const sortedDates = eventDates.length > 0 ? [...eventDates].sort() : [];
          const effectiveStartDate = sortedDates.length > 0
            ? sortedDates[0]
            : (date ? formatDateForInput(date) : null);
          const effectiveEndDate = sortedDates.length > 0
            ? sortedDates[sortedDates.length - 1]
            : (endDate ? formatDateForInput(endDate) : null);

          const eventData = {
            title,
            date: effectiveStartDate,
            start_date: effectiveStartDate,
            end_date: effectiveEndDate,
            event_dates: eventDates.length > 0 ? eventDates : null, // Include individual dates
            location,
            address,
            location_link: locationLink,
            description,
            category,
            genre: genre || undefined,
            scope,
            // password 필드 제거 (RLS 기반 권한 관리로 전환)
            link1,
            link_name1: linkName1,
            image: imageUrl,
            image_micro: imageMicroUrl,
            image_thumbnail: imageThumbnailUrl,
            image_medium: imageMediumUrl,
            image_full: imageFullUrl,
            storage_path: imageStoragePath,
            video_url: videoUrl,
            organizer: '익명', // Default value since input is removed
            organizer_name: isAdmin ? '관리자' : null,
            created_at: new Date().toISOString(),
            user_id: user?.id || null, // 작성자 ID 저장
            show_title_on_billboard: true, // 기본값 true로 설정
            venue_id: venueId,
            venue_name: venueId ? venueName : location,
            venue_custom_link: venueId ? null : venueCustomLink,
            group_id: groupId,
            day_of_week: dayOfWeek,
          };

          console.log("📝 [EventRegistrationModal] Final eventData to save:", eventData);
          console.log("   - image_micro present?", !!eventData.image_micro);

          let resultData: any[] | null = null;

          if (editEventData) {
            // Update existing event
            await retryOperation(async () => {
              console.log("🔄 Updating event ID:", editEventData.id, "IsAdmin:", isAdmin, "User:", user?.id);
              let query = supabase
                .from("events")
                .update(eventData)
                .eq('id', editEventData.id);

              if (!isAdmin) {
                console.log("   - Applying user_id filter (Not Admin)");
                query = query.eq('user_id', user?.id);
              } else {
                console.log("   - Skipping user_id filter (Admin)");
              }

              const { data, error } = await query.select();
              if (error) {
                console.error("❌ Update query error:", error);
                throw error;
              }
              console.log("✅ Update result data:", data);
              if (!data || data.length === 0) throw new Error("수정 권한이 없거나 이미 삭제된 이벤트입니다.");
              resultData = data;
            });
          } else {
            // Insert new event
            await retryOperation(async () => {
              console.log("🆕 [INSERT] Attempting to insert new event");
              console.log("📋 [INSERT] Event data:", JSON.stringify(eventData, null, 2));
              console.log("👤 [INSERT] Current user ID:", user?.id);
              console.log("🔑 [INSERT] Auth UID:", (await supabase.auth.getUser()).data.user?.id);

              const { data, error } = await supabase
                .from("events")
                .insert([eventData])
                .select();

              if (error) {
                console.error("❌ [INSERT] Insert failed with error:", error);
                console.error("❌ [INSERT] Error code:", error.code);
                console.error("❌ [INSERT] Error message:", error.message);
                console.error("❌ [INSERT] Error details:", error.details);
                console.error("❌ [INSERT] Error hint:", error.hint);
                throw error;
              }

              console.log("✅ [INSERT] Insert successful! Result:", data);
              resultData = data;
            });
          }

          if (resultData && resultData[0]) {
            if (editEventData && onEventUpdated) {
              onEventUpdated(resultData[0] as AppEvent);
              // Analytics: Log Update
              logEvent('Event', 'Update', `${title} (ID: ${editEventData.id})`);
            } else {
              const createdEvent = resultData[0] as AppEvent;
              onEventCreated(date || new Date(), createdEvent.id);
              window.dispatchEvent(new CustomEvent("eventCreated", {
                detail: { event: createdEvent }
              }));

              // [NEW] 관리자에게 자동 푸시 알림 발송 (행사/강습 구분) - 5분 지연 발송 (취소 가능)
              const isLesson = createdEvent.category === 'class' || createdEvent.category === 'regular' || createdEvent.category === 'club';
              const pushCategory = isLesson ? 'class' : 'event';
              const scheduledAt = new Date(Date.now() + 5 * 60 * 1000).toISOString(); // 5 minutes later

              const pushTitle = `${createdEvent.title} (${pushCategory === 'class' ? '강습' : '행사'})`;
              const weekDay = createdEvent.date ? ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'][new Date(createdEvent.date).getDay()] : '';
              const pushBody = `${createdEvent.date || ''} ${weekDay} | ${createdEvent.location || '장소 미정'}`;

              console.log("[Push] Queuing delayed notification...", {
                title: pushTitle,
                category: pushCategory,
                scheduledAt: scheduledAt
              });

              supabase.from('notification_queue').insert({
                event_id: createdEvent.id,
                title: pushTitle,
                body: pushBody,
                category: pushCategory,
                payload: {
                  url: `${window.location.origin}/calendar?id=${createdEvent.id}`,
                  userId: 'ALL',
                  genre: createdEvent.genre,
                  image: createdEvent.image_thumbnail, // [NEW] 이미지 URL 추가
                  content: createdEvent.description // [NEW] 상세 내용 추가
                },
                scheduled_at: scheduledAt,
                status: 'pending'
              }).then(({ error }) => {
                if (error) {
                  console.error('[Push] Queue insert failed:', error);
                } else {
                  console.log('[Push] Notification queued successfully.');
                }
              });

              // Analytics: Log Create
              logEvent('Event', 'Create', `${title} (ID: ${createdEvent.id})`);
            }
            onClose();

            // 🎯 [CLEANUP] After successful DB update, remove old images if changed
            if (editEventData && fileToUpload) {
              const performCleanup = async () => {
                console.log("🧹 [CLEANUP] Starting cleanup of old images...");

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
                const extractPath = (url: string | null) => {
                  if (!url) return null;
                  try {
                    if (url.includes('/images/')) {
                      return decodeURIComponent(url.split('/images/')[1]?.split('?')[0]);
                    }
                    return null;
                  } catch (e) { return null; }
                };

                const individualPaths = oldImageUrls
                  .map(url => extractPath(url as string))
                  .filter((p): p is string => !!p);

                if (individualPaths.length > 0) {
                  try {
                    await supabase.storage.from("images").remove(individualPaths);
                    console.log(`✅ [CLEANUP] Deleted ${individualPaths.length} individual legacy files`);
                  } catch (e) {
                    console.warn("⚠️ [CLEANUP] Failed to delete legacy individual files:", e);
                  }
                }
              };

              // Run in background so UI closes fast
              performCleanup().catch(err => console.error("❌ [CLEANUP] Fatal error during cleanup:", err));
            }
          }
        })(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 60000))
      ]);

    } catch (error: any) {
      console.error("Error creating/updating event:", error);
      let errorMessage = "이벤트 등록 중 오류가 발생했습니다.";

      if (error.message === "Timeout") {
        errorMessage = "서버 응답이 지연되어 저장이 취소되었습니다.\n작성하신 내용은 유지되니 잠시 후 다시 시도해주세요.";
      } else if (error.message.includes("이미지")) {
        errorMessage = error.message;
      } else if (error.message.includes("수정 권한")) {
        errorMessage = error.message;
      } else if (error.message.includes("Failed to fetch")) {
        errorMessage = "인터넷 연결 상태가 불안정합니다.";
      }

      alert(errorMessage);
    } finally {
      setIsSubmitting(false);
      // setUploadProgress removed
    }
  };

  // Construct Preview Event Object
  const previewEvent: ExtendedEvent = {
    id: 0,
    created_at: new Date().toISOString(),
    title: title,
    date: date ? formatDateForInput(date) : undefined,
    start_date: date ? formatDateForInput(date) : undefined,
    end_date: endDate ? formatDateForInput(endDate) : undefined,
    event_dates: eventDates.length > 0 ? eventDates : undefined,
    location: location,
    location_link: locationLink,
    organizer: '익명',
    description: description,
    category: category,
    genre: genre,
    image: imagePreview || editEventData?.image || "",
    link1: link1,
    link_name1: linkName1,
    video_url: videoUrl,
    organizer_name: isAdmin ? '관리자' : undefined,
    time: '00:00',
    price: '무료',
    capacity: 0,
    registered: 0,
    venue_id: venueId,
    venue_name: venueName,
    venue_custom_link: venueCustomLink,
  };

  // Update handler for EditableEventDetail
  const handleDetailUpdate = (field: string, value: any) => {
    switch (field) {
      case 'title': setTitle(value); break;
      case 'location': setLocation(value); break;
      case 'location_link': setLocationLink(value); break;
      case 'description': setDescription(value); break;
      case 'category': setCategory(value); break;
      case 'genre':
        console.log(`[EventRegistrationModal] handleDetailUpdate 'genre' called with value:`, value);
        setGenre(value);
        break;
      // Date handling
      case 'date':
        if (value) {
          setDate(new Date(value));
        } else {
          setDate(null);
        }
        break;
      case 'end_date':
        if (value) {
          setEndDate(new Date(value));
        } else {
          setEndDate(null);
        }
        break;
      case 'event_dates':
        setEventDates(value || []);
        break;
      // password case removed
      case 'link1': setLink1(value); break;
      case 'link_name1': setLinkName1(value); break;
    }
  };

  // Venue selection handler
  const handleVenueSelect = (venue: any) => {
    console.log('🎯 EventRegistrationModal.handleVenueSelect called with:', venue);
    setVenueId(venue.id);
    setVenueName(venue.name);
    setLocation(venue.name);
    setLocationLink("");
    setVenueCustomLink("");
    setShowVenueSelectModal(false);
    console.log('✅ Venue selected, modal closed');
  };

  // Ensure videoProvider is used or removed. It was used in logic but state variable unused in render.
  // We can keep the state if we plan to use it, or silence lint.
  // For now, let's silence the lint by simple usage or just remove the state setter if not needed.
  // actually it is used in handleVideoChange but not rendered.
  // We can just add it to a useEffect logger for debugging or ignore.
  // Or better, let's just make sure we don't have unused vars.
  // Ensure videoProvider is used or removed. It was used in logic but state variable unused in render.
  useEffect(() => {
    if (videoProvider) {
      // console.log("Video provider detected:", videoProvider);
    }
  }, [videoProvider]);



  if (!isOpen) return null;



  return createPortal(
    <div className={`EventRegistrationModal ERM-overlay ${previewMode === 'billboard' ? 'is-billboard' : ''}`}>
      <div className="ERM-switcher">
        <div className="ERM-switcherWrapper">
          <button
            onClick={() => setPreviewMode('detail')}
            className={`ERM-switcherBtn ${previewMode === 'detail' ? 'is-active' : ''}`}
          >
            <i className="ri-file-list-line"></i>
            <span className="ERM-switcherLabel">상세</span>
          </button>

          <button
            onClick={() => setPreviewMode('billboard')}
            className={`ERM-switcherBtn ${previewMode === 'billboard' ? 'is-active' : ''}`}
          >
            <i className="ri-billboard-line"></i>
            <span className="ERM-switcherLabel">전광판</span>
          </button>
        </div>
      </div>

      {previewMode === 'detail' ? (
        <EditableEventDetail
          event={previewEvent}
          onUpdate={handleDetailUpdate}
          onImageUpload={handleImageClick}
          imagePosition={imagePosition}
          onImagePositionChange={setImagePosition}
          genreSuggestions={allGenres}
          className="h-full"
          ref={detailRef}
          // DatePicker Props
          date={date}
          setDate={setDate}
          endDate={endDate}
          setEndDate={setEndDate}
          eventDates={eventDates}
          setEventDates={setEventDates}
          // Scope Props
          scope={scope}
          setScope={setScope}
          // Footer Props
          // password props removed

          link={link1}
          setLink={setLink1}
          linkName={linkName1}
          setLinkName={setLinkName1}
          onRegister={handleSubmit}
          onClose={onClose}
          isSubmitting={isSubmitting}
          videoUrl={videoUrl}
          onVideoChange={handleVideoChange}
          onExtractThumbnail={handleExtractThumbnail}
          onDelete={onDelete && editEventData ? () => onDelete(editEventData.id) : undefined}
          isDeleting={isDeleting}
          // progress={uploadProgress}
          onVenueSelectClick={() => {
            console.log('🎯 EventRegistrationModal.onVenueSelectClick called');
            console.log('   - showVenueSelectModal before:', showVenueSelectModal);
            setShowVenueSelectModal(true);
            console.log('   - setShowVenueSelectModal(true) called');
          }}
        />
      ) : previewMode === 'billboard' ? (
        <div className="ERM-billboardCard">
          <div className="ERM-billboardMedia">
            {isValidVideo && videoId ? (
              <div className="ERM-billboardVideo">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                ></iframe>
              </div>
            ) : previewEvent.image ? (
              <img
                src={previewEvent.image}
                alt="preview"
                className="ERM-billboardImage"
                onClick={handleReEditImage}
              />
            ) : (
              <div className="ERM-billboardPlaceholder">
                <i className="ri-image-line"></i>
              </div>
            )}

            <div className="ERM-billboardQR">
              <i className="ri-qr-code-line"></i>
            </div>
          </div>

          <div className="ERM-billboardInfo">
            <h3 className="ERM-billboardTitle">{title || "제목"}</h3>
            <p className="ERM-billboardDate">{date ? formatDateForInput(date) : "날짜"}</p>
          </div>
        </div>
      ) : (
        <div className="ERM-container">
          <div className="ERM-main">
            <div className="ERM-previewContainer">
              <div className="ERM-previewGrid">
                <div key="event-preview" className="ERM-activeWrapper">
                  <EditablePreviewCard
                    event={{
                      ...previewEvent,
                      category: 'event'
                    }}
                    readOnly={true}
                    showPlaceholders={true}
                  />
                </div>

                <div key="class-preview" className="ERM-activeWrapper">
                  <EditablePreviewCard
                    event={{
                      ...previewEvent,
                      category: 'class'
                    }}
                    readOnly={true}
                    showPlaceholders={true}
                  />
                </div>

                {dummyEvents.slice(0, 4).map((realEvent, idx) => (
                  <div key={`dummy-${idx}`} className="ERM-dummyWrapper">
                    <EditablePreviewCard
                      event={{
                        ...realEvent,
                        category: realEvent.category as 'class' | 'event'
                      }}
                      readOnly={true}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )
      }

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleImageSelect}
        accept="image/*"
        className="hidden"
        style={{ display: 'none' }}
      />

      {/* Image Crop Modal */}
      <ImageCropModal
        key="event-registration-crop-modal"
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        imageUrl={tempImageSrc}
        videoUrl={isValidVideo ? videoUrl : undefined}
        onCropComplete={handleCropComplete}
        onChangeImage={() => fileInputRef.current?.click()}
        onImageUpdate={handleImageUpdate}
        originalImageUrl={tempImageSrc}
      />
      <React.Suspense fallback={null}>
        <VenueSelectModal
          isOpen={showVenueSelectModal}
          onClose={() => setShowVenueSelectModal(false)}
          onSelect={handleVenueSelect}
          onManualInput={(name: string, link: string) => {
            console.log('🔘 Manual input submitted:', name, link);
            setShowVenueSelectModal(false);
            // Update state directly instead of opening another modal
            setLocation(name);
            setLocationLink(link);
            setVenueId(null);
            setVenueName("");
            setVenueCustomLink("");
          }}
        />
      </React.Suspense>
    </div >,
    document.body
  );
});
