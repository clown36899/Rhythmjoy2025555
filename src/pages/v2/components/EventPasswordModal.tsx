import type { Event } from "../../../lib/supabase";
import { createPortal } from "react-dom";
import "../../../styles/components/EventPasswordModal.css";

interface EventPasswordModalProps {
  event: Event;
  password: string;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default function EventPasswordModal({
  event,
  password,
  onPasswordChange,
  onSubmit,
  onClose,
}: EventPasswordModalProps) {
  return createPortal(
    (
      <div
        className="epm-modal-overlay"
        onTouchStartCapture={(e) => {
          e.stopPropagation();
        }}
        onTouchMoveCapture={(e) => {
          if (e.target === e.currentTarget) {
            e.preventDefault();
            e.stopPropagation();
          }
        }}
        onTouchEndCapture={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="epm-modal-container">
          <h3 className="epm-title">이벤트 수정</h3>
          <p className="epm-description">
            &quot;{event.title}&quot; 이벤트를 수정하려면 비밀번호를
            입력하세요.
          </p>
          <input
            type="password"
            value={password}
            onChange={(e) => onPasswordChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                onSubmit();
              }
            }}
            className="epm-input"
            placeholder="이벤트 비밀번호"
            autoFocus
          />
          <div className="epm-button-container">
            <button
              onClick={onClose}
              className="epm-button epm-cancel-btn"
            >
              취소
            </button>
            <button
              onClick={onSubmit}
              className="epm-button epm-confirm-btn"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    ), document.body
  );
}
