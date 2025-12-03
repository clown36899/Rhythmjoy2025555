import React, { useState, useEffect, forwardRef, useRef } from "react";
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
import EditableEventDetail from "./EditableEventDetail";
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

// ForwardRef 커스텀 입력 컴포넌트
interface CustomInputProps {
  value?: string;
  onClick?: () => void;
}

const CustomDateInput = forwardRef<HTMLButtonElement, CustomInputProps>(
  ({ value, onClick }, ref) => (
    <button
      type="button"
      ref={ref}
      onClick={onClick}
      className="reg-date-input-btn"
    >
      {value || "날짜 선택"}
    </button>
  )
);

CustomDateInput.displayName = "CustomDateInput";

export default function EventRegistrationModal({
  isOpen,
  onClose,
  selectedDate,
  onEventCreated,
}: EventRegistrationModalProps) {
  const { isAdmin } = useAuth();

  // Preview Mode State
  const [previewMode, setPreviewMode] = useState<'detail' | 'card' | 'billboard'>('detail');

  // Dynamic Preview Scale
  const [previewScale, setPreviewScale] = useState(0.76);

  useEffect(() => {
    const handleResize = () => {
      const vh = window.innerHeight;
      const vw = window.innerWidth;

      // Available space calculation (approximate header/footer/padding)
      const availableHeight = vh - 180; // Reduced top offset for ceiling switcher
      const availableWidth = Math.min(vw - 40, 360); // Max width constraint for mobile view

      const cardBaseHeight = 480; // Estimated card height
      const cardBaseWidth = 280;  // Estimated card width

      // Calculate scale to fit both width and height
      const scaleHeight = availableHeight / cardBaseHeight;
      const scaleWidth = availableWidth / cardBaseWidth;

      // Use the smaller scale to ensure it fits, but cap at 1.05 to avoid too large
      const newScale = Math.min(scaleHeight, scaleWidth, 1.05);

      setPreviewScale(Math.max(newScale, 0.5)); // Minimum scale 0.5
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Form State
  const [title, setTitle] = useState("");
  const [date, setDate] = useState<Date | null>(selectedDate);
  const [endDate, setEndDate] = useState<Date | null>(selectedDate);
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

  // Image State
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isCropModalOpen, setIsCropModalOpen] = useState(false);
  const [tempImageSrc, setTempImageSrc] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Loading State
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Genre Suggestions
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);

  // Editing Field State (for card preview interaction)
  const [editingField, setEditingField] = useState<string | null>(null);

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

  // Filter Genre Suggestions
  useEffect(() => {
    if (genre) {
      const filtered = allGenres.filter(g =>
        g.toLowerCase().includes(genre.toLowerCase()) && g !== genre
      ).slice(0, 5);
      setGenreSuggestions(filtered);
    } else {
      setGenreSuggestions([]);
    }
  }, [genre, allGenres]);

  // Reset Form
  useEffect(() => {
    if (isOpen) {
      setTitle("");
      setDate(selectedDate);
      setEndDate(selectedDate);
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
      setImageFile(null);
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
      const reader = new FileReader();
      reader.onload = () => {
        setTempImageSrc(reader.result as string);
        setIsCropModalOpen(true);
      };
      reader.readAsDataURL(file);
    }
    // Reset input value to allow selecting same file again
    e.target.value = '';
  };

  const handleCropComplete = async (croppedBlob: Blob) => {
    const file = new File([croppedBlob], "cropped-image.jpg", { type: "image/jpeg" });
    setImageFile(file);
    setIsCropModalOpen(false);
    setTempImageSrc(null);
  };

  // Submit Handler
  const handleSubmit = async () => {
    if (!title.trim()) {
      alert("제목을 입력해주세요.");
      return;
    }
    if (!password.trim() && !isAdmin) {
      alert("비밀번호를 입력해주세요.");
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
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from("event-images")
          .upload(filePath, imageFile);

        if (uploadError) throw uploadError;

        const { data: publicUrlData } = supabase.storage
          .from("event-images")
          .getPublicUrl(filePath);

        imageUrl = publicUrlData.publicUrl;

        // Resize images
        try {
          const resizedImages = await createResizedImages(imageFile);

          // Upload thumbnail
          const thumbFileName = `thumb_${fileName}`;
          await supabase.storage
            .from("event-images")
            .upload(thumbFileName, resizedImages.thumbnail);
          imageThumbnailUrl = supabase.storage
            .from("event-images")
            .getPublicUrl(thumbFileName).data.publicUrl;

          // Upload medium
          const mediumFileName = `medium_${fileName}`;
          await supabase.storage
            .from("event-images")
            .upload(mediumFileName, resizedImages.medium);
          imageMediumUrl = supabase.storage
            .from("event-images")
            .getPublicUrl(mediumFileName).data.publicUrl;

          // Upload full
          const fullFileName = `full_${fileName}`;
          await supabase.storage
            .from("event-images")
            .upload(fullFileName, resizedImages.full);
          imageFullUrl = supabase.storage
            .from("event-images")
            .getPublicUrl(fullFileName).data.publicUrl;

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

  // Interactive Edit Handlers for Card Preview
  const handleInteractiveUpdate = (field: string, value: string) => {
    switch (field) {
      case 'title': setTitle(value); break;
      case 'genre':
        setGenre(value);
        // Filter suggestions
        if (value) {
          const filtered = allGenres.filter(g =>
            g.toLowerCase().includes(value.toLowerCase()) && g !== value
          ).slice(0, 5);
          setGenreSuggestions(filtered);
        } else {
          setGenreSuggestions([]);
        }
        break;
      case 'category': setCategory(value as 'class' | 'event'); break;
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="reg-modal-overlay">
      {/* Ceiling Switcher - Detached */}
      <div className="absolute top-2 left-1/2 transform -translate-x-1/2 z-50">
        <div className="flex bg-gray-800/90 backdrop-blur-md rounded-full p-1 border border-white/10 shadow-lg">
          <button
            onClick={() => setPreviewMode('detail')}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${previewMode === 'detail'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <i className="ri-file-list-line"></i>
            상세
          </button>
          <button
            onClick={() => setPreviewMode('card')}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${previewMode === 'card'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <i className="ri-gallery-view-2"></i>
            카드
          </button>
          <button
            onClick={() => setPreviewMode('billboard')}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${previewMode === 'billboard'
              ? 'bg-blue-600 text-white shadow-md'
              : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
          >
            <i className="ri-billboard-line"></i>
            전광판
          </button>
        </div>
      </div>

      <div className="reg-modal-container" style={{ maxWidth: '500px', width: '100%', height: 'calc(100% - 60px)', display: 'flex', flexDirection: 'column', marginTop: '50px' }}>

        {/* Main Content Area */}
        <div className="flex-1 overflow-y-auto bg-gray-900 relative rounded-xl overflow-hidden">

          {/* Hidden File Input */}
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageSelect}
            accept="image/*"
            className="hidden"
          />

          {/* Mode: Detail (Editing) */}
          {previewMode === 'detail' && (
            <EditableEventDetail
              event={previewEvent}
              onUpdate={handleDetailUpdate}
              onImageUpload={() => fileInputRef.current?.click()}
              genreSuggestions={allGenres}
              className="h-full"
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
            <div className="flex items-center justify-center h-full p-4">
              <div style={{
                width: '100%',
                maxWidth: '300px',
                transform: `scale(${previewScale})`,
                transformOrigin: 'center center',
                transition: 'transform 0.2s ease'
              }}>
                <EditablePreviewCard
                  event={{
                    ...previewEvent,
                    category: previewEvent.category as 'class' | 'event'
                  }}
                  editingField={editingField}
                  onEditStart={(field) => setEditingField(field)}
                  onEditEnd={() => setEditingField(null)}
                  onUpdate={handleInteractiveUpdate}
                  onEditImage={() => fileInputRef.current?.click()}
                  // Date picker logic is now handled in EditableEventDetail
                  onEditCategory={() => {
                    setCategory(prev => prev === 'class' ? 'event' : 'class');
                  }}
                  suggestions={editingField === 'genre' ? genreSuggestions : undefined}
                  onSelectGenre={(g) => {
                    setGenre(g);
                    setEditingField(null);
                  }}
                />
              </div>
            </div>
          )}

          {/* Mode: Billboard Preview & Video Input */}
          {previewMode === 'billboard' && (
            <div className="flex flex-col h-full">
              {/* Video Input Section */}
              <div className="p-4 bg-gray-800 border-b border-gray-700">
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  동영상 링크 입력 (YouTube, Instagram)
                </label>
                <input
                  type="text"
                  value={videoUrl}
                  onChange={handleVideoUrlChange}
                  placeholder="https://..."
                  className="w-full bg-gray-700 text-white px-3 py-2 rounded border border-gray-600 focus:border-blue-500 outline-none"
                />
              </div>

              {/* Billboard Preview */}
              <div className="flex-1 flex items-center justify-center p-4 bg-black relative overflow-hidden">
                {/* Background Image/Video */}
                <div className="absolute inset-0 opacity-50">
                  {imageFile ? (
                    <img src={URL.createObjectURL(imageFile)} alt="bg" className="w-full h-full object-cover blur-sm" />
                  ) : (
                    <div className="w-full h-full bg-gray-900" />
                  )}
                </div>

                {/* Content */}
                <div className="relative z-10 w-full max-w-md aspect-[9/16] bg-gray-900 rounded-xl overflow-hidden shadow-2xl border border-gray-700 flex flex-col">
                  {/* Video/Image Area */}
                  <div className="flex-1 relative bg-black">
                    {isValidVideo && videoId ? (
                      <div className="w-full h-full flex items-center justify-center text-gray-500">
                        <div className="text-center">
                          <i className={`ri-${videoProvider === 'youtube' ? 'youtube' : 'instagram'}-fill text-4xl mb-2`}></i>
                          <p>동영상 미리보기</p>
                        </div>
                      </div>
                    ) : imageFile ? (
                      <img src={URL.createObjectURL(imageFile)} alt="preview" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-gray-600">
                        <i className="ri-image-line text-4xl"></i>
                      </div>
                    )}

                    {/* QR Code Placeholder */}
                    <div className="absolute bottom-4 right-4 w-16 h-16 bg-white p-1 rounded">
                      <i className="ri-qr-code-line text-5xl text-black"></i>
                    </div>
                  </div>

                  {/* Bottom Info */}
                  <div className="p-4 bg-gradient-to-t from-black to-transparent absolute bottom-0 left-0 right-0">
                    <h3 className="text-white text-xl font-bold mb-1">{title || "제목"}</h3>
                    <p className="text-gray-300 text-sm">{date ? formatDateForInput(date) : "날짜"}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* DatePicker logic moved to EditableEventDetail */}
        </div>



        {/* Image Crop Modal */}
        <ImageCropModal
          isOpen={isCropModalOpen}
          onClose={() => setIsCropModalOpen(false)}
          imageUrl={tempImageSrc || ''}
          onCropComplete={handleCropComplete}
        />
      </div>
    </div>,
    document.body
  );
}
