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
import ImageCropModal from "./ImageCropModal";
import "../styles/components/InteractivePreview.css";
import "./EventRegistrationModal.css";
import { EditablePreviewCard } from "./EditablePreviewCard";
import EditableEventDetail, { type EditableEventDetailRef } from './EditableEventDetail';
import type { Event as AppEvent } from "../lib/supabase";
import { useModalHistory } from "../hooks/useModalHistory";

// Extended Event type for preview
interface ExtendedEvent extends AppEvent {
  genre?: string | null;
}

interface EventRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onEventCreated: (createdDate: Date, eventId?: number) => void;
  onMonthChange?: (date: Date) => void;
  fromBanner?: boolean;
  bannerMonthBounds?: { min: string; max: string };
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
}: EventRegistrationModalProps) {
  const { isAdmin } = useAuth();

  // Preview Mode State
  const [previewMode, setPreviewMode] = useState<'detail' | 'card' | 'billboard'>('detail');

  // Form State
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [eventDates, setEventDates] = useState<string[]>([]); // For individual dates
  const [location, setLocation] = useState("");
  const [locationLink, setLocationLink] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<"class" | "event" | "">("");
  const [genre, setGenre] = useState("");
  const [password, setPassword] = useState("");
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
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Ref for EditableEventDetail to trigger modals
  const detailRef = useRef<EditableEventDetailRef>(null);

  // Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Genre Suggestions
  const [allGenres, setAllGenres] = useState<string[]>([]);

  // Dummy Events State - fetch real events from this month
  const [dummyEvents, setDummyEvents] = useState<ExtendedEvent[]>([]);

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
              organizer: "RhythmJoy",
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
            organizer: "RhythmJoy",
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



  // Reset Form
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDate(null);
      setEndDate(null);
      // setEventDates([]); // Commented out to prevent reset on re-render
      setLocation("");
      setLocationLink("");
      setDescription("");
      setCategory("");
      setGenre("");
      setPassword("");
      setLink1("");
      setLinkName1("");
      setVideoUrl("");
      setImageFile(null);
      setOriginalImageFile(null);
      setImagePosition({ x: 0, y: 0 });
      setPreviewMode('detail');
    }
  }, [isOpen, selectedDate]);

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
      setTempImageSrc(URL.createObjectURL(file));
      setIsCropModalOpen(true);
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


  // Image Handlers
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImageFile(file);
      setImageFile(file); // Initially set as current image
      setImagePosition({ x: 0, y: 0 }); // Reset position
      setTempImageSrc(URL.createObjectURL(file));
      setIsCropModalOpen(true); // Open crop modal after file selection
    }
    // Reset input value to allow selecting same file again
    e.target.value = '';
  };

  const handleImageUpdate = (file: File) => {
    setOriginalImageFile(file);
    setImageFile(file);
    setImagePosition({ x: 0, y: 0 });
    setTempImageSrc(URL.createObjectURL(file));
  };

  const handleCropComplete = async (croppedBlob: Blob, _previewUrl: string, _isModified: boolean) => {


    const croppedFile = new File([croppedBlob], originalImageFile?.name || "cropped.jpg", {
      type: "image/jpeg",
      lastModified: Date.now(),
    });
    setImageFile(croppedFile);
    setTempImageSrc(null);
    setIsCropModalOpen(false);
  };

  const handleRestoreOriginal = () => {
    if (originalImageFile) {
      setImageFile(originalImageFile);
      setTempImageSrc(URL.createObjectURL(originalImageFile));
      // Don't close modal, just update the image being cropped
    }
  };

  const handleReEditImage = (e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (imageFile) {
      setTempImageSrc(URL.createObjectURL(imageFile));
    } else if (originalImageFile) {
      setTempImageSrc(URL.createObjectURL(originalImageFile));
    }
    setIsCropModalOpen(true);
  };

  const handleImageClick = () => {
    if (imageFile) {
      setTempImageSrc(URL.createObjectURL(imageFile));
    } else if (originalImageFile) {
      setTempImageSrc(URL.createObjectURL(originalImageFile));
    } else {
      setTempImageSrc(null);
    }
    setIsCropModalOpen(true);
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (isSubmitting) return;

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

    if (!password.trim() && !isAdmin) {
      alert("비밀번호를 입력해주세요.");
      // Scroll to password input
      const passwordSection = document.getElementById('password-input-section');
      if (passwordSection) {
        passwordSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    // New Validation: Image OR Video is required
    if (!imageFile && !videoUrl) {
      alert("이미지 또는 동영상 중 하나는 필수입니다!\n둘 중 하나라도 입력해주세요.");
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl = null;
      let imageMicroUrl = null;
      let imageThumbnailUrl = null;
      let imageMediumUrl = null;
      let imageFullUrl = null;

      if (imageFile) {
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const basePath = `event-posters`;

        // 먼저 모든 이미지 리사이즈 (WebP 변환 포함)
        try {
          const resizedImages = await createResizedImages(imageFile);

          // 파일명은 WebP 확장자 사용
          const fileName = `${timestamp}_${randomString}.webp`;

          // Upload micro (micro 폴더) - 달력용
          const microPath = `${basePath}/micro/${fileName}`;
          await supabase.storage
            .from("images")
            .upload(microPath, resizedImages.micro);
          imageMicroUrl = supabase.storage
            .from("images")
            .getPublicUrl(microPath).data.publicUrl;

          // Upload thumbnail (thumbnails 폴더)
          const thumbPath = `${basePath}/thumbnails/${fileName}`;
          await supabase.storage
            .from("images")
            .upload(thumbPath, resizedImages.thumbnail);
          imageThumbnailUrl = supabase.storage
            .from("images")
            .getPublicUrl(thumbPath).data.publicUrl;

          // Upload medium (medium 폴더)
          const mediumPath = `${basePath}/medium/${fileName}`;
          await supabase.storage
            .from("images")
            .upload(mediumPath, resizedImages.medium);
          imageMediumUrl = supabase.storage
            .from("images")
            .getPublicUrl(mediumPath).data.publicUrl;

          // Upload full (full 폴더) - 원본 대신 사용
          const fullPath = `${basePath}/full/${fileName}`;
          await supabase.storage
            .from("images")
            .upload(fullPath, resizedImages.full);
          imageFullUrl = supabase.storage
            .from("images")
            .getPublicUrl(fullPath).data.publicUrl;

          // 원본도 full과 동일하게 설정
          imageUrl = imageFullUrl;

        } catch (resizeError) {
          console.error("Image resize failed:", resizeError);
          alert("이미지 처리 중 오류가 발생했습니다.");
          throw resizeError;
        }
      }

      // Determine effective start and end dates
      const sortedDates = eventDates.length > 0 ? [...eventDates].sort() : [];
      const effectiveStartDate = date ? formatDateForInput(date) : (sortedDates.length > 0 ? sortedDates[0] : null);
      const effectiveEndDate = endDate ? formatDateForInput(endDate) : (sortedDates.length > 0 ? sortedDates[sortedDates.length - 1] : null);

      const eventData = {
        title,
        date: effectiveStartDate,
        start_date: effectiveStartDate,
        end_date: effectiveEndDate,
        event_dates: eventDates.length > 0 ? eventDates : null, // Include individual dates
        location,
        location_link: locationLink,
        description,
        category,
        genre: genre || undefined,
        password,
        link1,
        link_name1: linkName1,
        image: imageUrl,
        image_micro: imageMicroUrl,
        image_thumbnail: imageThumbnailUrl,
        image_medium: imageMediumUrl,
        image_full: imageFullUrl,
        video_url: videoUrl,
        organizer: '익명', // Default value since input is removed
        organizer_name: isAdmin ? '관리자' : null,
        created_at: new Date().toISOString(),
      };

      const { data, error } = await supabase
        .from("events")
        .insert([eventData])
        .select();

      if (error) throw error;

      if (data && data[0]) {
        onEventCreated(date || new Date(), data[0].id);
        window.dispatchEvent(new CustomEvent("eventCreated", {
          detail: { event: data[0] }
        }));
        onClose();
      }
    } catch (error) {
      console.error("Error creating event:", error);
      alert("이벤트 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
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
    image: imageFile ? URL.createObjectURL(imageFile) : "",
    link1: link1,
    link_name1: linkName1,
    video_url: videoUrl,
    organizer_name: isAdmin ? '관리자' : undefined,
    time: '00:00',
    price: '무료',
    capacity: 0,
    registered: 0,
  };

  // Update handler for EditableEventDetail
  const handleDetailUpdate = (field: string, value: any) => {
    switch (field) {
      case 'title': setTitle(value); break;
      case 'location': setLocation(value); break;
      case 'location_link': setLocationLink(value); break;
      case 'description': setDescription(value); break;
      case 'category': setCategory(value); break;
      case 'genre': setGenre(value); break;
      case 'password': setPassword(value); break;
      case 'link1': setLink1(value); break;
      case 'link_name1': setLinkName1(value); break;
    }
  };



  if (!isOpen) return null;

  return createPortal(
    <div className={`reg-modal-overlay ${previewMode === 'billboard' ? 'billboard-mode' : ''}`}>
      {/* Ceiling Switcher - Detached */}
      {/* Ceiling Switcher - Detached */}
      <div className="ceiling-switcher-container">
        <div className="ceiling-switcher-wrapper">
          <button
            onClick={() => setPreviewMode('detail')}
            className={`switcher-btn ${previewMode === 'detail' ? 'active' : 'inactive'} `}
          >
            <i className="ri-file-list-line"></i>
            <span className="switcher-label">상세</span>
          </button>

          <button
            onClick={() => setPreviewMode('billboard')}
            className={`switcher-btn ${previewMode === 'billboard' ? 'active' : 'inactive'} `}
          >
            <i className="ri-billboard-line"></i>
            <span className="switcher-label">전광판</span>
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
          // Footer Props
          password={password}
          setPassword={setPassword}
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
        />
      ) : previewMode === 'billboard' ? (
        /* Billboard mode: Direct card with no container */
        <div className="billboard-content-card">
          {/* Video/Image Area */}
          <div className="billboard-media-area">
            {isValidVideo && videoId ? (
              <div className="billboard-media-video-wrapper w-full h-full">
                <iframe
                  width="100%"
                  height="100%"
                  src={`https://www.youtube.com/embed/${videoId}?autoplay=1&mute=1&controls=0&loop=1&playlist=${videoId}`}
                  title="YouTube video player"
                  frameBorder="0"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                  allowFullScreen
                  className="w-full h-full object-cover"
                ></iframe>
              </div>
            ) : imageFile ? (
              <img
                src={URL.createObjectURL(imageFile)}
                alt="preview"
                className="billboard-media-image cursor-pointer"
                onClick={handleReEditImage}
              />
            ) : (
              <div className="billboard-media-placeholder">
                <i className="ri-image-line billboard-empty-icon"></i>
              </div>
            )}

            {/* QR Code Placeholder */}
            <div className="billboard-qr-placeholder">
              <i className="ri-qr-code-line billboard-qr-icon"></i>
            </div>
          </div>

          {/* Bottom Info */}
          <div className="billboard-info-overlay">
            <h3 className="billboard-info-title">{title || "제목"}</h3>
            <p className="billboard-info-date">{date ? formatDateForInput(date) : "날짜"}</p>
          </div>
        </div>
      ) : (
        <div className="reg-modal-container">
          {/* Main Content Area */}
          <div className="reg-main-content">
            {/* Mode: Card Preview */}
            <div className="card-preview-container">
              <div className="card-preview-grid">
                {/* Event Preview Card */}
                <div key="event-preview" className="active-card-wrapper">
                  <EditablePreviewCard
                    event={{
                      ...previewEvent,
                      category: 'event'
                    }}
                    readOnly={true}
                    showPlaceholders={true}
                  />
                </div>

                {/* Class Preview Card */}
                <div key="class-preview" className="active-card-wrapper">
                  <EditablePreviewCard
                    event={{
                      ...previewEvent,
                      category: 'class'
                    }}
                    readOnly={true}
                    showPlaceholders={true}
                  />
                </div>

                {/* Dummy Cards - Only render if real events exist */}
                {dummyEvents.slice(0, 4).map((realEvent, idx) => (
                  <div key={`dummy-${idx}`} className="dummy-card-wrapper">
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
        key={tempImageSrc || 'register-crop-modal'}
        isOpen={isCropModalOpen}
        onClose={() => setIsCropModalOpen(false)}
        imageUrl={tempImageSrc}
        videoUrl={isValidVideo ? videoUrl : undefined}
        onCropComplete={handleCropComplete}
        onRestoreOriginal={handleRestoreOriginal}
        onChangeImage={() => fileInputRef.current?.click()}
        onImageUpdate={handleImageUpdate}
        hasOriginal={!!originalImageFile}
      />
    </div >,
    document.body
  );
});
