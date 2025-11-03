import { useState } from "react";
import QRCodeModal from "../../../components/QRCodeModal";

export default function Footer() {
  const [showQRModal, setShowQRModal] = useState(false);

  return (
    // ⭐️ 1. 전체를 Fragment (<>)로 감싸서 두 요소를 반환
    <>
      <footer className="bg-[#1f1f1f] text-white py-12 relative z-[1] no-select">
        <div className="max-w-7xl mx-auto px-4">
          <div className="grid grid-cols-1 gap-8">
            {/* Company Info */}
            <div className="text-center">
              <div className="mb-6">
                {/* pulse 애니메이션 추가 */}
                <div className="mb-6">
                  {/* 주 문구: 강조 (노란색, 굵게, 은은한 깜빡임 pulse) */}
                  <p className="text-yellow-400 mb-4 text-base font-bold animate-pulse">
                    누구나 일정 무료 등록가능 (로그인 x),
                  </p>

                  {/* 설명글: 작고 어두운 색상 (text-sm, text-gray-400) */}
                  <p className="text-gray-400 text-sm mb-1">
                    사용방법 <br></br> 달력을 두번 클릭하면 일정등록폼이 나옵니다.<br></br> 자율등록하시고 비번설정으로 수정가능
                    <br></br>공공의 이익에 해가되면 삭제수정될수있습니다.
                  </p>

                  {/* 연습실 문구: 강조 스타일 */}
                  <p className="text-orange-400 text-base font-semibold mb-4">
                    연습실 등록은 별도문의(사용불가능한 연습실은 등록불가)
                  </p>

                  {/* ... (이후 QR 공유 버튼 코드) ... */}
                </div>




                {/* QR 공유 버튼 */}
                <div className="flex justify-center mt-4">
                  <button
                    onClick={() => setShowQRModal(true)}
                    className="flex items-center space-x-2 transition-opacity cursor-pointer group"
                    title="사이트 QR 코드 공유"
                  >
                    <span
                      // ⭐️ 배경색, 텍스트색, 호버 효과를 눈에 띄게 변경
                      className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg transition-all shadow-md group-hover:shadow-lg whitespace-nowrap"
                    >
                      <span className="inline-flex items-center gap-1.5">
                        <span className="text-sm font-bold">
                          사이트 QR 공유
                        </span>
                        <i className="ri-qr-code-line text-base"></i> {/* 아이콘 크기 약간 키움 */}
                      </span>
                    </span>
                  </button>
                </div>
              </div>

              {/* <div className="flex justify-center space-x-4">
                <a href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                  <i className="fab fa-facebook-f"></i>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                  <i className="fab fa-twitter"></i>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                  <i className="fab fa-instagram"></i>
                </a>
                <a href="#" className="text-gray-400 hover:text-white transition-colors cursor-pointer">
                  <i className="fab fa-linkedin-in"></i>
                </a>
              </div> */}
            </div>
          </div>

          <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
            <div className="text-center md:text-left">
              {/* 저작권 및 이용 안내 문구 */}
              <div className="text-gray-400 text-sm">
                <p className="text-sm">이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.</p>
                <p className="text-sm">© since 2025. 제작-joy.</p>
              </div>
              {/* 연락처 정보 */}
              <p className="text-gray-500 text-xs mt-1">
                Made by joy | Contact:{" "}
                <a
                  href="tel:010-4801-7180"
                  onClick={(e) => {
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
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
                >
                  010-4801-7180
                </a>
              </p>
            </div>
            <div className="mt-4 md:mt-0">
              <a
                href="https://readdy.ai/?origin=logo"
                className="text-gray-400 hover:text-white transition-colors text-sm cursor-pointer"
              >
                Website Builder
              </a>
            </div>
          </div>
        </div>
      </footer>

      {/* ⭐️ 2. 모달을 footer와 함께 Fragment 내부에 배치 */}
      {showQRModal && (
        <QRCodeModal
          // 🚨 Header.tsx와 동일하게 isOpen과 onClose만 넘깁니다.
          // QRCodeModal 내부에서 URL 및 기타 정보를 처리하도록 설계되어 있을 가능성이 높습니다.
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
        />
      )}
    </>
  );
}