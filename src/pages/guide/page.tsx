import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import SimpleHeader from "../../components/SimpleHeader";
import CalendarSearchModal from '../v2/components/CalendarSearchModal';
import './guide.css';

export default function GuidePage() {
  const [showGlobalSearch, setShowGlobalSearch] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  // Event search from header
  useEffect(() => {
    const handleOpenEventSearch = () => setShowGlobalSearch(true);
    window.addEventListener('openEventSearch', handleOpenEventSearch);
    return () => window.removeEventListener('openEventSearch', handleOpenEventSearch);
  }, []);

  const handleShare = async () => {
    const shareData = {
      title: '댄스빌보드 - 스윙  플랫폼',
      text: '댄스빌보드에서 다양한 이벤트와 강습, 쇼핑정보를 확인하세요!',
      url: window.location.origin, // 메인 홈페이지 주소 공유
    };

    // 1. Web Share API (모바일 기본 공유 화면) 우선 시도
    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          console.error('Share failed:', err);
          // 공유 실패 시에만 클립보드 복사 시도
          copyToClipboard();
        }
      }
    } else {
      // 2. 미지원 환경(PC 등)에서는 링크 복사
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    const url = window.location.origin;

    // 1. Clipboard API 시도 (HTTPS 또는 localhost)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(() => {
          alert('링크가 복사되었습니다!\n친구에게 공유해보세요.');
        })
        .catch(() => {
          fallbackCopy(url);
        });
    } else {
      // 2. Fallback (비보안 컨텍스트 등)
      fallbackCopy(url);
    }
  };

  const fallbackCopy = (text: string) => {
    try {
      const textArea = document.createElement("textarea");
      textArea.value = text;

      // 화면 밖으로 보내기보다 보이지 않게 처리 (iOS 이슈 방지)
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      textArea.style.top = "0";

      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();

      const successful = document.execCommand('copy');
      document.body.removeChild(textArea);

      if (successful) {
        alert('링크가 복사되었습니다!\n친구에게 공유해보세요.');
      } else {
        throw new Error('Fallback copy failed');
      }
    } catch (err) {
      prompt('이 링크를 복사해주세요:', text);
    }
  };

  return (
    <div className="guide-page-container">
      {/* Fixed Header */}


      {/* Guide Content */}
      <div className="guide-content">
        <div className="guide-hero-section">
          <h1 className="guide-hero-title">
            <i className="ri-megaphone-line"></i>
            댄스빌보드 사용 안내
          </h1>
          <p className="guide-hero-subtitle">
            누구나 자유롭게 이벤트와 강습을 <br></br>등록하고 공유할 수 있습니다
          </p>
        </div>

        {/* Feature Cards */}
        <div className="guide-features-grid">
          {/* Free Registration Card */}
          <div className="guide-feature-card guide-card-highlight">
            <div className="guide-card-icon guide-icon-primary">
              <i className="ri-user-add-line"></i>
            </div>
            <h3 className="guide-card-title">무료 등록</h3>
            <p className="guide-card-description">
              카카오 간편 로그인으로 누구나<br />
              쉽고 빠르게 일정을 등록할 수 있습니다.<br /><br />
              {/* 건전한 커뮤니티 환경 조성을 위해,<br />
              서비스 이용 시 필요한 최소한의 정보가<br />
              암호화되어 안전하게 관리됩니다.<br /><br />
              게시판은 자유롭게 닉네임으로 활동 가능하며,<br />
              문제 발생 시 원활한 해결을 위해<br />
              관리자는 동의된 정보를 조회할 수 있습니다. */}
            </p>
          </div>

          {/* How to Use Card */}
          <div className="guide-feature-card">
            <div className="guide-card-icon guide-icon-info">
              <i className="ri-information-line"></i>
            </div>
            <h3 className="guide-card-title">사용 방법</h3>
            <div className="guide-card-description guide-card-list">
              <div className="guide-list-item">
                <i className="ri-checkbox-circle-line"></i>
                <span>카카오 로그인 후 자유롭게 등록/수정</span>
              </div>
              <div className="guide-list-item">
                <i className="ri-checkbox-circle-line"></i>
                <span>게시글 열람은 로그인 없이 가능</span>
              </div>
            </div>
          </div>

          {/* Notice Card */}
          <div className="guide-feature-card guide-card-warning">
            <div className="guide-card-icon guide-icon-warning">
              <i className="ri-alert-line"></i>
            </div>
            <h3 className="guide-card-title">유의사항</h3>
            <p className="guide-card-description">
              운영 정책에 위반되거나 부적절한 게시물은<br />
              관리자에 의해 사전 통보 없이<br />
              삭제 또는 수정될 수 있습니다.
            </p>
          </div>

          {/* Practice Room Card */}
          <div className="guide-feature-card guide-card-notice">
            <div className="guide-card-icon guide-icon-notice">
              <i className="ri-music-2-line"></i>
            </div>
            <h3 className="guide-card-title">연습실 등록</h3>
            <p className="guide-card-description">
              연습실 등록을 원하시면<br />
              관리자에게 별도로 문의해 주세요.<br />
              (현재 운영 중인 연습실만 등록 가능)
            </p>
          </div>
        </div>

        {/* Share Section */}
        <div className="guide-action-section">
          <button onClick={handleShare} className="guide-share-button">
            <i className="ri-share-line"></i>
            <span>친구에게 공유하기</span>
          </button>
          <p className="guide-share-hint">
            버튼을 클릭하여 링크를 공유해 보세요
          </p>
        </div>

        {/* Contact Section */}
        <div className="guide-footer-section">
          <div className="guide-footer-content">
            <p className="guide-footer-description">
              댄스빌보드는 누구나 자유롭게 정보를 공유할 수 있는 열린 공간입니다.
            </p>
            <div className="guide-footer-divider"></div>
            <p className="guide-footer-copyright">© since 2025. 제작-joy.</p>
            <div className="guide-footer-business">
              <p className="guide-footer-business-line">사업자등록번호: 205-10-01239</p>
              <p className="guide-footer-business-line">상호: 사당연습실 리듬앤조이</p>
            </div>
            <p className="guide-footer-contact">
              Contact:{" "}
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
                className="guide-footer-phone"
              >
                <i className="ri-phone-line"></i>
                010-4801-7180
              </a>
            </p>
            <p className="guide-footer-contact" style={{ marginTop: '0.5rem' }}>
              <Link to="/privacy" className="text-gray-500 hover:text-gray-300 text-xs underline">
                개인정보 처리방침
              </Link>
            </p>
          </div>
        </div>
      </div>

      {/* Global Search Modal */}
      <CalendarSearchModal
        isOpen={showGlobalSearch}
        onClose={() => setShowGlobalSearch(false)}
        onSelectEvent={(event) => {
          setSelectedEvent(event);
        }}
        searchMode="all"
      />
    </div >
  );
}
