import { Link } from 'react-router-dom';
import SimpleHeader from "../../components/SimpleHeader";
import './guide.css';

export default function GuidePage() {
  const handleShare = async () => {
    const shareData = {
      title: '댄스빌보드 - 이벤트 발견 플랫폼',
      text: '댄스빌보드에서 다양한 이벤트와 강습을 확인하세요!',
      url: window.location.href, // 현재 페이지 전체 주소 공유
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
      <div className="guide-header global-header">
        <SimpleHeader title="안내" />
      </div>

      {/* Guide Content */}
      <div className="guide-content">
        <div className="guide-hero-section">
          <h1 className="guide-hero-title">
            <i className="ri-megaphone-line"></i>
            댄스빌보드 사용 안내
          </h1>
          <p className="guide-hero-subtitle">
            누구나 자유롭게 이벤트와 강습을 등록하고 공유할 수 있습니다
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
              로그인 없이 누구나<br />
              일정을 무료로 등록할 수 있습니다
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
                <span>자율 등록 후 비밀번호 설정</span>
              </div>
              <div className="guide-list-item">
                <i className="ri-checkbox-circle-line"></i>
                <span>비밀번호로 수정 가능</span>
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
              관리자 판단하에<br />
              이유 불문 삭제/수정될 수 있습니다
            </p>
          </div>

          {/* Practice Room Card */}
          <div className="guide-feature-card guide-card-notice">
            <div className="guide-card-icon guide-icon-notice">
              <i className="ri-music-2-line"></i>
            </div>
            <h3 className="guide-card-title">연습실 등록</h3>
            <p className="guide-card-description">
              연습실은 별도 문의 필요<br />
              (사용 불가능한 연습실은 등록 불가)
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
            클릭하면 링크를 공유할 수 있습니다
          </p>
        </div>

        {/* Contact Section */}
        <div className="guide-footer-section">
          <div className="guide-footer-content">
            <p className="guide-footer-description">
              이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.
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
    </div>
  );
}
