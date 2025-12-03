import React, { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { createResizedImages } from "../utils/imageResize";
import {
  parseVideoUrl,
  isValidVideoUrl,
} from "../utils/videoEmbed";
import { useAuth } from "../contexts/AuthContext";
import ImageCropModal from "./ImageCropModal";
import "../styles/components/InteractivePreview.css";
import "./EventRegistrationModal.css";
import { EditablePreviewCard } from "./EditablePreviewCard";
import EditableEventDetail, { type EditableEventDetailRef } from './EditableEventDetail';
import type { Event as AppEvent } from "../lib/supabase";

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



export default function EventRegistrationModal({
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
  const [category, setCategory] = useState<"class" | "event">("event");
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
      setCategory("event");
      setGenre("");
      setPassword("");
      setLink1("");
      setLinkName1("");
      setVideoUrl("");
      setVideoUrl("");
      setImageFile(null);
      setOriginalImageFile(null);
      setImagePosition({ x: 0, y: 0 });
      setPreviewMode('detail');
    }
  }, [isOpen, selectedDate]);

  // Video URL Handler
  const handleVideoUrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const url = e.target.value;
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

  // Image Handlers
  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setOriginalImageFile(file);
      setImageFile(file); // Initially set as current image
      setImagePosition({ x: 0, y: 0 }); // Reset position
      setTempImageSrc(URL.createObjectURL(file));
      setIsCropModalOpen(true);
    }
    // Reset input value to allow selecting same file again
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob, previewUrl: string, isModified: boolean) => {
    // If not modified (full image) and we have the original, revert to original
    if (!isModified && originalImageFile) {
      setImageFile(originalImageFile);
      setTempImageSrc(null);
      setIsCropModalOpen(false);
      return;
    }

    const file = new File([croppedBlob], "cropped-image.jpg", { type: "image/jpeg" });
    setImageFile(file);
    setIsCropModalOpen(false);
    setTempImageSrc(null);
  };

  const handleRestoreOriginal = () => {
    if (originalImageFile) {
      setImageFile(originalImageFile);
      setTempImageSrc(URL.createObjectURL(originalImageFile));
      // Don't close modal, just update the image being cropped
    }
  };

  const handleReEditImage = () => {
    if (imageFile) {
      setTempImageSrc(URL.createObjectURL(imageFile));
      setIsCropModalOpen(true);
    }
  };

  const handleImageClick = () => {
    if (imageFile) {
      handleReEditImage();
    } else {
      fileInputRef.current?.click();
    }
  };

  // Submit Handler
  const handleSubmit = async () => {
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

    if (!date) {
      alert("날짜를 선택해주세요.");
      detailRef.current?.openModal('date');
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

    setIsSubmitting(true);

    try {
      let imageUrl = null;
      let imageThumbnailUrl = null;
      let imageMediumUrl = null;
      let imageFullUrl = null;

      if (imageFile) {
        const fileExt = imageFile.name.split(".").pop();
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 15);
        const fileName = `${timestamp}_${randomString}.${fileExt}`;
        const folderPath = `event-posters`;
        const filePath = `${folderPath}/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("images")
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("images")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;

        // Resize images
        try {
          const resizedImages = await createResizedImages(imageFile);

          // Upload thumbnail
          const thumbFileName = `thumb_${fileName}`;
          const thumbPath = `${folderPath}/${thumbFileName}`;
          await supabase.storage
            .from("images")
            .upload(thumbPath, resizedImages.thumbnail);
          imageThumbnailUrl = supabase.storage
            .from("images")
            .getPublicUrl(thumbPath).data.publicUrl;

          // Upload medium
          const mediumFileName = `medium_${fileName}`;
          const mediumPath = `${folderPath}/${mediumFileName}`;
          await supabase.storage
            .from("images")
            .upload(mediumPath, resizedImages.medium);
          imageMediumUrl = supabase.storage
            .from("images")
            .getPublicUrl(mediumPath).data.publicUrl;

          // Upload full
          const fullFileName = `full_${fileName}`;
          const fullPath = `${folderPath}/${fullFileName}`;
          await supabase.storage
            .from("images")
            .upload(fullPath, resizedImages.full);
          imageFullUrl = supabase.storage
            .from("images")
            .getPublicUrl(fullPath).data.publicUrl;

        } catch (resizeError) {
          console.error("Image resize failed:", resizeError);
          // Fallback to original image if resize fails
          imageThumbnailUrl = imageUrl;
          imageMediumUrl = imageUrl;
          imageFullUrl = imageUrl;
        }
      }

      const eventData = {
        title,
        date: date ? formatDateForInput(date) : null,
        start_date: date ? formatDateForInput(date) : null,
        end_date: endDate ? formatDateForInput(endDate) : null,
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
    <div className="reg-modal-overlay">
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
            onClick={() => setPreviewMode('card')}
            className={`switcher-btn ${previewMode === 'card' ? 'active' : 'inactive'} `}
          >
            <i className="ri-gallery-view-2"></i>
            <span className="switcher-label">카드</span>
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

      <div className="reg-modal-container">

        {/* Main Content Area */}
        {/* Main Content Area */}
        <div className="reg-main-content">



          {/* Mode: Detail (Editing) */}
          {previewMode === 'detail' && (
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
            />
          )}

          {/* Mode: Card Preview */}
          {previewMode === 'card' && (
            <div className="flex items-center justify-center h-full overflow-y-auto">
              <div className="card-preview-grid">
                {/* Active Card - Always show at index 1 (top center) */}
                <div key="active" className="active-card-wrapper">
                  <EditablePreviewCard
                    event={{
                      ...previewEvent,
                      category: previewEvent.category as 'class' | 'event'
                    }}
                    readOnly={true}
                    showPlaceholders={true}
                  />
                </div>

                {/* Dummy Cards - Only render if real events exist */}
                {dummyEvents.slice(0, 5).map((realEvent, idx) => (
                  <div key={`dummy - ${idx} `} className="dummy-card-wrapper">
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
          )}

          {/* Mode: Billboard Preview & Video Input */}
          {previewMode === 'billboard' && (
            <div className="billboard-preview-container">
              {/* Video Input Section */}


              {/* Billboard Preview */}
              <div className="billboard-preview-area">
                {/* Background Image/Video */}
                <div className="billboard-bg-layer">
                  {imageFile ? (
                    <img src={URL.createObjectURL(imageFile)} alt="bg" className="billboard-bg-image" />
                  ) : (
                    <div className="billboard-bg-placeholder" />
                  )}
                </div>

                {/* Content */}
                <div className="billboard-content-card">
                  {/* Video/Image Area */}
                  <div className="billboard-media-area">
                    {isValidVideo && videoId ? (
                      <div className="billboard-media-placeholder">
                        <div className="billboard-video-placeholder-content">
                          <i className={`ri - ${videoProvider === 'youtube' ? 'youtube' : 'instagram'} -fill billboard - video - icon`}></i>
                          <p>동영상 미리보기</p>
                        </div>
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
              </div>
            </div>
          )}

          {/* DatePicker logic moved to EditableEventDetail */}
        </div>



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
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          imageUrl={tempImageSrc || ''}
          onCropComplete={handleCropComplete}
          onRestoreOriginal={handleRestoreOriginal}
          onChangeImage={() => fileInputRef.current?.click()}
          hasOriginal={!!originalImageFile && imageFile !== originalImageFile}
        />
      </div>
    </div>,
    document.body
  );
}
