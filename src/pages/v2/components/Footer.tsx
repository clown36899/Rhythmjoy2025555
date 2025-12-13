import { useState } from "react";
import { memo } from 'react';
import QRCodeModal from "../../../components/QRCodeModal";
import '../styles/Footer.css';

export default memo(function Footer() {
  const [showQRModal, setShowQRModal] = useState(false);

  return (
    <>
      <footer className="footer-container hidden">
        <div className="footer-max-w">
          <div className="footer-grid">
            <div className="footer-content-section">
              <div className="footer-content-inner">
                <div className="mb-6">
                  <p className="footer-text-yellow">
                    누구나 일정 무료 등록가능 (로그인 x),
                  </p>

                  <p className="footer-text-gray">
                    사용방법 <br></br> 달력을 두번 클릭하면 일정등록폼이 나옵니다.<br></br> 자율등록하시고 비번설정으로 수정가능
                    <br></br>공공의 이익에 해가되면 삭제수정될수있습니다.
                  </p>

                  <p className="footer-text-orange">
                    연습실 등록은 별도문의(사용불가능한 연습실은 등록불가)
                  </p>
                </div>

                <div className="footer-qr-btn-container">
                  <button
                    onClick={() => setShowQRModal(true)}
                    className="footer-qr-btn"
                    title="사이트 QR 코드 공유"
                  >
                    <span className="footer-qr-btn-inner">
                      <span className="footer-qr-btn-content">
                        <span className="footer-qr-btn-text">
                          사이트 QR 공유
                        </span>
                        <i className="ri-qr-code-line footer-qr-btn-icon"></i>
                      </span>
                    </span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="footer-divider">
            <div className="footer-copyright">
              <div className="footer-copyright-text">
                <p className="footer-copyright-line">이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.</p>
                <p className="footer-copyright-line">© since 2025. 제작-joy.</p>
              </div>
              <p className="footer-contact">
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
                  className="footer-contact-link"
                >
                  010-4801-7180
                </a>
              </p>
            </div>
            <div className="footer-builder-link-container">
              <a
                href="https://readdy.ai/?origin=logo"
                className="footer-builder-link"
              >
                Website Builder
              </a>
            </div>
          </div>
        </div>
      </footer>

      {showQRModal && (
        <QRCodeModal
          isOpen={showQRModal}
          onClose={() => setShowQRModal(false)}
        />
      )}
    </>
  );
});