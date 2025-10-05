
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '../lib/supabase';

interface EventRegistrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedDate: Date;
  onEventCreated: (createdDate: Date, category: string) => void;
}

export default function EventRegistrationModal({ isOpen, onClose, selectedDate, onEventCreated }: EventRegistrationModalProps) {
  const [formData, setFormData] = useState({
    title: '',
    time: '19:00',
    location: '미정',
    category: 'class',
    description: '자세한 내용은 추후 공지됩니다.',
    organizer: '주최자',
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
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [isDescriptionExpanded, setIsDescriptionExpanded] = useState(false);

  // selectedDate가 변경되면 endDate도 업데이트
  useEffect(() => {
    setEndDate(selectedDate);
  }, [selectedDate]);

  const categories = [
    { id: 'class', name: '강습' },
    { id: 'event', name: '행사' }
  ];

  const morningTimes = [
    '09:00', '09:30', '10:00', '10:30', '11:00', '11:30'
  ];

  const afternoonTimes = [
    '12:00', '12:30', '13:00', '13:30', '14:00', '14:30',
    '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30',
    '21:00', '21:30', '22:00', '22:30'
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

  const handleTimeSelect = (time: string) => {
    setFormData(prev => ({
      ...prev,
      time: time
    }));
    setShowTimeModal(false);
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

  const uploadImage = async (file: File): Promise<string> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `event-posters/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('images')
        .upload(filePath, file);

      if (uploadError) {
        console.error('Storage upload error:', uploadError);
        return `https://readdy.ai/api/search-image?query=$%7BencodeURIComponent%28formData.title%20%20%20%20event%20poster%20design%29%7D&width=300&height=400&seq=fallback${Date.now()}&orientation=portrait`;
      }

      const { data } = supabase.storage
        .from('images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (error) {
      console.error('Image upload failed:', error);
      return `https://readdy.ai/api/search-image?query=$%7BencodeURIComponent%28formData.title%20%20%20%20event%20poster%20design%29%7D&width=300&height=400&seq=error${Date.now()}&orientation=portrait`;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.password) {
      alert('이벤트 수정을 위한 비밀번호를 설정해주세요.');
      return;
    }

    setIsSubmitting(true);

    try {
      let imageUrl = '';
      
      if (imageFile) {
        imageUrl = await uploadImage(imageFile);
      } else {
        imageUrl = `https://readdy.ai/api/search-image?query=$%7BencodeURIComponent%28formData.title%20%20%20%20event%20poster%20design%29%7D&width=300&height=400&seq=new${Date.now()}&orientation=portrait`;
      }

      const year = selectedDate.getFullYear();
      const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
      const day = String(selectedDate.getDate()).padStart(2, '0');
      const localDateString = `${year}-${month}-${day}`;

      const endYear = endDate.getFullYear();
      const endMonth = String(endDate.getMonth() + 1).padStart(2, '0');
      const endDay = String(endDate.getDate()).padStart(2, '0');
      const endDateString = `${endYear}-${endMonth}-${endDay}`;

      const { error } = await supabase
        .from('events')
        .insert([
          {
            title: formData.title,
            date: localDateString,
            start_date: localDateString,
            end_date: endDateString,
            time: formData.time,
            location: formData.location,
            category: formData.category,
            price: 'Free',
            image: imageUrl,
            description: formData.description,
            organizer: formData.organizer,
            capacity: 50,
            registered: 0,
            link1: formData.link1 || null,
            link2: formData.link2 || null,
            link3: formData.link3 || null,
            link_name1: formData.linkName1 || null,
            link_name2: formData.linkName2 || null,
            link_name3: formData.linkName3 || null,
            password: formData.password
          }
        ]);

      if (error) {
        console.error('Error creating event:', error);
        alert('이벤트 등록 중 오류가 발생했습니다.');
      } else {
        alert('이벤트가 성공적으로 등록되었습니다!');
        setFormData({
          title: '',
          time: '19:00',
          location: '미정',
          category: 'class',
          description: '자세한 내용은 추후 공지됩니다.',
          organizer: '주최자',
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
        onEventCreated(selectedDate, formData.category);
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
                    value={selectedDate.toISOString().split('T')[0]}
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
                    value={endDate.toISOString().split('T')[0]}
                    min={selectedDate.toISOString().split('T')[0]}
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

              {/* 시간과 카테고리 - 한 줄로 배치 */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    시간
                  </label>
                  <div
                    onClick={() => setShowTimeModal(true)}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm cursor-pointer hover:bg-gray-600 transition-colors flex items-center justify-between"
                  >
                    <span>{formData.time}</span>
                    <i className="ri-time-line"></i>
                  </div>
                </div>
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
              </div>

              {/* 장소와 주최자 - 마진 패딩 축소 */}
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

              {/* 이벤트 설명 - 축소 */}
              <div>
                <label className="block text-gray-300 text-sm font-medium mb-1">
                  이벤트 설명
                </label>
                <div className="relative">
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    onFocus={handleInputFocus}
                    rows={isDescriptionExpanded ? 8 : 3}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none transition-all duration-300 text-sm"
                    placeholder="이벤트에 대한 자세한 설명을 입력하세요"
                  />
                  <button
                    type="button"
                    onClick={() => setIsDescriptionExpanded(!isDescriptionExpanded)}
                    className="absolute bottom-2 right-2 bg-gray-600 hover:bg-gray-500 text-gray-300 hover:text-white p-1 rounded transition-colors cursor-pointer"
                    title={isDescriptionExpanded ? "축소" : "확장"}
                  >
                    <i className={`ri-${isDescriptionExpanded ? 'contract' : 'expand'}-up-down-line text-sm`}></i>
                  </button>
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

      {/* 시간 선택 모달 */}
      {showTimeModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center p-4 pt-10 overflow-y-auto z-[9999999]">
          <div className="bg-gray-800 rounded-lg max-w-md w-full max-h-[70vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">시간 선택</h3>
                <button
                  onClick={() => setShowTimeModal(false)}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <div className="space-y-4">
                {/* 오전 */}
                <div>
                  <h4 className="text-md font-semibold text-white mb-2">오전</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {morningTimes.map(time => (
                      <button
                        key={time}
                        onClick={() => handleTimeSelect(time)}
                        className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          formData.time === time
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>

                {/* 오후 */}
                <div>
                  <h4 className="text-md font-semibold text-white mb-2">오후</h4>
                  <div className="grid grid-cols-3 gap-2">
                    {afternoonTimes.map(time => (
                      <button
                        key={time}
                        onClick={() => handleTimeSelect(time)}
                        className={`p-2 rounded-lg text-sm font-medium transition-colors cursor-pointer ${
                          formData.time === time
                            ? 'bg-blue-600 text-white'
                            : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                        }`}
                      >
                        {time}
                      </button>
                    ))}
                  </div>
                </div>
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
