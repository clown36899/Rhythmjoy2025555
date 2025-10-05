
import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

interface PracticeRoom {
  id: number;
  name: string;
  address: string;
  address_link: string;
  additional_link: string;
  images: string[];
  description: string;
  created_at?: string;
  // 보조 필드 (선택적으로 사용)
  mapUrl?: string;
  additional_link_title?: string;
  location?: string;
  hourly_rate?: number;
  contact_info?: string;
  capacity?: number;
  password?: string;
}

interface PracticeRoomModalProps {
  isOpen: boolean;
  onClose: () => void;
  isAdminMode?: boolean;
}

interface ImageItem {
  id: string;
  url: string;
  file?: File;
  isExisting: boolean;
}

/**
 * Main component – shows a list of practice rooms, a detail view,
 * and an admin‑only create / edit form.
 */
export default function PracticeRoomModal({
  isOpen,
  onClose,
  isAdminMode,
}: PracticeRoomModalProps) {
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState<PracticeRoom | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PracticeRoom | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [formData, setFormData] = useState({
    name: '',
    address: '',
    address_link: '',
    location: '',
    description: '',
    capacity: 10,
    hourly_rate: 10000,
    contact_info: '',
    additional_link: '',
    additional_link_title: '',
    password: '',
    images: [] as string[],
  });
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      fetchRooms();
    }
  }, [isOpen]);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('practice_rooms')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) {
        console.error('Error fetching practice rooms:', error);
        return;
      }

      // Parse images when stored as JSON string
      const processedData = (data ?? []).map((room) => ({
        ...room,
        images:
          typeof room.images === 'string'
            ? JSON.parse(room.images)
            : room.images ?? [],
      })) as PracticeRoom[];

      setRooms(processedData);
    } catch (err) {
      console.error('Unexpected error while fetching rooms:', err);
    } finally {
      setLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Form handlers
  // -------------------------------------------------------------------------
  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) => {
    const { name, value, type } = e.target;
    setFormData((prev) => ({
      ...prev,
      [name]:
        type === 'checkbox'
          ? (e.target as HTMLInputElement).checked
          : value,
    }));
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length + imageItems.length > 7) {
      alert('이미지는 최대 7개까지 업로드할 수 있습니다.');
      return;
    }

    // 새로운 이미지들을 기존 이미지 목록에 추가
    const newImageItems: ImageItem[] = files.map((file, index) => ({
      id: `new_${Date.now()}_${index}`,
      url: URL.createObjectURL(file),
      file: file,
      isExisting: false,
    }));

    setImageItems(prev => [...prev, ...newImageItems]);
    
    // 파일 입력 초기화
    e.target.value = '';
  };

  const removeImage = (id: string) => {
    setImageItems(prev => {
      const updatedItems = prev.filter(item => item.id !== id);
      // URL 정리 (메모리 누수 방지)
      const itemToRemove = prev.find(item => item.id === id);
      if (itemToRemove && !itemToRemove.isExisting) {
        URL.revokeObjectURL(itemToRemove.url);
      }
      return updatedItems;
    });
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    
    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    setImageItems(prev => {
      const newItems = [...prev];
      const draggedItem = newItems[draggedIndex];
      
      // 드래그된 아이템 제거
      newItems.splice(draggedIndex, 1);
      
      // 새 위치에 삽입
      const adjustedDropIndex = draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
      newItems.splice(adjustedDropIndex, 0, draggedItem);
      
      return newItems;
    });
    
    setDraggedIndex(null);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
  };

  // -------------------------------------------------------------------------
  // Image upload
  // -------------------------------------------------------------------------
  const uploadImages = async (imageItems: ImageItem[]): Promise<string[]> => {
    const uploadPromises = imageItems.map(async (item, idx) => {
      // 기존 이미지는 그대로 반환
      if (item.isExisting) {
        return item.url;
      }

      // 새 이미지만 업로드
      if (!item.file) {
        return `https://readdy.ai/api/search-image?query=modern%20music%20practice%20room%20interior%20with%20professional%20equipment%2C%20soundproof%20walls%2C%20musical%20instruments%2C%20clean%20and%20bright%20lighting%2C%20professional%20studio%20setup&width=400&height=300&seq=${Date.now()}_${idx}&orientation=landscape`;
      }

      try {
        const ext = item.file.name.split('.').pop();
        const filename = `${Date.now()}_${idx}.${ext}`;
        const filePath = `practice-rooms/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from('images')
          .upload(filePath, item.file);

        if (uploadError) {
          console.error('Storage upload error:', uploadError);
          return `https://readdy.ai/api/search-image?query=modern%20music%20practice%20room%20interior%20with%20professional%20equipment%2C%20soundproof%20walls%2C%20musical%20instruments%2C%20clean%20and%20bright%20lighting%2C%20professional%20studio%20setup&width=400&height=300&seq=${Date.now()}_${idx}&orientation=landscape`;
        }

        const { data } = supabase.storage.from('images').getPublicUrl(filePath);
        return data.publicUrl;
      } catch (err) {
        console.error('Image upload failed:', err);
        return `https://readdy.ai/api/search-image?query=modern%20music%20practice%20room%20interior%20with%20professional%20equipment%2C%20soundproof%20walls%2C%20musical%20instruments%2C%20clean%20and%20bright%20lighting%2C%20professional%20studio%20setup&width=400&height=300&seq=error${Date.now()}_${idx}&orientation=landscape`;
      }
    });

    return Promise.all(uploadPromises);
  };

  // -------------------------------------------------------------------------
  // Submit handler
  // -------------------------------------------------------------------------
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      let imageUrls: string[] = [];

      if (imageItems.length > 0) {
        imageUrls = await uploadImages(imageItems);
      } else {
        // Default placeholder image
        imageUrls = [
          `https://readdy.ai/api/search-image?query=modern%20music%20practice%20room%20interior%20with%20professional%20equipment%2C%20soundproof%20walls%2C%20musical%20instruments%2C%20clean%20and%20bright%20lighting%2C%20professional%20studio%20setup&width=400&height=300&seq=${Date.now()}&orientation=landscape`,
        ];
      }

      const roomData = {
        name: formData.name,
        address: formData.address,
        address_link: formData.address_link,
        images: JSON.stringify(imageUrls), // Store as string for compatibility
        description: formData.description,
        // Additional mandatory fields (provide sensible defaults)
        image: imageUrls[0] ?? '',
        price_per_hour: formData.hourly_rate,
        capacity: formData.capacity,
        equipment: '기본 장비',
        available_hours: '09:00-22:00',
        contact: formData.contact_info,
        location: formData.address ?? '미정',
        additional_link: formData.additional_link || null,
        additional_link_title: formData.additional_link_title || null,
        password: formData.password,
      };

      let error;
      if (editingRoom) {
        ({ error } = await supabase
          .from('practice_rooms')
          .update(roomData)
          .eq('id', editingRoom.id));
      } else {
        ({ error } = await supabase
          .from('practice_rooms')
          .insert([roomData]));
      }

      if (error) {
        console.error('Error saving practice room:', error);
        alert('연습실 저장 중 오류가 발생했습니다.');
        return;
      }

      alert(editingRoom ? '연습실이 수정되었습니다.' : '연습실이 등록되었습니다.');
      setIsFormOpen(false);
      setEditingRoom(null);
      setFormData({
        name: '',
        address: '',
        address_link: '',
        location: '',
        description: '',
        capacity: 10,
        hourly_rate: 10000,
        contact_info: '',
        additional_link: '',
        additional_link_title: '',
        password: '',
        images: [] as string[],
      });
      setImageItems([]);
      fetchRooms();
    } catch (err) {
      console.error('Unexpected error on submit:', err);
      alert('연습실 저장 중 오류가 발생했습니다.');
    }
  };

  // -------------------------------------------------------------------------
  // Edit / Delete handlers
  // -------------------------------------------------------------------------
  const handleEdit = (room: PracticeRoom) => {
    setEditingRoom(room);
    setFormData({
      name: room.name,
      address: room.address,
      address_link: room.address_link,
      location: '',
      description: room.description,
      capacity: 10,
      hourly_rate: 10000,
      contact_info: '',
      additional_link: room.additional_link,
      additional_link_title: room.additional_link_title || '',
      password: '',
      images: room.images,
    });
    
    // 기존 이미지들을 ImageItem 형태로 변환
    const existingImageItems: ImageItem[] = (Array.isArray(room.images) ? room.images : []).map((url, index) => ({
      id: `existing_${index}`,
      url: url,
      isExisting: true,
    }));
    
    setImageItems(existingImageItems);
    setIsFormOpen(true);
  };

  const handleDelete = async (roomId: number) => {
    if (!confirm('연습실을 삭제하시겠습니까?')) return;

    try {
      const { error } = await supabase
        .from('practice_rooms')
        .delete()
        .eq('id', roomId);

      if (error) {
        console.error('Error deleting practice room:', error);
        alert('연습실 삭제 중 오류가 발생했습니다.');
        return;
      }

      alert('연습실이 삭제되었습니다.');
      fetchRooms();
    } catch (err) {
      console.error('Unexpected error on delete:', err);
      alert('연습실 삭제 중 오류가 발생했습니다.');
    }
  };

  // -------------------------------------------------------------------------
  // Detail view handlers
  // -------------------------------------------------------------------------
  const handleViewDetails = (room: PracticeRoom) => {
    setSelectedRoom(room);
    setSelectedImageIndex(0);
  };

  const handleCloseDetails = () => {
    setSelectedRoom(null);
    setSelectedImageIndex(0);
  };

  // 모달 완전 닫기 함수 추가
  const handleCloseModal = () => {
    setSelectedRoom(null);
    setSelectedImageIndex(0);
    onClose();
  };

  const nextImage = () => {
    if (selectedRoom && selectedRoom.images.length > 0) {
      setSelectedImageIndex((prev) =>
        prev === selectedRoom.images.length - 1 ? 0 : prev + 1,
      );
    }
  };

  const prevImage = () => {
    if (selectedRoom && selectedRoom.images.length > 0) {
      setSelectedImageIndex((prev) =>
        prev === 0 ? selectedRoom.images.length - 1 : prev - 1,
      );
    }
  };

  const goToImage = (index: number) => {
    setSelectedImageIndex(index);
  };

  // -------------------------------------------------------------------------
  // UI helpers
  // -------------------------------------------------------------------------
  const handleRoomClick = (room: PracticeRoom) => {
    handleViewDetails(room);
  };

  const handleEditClick = (room: PracticeRoom, e: React.MouseEvent) => {
    e.stopPropagation(); // 이벤트 버블링 방지
    setEditingRoom(room);
    setFormData({
      name: room.name,
      address: room.address,
      address_link: room.address_link,
      location: '',
      description: room.description,
      capacity: 10,
      hourly_rate: 10000,
      contact_info: '',
      additional_link: room.additional_link || '',
      additional_link_title: room.additional_link_title || '',
      password: '',
      images: room.images,
    });
    
    const existingImageItems: ImageItem[] = (Array.isArray(room.images) ? room.images : []).map((url, index) => ({
      id: `existing_${index}`,
      url: url,
      isExisting: true,
    }));
    
    setImageItems(existingImageItems);
    setIsFormOpen(true);
  };

  const handleDeleteClick = (room: PracticeRoom, e: React.MouseEvent) => {
    e.stopPropagation();
    handleDelete(room.id);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      alert('주소가 복사되었습니다.');
    }).catch(() => {
      alert('주소 복사에 실패했습니다.');
    });
  };

  // New helper functions matching the modified snippet
  const copyAddress = () => {
    if (selectedRoom) {
      copyToClipboard(selectedRoom.address);
    }
  };

  const openMap = () => {
    if (selectedRoom) {
      // 사용자가 입력한 지도 주소 링크가 있으면 해당 링크 사용, 없으면 기본 Google Maps 검색
      const url = selectedRoom.address_link || `https://maps.google.com/?q=${encodeURIComponent(selectedRoom.address)}`;
      window.open(url, '_blank');
    }
  };

  const filteredRooms = rooms; // No filter applied yet

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------
  if (!isOpen) return null;

  // -------------------------------------------------
  // Detail view mode
  // -------------------------------------------------
  if (selectedRoom) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg max-w-6xl w-full max-h-[90vh] overflow-hidden mx-4 flex flex-col">
          {/* Header with navigation buttons */}
          <div className="flex-shrink-0 flex items-center justify-between p-2 border-b border-gray-200">
            <div></div> {/* 빈 공간 */}

            <h2 className="text-xl font-bold text-gray-900">{selectedRoom.name}</h2>

            <button
              onClick={handleCloseDetails}
              className="flex items-center justify-center w-8 h-8 bg-gray-100 hover:bg-gray-200 text-gray-600 hover:text-gray-800 rounded-lg transition-colors cursor-pointer"
              title="목록으로 돌아가기"
            >
              <i className="ri-close-line text-lg"></i>
            </button>
          </div>

          {/* Gallery & info */}
          <div className="flex-1 overflow-y-auto">
            <div className="grid grid-cols-1 lg:grid-cols-2 h-full">
              {/* Left: Image gallery */}
              <div className="bg-black flex flex-col">
                {/* Main image */}
                <div className="flex-1 relative bg-black flex items-center justify-center max-h-[30vh]">
                  <img
                    src={selectedRoom.images[selectedImageIndex]}
                    alt={`${selectedRoom.name} ${selectedImageIndex + 1}`}
                    className="max-w-full h-full object-contain"
                    onClick={nextImage}
                  />
                  {selectedRoom.images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-5 text-white p-3 rounded-full hover:bg-opacity-70 transition-colors cursor-pointer"
                      >
                        <i className="ri-arrow-left-line text-xl w-6 h-6 flex items-center justify-center"></i>
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-4 top-1/2 -translate-y-1/2 bg-black bg-opacity-5 text-white p-3 rounded-full hover:bg-opacity-70 transition-colors cursor-pointer"
                      >
                        <i className="ri-arrow-right-line text-xl w-6 h-6 flex items-center justify-center"></i>
                      </button>

                      {/* Image counter */}
                      <div className="absolute top-4 right-4 bg-black bg-opacity-5 text-white px-3 py-1 rounded-full text-sm">
                        {selectedImageIndex + 1} / {selectedRoom.images.length}
                      </div>

                      {/* Image indicators */}
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex space-x-2">
                        {selectedRoom.images.map((_, idx) => (
                          <button
                            key={idx}
                            onClick={() => goToImage(idx)}
                            className={`w-2 h-2 rounded-full transition-colors cursor-pointer ${
                              idx === selectedImageIndex
                                ? 'bg-white'
                                : 'bg-white bg-opacity-50 hover:bg-opacity-75'
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>

                {/* Thumbnail list */}
                <div className="bg-white p-3">
                  <div className="flex space-x-2 overflow-x-auto">
                    {selectedRoom.images.map((image, index) => (
                      <button
                        key={index}
                        onClick={() => setSelectedImageIndex(index)}
                        className={`flex-shrink-0 w-16 h-12 rounded-lg overflow-hidden border-2 transition-colors cursor-pointer ${
                          selectedImageIndex === index
                            ? 'border-blue-500'
                            : 'border-gray-600 hover:border-gray-400'
                        }`}
                      >
                        <img
                          src={image}
                          alt={`썸네일 ${index + 1}`}
                          className="w-full h-full object-cover object-top"
                        />
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right: Information */}
              <div className="bg-white p-4 flex flex-col">
                {/* Address */}
                <div className="mb-2">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <i className="ri-map-pin-line w-5 h-5 flex items-center justify-center mr-2 text-blue-600"></i>
                    위치
                  </h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    {/* Modified address block */}
                    <div className="flex items-center justify-between">
                      <span className="text-gray-900 text-sm break-all">{selectedRoom.address}</span>
                      <div className="flex gap-2 ml-4 flex-shrink-0">
                        <button
                          onClick={copyAddress}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded text-xs transition-colors"
                        >
                          복사
                        </button>
                        <button
                          onClick={openMap}
                          className="bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded text-xs transition-colors"
                        >
                          지도 바로보기
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div className="flex-1">
                  <h3 className="text-lg font-semibold text-gray-900 mb-3 flex items-center">
                    <i className="ri-information-line w-5 h-5 flex items-center justify-center mr-2 text-blue-600"></i>
                    상세 정보
                  </h3>
                  <div className="p-3 bg-gray-50 rounded-lg overflow-y-auto max-h-[200px]">
                    <p className="text-gray-700 leading-relaxed break-words whitespace-pre-wrap text-sm">
                      {selectedRoom.description}
                    </p>
                  </div>
                </div>

                {/* Additional link */}
                {selectedRoom.additional_link && (
                  <a
                    href={selectedRoom.additional_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center bg-gray-800 hover:bg-gray-900 text-white px-4 py-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <i className="ri-external-link-line mr-2"></i>
                    {selectedRoom.additional_link_title || '추가 정보 보기'}
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------
  // Main list & admin form
  // -------------------------------------------------
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg max-w-6xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          {/* Header */}
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-gray-900">연습실</h2>
            <div className="flex items-center space-x-3">
              {isAdminMode && (
                <button
                  onClick={() => setIsFormOpen(true)}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  등록
                </button>
              )}
              <button
                onClick={onClose}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <i className="ri-close-line text-2xl"></i>
              </button>
            </div>
          </div>

          {/* Loading / List */}
          {loading ? (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-2">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow cursor-pointer"
                  onClick={() => handleRoomClick(room)}
                >
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="w-full h-32 object-cover object-top"
                  />
                  <div className="p-3">
                    <h3
                      className="text-sm font-semibold text-gray-900 mb-1"
                      title={room.name}
                    >
                      {room.name}
                    </h3>
                    {isAdminMode && (
                      <div className="flex space-x-1 flex-shrink-0">
                        <button
                          onClick={(e) => handleEditClick(room, e)}
                          className="py-1 px-2 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-700 transition-colors cursor-pointer"
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(room, e)}
                          className="py-1 px-2 bg-red-600 text-white rounded text-xs hover:bg-red-700 transition-colors cursor-pointer"
                        >
                          삭제
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Register / Edit form modal */}
      {isFormOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4">
          <div className="bg-gray-800 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-4">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-bold text-white">
                  {editingRoom ? '연습실 수정' : '연습실 등록'}
                </h3>
                <button
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingRoom(null);
                    setImageItems([]);
                  }}
                  className="text-gray-400 hover:text-white transition-colors cursor-pointer"
                >
                  <i className="ri-close-line text-xl"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                {/* Name */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    연습실 이름 *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    주소 *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>

                {/* Address Link */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    주소 링크
                  </label>
                  <input
                    type="url"
                    name="address_link"
                    value={formData.address_link}
                    onChange={handleInputChange}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://..."
                  />
                </div>

                {/* 추가 링크 */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    추가 링크 (선택사항)
                  </label>
                  <input
                    type="url"
                    name="additional_link"
                    value={formData.additional_link}
                    onChange={handleInputChange}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 mb-2"
                    placeholder="추가 정보 링크 URL"
                  />
                  <input
                    type="text"
                    name="additional_link_title"
                    value={formData.additional_link_title}
                    onChange={handleInputChange}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="링크 버튼 제목 (예: 예약하기, 더보기 등)"
                  />
                </div>

                {/* Description */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    설명
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="w-full bg-gray-700 text-white rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="연습실에 대한 상세 설명을 입력하세요..."
                  />
                </div>

                {/* Image Upload */}
                <div>
                  <label className="block text-gray-300 text-sm font-medium mb-1">
                    이미지 (최대 7장)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="w-full text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white hover:file:bg-blue-700"
                  />

                  {/* Image Previews with Drag & Drop */}
                  {imageItems.length > 0 && (
                    <div className="mt-3">
                      <p className="text-gray-400 text-xs mb-2">
                        드래그하여 순서를 변경할 수 있습니다
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        {imageItems.map((item, index) => (
                          <div
                            key={item.id}
                            className={`relative cursor-move ${
                              draggedIndex === index ? 'opacity-50' : ''
                            }`}
                            draggable
                            onDragStart={(e) => handleDragStart(e, index)}
                            onDragOver={handleDragOver}
                            onDrop={(e) => handleDrop(e, index)}
                            onDragEnd={handleDragEnd}
                          >
                            <img
                              src={item.url}
                              alt={`Preview ${index + 1}`}
                              className="w-full h-20 object-cover rounded-lg border-2 border-gray-600 hover:border-gray-400 transition-colors"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(item.id)}
                              className="absolute top-1 right-1 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-700 transition-colors cursor-pointer"
                            >
                              <i className="ri-close-line text-xs"></i>
                            </button>
                            {/* 순서 표시 */}
                            <div className="absolute top-1 left-1 bg-blue-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs font-bold">
                              {index + 1}
                            </div>
                            {/* 드래그 아이콘 */}
                            <div className="absolute bottom-1 right-1 bg-gray-800 bg-opacity-70 text-white rounded p-1">
                              <i className="ri-drag-move-line text-xs"></i>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingRoom(null);
                      setImageItems([]);
                    }}
                    className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    저장
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
