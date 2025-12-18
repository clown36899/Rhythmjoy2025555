import { useState, useEffect, memo } from "react";
import { supabase } from "../lib/supabase";
import { useModalHistory } from "../hooks/useModalHistory";
import "./PracticeRoomModal.css";

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
  selectedRoom?: PracticeRoom | null;
  initialRoom?: PracticeRoom | null;
  openToForm?: boolean;
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
export default memo(function PracticeRoomModal({
  isOpen,
  onClose,
  isAdminMode,
  selectedRoom: externalSelectedRoom,
  initialRoom,
  openToForm,
}: PracticeRoomModalProps) {
  const [rooms, setRooms] = useState<PracticeRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingRoom, setEditingRoom] = useState<PracticeRoom | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<PracticeRoom | null>(null);
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [formData, setFormData] = useState({
    name: "",
    address: "",
    address_link: "",
    location: "",
    description: "",
    capacity: 10,
    hourly_rate: 10000,
    contact_info: "",
    additional_link: "",
    additional_link_title: "",
    password: "",
    images: [] as string[],
  });
  const [imageItems, setImageItems] = useState<ImageItem[]>([]);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  // -------------------------------------------------------------------------
  // Data fetching
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (isOpen) {
      // openToForm이 true면 바로 등록 폼 열기
      if (openToForm) {
        setIsFormOpen(true);
        setLoading(false);
      }
      // initialRoom이 있으면 바로 상세 보기 모드로 열기
      else {
        const roomToShow = initialRoom || externalSelectedRoom;
        if (roomToShow) {
          setSelectedRoom(roomToShow);
          setLoading(false);
        } else {
          fetchRooms();
        }
      }
    } else {
      // 모달이 닫힐 때 상태 초기화
      setSelectedRoom(null);
      setEditingRoom(null);
      setIsFormOpen(false);
    }
  }, [isOpen, initialRoom, externalSelectedRoom, openToForm]);

  // Enable mobile back gesture to close modal
  useModalHistory(isOpen, onClose);

  const fetchRooms = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("practice_rooms")
        .select("*")
        .order("created_at", { ascending: true });

      if (error) {
        console.error("Error fetching practice rooms:", error);
        return;
      }

      // Parse images when stored as JSON string
      const processedData = (data ?? []).map((room) => ({
        ...room,
        images:
          typeof room.images === "string"
            ? JSON.parse(room.images)
            : (room.images ?? []),
      })) as PracticeRoom[];

      setRooms(processedData);
    } catch (err) {
      console.error("Unexpected error while fetching rooms:", err);
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
        type === "checkbox" ? (e.target as HTMLInputElement).checked : value,
    }));
  };

  // Helper with compression to prevent flickering
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
        img.onerror = reject;
        img.src = e.target?.result as string;
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const handleImageChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length + imageItems.length > 7) {
      alert("이미지는 최대 7개까지 업로드할 수 있습니다.");
      return;
    }

    // 새로운 이미지들을 기존 이미지 목록에 추가
    const newImageItems: ImageItem[] = [];

    for (const [index, file] of files.entries()) {
      const url = await fileToDataURL(file);
      newImageItems.push({
        id: `new_${Date.now()}_${index}`,
        url: url,
        file: file,
        isExisting: false,
      });
    }

    setImageItems((prev) => [...prev, ...newImageItems]);

    // 파일 입력 초기화
    e.target.value = "";
  };

  const removeImage = (id: string) => {
    setImageItems((prev) => {
      const updatedItems = prev.filter((item) => item.id !== id);
      // Data URL does not need revoke
      return updatedItems;
    });
  };

  // 드래그 앤 드롭 핸들러
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();

    if (draggedIndex === null || draggedIndex === dropIndex) {
      setDraggedIndex(null);
      return;
    }

    setImageItems((prev) => {
      const newItems = [...prev];
      const draggedItem = newItems[draggedIndex];

      // 드래그된 아이템 제거
      newItems.splice(draggedIndex, 1);

      // 새 위치에 삽입
      const adjustedDropIndex =
        draggedIndex < dropIndex ? dropIndex - 1 : dropIndex;
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
        // 이미지 리사이징 (트래픽 최적화)
        const { createResizedImages } = await import("../utils/imageResize");
        const resized = await createResizedImages(item.file);

        // 연습실 이미지는 퀄리티가 중요하므로 full(1280px) 또는 medium(1080px) 사용
        const targetImage = resized.full || resized.medium || resized.thumbnail;

        if (!targetImage) throw new Error("Image resizing failed");

        const filename = `${Date.now()}_${idx}.webp`;
        const filePath = `practice-rooms/${filename}`;

        const { error: uploadError } = await supabase.storage
          .from("images")
          .upload(filePath, targetImage, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: true
          });

        if (uploadError) {
          console.error("Storage upload error:", uploadError);
          // 실패 시 원본 시도 (혹은 플레이스홀더)
          return `https://readdy.ai/api/search-image?query=modern%20music%20practice%20room%20interior%20with%20professional%20equipment%2C%20soundproof%20walls%2C%20musical%20instruments%2C%20clean%20and%20bright%20lighting%2C%20professional%20studio%20setup&width=400&height=300&seq=${Date.now()}_${idx}&orientation=landscape`;
        }

        const { data } = supabase.storage.from("images").getPublicUrl(filePath);
        return data.publicUrl;
      } catch (err) {
        console.error("Image upload failed:", err);
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
        image: imageUrls[0] ?? "",
        price_per_hour: formData.hourly_rate,
        capacity: formData.capacity,
        equipment: "기본 장비",
        available_hours: "09:00-22:00",
        contact: formData.contact_info,
        location: formData.address ?? "미정",
        additional_link: formData.additional_link || null,
        additional_link_title: formData.additional_link_title || null,
        password: formData.password,
      };

      let error;
      if (editingRoom) {
        ({ error } = await supabase
          .from("practice_rooms")
          .update(roomData)
          .eq("id", editingRoom.id));
      } else {
        ({ error } = await supabase.from("practice_rooms").insert([roomData]));
      }

      if (error) {
        console.error("Error saving practice room:", error);
        alert("연습실 저장 중 오류가 발생했습니다.");
        return;
      }

      alert(
        editingRoom ? "연습실이 수정되었습니다." : "연습실이 등록되었습니다.",
      );
      setIsFormOpen(false);
      setEditingRoom(null);
      setFormData({
        name: "",
        address: "",
        address_link: "",
        location: "",
        description: "",
        capacity: 10,
        hourly_rate: 10000,
        contact_info: "",
        additional_link: "",
        additional_link_title: "",
        password: "",
        images: [] as string[],
      });
      setImageItems([]);

      // initialRoom이나 openToForm으로 열린 경우 모달 닫기, 아니면 목록 새로고침
      if (initialRoom || externalSelectedRoom || openToForm) {
        onClose();
      } else {
        fetchRooms();
      }
    } catch (err) {
      console.error("Unexpected error on submit:", err);
      alert("연습실 저장 중 오류가 발생했습니다.");
    }
  };

  // -------------------------------------------------------------------------
  // Edit / Delete handlers
  // -------------------------------------------------------------------------
  const handleEdit = (room: PracticeRoom) => {
    // 상세 보기 닫기
    setSelectedRoom(null);

    setEditingRoom(room);
    setFormData({
      name: room.name,
      address: room.address,
      address_link: room.address_link,
      location: "",
      description: room.description,
      capacity: 10,
      hourly_rate: 10000,
      contact_info: "",
      additional_link: room.additional_link,
      additional_link_title: room.additional_link_title || "",
      password: "",
      images: room.images,
    });

    // 기존 이미지들을 ImageItem 형태로 변환
    const existingImageItems: ImageItem[] = (
      Array.isArray(room.images) ? room.images : []
    ).map((url, index) => ({
      id: `existing_${index}`,
      url: url,
      isExisting: true,
    }));

    setImageItems(existingImageItems);
    setIsFormOpen(true);
  };

  const handleDelete = async (roomId: number) => {
    if (!confirm("연습실을 삭제하시겠습니까?")) return;

    try {
      const { error } = await supabase
        .from("practice_rooms")
        .delete()
        .eq("id", roomId);

      if (error) {
        console.error("Error deleting practice room:", error);
        alert("연습실 삭제 중 오류가 발생했습니다.");
        return;
      }

      alert("연습실이 삭제되었습니다.");
      fetchRooms();
    } catch (err) {
      console.error("Unexpected error on delete:", err);
      alert("연습실 삭제 중 오류가 발생했습니다.");
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
    // initialRoom이 있으면 모달 자체를 닫기, 없으면 목록으로 돌아가기
    if (initialRoom || externalSelectedRoom) {
      onClose();
    } else {
      setSelectedRoom(null);
      setSelectedImageIndex(0);
    }
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
      location: "",
      description: room.description,
      capacity: 10,
      hourly_rate: 10000,
      contact_info: "",
      additional_link: room.additional_link || "",
      additional_link_title: room.additional_link_title || "",
      password: "",
      images: room.images,
    });

    const existingImageItems: ImageItem[] = (
      Array.isArray(room.images) ? room.images : []
    ).map((url, index) => ({
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
    navigator.clipboard
      .writeText(text)
      .then(() => {
        alert("주소가 복사되었습니다.");
      })
      .catch(() => {
        alert("주소 복사에 실패했습니다.");
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
      const url =
        selectedRoom.address_link ||
        `https://maps.google.com/?q=${encodeURIComponent(selectedRoom.address)}`;
      window.open(url, "_blank");
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
      <div className="room-modal-overlay">
        <div className="room-modal-container">
          {/* 1. Header - Title & Edit Button */}
          <div className="room-detail-header">
            <h2 className="room-detail-title">
              {selectedRoom.name}
            </h2>
            {isAdminMode && (
              <button
                onClick={() => handleEdit(selectedRoom)}
                className="room-detail-edit-btn"
              >
                <i className="ri-edit-line"></i>
                <span>수정</span>
              </button>
            )}
          </div>

          {/* 2. Gallery Section */}
          <div className="room-gallery-container">
            {/* Main image */}
            <div className="room-gallery-main">
              <img
                src={selectedRoom.images[selectedImageIndex]}
                alt={`${selectedRoom.name} ${selectedImageIndex + 1}`}
                className="room-gallery-image"
                onClick={nextImage}
              />
              {selectedRoom.images.length > 1 && (
                <>
                  <button
                    onClick={prevImage}
                    className="room-gallery-nav-btn room-gallery-nav-btn-left"
                  >
                    <i className="ri-arrow-left-line room-gallery-nav-icon"></i>
                  </button>
                  <button
                    onClick={nextImage}
                    className="room-gallery-nav-btn room-gallery-nav-btn-right"
                  >
                    <i className="ri-arrow-right-line room-gallery-nav-icon"></i>
                  </button>

                  {/* Image counter */}
                  <div className="room-gallery-counter">
                    {selectedImageIndex + 1} / {selectedRoom.images.length}
                  </div>

                  {/* Image indicators */}
                  <div className="room-gallery-indicators">
                    {selectedRoom.images.map((_, idx) => (
                      <button
                        key={idx}
                        onClick={() => goToImage(idx)}
                        className={`room-gallery-indicator ${idx === selectedImageIndex
                          ? "room-gallery-indicator-active"
                          : ""
                          }`}
                      />
                    ))}
                  </div>
                </>
              )}
            </div>

            {/* Thumbnail list */}
            <div className="room-thumbnails-container">
              {/* Scroll arrows */}
              {selectedRoom.images.length > 3 && (
                <>
                  <button className="room-thumbnails-arrow room-thumbnails-arrow-left">
                    <i className="ri-arrow-left-s-line"></i>
                  </button>
                  <button className="room-thumbnails-arrow room-thumbnails-arrow-right">
                    <i className="ri-arrow-right-s-line"></i>
                  </button>
                </>
              )}

              <div className="room-thumbnails-list">
                {selectedRoom.images.map((image, index) => (
                  <button
                    key={index}
                    onClick={() => setSelectedImageIndex(index)}
                    className={`room-thumbnail-btn ${selectedImageIndex === index
                      ? "room-thumbnail-btn-active"
                      : "room-thumbnail-btn-inactive"
                      }`}
                  >
                    <img
                      src={image}
                      alt={`썸네일 ${index + 1}`}
                      className="room-thumbnail-image"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 3. Info Section */}
          <div className="room-info-container">
            {/* Address */}
            <div className="room-address-section">
              <div className="room-address-box">
                <div className="room-address-content">
                  <span className="room-address-text">
                    {selectedRoom.address}
                  </span>
                  <div className="room-address-btns">
                    <button
                      onClick={copyAddress}
                      className="room-copy-btn"
                    >
                      복사
                    </button>
                    <button
                      onClick={openMap}
                      className="room-map-btn"
                    >
                      지도 바로보기
                    </button>
                  </div>
                </div>
              </div>
            </div>

            {/* Description */}
            <div className="room-description-section">
              <h3 className="room-description-header">
                <i className="ri-information-line room-description-icon"></i>
                상세 정보
              </h3>
              <div className="room-description-box">
                <p className="room-description-text">
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
                className="room-additional-link"
              >
                <i className="ri-external-link-line room-additional-link-icon"></i>
                {selectedRoom.additional_link_title || "추가 정보 보기"}
              </a>
            )}

            {/* Close Button */}
            <button
              onClick={handleCloseDetails}
              className="room-detail-close-btn"
            >
              <i className="ri-close-line"></i>
              <span>닫기</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------
  // Main list & admin form
  // -------------------------------------------------
  return (
    <div className="room-modal-overlay">
      <div className="room-modal-container-list">
        <div className="room-list-padding">
          {/* Header */}
          <div className="room-list-header">
            <h2 className="room-list-title">추천연습실</h2>
            <div className="room-list-header-btns">
              {isAdminMode && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    onClick={async () => {
                      if (!confirm("모든 연습실 이미지를 최적화(WebP 변환)하시겠습니까?\n이 작업은 시간이 걸릴 수 있습니다.")) return;

                      setLoading(true);
                      try {
                        const { data: allRooms } = await supabase.from("practice_rooms").select("*");
                        if (!allRooms) return;

                        let totalUpdated = 0;
                        const { createResizedImages } = await import("../utils/imageResize");

                        for (const room of allRooms) {
                          let images = typeof room.images === 'string' ? JSON.parse(room.images) : room.images || [];
                          let changed = false;
                          const newImages = [];

                          for (let i = 0; i < images.length; i++) {
                            const url = images[i];
                            // 이미 WebP이면 건너뛰기 (선택사항)
                            if (url.includes('.webp')) {
                              newImages.push(url);
                              continue;
                            }

                            try {
                              // Fetch blob
                              const response = await fetch(url);
                              const blob = await response.blob();
                              const file = new File([blob], "image.jpg", { type: blob.type });

                              // Resize
                              const resized = await createResizedImages(file);
                              const targetImage = resized.full || resized.medium || resized.thumbnail;

                              // Upload
                              const filename = `practice-rooms/optimized_${room.id}_${i}_${Date.now()}.webp`;
                              const { error: uploadError } = await supabase.storage
                                .from("images")
                                .upload(filename, targetImage, {
                                  contentType: 'image/webp',
                                  cacheControl: '31536000',
                                  upsert: true
                                });

                              if (uploadError) throw uploadError;

                              const { data } = supabase.storage.from("images").getPublicUrl(filename);
                              newImages.push(data.publicUrl);
                              changed = true;
                            } catch (e) {
                              console.error(`Failed to optimize image for room ${room.id}:`, e);
                              newImages.push(url); // Keep original if failed
                            }
                          }

                          if (changed) {
                            await supabase
                              .from("practice_rooms")
                              .update({
                                images: JSON.stringify(newImages),
                                image: newImages[0] // Update main image too
                              })
                              .eq("id", room.id);
                            totalUpdated++;
                          }
                        }
                        alert(`작업 완료! 총 ${totalUpdated}개의 연습실 정보가 업데이트되었습니다.`);
                        fetchRooms();
                      } catch (e) {
                        console.error(e);
                        alert("이미지 최적화 중 오류가 발생했습니다.");
                      } finally {
                        setLoading(false);
                      }
                    }}
                    className="room-register-btn"
                    style={{ backgroundColor: '#10b981' }}
                  >
                    이미지 전체 최적화
                  </button>
                  <button
                    onClick={() => setIsFormOpen(true)}
                    className="room-register-btn"
                  >
                    등록
                  </button>
                </div>
              )}
              <button
                onClick={onClose}
                className="room-list-close-btn"
              >
                <i className="ri-close-line room-list-close-icon"></i>
              </button>
            </div>
          </div>

          {/* Loading / List */}
          {loading ? (
            <div className="room-loading-container">
              <div className="room-loading-spinner"></div>
            </div>
          ) : (
            <div className="room-grid">
              {filteredRooms.map((room) => (
                <div
                  key={room.id}
                  className="room-card"
                  onClick={() => handleRoomClick(room)}
                >
                  <img
                    src={room.images[0]}
                    alt={room.name}
                    className="room-card-image"
                  />
                  <div className="room-card-content">
                    <h3
                      className="room-card-title"
                      title={room.name}
                    >
                      {room.name}
                    </h3>
                    {isAdminMode && (
                      <div className="room-card-admin-btns">
                        <button
                          onClick={(e) => handleEditClick(room, e)}
                          className="room-card-edit-btn"
                        >
                          수정
                        </button>
                        <button
                          onClick={(e) => handleDeleteClick(room, e)}
                          className="room-card-delete-btn"
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
          <div className="room-contact-info">
            연습실 등록문의{" "}
            <a
              href="tel:010-4801-7180"
              onClick={(e) => {
                // 데스크탑인 경우 번호 복사, 모바일인 경우 전화 걸기
                const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
                if (!isMobile) {
                  e.preventDefault();
                  navigator.clipboard.writeText("010-4801-7180").then(() => {
                    alert("전화번호가 복사되었습니다!");
                  }).catch(() => {
                    alert("복사에 실패했습니다. 번호: 010-4801-7180");
                  });
                }
              }}
              className="room-contact-link"
            >
              010-4801-7180
            </a>
          </div>
        </div>
      </div>

      {/* Register / Edit form modal */}
      {isFormOpen && (
        <div className="room-modal-overlay-high">
          <div className="room-modal-container-form">
            <div className="room-form-padding">
              <div className="room-form-header">
                <h3 className="room-form-title">
                  {editingRoom ? "연습실 수정" : "연습실 등록"}
                </h3>
                <button
                  onClick={() => {
                    setIsFormOpen(false);
                    setEditingRoom(null);
                    setImageItems([]);
                  }}
                  className="room-form-close-btn"
                >
                  <i className="ri-close-line room-form-close-icon"></i>
                </button>
              </div>

              <form onSubmit={handleSubmit} className="room-form">
                {/* Name */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    연습실 이름 *
                  </label>
                  <input
                    type="text"
                    name="name"
                    value={formData.name}
                    onChange={handleInputChange}
                    required
                    className="room-form-input"
                  />
                </div>

                {/* Address */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    주소 *
                  </label>
                  <input
                    type="text"
                    name="address"
                    value={formData.address}
                    onChange={handleInputChange}
                    required
                    className="room-form-input"
                  />
                </div>

                {/* Address Link */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    주소 링크
                  </label>
                  <input
                    type="url"
                    name="address_link"
                    value={formData.address_link}
                    onChange={handleInputChange}
                    className="room-form-input"
                    placeholder="https://..."
                  />
                </div>

                {/* 추가 링크 */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    추가 링크 (선택사항)
                  </label>
                  <input
                    type="url"
                    name="additional_link"
                    value={formData.additional_link}
                    onChange={handleInputChange}
                    className="room-form-input room-form-link-spacing"
                    placeholder="추가 정보 링크 URL"
                  />
                  <input
                    type="text"
                    name="additional_link_title"
                    value={formData.additional_link_title}
                    onChange={handleInputChange}
                    className="room-form-input"
                    placeholder="링크 버튼 제목 (예: 예약하기, 더보기 등)"
                  />
                </div>

                {/* Description */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    설명
                  </label>
                  <textarea
                    name="description"
                    value={formData.description}
                    onChange={handleInputChange}
                    rows={4}
                    className="room-form-textarea"
                    placeholder="연습실에 대한 상세 설명을 입력하세요..."
                  />
                </div>

                {/* Image Upload */}
                <div className="room-form-group">
                  <label className="room-form-label">
                    이미지 (최대 7장)
                  </label>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                    className="room-file-input"
                  />

                  {/* Image Previews with Drag & Drop */}
                  {imageItems.length > 0 && (
                    <div className="room-image-preview-container">
                      <p className="room-drag-hint">
                        드래그하여 순서를 변경할 수 있습니다
                      </p>
                      <div className="room-image-grid">
                        {imageItems.map((item, index) => (
                          <div
                            key={item.id}
                            className={`room-image-item ${draggedIndex === index ? "room-image-item-dragging" : ""
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
                              className="room-preview-image"
                            />
                            <button
                              type="button"
                              onClick={() => removeImage(item.id)}
                              className="room-image-remove-btn"
                            >
                              <i className="ri-close-line room-image-remove-icon"></i>
                            </button>
                            {/* 순서 표시 */}
                            <div className="room-image-order">
                              {index + 1}
                            </div>
                            {/* 드래그 아이콘 */}
                            <div className="room-image-drag-icon">
                              <i className="ri-drag-move-line room-drag-icon"></i>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submit Button */}
                <div className="room-form-btns">
                  <button
                    type="button"
                    onClick={() => {
                      setIsFormOpen(false);
                      setEditingRoom(null);
                      setImageItems([]);
                    }}
                    className="room-form-cancel-btn"
                  >
                    취소
                  </button>
                  <button
                    type="submit"
                    className="room-form-submit-btn"
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
});
