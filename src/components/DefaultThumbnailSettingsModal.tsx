import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { supabase } from "../lib/supabase";
import "./DefaultThumbnailSettingsModal.css";

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
        .maybeSingle();

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
    <div className="dtm-modal-overlay">
      <div className="dtm-modal-container" translate="no">
        <div className="dtm-modal-body">
          <h2 className="dtm-main-title">
            기본 썸네일 설정
          </h2>

          {/* 강습용 기본 이미지 */}
          <div className="dtm-section">
            <h3 className="dtm-section-title dtm-section-title-purple">
              강습 기본 이미지
            </h3>

            <div className="dtm-preview-container">
              {classImagePreview ? (
                <div className="dtm-image-wrapper">
                  <img
                    src={classImagePreview}
                    alt="강습 기본 썸네일"
                    className="dtm-preview-image"
                  />
                  <button
                    onClick={handleRemoveClassImage}
                    className="dtm-remove-btn"
                  >
                    제거
                  </button>
                </div>
              ) : (
                <div className="dtm-no-image">
                  <span className="dtm-no-image-text">이미지 없음</span>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleClassImageChange}
              className="dtm-file-input"
            />
          </div>

          {/* 행사용 기본 이미지 */}
          <div className="dtm-section">
            <h3 className="dtm-section-title dtm-section-title-blue">
              행사 기본 이미지
            </h3>

            <div className="dtm-preview-container">
              {eventImagePreview ? (
                <div className="dtm-image-wrapper">
                  <img
                    src={eventImagePreview}
                    alt="행사 기본 썸네일"
                    className="dtm-preview-image"
                  />
                  <button
                    onClick={handleRemoveEventImage}
                    className="dtm-remove-btn"
                  >
                    제거
                  </button>
                </div>
              ) : (
                <div className="dtm-no-image">
                  <span className="dtm-no-image-text">이미지 없음</span>
                </div>
              )}
            </div>

            <input
              type="file"
              accept="image/*"
              onChange={handleEventImageChange}
              className="dtm-file-input"
            />
          </div>

          {/* 버튼 */}
          <div className="dtm-button-container">
            <button
              onClick={onClose}
              disabled={loading}
              className="dtm-button dtm-cancel-btn"
            >
              취소
            </button>
            <button
              onClick={handleSave}
              disabled={loading}
              className="dtm-button dtm-save-btn"
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
