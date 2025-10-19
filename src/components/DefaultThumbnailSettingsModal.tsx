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
  const [defaultThumbnailUrl, setDefaultThumbnailUrl] = useState<string>("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDefaultThumbnail();
    }
  }, [isOpen]);

  const loadDefaultThumbnail = async () => {
    try {
      const { data, error } = await supabase
        .from("billboard_settings")
        .select("default_thumbnail_url")
        .eq("id", 1)
        .single();

      if (error) {
        console.error("Error loading default thumbnail:", error);
      } else if (data) {
        setDefaultThumbnailUrl(data.default_thumbnail_url || "");
        setImagePreview(data.default_thumbnail_url || "");
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setImagePreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleRemoveImage = () => {
    setImageFile(null);
    setImagePreview("");
  };

  const uploadImage = async (file: File): Promise<string | null> => {
    try {
      const fileExt = file.name.split(".").pop();
      const fileName = `default-thumbnail-${Date.now()}.${fileExt}`;
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

      let thumbnailUrl = defaultThumbnailUrl;

      if (imageFile) {
        const uploadedUrl = await uploadImage(imageFile);
        if (uploadedUrl) {
          thumbnailUrl = uploadedUrl;
          
          if (defaultThumbnailUrl && defaultThumbnailUrl.includes("supabase")) {
            const oldPath = defaultThumbnailUrl.split("/").slice(-2).join("/");
            await supabase.storage.from("images").remove([oldPath]);
          }
        }
      } else if (!imagePreview) {
        thumbnailUrl = "";
        
        if (defaultThumbnailUrl && defaultThumbnailUrl.includes("supabase")) {
          const oldPath = defaultThumbnailUrl.split("/").slice(-2).join("/");
          await supabase.storage.from("images").remove([oldPath]);
        }
      }

      const { error } = await supabase
        .from("billboard_settings")
        .update({
          default_thumbnail_url: thumbnailUrl,
          updated_at: new Date().toISOString(),
        })
        .eq("id", 1);

      if (error) {
        throw error;
      }

      // localStorage에도 저장 (즉시 사용 가능하도록)
      localStorage.setItem('cached_default_thumbnail', thumbnailUrl);

      alert("기본 썸네일이 저장되었습니다.");
      onClose();
    } catch (error) {
      console.error("Error saving default thumbnail:", error);
      alert("기본 썸네일 저장 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[999999] flex items-center justify-center p-4 bg-black/80">
      <div className="bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-gray-800 border-b border-gray-700 px-6 py-4 flex items-center justify-between z-10">
          <h3 className="text-xl font-bold text-white flex items-center gap-2">
            <i className="ri-image-2-line"></i>
            기본 썸네일 설정
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white transition-colors"
          >
            <i className="ri-close-line text-2xl"></i>
          </button>
        </div>

        <div className="p-6 space-y-6">
          <div className="bg-blue-900/20 border border-blue-500/30 rounded-lg p-4">
            <p className="text-sm text-blue-300">
              <i className="ri-information-line mr-2"></i>
              Instagram/Facebook 영상 이벤트에서 썸네일이 없을 때 사용될 기본 이미지입니다.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-300 mb-2">
              기본 썸네일 이미지
            </label>
            
            {imagePreview ? (
              <div className="relative">
                <img
                  src={imagePreview}
                  alt="기본 썸네일"
                  className="w-full h-48 object-cover rounded-lg"
                />
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="absolute top-2 right-2 bg-red-600 hover:bg-red-700 text-white rounded-full p-2 transition-colors"
                >
                  <i className="ri-delete-bin-line"></i>
                </button>
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-600 rounded-lg p-8 text-center">
                <i className="ri-image-add-line text-4xl text-gray-500 mb-2"></i>
                <p className="text-gray-400 text-sm mb-3">
                  이미지를 업로드해주세요
                </p>
                <label className="inline-block bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 cursor-pointer transition-colors">
                  <i className="ri-upload-2-line mr-2"></i>
                  이미지 선택
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    className="hidden"
                  />
                </label>
              </div>
            )}

            {imagePreview && (
              <label className="mt-3 inline-block bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-4 py-2 cursor-pointer transition-colors">
                <i className="ri-refresh-line mr-2"></i>
                이미지 변경
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="hidden"
                />
              </label>
            )}
          </div>

          <div className="flex gap-3 pt-4">
            <button
              onClick={onClose}
              className="flex-1 bg-gray-700 hover:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-600 text-white py-3 rounded-lg font-semibold transition-colors"
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
