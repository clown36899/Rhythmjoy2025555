
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { createResizedImages } from '../utils/imageResize';
import { parseVideoUrl, isValidVideoUrl, getVideoProviderName } from '../utils/videoEmbed';
import { getVideoThumbnailOptions, downloadThumbnailAsBlob, type VideoThumbnailOption } from '../utils/videoThumbnail';

interface EventRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onEventCreated: (createdDate: Date) => void;
}

const formatDateForInput = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function EventRegistrationModal({ isOpen, onClose, selectedDate, onEventCreated }: EventRegistrationModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    location: '',
    category: 'class',
    organizer: '',
    organizerName: '',
    organizerPhone: '',
    link1: '',
    link2: '',
    link3: '',
    linkName1: '',
    linkName2: '',
    linkName3: '',
    password: '',
    videoUrl: ''
  });
  const [endDate, setEndDate] = useState<Date>(selectedDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [videoPreview, setVideoPreview] = useState<{ provider: string | null; embedUrl: string | null }>({ provider: null, embedUrl: null });
  const [showThumbnailSelector, setShowThumbnailSelector] = useState(false);
  const [thumbnailOptions, setThumbnailOptions] = useState<VideoThumbnailOption[]>([]);

  // selectedDate가 변경되면 endDate도 업데이트
  useEffect(() => {
    setEndDate(selectedDate);
  }, [selectedDate]);

  const categories = [
    { id: 'class', name: '강습' },
    { id: 'event', name: '행사' }
  ];

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));

    if (name === 'videoUrl') {
      if (value.trim() === '') {
        setVideoPreview({ provider: null, embedUrl: null });
      } else {
        const videoInfo = parseVideoUrl(value);
        setVideoPreview({ 
          provider: videoInfo.provider, 
          embedUrl: videoInfo.embedUrl 
        });
        
        if (videoInfo.provider) {
          setImageFile(null);
          setImagePreview('');
        }
      }
    }
  };

  const handleInputFocus = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    // 모바일에서 키보드가 올라올 시간을 주기 위해 약간의 지연
    setTimeout(() => {
      e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 300);
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onload = (e) => {
        setImagePreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
      
      setFormData(prev => ({
        ...prev,
        videoUrl: ''
      }));
      setVideoPreview({ provider: null, embedUrl: null });
    }
  };

  const sanitizeFileName = (fileName: string): string => {
    // 파일명에서 확장자 제거
    const nameWithoutExt = fileName.split('.')[0];
    
    // 전각 문자를 반각으로 변환
    let normalized = nameWithoutExt.replace(/[\uFF01-\uFF5E]/g, (ch) => 
      String.fromCharCode(ch.charCodeAt(0) - 0xFEE0)
    );
    
    // 영문, 숫자, 하이픈, 언더스코어만 남기고 나머지는 제거
    normalized = normalized.replace(/[^a-zA-Z0-9\-_]/g, '');
    
    // 연속된 특수문자 제거
    normalized = normalized.replace(/[\-_]+/g, '_');
    
    // 앞뒤 특수문자 제거
    normalized = normalized.replace(/^[\-_]+|[\-_]+$/g, '');
    
    return normalized || 'image';
  };

  const uploadImages = async (file: File): Promise<{
    thumbnail: string;
    medium: string;
    full: string;
  }> => {
    try {
      const resizedImages = await createResizedImages(file);
      const timestamp = Date.now();
      const baseFileName = sanitizeFileName(file.name);

      const uploadPromises = [
        {
          file: resizedImages.thumbnail,
          path: `event-posters/thumbnail/${baseFileName}_${timestamp}_thumb.jpg`,
          key: 'thumbnail' as const
        },
        {
          file: resizedImages.medium,
          path: `event-posters/medium/${baseFileName}_${timestamp}_medium.jpg`,
          key: 'medium' as const
        },
        {
          file: resizedImages.full,
          path: `event-posters/full/${baseFileName}_${timestamp}_full.jpg`,
          key: 'full' as const
        }
      ];

      const results = await Promise.all(
        uploadPromises.map(async ({ file, path, key }) => {
          const { error } = await supabase.storage
            .from('images')
            .upload(path, file, {
              cacheControl: '31536000',
              upsert: true
            });

          if (error) {
            console.error(`${key} upload error:`, error);
            throw new Error(`이미지 업로드 실패 (${key}): ${error.message}`);
          }

          const { data } = supabase.storage
            .from('images')
            .getPublicUrl(path);

          return { key, url: data.publicUrl };
        })
      );

      return {
        thumbnail: results.find(r => r.key === 'thumbnail')?.url || '',
        medium: results.find(r => r.key === 'medium')?.url || '',
        full: results.find(r => r.key === 'full')?.url || ''
      };
    } catch (error) {
      console.error('Image upload failed:', error);
      const errorMessage = error instanceof Error ? error.message : '이미지 업로드 중 오류가 발생했습니다.';
      alert(errorMessage);
      throw error;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.password) {
      alert('이벤트 수정을 위한 비밀번호를 설정해주세요.');
      return;
    }

    if (!formData.organizerName) {
      alert('등록자 이름을 입력해주세요.');
      return;
    }

    if (!formData.organizerPhone) {
      alert('등록자 전화번호를 입력해주세요.');
      return;
    }

    // 영상 URL 유효성 검증
    if (formData.videoUrl && !isValidVideoUrl(formData.videoUrl)) {
      alert('지원하지 않는 영상 URL입니다. YouTube, Instagram, Facebook, Vimeo 링크를 사용해주세요.');
      return;
    }

    // YouTube/Vimeo URL이 있고 썸네일이 없으면 추출 필수
    if (formData.videoUrl && !imageFile && !imagePreview) {
      const videoInfo = parseVideoUrl(formData.videoUrl);
      if (videoInfo.provider === 'youtube' || videoInfo.provider === 'vimeo') {
        alert('YouTube 또는 Vimeo 영상은 썸네일 이미지가 필요합니다. 이미지를 업로드하거나 썸네일 추출 기능을 사용해주세요.');
        return;
      }
    }

    // 이미지와 영상 중 하나는 있어야 함 (선택사항이므로 둘 다 없어도 됨)

    // 링크 유효성 검증: 제목과 주소가 짝을 이루어야 함
    if (formData.linkName1 && !formData.link1) {
      alert('링크1 제목을 입력했다면 링크 주소도 입력해주세요.');
      return;
    }
    if (formData.link1 && !formData.linkName1) {
      alert('링크1 주소를 입력했다면 링크 제목도 입력해주세요.');
      return;
    }
    if (formData.linkName2 && !formData.link2) {
      alert('링크2 제목을 입력했다면 링크 주소도 입력해주세요.');
      return;
    }
    if (formData.link2 && !formData.linkName2) {
      alert('링크2 주소를 입력했다면 링크 제목도 입력해주세요.');
      return;
    }
    if (formData.linkName3 && !formData.link3) {
      alert('링크3 제목을 입력했다면 링크 주소도 입력해주세요.');
      return;
    }
    if (formData.link3 && !formData.linkName3) {
      alert('링크3 주소를 입력했다면 링크 제목도 입력해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrls = {
        thumbnail: '',
        medium: '',
        full: ''
      };
      
      if (imageFile) {
        imageUrls = await uploadImages(imageFile);
      }

      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const localDateString = `${year}-${month}-${day}`;

      const endYear = endDate.getFullYear();
      const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDate.getDate()).padStart(2, '0');
      const endDateString = `${endYear}-${endMonth}-${endDay}`;

      const eventData = {
        title: formData.title,
        date: localDateString,
        start_date: localDateString,
        end_date: endDateString,
        time: '00:00',
        location: formData.location,
        category: formData.category,
        price: 'Free',
        image: imageUrls.full || '',
        image_thumbnail: imageUrls.thumbnail || null,
        image_medium: imageUrls.medium || null,
        image_full: imageUrls.full || null,
        video_url: formData.videoUrl || null,
        description: '',
        organizer: formData.organizer,
        organizer_name: formData.organizerName,
        organizer_phone: formData.organizerPhone,
        capacity: 50,
        registered: 0,
        link1: formData.link1 || null,
        link2: formData.link2 || null,
        link3: formData.link3 || null,
        link_name1: formData.linkName1 || null,
        link_name2: formData.linkName2 || null,
        link_name3: formData.linkName3 || null,
        password: formData.password,
        created_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('events')
        .insert([eventData]);

      if (error) {
        console.error('Error creating event:', error);
        alert('이벤트 등록 중 오류가 발생했습니다.');
      } else {
        alert('이벤트가 성공적으로 등록되었습니다!');
        setFormData({
          title: '',
          location: '',
          category: 'class',
          organizer: '',
          organizerName: '',
          organizerPhone: '',
          link1: '',
          link2: '',
          link3: '',
          linkName1: '',
          linkName2: '',
          linkName3: '',
          password: '',
          videoUrl: ''
        });
        setImageFile(null);
        setImagePreview('');
        setVideoPreview({ provider: null, embedUrl: null });
        onEventCreated(selectedDate);
        onClose();
      }
    } catch (error) {
      console.error('Error:', error);
      alert('이벤트 등록 중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 pt-10 z-[999999] overflow-y-auto">
        <div className="bg-gray-800 rounded-lg max-w-2xl w-full mb-10 relative z-[999999]">
          <div className="p-4">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-bold text-white">
                {selectedDate.toLocaleDateString('ko-KR', { 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric',
                  weekday: 'long'
                })} 이벤트 등록
              </h2>
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-white transition-colors cursor-pointer"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-3">
              {/* 이벤트 제목 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  이벤트 제목 *
                </label>
                <input
                  type="text"
                  name="title"
                  value={formData.title}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  required
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="이벤트 제목을 입력하세요"
                />
              </div>

              {/* 시작일과 종료일 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    시작일
                  </label>
                  <input
                    type="date"
                    value={formatDateForInput(selectedDate)}
                    disabled
                    className="w-full bg-gray-600 text-gray-300 rounded-lg px-3 py-2 cursor-not-allowed"
                  />
                </div>
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    종료일
                  </label>
                  <input
                    type="date"
                    value={formatDateForInput(endDate)}
                    min={formatDateForInput(selectedDate)}
                    onChange={(e) => setEndDate(new Date(e.target.value + 'T00:00:00'))}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>

              {/* 이벤트 비밀번호 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  이벤트 수정 비밀번호 *
                </label>
                <input
                  type="password"
                  name="password"
                  value={formData.password}
                  onChange={handleInputChange}
                  onFocus={handleInputFocus}
                  required
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="이벤트 수정을 위한 비밀번호를 설정하세요"
                />
                <p className="text-gray-400 text-xs mt-1">
                  이 비밀번호로 나중에 이벤트를 수정하거나 삭제할 수 있습니다.
                </p>
              </div>

              {/* 카테고리와 장소 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    카테고리
                  </label>
                  <select
                    name="category"
                    value={formData.category}
                    onChange={handleInputChange}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 pr-8"
                  >
                    {categories.map(category => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    장소
                  </label>
                  <input
                    type="text"
                    name="location"
                    value={formData.location}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="이벤트 장소"
                  />
                </div>
              </div>

              {/* 등록자 정보 (관리자 전용, 비공개) */}
              <div className="bg-orange-900/20 border border-orange-700/50 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <i className="ri-lock-line text-orange-400"></i>
                  <h3 className="text-orange-400 text-sm font-bold">등록자 정보 (비공개 - 관리자만 확인 가능)</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-orange-300 text-sm font-medium mb-1">
                      등록자 이름 <span className="text-red-400">*필수</span>
                    </label>
                    <input
                      type="text"
                      name="organizerName"
                      value={formData.organizerName}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="w-full bg-gray-800 border border-orange-700/30 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="등록자 이름"
                    />
                  </div>
                  <div>
                    <label className="block text-orange-300 text-sm font-medium mb-1">
                      등록자 전화번호 <span className="text-red-400">*필수</span>
                    </label>
                    <input
                      type="tel"
                      name="organizerPhone"
                      value={formData.organizerPhone}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="w-full bg-gray-800 border border-orange-700/30 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-orange-500"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>
                <p className="text-xs text-orange-300/80 mt-2">
                  <i className="ri-information-line mr-1"></i>
                  수정 등 문제가 있을 경우 연락받으실 번호를 입력해주세요
                </p>
              </div>

              {/* 포스터 이미지 업로드 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  포스터 이미지 (선택사항)
                </label>
                <div className="space-y-2">
                  {imagePreview && (
                    <div className="relative">
                      <img
                        src={imagePreview}
                        alt="이미지 미리보기"
                        className="w-full h-48 object-cover rounded-lg"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setImagePreview("");
                          setImageFile(null);
                        }}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                      >
                        이미지 삭제
                      </button>
                    </div>
                  )}
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                  />
                  <p className="text-xs text-gray-400">
                    <i className="ri-information-line mr-1"></i>
                    썸네일은 이벤트 배너와 상세보기에 표시됩니다.
                  </p>
                </div>
              </div>

              {/* 영상 URL 입력 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  영상 URL (선택사항)
                </label>
                <div className="space-y-2">
                  {/* 영상 프리뷰 */}
                  {videoPreview.provider && videoPreview.embedUrl && (
                    <div className="relative">
                      <div className="flex items-center gap-2 text-sm text-green-400 mb-2">
                        <i className="ri-check-line"></i>
                        <span>{getVideoProviderName(formData.videoUrl)} 영상 인식됨 - 빌보드에서 재생됩니다</span>
                      </div>
                      <div className="relative w-full" style={{ paddingTop: '56.25%' }}>
                        <iframe
                          src={videoPreview.embedUrl}
                          className="absolute top-0 left-0 w-full h-full rounded-lg"
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
                            videoUrl: '',
                          }));
                          // 추출 썸네일도 삭제
                          setImageFile(null);
                          setImagePreview('');
                        }}
                        className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                      >
                        영상 삭제
                      </button>
                    </div>
                  )}
                  
                  {/* 추출 썸네일 미리보기 (영상 URL이 있을 때만) */}
                  {formData.videoUrl && (imagePreview || imageFile) && (
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-sm text-blue-400 mb-1">
                        <i className="ri-image-line"></i>
                        <span>추출 썸네일 (리스트/상세보기용)</span>
                      </div>
                      <div className="relative">
                        <img
                          src={imagePreview}
                          alt="추출 썸네일"
                          className="w-full h-48 object-cover rounded-lg"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setImagePreview("");
                            setImageFile(null);
                          }}
                          className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded-lg transition-colors cursor-pointer text-xs font-medium"
                        >
                          썸네일 삭제
                        </button>
                      </div>
                      {/* 썸네일 변경 버튼 */}
                      {(videoPreview.provider === 'youtube' || videoPreview.provider === 'vimeo') && (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const options = await getVideoThumbnailOptions(formData.videoUrl);
                              if (options.length > 0) {
                                setThumbnailOptions(options);
                                setShowThumbnailSelector(true);
                              } else {
                                alert('이 영상에서 썸네일을 추출할 수 없습니다.');
                              }
                            } catch (error) {
                              console.error('썸네일 추출 오류:', error);
                              alert('썸네일 추출 중 오류가 발생했습니다.');
                            }
                          }}
                          className="w-full bg-purple-600 hover:bg-purple-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                        >
                          <i className="ri-refresh-line mr-1"></i>
                          썸네일 변경하기
                        </button>
                      )}
                    </div>
                  )}
                  
                  <input
                    type="url"
                    name="videoUrl"
                    value={formData.videoUrl}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="YouTube, Instagram, Facebook, Vimeo 링크"
                  />
                  <div className="mt-2 space-y-1">
                    <p className="text-xs text-gray-400">
                      <i className="ri-information-line mr-1"></i>
                      영상은 전면 빌보드에서 자동재생됩니다.
                    </p>
                    <p className="text-xs text-green-400">
                      <i className="ri-check-line mr-1"></i>
                      <strong>YouTube, Vimeo:</strong> 썸네일 자동 추출 + 영상 재생 가능
                    </p>
                    <p className="text-xs text-orange-400">
                      <i className="ri-alert-line mr-1"></i>
                      <strong>Instagram, Facebook:</strong> 빌보드 재생만 가능 (썸네일은 위 이미지 업로드로 직접 등록)
                    </p>
                  </div>
                  {formData.videoUrl && !videoPreview.provider && (
                    <p className="text-xs text-red-400 mt-1">
                      지원하지 않는 URL입니다. YouTube, Instagram, Facebook, Vimeo 링크를 사용해주세요.
                    </p>
                  )}
                  {/* 썸네일 추출 버튼 */}
                  {formData.videoUrl && videoPreview.provider && (
                    <>
                      {(videoPreview.provider === 'youtube' || videoPreview.provider === 'vimeo') ? (
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const options = await getVideoThumbnailOptions(formData.videoUrl);
                              if (options.length > 0) {
                                setThumbnailOptions(options);
                                setShowThumbnailSelector(true);
                              } else {
                                alert('이 영상에서 썸네일을 추출할 수 없습니다.');
                              }
                            } catch (error) {
                              console.error('썸네일 추출 오류:', error);
                              alert('썸네일 추출 중 오류가 발생했습니다.');
                            }
                          }}
                          className="mt-2 w-full bg-green-600 hover:bg-green-700 text-white rounded-lg px-3 py-2 text-sm font-medium transition-colors"
                        >
                          <i className="ri-image-add-line mr-1"></i>
                          썸네일 추출하기 {videoPreview.provider === 'youtube' && '(여러 장면 선택 가능)'}
                        </button>
                      ) : (
                        <div className="mt-2">
                          <button
                            type="button"
                            disabled
                            className="w-full bg-gray-600 text-gray-400 rounded-lg px-3 py-2 text-sm font-medium cursor-not-allowed opacity-60"
                          >
                            <i className="ri-image-add-line mr-1"></i>
                            썸네일 추출 불가능
                          </button>
                          <p className="text-xs text-orange-400 mt-2">
                            <i className="ri-alert-line mr-1"></i>
                            Instagram/Facebook은 썸네일 자동 추출이 지원되지 않습니다. 위 이미지 업로드로 썸네일을 직접 등록해주세요.
                          </p>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </div>

              {/* 바로가기 링크 3개 - 축소 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  바로가기 링크 (선택사항)
                </label>
                <div className="space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="url"
                      name="link1"
                      value={formData.link1}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 1 URL"
                    />
                    <input
                      type="text"
                      name="linkName1"
                      value={formData.linkName1}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 1 이름"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="url"
                      name="link2"
                      value={formData.link2}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 2 URL"
                    />
                    <input
                      type="text"
                      name="linkName2"
                      value={formData.linkName2}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 2 이름"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="url"
                      name="link3"
                      value={formData.link3}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 3 URL"
                    />
                    <input
                      type="text"
                      name="linkName3"
                      value={formData.linkName3}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="링크 3 이름"
                    />
                  </div>
                </div>
              </div>

              {/* 버튼 - 축소 */}
              <div className="flex space-x-3 pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="flex-1 bg-gray-700 hover:bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-semibold transition-colors cursor-pointer"
                >
                  취소
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 text-white py-2 px-4 rounded-lg font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                >
                  {isSubmitting ? '등록 중...' : '이벤트 등록'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* 썸네일 선택 모달 */}
      {showThumbnailSelector && (
        <div className="fixed inset-0 z-[10000000] flex items-center justify-center p-4" style={{ backgroundColor: "rgba(0, 0, 0, 0.9)" }}>
          <div className="bg-gray-900 rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-gray-900 border-b border-gray-700 p-4 flex justify-between items-center z-10">
              <h2 className="text-xl font-bold text-white">썸네일 선택</h2>
              <button
                onClick={() => {
                  setShowThumbnailSelector(false);
                  setThumbnailOptions([]);
                }}
                className="text-gray-400 hover:text-white transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
            
            <div className="p-6">
              <p className="text-gray-400 text-sm mb-4">
                원하는 썸네일을 선택하세요. YouTube 쇼츠도 지원됩니다.
              </p>
              
              <div className="grid grid-cols-2 gap-4">
                {thumbnailOptions.map((option, index) => (
                  <div
                    key={index}
                    onClick={async () => {
                      try {
                        const blob = await downloadThumbnailAsBlob(option.url);
                        if (blob) {
                          const file = new File([blob], 'video-thumbnail.jpg', { type: 'image/jpeg' });
                          setImageFile(file);
                          setImagePreview(URL.createObjectURL(blob));
                          
                          // 영상 URL은 유지 (빌보드에서 영상 재생, 리스트에서는 썸네일 표시)
                          // 영상 URL 삭제하지 않음!
                          
                          // 모달 닫기
                          setShowThumbnailSelector(false);
                          setThumbnailOptions([]);
                          
                          alert('썸네일이 추출되었습니다! 리스트에서는 썸네일이, 빌보드에서는 영상이 표시됩니다.');
                        } else {
                          alert('썸네일 다운로드에 실패했습니다.');
                        }
                      } catch (error) {
                        console.error('썸네일 다운로드 오류:', error);
                        alert('썸네일 다운로드 중 오류가 발생했습니다.');
                      }
                    }}
                    className="cursor-pointer group"
                  >
                    <div className="relative aspect-video rounded-lg overflow-hidden bg-gray-800 border-2 border-gray-700 group-hover:border-blue-500 transition-colors">
                      <img
                        src={option.url}
                        alt={option.label}
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all flex items-center justify-center">
                        <i className="ri-checkbox-circle-fill text-4xl text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity"></i>
                      </div>
                    </div>
                    <p className="text-center text-sm text-gray-300 mt-2">{option.label}</p>
                    {option.quality === 'high' && (
                      <span className="block text-center text-xs text-green-400 mt-1">고화질</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // createPortal을 사용하여 body에 직접 렌더링
  return createPortal(modalContent, document.body);
}
