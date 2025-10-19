import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";

interface DefaultThumbnailSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function DefaultThumbnailSettingsModal({
  isOpen,
  onClose,
}: DefaultThumbnailSettingsModalProps) {
  // 강습용 기본 이미지
  const [classThumbnailUrl, setClassThumbnailUrl] = useState<string>("");
  const [classImageFile, setClassImageFile] = useState<File | null>(null);
  const [classImagePreview, setClassImagePreview] = useState<string>("");

  // 행사용 기본 이미지
  const [eventThumbnailUrl, setEventThumbnailUrl] = useState<string>("");
  const [eventImageFile, setEventImageFile] = useState<File | null>(null);
  const [eventImagePreview, setEventImagePreview] = useState<string>("");

  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDefaultThumbnails();
    }
  }, [isOpen]);

  const loadDefaultThumbnails = async () => {
    try {
      const { data, error } = await supabase
        .from("billboard_settings")
        .select("default_thumbnail_class, default_thumbnail_event")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("Error loading default thumbnails:", error);
      } else if (data) {
        setClassThumbnailUrl(data.default_thumbnail_class || "");
        setClassImagePreview(data.default_thumbnail_class || "");
        setEventThumbnailUrl(data.default_thumbnail_event || "");
        setEventImagePreview(data.default_thumbnail_event || "");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleClassImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setClassImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setClassImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleEventImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setEventImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setEventImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveClassImage = () => {
    setClassImageFile(null);
    setClassImagePreview("");
  };

  const handleRemoveEventImage = () => {
    setEventImageFile(null);
    setEventImagePreview("");
  };

  const uploadImage = async (file: File, category: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `default-thumbnail-${category}-${Date.now()}.${fileExt}`;
      const filePath = `default-thumbnails/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("images")
        .upload(filePath, file);

      if (uploadError) {
        throw uploadError;
      }

      const { data: urlData } = supabase.storage
        .from("images")
        .getPublicUrl(filePath);

      return urlData.publicUrl;
    } catch (error) {
      console.error("Error uploading image:", error);
      throw error;
    }
  };

  const handleSave = async () => {
    try {
      setLoading(true);

      let finalClassUrl = classThumbnailUrl;
      let finalEventUrl = eventThumbnailUrl;

      // 강습 이미지 처리
      if (classImageFile) {
        const uploadedUrl = await uploadImage(classImageFile, "class");
        if (uploadedUrl) {
          finalClassUrl = uploadedUrl;
          
          if (classThumbnailUrl && classThumbnailUrl.includes("supabase")) {
            const oldPath = classThumbnailUrl.split("/").slice(-2).join("/");
            await supabase.storage.from("images").remove([oldPath]);
          }
        }
      } else if (!classImagePreview) {
        finalClassUrl = "";
        
        if (classThumbnailUrl && classThumbnailUrl.includes("supabase")) {
          const oldPath = classThumbnailUrl.split("/").slice(-2).join("/");
          await supabase.storage.from("images").remove([oldPath]);
        }
      }

      // 행사 이미지 처리
      if (eventImageFile) {
        const uploadedUrl = await uploadImage(eventImageFile, "event");
        if (uploadedUrl) {
          finalEventUrl = uploadedUrl;
          
          if (eventThumbnailUrl && eventThumbnailUrl.includes("supabase")) {
            const oldPath = eventThumbnailUrl.split("/").slice(-2).join("/");
            await supabase.storage.from("images").remove([oldPath]);
          }
        }
      } else if (!eventImagePreview) {
        finalEventUrl = "";
        
        if (eventThumbnailUrl && eventThumbnailUrl.includes("supabase")) {
          const oldPath = eventThumbnailUrl.split("/").slice(-2).join("/");
          await supabase.storage.from("images").remove([oldPath]);
        }
      }

      const { error } = await supabase
        .from("billboard_settings")
        .update({
          default_thumbnail_class: finalClassUrl,
          default_thumbnail_event: finalEventUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) {
        throw error;
      }

      alert("기본 썸네일이 저장되었습니다.");
      onClose();
      window.location.reload(); // 변경사항 즉시 반영
    } catch (error) {
      console.error("Error saving default thumbnails:", error);
      alert("기본 썸네일 저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
      <div className="bg-gray-900 rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <h2 className="text-xl font-bold text-white mb-6">
            기본 썸네일 설정
          </h2>

          {/* 강습용 기본 이미지 */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-purple-400 mb-4">
              강습 기본 이미지
            </h3>
            
            <div className="mb-4">
              {classImagePreview ? (
                <div className="relative">
                  <img
                    src={classImagePreview}
                    alt="강습 기본 썸네일"
                    className="w-full h-48 object-cover rounded"
                  />
                  <button
                    onClick={handleRemoveClassImage}
                    className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                  >
                    제거
                  </button>
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-800 flex items-center justify-center rounded">
                  <span className="text-gray-400">이미지 없음</span>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleClassImageChange}
              className="w-full text-white bg-gray-800 border border-gray-700 rounded p-2"
            />
          </div>

          {/* 행사용 기본 이미지 */}
          <div className="mb-8">
            <h3 className="text-lg font-semibold text-blue-400 mb-4">
              행사 기본 이미지
            </h3>
            
            <div className="mb-4">
              {eventImagePreview ? (
                <div className="relative">
                  <img
                    src={eventImagePreview}
                    alt="행사 기본 썸네일"
                    className="w-full h-48 object-cover rounded"
                  />
                  <button
                    onClick={handleRemoveEventImage}
                    className="absolute top-2 right-2 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                  >
                    제거
                  </button>
                </div>
              ) : (
                <div className="w-full h-48 bg-gray-800 flex items-center justify-center rounded">
                  <span className="text-gray-400">이미지 없음</span>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleEventImageChange}
              className="w-full text-white bg-gray-800 border border-gray-700 rounded p-2"
            />
          </div>

          {/* 버튼 */}
          <div className="flex justify-end space-x-3 mt-6">
            <button
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600 disabled:opacity-50"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? "저장 중..." : "저장"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
