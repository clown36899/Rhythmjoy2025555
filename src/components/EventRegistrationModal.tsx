import React, { useState, useEffect, forwardRef, useRef } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import { createResizedImages } from "../utils/imageResize";
import {
  parseVideoUrl,
  isValidVideoUrl,
  getVideoProviderName,
} from "../utils/videoEmbed";
import {
  getVideoThumbnailOptions,
  downloadThumbnailAsBlob,
  type VideoThumbnailOption,
} from "../utils/videoThumbnail";
import { useAuth } from "../contexts/AuthContext";
import ImageCropModal from "./ImageCropModal";
import CustomDatePickerHeader from "./CustomDatePickerHeader";
import DatePicker, { registerLocale } from "react-datepicker";
import { ko } from "date-fns/locale/ko";
import "react-datepicker/dist/react-datepicker.css";
import "./EventRegistrationModal.css";

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

// 한국어 locale 등록
registerLocale("ko", ko);

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
  onMonthChange,
  fromBanner = false,
  bannerMonthBounds: _bannerMonthBounds,
}: EventRegistrationModalProps) {
  const { isAdmin } = useAuth();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const organizerNameInputRef = useRef<HTMLInputElement>(null);
  const organizerPhoneInputRef = useRef<HTMLInputElement>(null);
  const startDatePickerRef = useRef<DatePicker>(null);
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [genreSuggestions, setGenreSuggestions] = useState<string[]>([]);
  const [isGenreInputFocused, setIsGenreInputFocused] = useState(false);
  const specificDatePickerRef = useRef<DatePicker>(null);
  const dateSectionRef = useRef<HTMLDivElement>(null);

  const [formData, setFormData] = useState({
    title: "",
    description: "",
    location: "",
    locationLink: "",
    category: "class",
    organizer: "",
    organizerName: "",
    organizerPhone: "",
    contact: "",
    link1: "",
    link2: "",
    link3: "",
    linkName1: "",
    linkName2: "",
    linkName3: "",
    genre: "",
    password: "",
    videoUrl: "",
    showTitleOnBillboard: true,
  });
  const [startDateInput, setStartDateInput] = useState<string>(
    fromBanner ? "" : formatDateForInput(selectedDate)
  );
  const [endDate, setEndDate] = useState<Date>(selectedDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStep, setUploadStep] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [videoPreview, setVideoPreview] = useState<{
    provider: string | null;
    embedUrl: string | null;
  }>({ provider: null, embedUrl: null });
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [thumbnailOptions, setThumbnailOptions] = useState<
    VideoThumbnailOption[]
  >([]);

  // 이미지 크롭 모달
  const [showCropModal, setShowCropModal] = useState(false);
  const [cropImageUrl, setCropImageUrl] = useState<string>("");
  
  // 원본 이미지 보관 (되돌리기용)
  const [originalImageFile, setOriginalImageFile] = useState<File | null>(null);
  const [originalImagePreview, setOriginalImagePreview] = useState<string>("");

  // 날짜 선택 모드: 'range' (연속 기간) 또는 'specific' (특정 날짜들)
  const [dateMode, setDateMode] = useState<"range" | "specific">("range");
  const [specificDates, setSpecificDates] = useState<Date[]>([selectedDate]);
  const [tempDateInput, setTempDateInput] = useState<string>(""); // 날짜 추가 전 임시 값

  // selectedDate가 변경되면 startDateInput, endDate, specificDates도 업데이트
  useEffect(() => {
    if (isOpen) {
      const fetchGenres = async () => {
        const { data, error } = await supabase.from('events').select('genre');
        if (data && !error) {
          const uniqueGenres = [...new Set(data.map(item => item.genre).filter(g => g))] as string[];
          setAllGenres(uniqueGenres);
        }
      };
      fetchGenres();
    }
    setStartDateInput(fromBanner ? "" : formatDateForInput(selectedDate));
    setEndDate(selectedDate);
    setSpecificDates([selectedDate]);
  }, [selectedDate, fromBanner]);

  // 모달이 열릴 때 배경 스크롤 금지
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    // 컴포넌트 언마운트 시 원상복구
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  const categories = [
    { id: "class", name: "강습" },
    { id: "event", name: "행사" },
  ];

  const handleInputChange = (
    e: React.ChangeEvent<
      HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement
    >,
  ) => {
    const { name, value } = e.target;

    if (e.target.type === 'checkbox' && 'checked' in e.target) {
      const { checked } = e.target as HTMLInputElement;
      setFormData(prev => ({ ...prev, [name]: checked }));
      return;
    }

    setFormData((prev) => ({ ...prev, [name]: value }));

    if (name === 'genre') {
      const suggestions = value
        ? allGenres.filter(
            (genre) =>
              genre.toLowerCase().includes(value.toLowerCase()) &&
              genre.toLowerCase() !== value.toLowerCase(),
          )
        : allGenres; // 입력값이 없으면 전체 목록 보여주기
      setGenreSuggestions(suggestions);
    } else {
      setFormData((prev) => ({ ...prev, [name]: value }));
    }

    if (name === "videoUrl") {
      if (value.trim() === "") {
        setVideoPreview({ provider: null, embedUrl: null });
      } else {
        const videoInfo = parseVideoUrl(value);

        // 유튜브만 허용
        if (videoInfo.provider && videoInfo.provider !== "youtube") {
          setVideoPreview({ provider: null, embedUrl: null });
        } else {
          setVideoPreview({
            provider: videoInfo.provider,
            embedUrl: videoInfo.embedUrl,
          });

          if (videoInfo.provider === "youtube") {
            setImageFile(null);
            setImagePreview("");
          }
        }
      }
    }
  };

  const handleGenreSuggestionClick = (genre: string) => {
    setFormData(prev => ({ ...prev, genre }));
    setGenreSuggestions([]);
  };

  const handleGenreFocus = () => {
    setIsGenreInputFocused(true);
    setGenreSuggestions(allGenres); // 포커스 시 전체 장르 목록 보여주기
  };

  const handleInputFocus = (
    e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    // 모바일에서 키보드가 올라올 시간을 주기 위해 약간의 지연
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 300);
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    let processedFile = file;

    // 파일 형식 체크 (원본 파일로 체크)
    const fileType = file.type.toLowerCase();
    const fileName = file.name.toLowerCase();
    
    // HEIC 파일 감지
    if (fileName.endsWith('.heic') || fileName.endsWith('.heif') || fileType === 'image/heic' || fileType === 'image/heif') {
      alert('HEIC 형식은 지원하지 않습니다.\niPhone 사진은 설정 > 카메라 > 형식에서 "호환성 우선"으로 변경하거나,\n다른 앱에서 JPG/PNG로 변환 후 업로드해주세요.');
      e.target.value = '';
      return;
    }

    // 지원되는 형식 체크
    const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
    if (!supportedFormats.includes(fileType) && !fileName.match(/\.(jpg|jpeg|png|gif|webp)$/)) {
      alert('지원하는 이미지 형식: JPG, PNG, GIF, WebP\n현재 파일 형식은 지원하지 않습니다.');
      e.target.value = '';
      return;
    }

    // 파일 크기 체크 및 자동 압축
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    const maxSize = isMobile ? 10 * 1024 * 1024 : 20 * 1024 * 1024;
    
    if (file.size > maxSize) {
      try {
        // 자동 압축 시도
        const originalSizeMB = (file.size / 1024 / 1024).toFixed(1);
        const { resizeImage } = await import('../utils/imageResize');
        
        // 모바일: 더 작게, 데스크톱: 적당히
        const targetWidth = isMobile ? 1920 : 2560;
        const quality = isMobile ? 0.7 : 0.8;
        
        processedFile = await resizeImage(file, targetWidth, quality);
        const newSizeMB = (processedFile.size / 1024 / 1024).toFixed(1);
        
        alert(`파일이 너무 커서 자동으로 압축했습니다.\n\n원본: ${originalSizeMB}MB → 압축: ${newSizeMB}MB`);
      } catch (error) {
        console.error('Auto compression failed:', error);
        const errorMsg = error instanceof Error ? error.message : '알 수 없는 오류';
        alert(`파일 압축 중 오류가 발생했습니다.\n\n오류: ${errorMsg}\n\n다른 이미지를 선택하거나, 이미지 크기를 줄여서 다시 시도해주세요.`);
        e.target.value = '';
        return;
      }
    }

    setImageFile(processedFile);
    // 원본 보관 (최초 선택 시만)
    if (!originalImageFile) {
      setOriginalImageFile(processedFile);
    }
    
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      setImagePreview(preview);
      // 원본 미리보기 보관 (최초 선택 시만)
      if (!originalImagePreview) {
        setOriginalImagePreview(preview);
      }
    };
    reader.onerror = () => {
      alert('파일을 읽을 수 없습니다. 손상되었거나 지원하지 않는 형식일 수 있습니다.');
      e.target.value = '';
    };
    reader.readAsDataURL(processedFile);
  };

  // 파일 선택 이미지 편집
  const handleOpenCropForFile = () => {
    if (imagePreview) {
      setCropImageUrl(imagePreview);
      setShowCropModal(true);
    }
  };

  // 썸네일 선택 후 편집
  const handleOpenCropForThumbnail = async (thumbnailUrl: string) => {
    try {
      const blob = await downloadThumbnailAsBlob(thumbnailUrl);
      if (!blob) {
        alert('썸네일 다운로드에 실패했습니다.');
        return;
      }
      
      // 원본 보관 (최초 선택 시만)
      if (!originalImageFile) {
        const file = new File([blob], 'youtube-thumbnail.jpg', { type: 'image/jpeg' });
        setOriginalImageFile(file);
        const reader = new FileReader();
        reader.onload = (e) => {
          setOriginalImagePreview(e.target?.result as string);
        };
        reader.readAsDataURL(file);
      }
      
      const blobUrl = URL.createObjectURL(blob);
      setCropImageUrl(blobUrl);
      setShowCropModal(true);
      setShowThumbnailSelector(false);
    } catch (error) {
      console.error('썸네일 다운로드 실패:', error);
      alert('썸네일 다운로드 중 오류가 발생했습니다.');
    }
  };

  // 크롭 완료 처리
  const handleCropComplete = (croppedFile: File, croppedPreviewUrl: string) => {
    setImageFile(croppedFile);
    setImagePreview(croppedPreviewUrl);
    
    // ObjectURL 정리 (메모리 누수 방지)
    if (cropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl('');
  };

  // 크롭 취소 처리 (메모리 정리)
  const handleCropDiscard = () => {
    // ObjectURL 정리
    if (cropImageUrl.startsWith('blob:')) {
      URL.revokeObjectURL(cropImageUrl);
    }
    setCropImageUrl('');
  };

  // 원본으로 되돌리기 (모달 안에서)
  const handleRestoreOriginal = () => {
    if (originalImagePreview) {
      // 기존 크롭 이미지 URL 정리
      if (cropImageUrl.startsWith('blob:')) {
        URL.revokeObjectURL(cropImageUrl);
      }
      
      // 원본 이미지를 크롭 모달에 표시 (모달 닫지 않음)
      setCropImageUrl(originalImagePreview);
    }
  };

  const sanitizeFileName = (fileName: string): string => {
    // 파일명에서 확장자 제거
    const nameWithoutExt = fileName.split(".")[0];

    // 전각 문자를 반각으로 변환
    let normalized = nameWithoutExt.replace(/[\uFF01-\uFF5E]/g, (ch) =>
      String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
    );

    // 영문, 숫자, 하이픈, 언더스코어만 남기고 나머지는 제거
    normalized = normalized.replace(/[^a-zA-Z0-9\-_]/g, "");

    // 연속된 특수문자 제거
    normalized = normalized.replace(/[\-_]+/g, "_");

    // 앞뒤 특수문자 제거
    normalized = normalized.replace(/^[\-_]+|[\-_]+$/g, "");

    return normalized || "image";
  };

  const uploadImages = async (
    file: File,
  ): Promise<{
    thumbnail: string;
    medium: string;
    full: string;
    folderPath: string;
  }> => {
    try {
      console.log('[📤 이미지 업로드] 시작', { 
        fileName: file.name, 
        fileSize: `${(file.size / 1024).toFixed(0)}KB`,
        fileType: file.type,
        hasImagePreview: !!imagePreview
      });
      
      setUploadStep('이미지 리사이즈 중...');
      
      // imagePreview(base64) 우선 사용, 없으면 File 객체 사용
      const source = imagePreview || file;
      const fileName = file.name;
      
      console.log('[📤 이미지 업로드] 리사이즈 소스:', imagePreview ? 'base64 (모바일 호환)' : 'File 객체');
      
      const resizedImages = await createResizedImages(source, (progress, step) => {
        setUploadProgress(progress);
        setUploadStep(step);
        console.log(`[📤 진행률] ${progress}% - ${step}`);
      }, fileName);
      
      console.log('[📤 이미지 업로드] 리사이즈 완료, 업로드 시작');
      setUploadStep('서버에 업로드 중...');
      const timestamp = Date.now();
      const baseFileName = sanitizeFileName(file.name);
      const folderPath = `event-posters/${timestamp}_${baseFileName}`;
      
      console.log('[📤 이미지 업로드] 리사이즈 완료', { 
        baseFileName,
        thumbnailSize: resizedImages.thumbnail.size,
        mediumSize: resizedImages.medium.size,
        fullSize: resizedImages.full.size
      });
      
      // 리사이즈된 이미지의 실제 확장자 추출 (WebP 또는 JPEG)
      const getExtension = (fileName: string) => {
        const ext = fileName.split('.').pop()?.toLowerCase();
        return ext || 'jpg';
      };

      const uploadPromises = [
        {
          file: resizedImages.thumbnail,
          path: `${folderPath}/thumb.${getExtension(resizedImages.thumbnail.name)}`,
          key: "thumbnail" as const,
        },
        {
          file: resizedImages.medium,
          path: `${folderPath}/medium.${getExtension(resizedImages.medium.name)}`,
          key: "medium" as const,
        },
        {
          file: resizedImages.full,
          path: `${folderPath}/full.${getExtension(resizedImages.full.name)}`,
          key: "full" as const,
        },
      ];

      const results = await Promise.all(
        uploadPromises.map(async ({ file, path, key }) => {
          const { error } = await supabase.storage
            .from("images")
            .upload(path, file, {
              cacheControl: "31536000",
              upsert: true,
            });

          if (error) {
            console.error(`${key} upload error:`, error);
            throw new Error(`이미지 업로드 실패 (${key}): ${error.message}`);
          }

          const { data } = supabase.storage.from("images").getPublicUrl(path);
          console.log(`[📤 이미지 업로드] ${key} 업로드 성공:`, data.publicUrl);

          return { key, url: data.publicUrl };
        }),
      );

      const finalUrls = {
        thumbnail: results.find((r) => r.key === "thumbnail")?.url || "",
        medium: results.find((r) => r.key === "medium")?.url || "",
        full: results.find((r) => r.key === "full")?.url || "",
      };
      
      console.log('[📤 이미지 업로드] ✅ 완료', { ...finalUrls, folderPath });
      
      return { ...finalUrls, folderPath };
    } catch (error) {
      console.error("Image upload failed:", error);
      const errorMessage =
        error instanceof Error
          ? error.message
          : "이미지 업로드 중 오류가 발생했습니다.";
      alert(errorMessage);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    console.log('[🚀 이벤트 등록] 폼 제출 시작 - 필수 필드 검증');

    // 0️⃣ 제목 검증
    if (!formData.title) {
      alert("이벤트 제목을 입력해주세요.");
      titleInputRef.current?.focus();
      return;
    }

    // 1️⃣ 날짜 검증 (최우선)
    if (dateMode === "range" && !startDateInput) {
      alert("시작 날짜를 선택해주세요.");
      startDatePickerRef.current?.setOpen(true);
      dateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    if (dateMode === "specific" && specificDates.length === 0) {
      alert("최소 1개의 날짜를 선택해주세요.");
      specificDatePickerRef.current?.setOpen(true);
      dateSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }

    // 2️⃣ 필수 필드 검증
    if (!formData.password) {
      alert("이벤트 수정을 위한 비밀번호를 설정해주세요.");
      passwordInputRef.current?.focus();
      return;
    }

    if (!formData.organizerName) {
      alert("등록자 이름을 입력해주세요.");
      organizerNameInputRef.current?.focus();
      return;
    }

    if (!formData.organizerPhone) {
      alert("등록자 전화번호를 입력해주세요.");
      organizerPhoneInputRef.current?.focus();
      return;
    }

    // 3️⃣ 영상 URL 유효성 검증
    if (formData.videoUrl && !isValidVideoUrl(formData.videoUrl)) {
      alert(
        "지원하지 않는 영상 URL입니다. YouTube, Instagram, Facebook, Vimeo 링크를 사용해주세요.",
      );
      return;
    }

    // YouTube/Vimeo URL이 있고 썸네일이 없으면 추출 필수
    if (formData.videoUrl && !imageFile && !imagePreview) {
      const videoInfo = parseVideoUrl(formData.videoUrl);
      if (videoInfo.provider === "youtube" || videoInfo.provider === "vimeo") {
        alert(
          "YouTube 또는 Vimeo 영상은 썸네일 이미지가 필요합니다. 이미지를 업로드하거나 썸네일 추출 기능을 사용해주세요.",
        );
        return;
      }
    }

    // 4️⃣ 링크 유효성 검증
    if (formData.linkName1 && !formData.link1) {
      alert("링크1 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (formData.link1 && !formData.linkName1) {
      alert("링크1 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }
    if (formData.linkName2 && !formData.link2) {
      alert("링크2 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (formData.link2 && !formData.linkName2) {
      alert("링크2 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }
    if (formData.linkName3 && !formData.link3) {
      alert("링크3 제목을 입력했다면 링크 주소도 입력해주세요.");
      return;
    }
    if (formData.link3 && !formData.linkName3) {
      alert("링크3 주소를 입력했다면 링크 제목도 입력해주세요.");
      return;
    }

    console.log('[✅ 검증 완료] 모든 필수 필드 통과');
    console.log('[🚀 이벤트 등록] 시작', { 
      title: formData.title, 
      dateMode,
      hasImage: !!imageFile 
    });
    
    setIsSubmitting(true);
    setUploadProgress(0);
    setUploadStep('준비 중...');

    try {
      // 5️⃣ 이미지 업로드 (검증 완료 후)
      let imageUrls = {
        thumbnail: "",
        medium: "",
        full: "",
      };
      let storagePath: string | null = null;

      if (imageFile) {
        console.log('[🚀 이벤트 등록] 이미지 업로드 시작');
        const uploadResult = await uploadImages(imageFile);
        imageUrls.thumbnail = uploadResult.thumbnail;
        imageUrls.medium = uploadResult.medium;
        imageUrls.full = uploadResult.full;
        storagePath = uploadResult.folderPath;
        console.log('[🚀 이벤트 등록] 이미지 업로드 완료');
      }

      // 6️⃣ 날짜 데이터 준비
      console.log('[🚀 이벤트 등록] 날짜 데이터 준비 중');
      setUploadStep('이벤트 데이터 준비 중...');
      
      let localDateString: string;
      let endDateString: string;
      let eventDatesArray: string[] | null = null;

      if (dateMode === "specific") {
        // 특정 날짜 모드: 선택된 날짜들을 배열로 저장
        const sortedDates = [...specificDates].sort(
          (a, b) => a.getTime() - b.getTime(),
        );
        eventDatesArray = sortedDates.map((date) => formatDateForInput(date));
        localDateString = eventDatesArray[0]; // 최소 날짜
        endDateString = eventDatesArray[eventDatesArray.length - 1]; // 최대 날짜
        console.log('[🚀 이벤트 등록] 특정 날짜 모드', { 날짜수: eventDatesArray.length });
      } else {
        // 연속 기간 모드: startDateInput 사용
        localDateString = startDateInput;
        endDateString = formatDateForInput(endDate);
        console.log('[🚀 이벤트 등록] 연속 기간 모드', { 시작일: localDateString, 종료일: endDateString });
      }

      const eventData = {
        title: formData.title,
        date: localDateString,
        genre: formData.genre || null,
        start_date: localDateString,
        end_date: endDateString,
        event_dates: eventDatesArray,
        time: "00:00",
        location: formData.location,
        location_link: formData.locationLink || null,
        category: formData.category,
        price: "Free",
        image: imageUrls.full || "",
        image_thumbnail: imageUrls.thumbnail || null,
        image_medium: imageUrls.medium || null,
        image_full: imageUrls.full || null,
        video_url: formData.videoUrl || null,
        description: formData.description || "",
        organizer: formData.organizer,
        organizer_name: formData.organizerName,
        organizer_phone: formData.organizerPhone,
        contact: formData.contact || null,
        capacity: 50,
        registered: 0,
        link1: formData.link1 || null,
        link2: formData.link2 || null,
        link3: formData.link3 || null,
        link_name1: formData.linkName1 || null,
        link_name2: formData.linkName2 || null,
        link_name3: formData.linkName3 || null,
        password: formData.password,
        storage_path: storagePath,
        show_title_on_billboard: formData.showTitleOnBillboard,

        created_at: new Date().toISOString(),
      };

      console.log('[💾 이벤트 등록] DB 저장 시작');
      setUploadStep('데이터베이스 저장 중...');
      
      console.log('>>>>>>>>>> [DB INSERT 직전 데이터 확인] storage_path:', eventData.storage_path, '<<<<<<<<<<');

      const { data: insertedData, error } = await supabase
        .from("events")
        .insert([eventData])
        .select("id");

      if (error) {
        console.error("[💾 이벤트 등록] ❌ 실패:", error);
        alert("이벤트 등록 중 오류가 발생했습니다.");
      } else {
        const newEventId = insertedData?.[0]?.id;
        console.log('[💾 이벤트 등록] ✅ 성공', { eventId: newEventId });
        alert("이벤트가 성공적으로 등록되었습니다!");
        setFormData({
          title: "",
          description: "",
          location: "",
          locationLink: "",
          category: "class",
          organizer: "",
          organizerName: "",
          organizerPhone: "",
          contact: "",
          link1: "",
          link2: "",
          link3: "",
          linkName1: "",
          linkName2: "",
          linkName3: "",
          genre: "",
          password: "",
          videoUrl: "",
          showTitleOnBillboard: true,
        });
        setImageFile(null);
        setImagePreview("");
        setVideoPreview({ provider: null, embedUrl: null });
       
        // 등록된 이벤트의 시작 날짜 전달
        const createdDate = new Date(localDateString + "T00:00:00");
        console.log('[🔔 이벤트 등록] onEventCreated 호출', {
          createdDate: createdDate.toISOString(),
          eventId: newEventId,
          fromBanner: fromBanner
        });
        onEventCreated(createdDate, newEventId);
        onClose();
      }
    } catch (error) {
      console.error("Error:", error);
      alert("이벤트 등록 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div className="reg-modal-overlay" style={{ alignItems: 'center', zIndex: 999999 }}>
        <div className="reg-modal-container reg-modal-shadow" style={{ position: 'relative', zIndex: 999999, border: '1px solid var(--color-gray-600)' }}>
          {/* 업로드 진행률 오버레이 */}
          {isSubmitting && (
            <div className="reg-upload-overlay">
              <div className="reg-upload-container">
                <div className="erm-text-center-mb-4">
                  <div className="reg-upload-title" style={{ fontSize: '3rem', color: 'var(--color-blue-500)' }}>
                    {uploadProgress}%
                  </div>
                  <div className="reg-upload-step">{uploadStep}</div>
                </div>
                <div className="reg-upload-progress-bar">
                  <div
                    className="reg-upload-progress-fill"
                    style={{ width: `${uploadProgress}%` }}
                  />
                </div>
              </div>
            </div>
          )}
          
          {/* Header - 상단 고정 */}
          <div className="reg-modal-header">
            <h2 className="erm-title">
              {(startDateInput ? new Date(startDateInput + "T00:00:00") : selectedDate).toLocaleDateString("ko-KR", {
                year: "numeric",
                month: "long",
                day: "numeric",
                weekday: "long",
              })}{" "}
              이벤트 등록
            </h2>
          </div>

          {/* Content - 스크롤 가능 */}
          <form id="event-form" onSubmit={handleSubmit} className="reg-modal-body space-y-3">
              {/* 이벤트 제목 */}
              <div>
                <input
                  ref={titleInputRef}
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  required
                  className="reg-form-input"
                  placeholder="이벤트 제목을 입력하세요"
                />
              </div>

              {/* 장르 */}
              <div className="relative">
                <label className="reg-form-label">
                  장르 (7자 이내, 선택사항)
                </label>
                <input
                  type="text"
                  name="genre"
                  value={formData.genre}
                  onChange={handleInputChange}
                  onFocus={handleGenreFocus}
                  onBlur={() => setTimeout(() => setIsGenreInputFocused(false), 150)}
                  maxLength={7}
                  className="reg-form-input"
                  placeholder="예: 린디합, 발보아, 스윙"
                  autoComplete="off"
                />
                {isGenreInputFocused && genreSuggestions.length > 0 && (
                  <div className="reg-autocomplete-dropdown">
                    {genreSuggestions.map((genre) => (
                      <button
                        key={genre}
                        type="button"
                        onMouseDown={() => handleGenreSuggestionClick(genre)}
                        className="reg-autocomplete-item"
                      >
                        {genre}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 비밀번호 & 카테고리 (한 줄) */}
              <div className="erm-grid-2-gap-3">
                {/* 이벤트 비밀번호 */}
                <div>
                  <input
                    ref={passwordInputRef}
                    type="password"
                    name="password"
                    value={formData.password}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    required
                    className="reg-form-input"
                    placeholder="비밀번호"
                  />
                </div>

                {/* 카테고리 */}
                <div>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="reg-form-select"
                    style={{ paddingRight: '2rem' }}
                  >
                    {categories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 빌보드 표시 옵션 */}
              <div className="reg-billboard-option-box space-y-2">
                <label className="reg-form-label">
                  빌보드 표시 옵션
                </label>
                <div className="reg-flex-items-center">
                  <input
                    type="checkbox"
                    id="showTitleOnBillboard"
                    name="showTitleOnBillboard"
                    checked={formData.showTitleOnBillboard}
                    onChange={handleInputChange}
                    className="reg-form-checkbox"
                  />
                  <label htmlFor="showTitleOnBillboard" className="reg-checkbox-text">
                    빌보드에 제목, 날짜, 장소 정보 표시
                  </label>
                </div>
              </div>

              {/* 날짜 선택 섹션 (날짜 선택 방식 + 시작일/종료일) */}
              <div ref={dateSectionRef} className="reg-date-section space-y-3">
                <label className="reg-form-label">
                  날짜 선택 방식
                </label>
                <div className="reg-flex-gap-4">
                  <label className="reg-checkbox-label">
                    <input
                      type="radio"
                      checked={dateMode === "range"}
                      onChange={() => setDateMode("range")}
                      className="mr-2"
                    />
                    <span className="erm-text-white-sm">연속 기간</span>
                  </label>
                  <label className="reg-checkbox-label">
                    <input
                      type="radio"
                      checked={dateMode === "specific"}
                      onChange={() => setDateMode("specific")}
                      className="mr-2"
                    />
                    <span className="erm-text-white-sm">특정 날짜 선택</span>
                  </label>
                </div>

                {/* 연속 기간 모드 */}
                {dateMode === "range" && (
                  <div className="reg-date-range-inputs">
                    <div>
                      <label className="reg-form-label-sm erm-mb-1">
                        시작
                      </label>
                      <DatePicker
                        ref={startDatePickerRef}
                        selected={startDateInput ? new Date(startDateInput + "T00:00:00") : null}
                        onChange={(date) => {
                          if (date) {
                            const dateStr = formatDateForInput(date);
                            setStartDateInput(dateStr);
                            if (endDate < date) {
                              setEndDate(date);
                            }
                            if (onMonthChange) {
                              onMonthChange(date);
                            }
                          }
                        }}
                        minDate={new Date()}
                        locale="ko"
                        shouldCloseOnSelect={false}
                        customInput={
                          <CustomDateInput
                            value={
                              startDateInput
                                ? `${new Date(startDateInput + "T00:00:00").getMonth() + 1}.${new Date(startDateInput + "T00:00:00").getDate()}`
                                : undefined
                            }
                          />
                        }
                        calendarClassName="bg-gray-800"
                        withPortal
                        portalId="root-portal"
                        renderCustomHeader={(props) => (
                          <CustomDatePickerHeader
                            {...props}
                            selectedDate={startDateInput ? new Date(startDateInput + "T00:00:00") : null}
                            onTodayClick={() => {
                              const today = new Date();
                              props.changeMonth(today.getMonth());
                              props.changeYear(today.getFullYear());
                              setStartDateInput(formatDateForInput(today));
                              if (endDate < today) {
                                setEndDate(today);
                              }
                              if (onMonthChange) {
                                onMonthChange(today);
                              }
                            }}
                          />
                        )}
                      />
                    </div>
                    <div>
                      <label className="reg-form-label-sm erm-mb-1">
                        종료
                      </label>
                      <DatePicker
                        selected={endDate}
                        onChange={(date) => {
                          if (date) {
                            setEndDate(date);
                            if (onMonthChange) {
                              onMonthChange(date);
                            }
                          }
                        }}
                        startDate={startDateInput ? new Date(startDateInput + "T00:00:00") : null}
                        endDate={endDate}
                        minDate={startDateInput ? new Date(startDateInput + "T00:00:00") : undefined}
                        locale="ko"
                        shouldCloseOnSelect={false}
                        customInput={
                          <CustomDateInput
                            value={`${endDate.getMonth() + 1}.${endDate.getDate()}`}
                          />
                        }
                        calendarClassName="bg-gray-800"
                        withPortal
                        portalId="root-portal"
                        renderCustomHeader={(props) => <CustomDatePickerHeader {...props} />}
                      />
                    </div>
                  </div>
                )}

                {/* 특정 날짜 선택 모드 */}
                {dateMode === "specific" && (
                  <div>
                    <label className="reg-form-label-sm erm-mb-2">
                      선택된 날짜 ({specificDates.length}개)
                    </label>
                    <div className="reg-date-specific-tags">
                      {specificDates
                        .sort((a, b) => a.getTime() - b.getTime())
                        .map((date, index) => (
                          <div
                            key={index}
                            className="reg-date-tag"
                          >
                            <span>
                              {date.getMonth() + 1}/{date.getDate()}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                if (specificDates.length > 1) {
                                  setSpecificDates((prev) =>
                                    prev.filter((_, i) => i !== index),
                                  );
                                }
                              }}
                              className="reg-date-tag-close"
                            >
                              <i className="ri-close-line"></i>
                            </button>
                          </div>
                        ))}
                    </div>
                    <div className="reg-date-add-row">
                      <DatePicker
                        ref={specificDatePickerRef}
                        selected={tempDateInput ? new Date(tempDateInput + "T00:00:00") : null}
                        onChange={(date) => {
                          if (date) {
                            const dateStr = formatDateForInput(date);
                            setTempDateInput(dateStr);
                            if (onMonthChange) {
                              onMonthChange(date);
                            }
                          }
                        }}
                        locale="ko"
                        shouldCloseOnSelect={false}
                        customInput={
                          <CustomDateInput
                            value={
                              tempDateInput
                                ? `${new Date(tempDateInput + "T00:00:00").getMonth() + 1}.${new Date(tempDateInput + "T00:00:00").getDate()}`
                                : undefined
                            }
                          />
                        }
                        calendarClassName="bg-gray-800"
                        withPortal
                        portalId="root-portal"
                        renderCustomHeader={(props) => <CustomDatePickerHeader {...props} />}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (tempDateInput) {
                            const newDate = new Date(
                              tempDateInput + "T00:00:00",
                            );
                            // 중복 체크
                            const isDuplicate = specificDates.some(
                              (d) =>
                                formatDateForInput(d) ===
                                formatDateForInput(newDate),
                            );
                            if (!isDuplicate) {
                              setSpecificDates((prev) => [...prev, newDate]);
                            }
                            setTempDateInput(""); // 입력 필드 초기화
                          }
                        }}
                        className="reg-btn-base reg-btn-blue reg-btn-whitespace-nowrap"
                      >
                        추가
                      </button>
                    </div>
                    <p className="reg-info-text">
                      예: 11일, 25일, 31일처럼 특정 날짜들만 선택할 수 있습니다
                    </p>
                  </div>
                )}
              </div>

              {/* 장소 입력 섹션 */}
              <div className="reg-location-section space-y-3">
                <label className="reg-form-label">
                  장소 입력
                </label>
                <div className="reg-location-grid">
                  <div>
                    <input
                      type="text"
                      name="location"
                      value={formData.location}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="reg-form-input"
                      placeholder="장소 이름"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      name="locationLink"
                      value={formData.locationLink}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="reg-form-input"
                      placeholder="지도 링크"
                    />
                  </div>
                </div>
              </div>

              {/* 문의 정보 (공개) */}
              <div>
                <label className="reg-form-label">
                  문의
                </label>
                <input
                  type="text"
                  name="contact"
                  value={formData.contact}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  className="reg-form-input"
                  placeholder="카카오톡ID, 전화번호, SNS 등 (예: 카카오톡09502958)"
                />
                <p className="reg-info-text-mt">
                  <i className="ri-information-line mr-1"></i>
                  참가자가 문의할 수 있는 연락처를 입력해주세요 (선택사항)
                </p>
              </div>

              {/* 내용 */}
              <div>
                <label className="reg-form-label">
                  내용 (선택사항)
                </label>
                <textarea
                  name="description"
                  value={formData.description}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  rows={4}
                  className="reg-form-textarea"
                  placeholder="이벤트에 대한 자세한 설명을 입력해주세요"
                />
              </div>

              {/* 바로가기 링크 섹션 */}
              <div className="reg-links-section space-y-3">
                <label className="reg-form-label">
                  바로가기 링크 (선택사항)
                </label>
                <div className="reg-link-grid">
                  <input
                    type="url"
                    name="link1"
                    value={formData.link1}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    className="reg-form-input"
                    placeholder="링크 URL"
                  />
                  <input
                    type="text"
                    name="linkName1"
                    value={formData.linkName1}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    className="reg-form-input"
                    placeholder="링크 이름"
                  />
                </div>
              </div>

              {/* 썸네일 이미지 & 영상 섹션 */}
              <div className="reg-media-section space-y-3">
                <label className="reg-form-label">
                  썸네일 이미지 & 영상 (선택사항)
                </label>
                <p className="reg-info-text reg-text-yellow-400">
                  ⚠️ 이미지 또는 영상이 없으면 광고판에 나오지 않습니다
                </p>

                {/* 썸네일 이미지 업로드 */}
                <div className="space-y-2">
                  {imagePreview && (
                    <div className="reg-image-preview-container">
                      <img
                        src={imagePreview}
                        alt="이미지 미리보기"
                        className="reg-image-preview"
                      />
                      <div className="reg-image-buttons">
                        {isAdmin && (
                          <button
                            type="button"
                            onClick={() => {
                              // 썸네일 다운로드
                              const link = document.createElement('a');
                              link.href = imagePreview;
                              link.download = `thumbnail-${Date.now()}.jpg`;
                              document.body.appendChild(link);
                              link.click();
                              document.body.removeChild(link);
                            }}
                            className="reg-btn-sm reg-btn-blue"
                          >
                            <i className="ri-download-line mr-1"></i>
                            다운로드
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={handleOpenCropForFile}
                          className="reg-btn-sm reg-btn-purple"
                        >
                          <i className="ri-crop-line mr-1"></i>
                          편집
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview("");
                            setImageFile(null);
                          }}
                          className="reg-btn-sm reg-btn-red"
                        >
                          이미지 삭제
                        </button>
                      </div>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="reg-file-input"
                  />

                  {/* 썸네일 추출 버튼 (영상 URL이 있을 때만) */}
                  {formData.videoUrl && videoPreview.provider && (
                    <>
                      {videoPreview.provider === "youtube" ||
                      videoPreview.provider === "vimeo" ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const options = await getVideoThumbnailOptions(
                                formData.videoUrl,
                              );
                              if (options.length > 0) {
                                setThumbnailOptions(options);
                                setShowThumbnailSelector(true);
                              } else {
                                alert(
                                  "이 영상에서 썸네일을 추출할 수 없습니다.",
                                );
                              }
                            } catch (error) {
                              console.error("썸네일 추출 오류:", error);
                              alert("썸네일 추출 중 오류가 발생했습니다.");
                            }
                          }}
                          className="mt-2 w-full reg-btn-base reg-btn-green"
                        >
                          <i className="ri-image-add-line mr-1"></i>
                          썸네일 추출하기{" "}
                          {videoPreview.provider === "youtube" &&
                            "(여러 장면 선택 가능)"}
                        </button>
                      ) : (
                        <div className="mt-2">
                          <button
                            type="button"
                            disabled
                            className="w-full reg-btn-base reg-btn-disabled"
                          >
                            <i className="ri-image-add-line mr-1"></i>
                            썸네일 추출 불가능
                          </button>
                          <p className="reg-info-text-mt2 reg-text-orange-400">
                            <i className="ri-alert-line mr-1"></i>
                            Instagram/Facebook은 썸네일 자동 추출이 지원되지
                            않습니다. 위 이미지 업로드로 썸네일을 직접
                            등록해주세요.
                          </p>
                        </div>
                      )}
                    </>
                  )}

                  <p className="reg-info-text">
                    <i className="ri-information-line mr-1"></i>
                    썸네일 이미지는 이벤트 배너와 상세보기에 표시됩니다.
                  </p>
                </div>

                {/* 영상 URL 입력 */}
                <div className="space-y-2">
                  {/* 영상 프리뷰 */}
                  {videoPreview.provider && videoPreview.embedUrl && (
                    <div className="reg-video-preview-container">
                      <div className="reg-video-status erm-mb-2">
                        <i className="ri-check-line"></i>
                        <span>
                          {getVideoProviderName(formData.videoUrl)} 영상 인식됨
                          - 빌보드에서 재생됩니다
                        </span>
                      </div>
                      <div className="reg-video-wrapper">
                        <iframe
                          src={videoPreview.embedUrl}
                          className="reg-video-iframe"
                          frameBorder="0"
                          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                          allowFullScreen
                        ></iframe>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setVideoPreview({ provider: null, embedUrl: null });
                          setFormData((prev) => ({
                            ...prev,
                            videoUrl: "",
                          }));
                          setImageFile(null);
                          setImagePreview("");
                        }}
                        className="reg-video-delete-btn"
                      >
                        영상 삭제
                      </button>
                    </div>
                  )}
                  
                  {/* 영상 URL 입력창 - 항상 표시 */}
                  <div>
                    <label className="reg-form-label-sm erm-mb-1">
                      {videoPreview.provider ? '영상 주소 (복사/수정 가능)' : '영상 주소 입력'}
                    </label>
                    <input
                      type="url"
                      name="videoUrl"
                      value={formData.videoUrl}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="reg-form-input"
                      placeholder="YouTube 링크만 가능"
                    />
                  </div>
                  <div className="mt-2 space-y-1">
                    <p className="reg-info-text">
                      <i className="ri-information-line mr-1"></i>
                      영상은 전면 빌보드에서 자동재생됩니다.
                    </p>
                    <p className="reg-info-text reg-text-green-400">
                      <i className="ri-check-line mr-1"></i>
                      <strong>YouTube만 지원:</strong> 썸네일 자동 추출 + 영상
                      재생 가능
                    </p>
                    <p className="reg-info-text reg-text-red-400">
                      <i className="ri-close-line mr-1"></i>
                      <strong>Instagram, Vimeo는 지원하지 않습니다</strong>
                    </p>
                  </div>
                  {formData.videoUrl && !videoPreview.provider && (
                    <p className="reg-info-text-mt reg-text-red-400">
                      <i className="ri-alert-line mr-1"></i>
                      YouTube URL만 지원합니다. 인스타그램, 비메오는 사용할 수
                      없습니다.
                    </p>
                  )}
                </div>
              </div>

              {/* 등록자 정보 (관리자 전용, 비공개) */}
              <div className="reg-registrant-section space-y-3">
                <div className="reg-registrant-header">
                  <i className="ri-lock-line reg-text-gray-300"></i>
                  <h3 className="reg-registrant-title">
                    등록자 정보 (비공개 - 관리자만 확인 가능)
                  </h3>
                </div>
                <div className="reg-registrant-grid">
                  <div>
                    <label className="reg-form-label">
                      등록자 이름 <span className="reg-required-mark">*필수</span>
                    </label>
                    <input
                      ref={organizerNameInputRef}
                      type="text"
                      name="organizerName"
                      value={formData.organizerName}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="reg-form-input"
                      placeholder="등록자 이름"
                    />
                  </div>
                  <div>
                    <label className="reg-form-label">
                      등록자 전화번호{" "}
                      <span className="reg-required-mark">*필수</span>
                    </label>
                    <input
                      ref={organizerPhoneInputRef}
                      type="tel"
                      name="organizerPhone"
                      value={formData.organizerPhone}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="reg-form-input"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>
                <p className="reg-info-text-mt2">
                  <i className="ri-information-line mr-1"></i>
                  수정 등 문제가 있을 경우 연락받으실 번호를 입력해주세요
                </p>
              </div>

            </form>

          {/* Footer - 하단 고정 */}
          <div className="reg-modal-footer">
            <button
              type="button"
              onClick={onClose}
              className="reg-footer-btn reg-footer-btn-cancel"
            >
              취소
            </button>
            <button
              type="submit"
              form="event-form"
              disabled={isSubmitting}
              className="reg-footer-btn reg-footer-btn-submit reg-btn-whitespace-nowrap"
            >
              {isSubmitting ? "등록 중..." : "이벤트 등록"}
            </button>
          </div>
        </div>
      </div>

      {/* 썸네일 선택 모달 */}
      {showThumbnailSelector && (
        <div className="reg-thumbnail-modal-overlay">
          <div className="reg-thumbnail-modal">
            <div className="reg-thumbnail-header">
              <h2 className="reg-thumbnail-title">썸네일 선택</h2>
              <button
                onClick={() => {
                  setShowThumbnailSelector(false);
                  setThumbnailOptions([]);
                }}
                className="reg-thumbnail-close-btn"
              >
                <i className="ri-close-line reg-icon-text-2xl"></i>
              </button>
            </div>

            <div className="reg-thumbnail-body">
              <p className="reg-thumbnail-description">
                원하는 썸네일을 선택하세요. YouTube 쇼츠도 지원됩니다.
              </p>

              <div className="reg-thumbnail-grid">
                {thumbnailOptions.map((option, index) => (
                  <div
                    key={index}
                    onClick={() => handleOpenCropForThumbnail(option.url)}
                    className="reg-thumbnail-item"
                  >
                    <div className="reg-thumbnail-image-wrapper">
                      <img
                        src={option.url}
                        alt={option.label}
                        className="reg-thumbnail-image"
                      />
                      <div className="reg-thumbnail-overlay">
                        <i className="ri-checkbox-circle-fill reg-thumbnail-check-icon"></i>
                      </div>
                    </div>
                    <p className="reg-thumbnail-label">
                      {option.label}
                    </p>
                    {option.quality === "high" && (
                      <span className="reg-thumbnail-quality">
                        고화질
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 이미지 크롭 모달 */}
      <ImageCropModal
        isOpen={showCropModal}
        imageUrl={cropImageUrl}
        onClose={() => setShowCropModal(false)}
        onCropComplete={handleCropComplete}
        onDiscard={handleCropDiscard}
        onRestoreOriginal={handleRestoreOriginal}
        hasOriginal={!!originalImageFile}
        fileName="cropped-thumbnail.jpg"
      />
    </>
  );

  // createPortal을 사용하여 body에 직접 렌더링
  return createPortal(modalContent, document.body);
}
