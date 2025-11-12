import { Event } from "../../../types/event";

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
  return (
    <div 
      className="fixed inset-0 bg-black bg-opacity-50 flex items-start justify-center z-50 p-4 pt-20 overflow-y-auto"
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
      <div className="bg-gray-800 rounded-lg p-6 w-full max-w-md">
        <h3 className="text-xl font-bold text-white mb-4">이벤트 수정</h3>
        <p className="text-gray-300 mb-4">
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
          className="w-full bg-gray-700 text-white rounded-lg px-4 py-3 mb-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="이벤트 비밀번호"
          autoFocus
        />
        <div className="flex space-x-3">
          <button
            onClick={onClose}
            className="flex-1 bg-gray-700 hover-bg-gray-600 text-gray-300 py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer"
          >
            취소
          </button>
          <button
            onClick={onSubmit}
            className="flex-1 bg-blue-600 hover-bg-blue-700 text-white py-2 px-4 rounded-lg font-medium transition-colors cursor-pointer whitespace-nowrap"
          >
            확인
          </button>
        </div>
      </div>
    </div>
  );
}
