
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';
import { createResizedImages } from '../utils/imageResize';

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
    password: ''
  });
  const [endDate, setEndDate] = useState<Date>(selectedDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');

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
      
      console.log('Original filename:', file.name);
      console.log('Sanitized filename:', baseFileName);

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

      console.log('📝 이벤트 등록 데이터:', eventData);
      
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
          password: ''
        });
        setImageFile(null);
        setImagePreview('');
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

              {/* 카테고리 */}
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

              {/* 장소와 주최자 */}
              <div className="grid grid-cols-2 gap-3">
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
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    주최자
                  </label>
                  <input
                    type="text"
                    name="organizer"
                    value={formData.organizer}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="주최자명"
                  />
                </div>
              </div>

              {/* 등록자 정보 (관리자 전용, 비공개) */}
              <div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">
                      등록자 이름 *(비공개)
                    </label>
                    <input
                      type="text"
                      name="organizerName"
                      value={formData.organizerName}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="등록자 이름"
                    />
                  </div>
                  <div>
                    <label className="block text-gray-300 text-sm font-medium mb-1">
                      등록자 전화번호 *(비공개)
                    </label>
                    <input
                      type="tel"
                      name="organizerPhone"
                      value={formData.organizerPhone}
                      onChange={handleInputChange}
                      onFocus={handleInputFocus}
                      required
                      className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                      placeholder="010-0000-0000"
                    />
                  </div>
                </div>
                <p className="text-xs text-gray-400 mt-1">
                  수정 등 문제가 있을 경우 연락받으실 번호를 입력해주세요
                </p>
              </div>

              {/* 포스터 이미지 업로드 - 축소 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  포스터 이미지 (선택사항)
                </label>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700 file:cursor-pointer"
                />
                {imagePreview && (
                  <div className="flex justify-center mt-2">
                    <img
                      src={imagePreview}
                      alt="미리보기"
                      className="w-24 h-32 object-cover object-top rounded-lg"
                    />
                  </div>
                )}
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
    </>
  );

  // createPortal을 사용하여 body에 직접 렌더링
  return createPortal(modalContent, document.body);
}
