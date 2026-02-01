import type { Event } from "../../../lib/supabase";
import { memo } from "react";
import { createPortal } from "react-dom";
import "../../../styles/domains/events.css";

interface EventPasswordModalProps {
  event: Event;
  password: string;
  onPasswordChange: (password: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

export default memo(function EventPasswordModal({
  event,
  password,
  onPasswordChange,
  onSubmit,
  onClose,
}: EventPasswordModalProps) {
  return createPortal(
    (
      <div
        className="EPM-overlay"
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
        <div className="EPM-container">
          <h3 className="EPM-title">이벤트 수정</h3>
          <p className="EPM-description">
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
            className="EPM-input"
            placeholder="이벤트 비밀번호"
            autoFocus
          />
          <div className="EPM-buttonContainer">
            <button
              onClick={onClose}
              className="EPM-button EPM-cancelBtn"
            >
              취소
            </button>
            <button
              onClick={onSubmit}
              className="EPM-button EPM-confirmBtn"
            >
              확인
            </button>
          </div>
        </div>
      </div>
    ), document.body
  );
});
