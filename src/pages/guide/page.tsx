import SimpleHeader from "../../components/SimpleHeader";
import './guide.css';

export default function GuidePage() {
  const handleShare = async () => {
    const shareData = {
      title: '광고판 - 이벤트 발견 플랫폼',
      text: '광고판에서 다양한 이벤트와 강습을 확인하세요!',
      url: window.location.origin
    };

    // Web Share API 지원 확인
    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // 사용자가 공유를 취소한 경우 무시
        if ((err as Error).name !== 'AbortError') {
          // 공유 실패 시 URL 복사
          copyToClipboard();
        }
      }
    } else {
      // Web Share API 미지원 시 URL 복사
      copyToClipboard();
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(window.location.origin)
      .then(() => {
        alert('링크가 복사되었습니다!\n친구에게 공유해보세요.');
      })
      .catch(() => {
        alert(`링크를 복사해주세요:\n${window.location.origin}`);
      });
  };

  return (
    <div className="guide-page-container" style={{ backgroundColor: "var(--page-bg-color)" }}>
      {/* Fixed Header */}
      <div
        className="guide-header"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <SimpleHeader title="안내" />
      </div>

      {/* Guide Content */}
      <div className="guide-content">
        <div className="guide-inner-content">
          <div className="guide-centered-content">
            <h2 className="guide-title">광고판 사용 안내</h2>
            
            {/* 주 문구 */}
            <div className="guide-main-message">
              <p className="guide-highlight-text">
                누구나 일정 무료 등록가능 (로그인 x),
              </p>

              <p className="guide-instructions">
                사용방법 <br />
                달력을 두번 클릭하면 일정등록폼이 나옵니다.<br />
                자율등록하시고 비번설정으로 수정가능
                <br />공공의 이익에 해가되면 삭제수정될수있습니다.
              </p>

              <p className="guide-warning-text">
                연습실 등록은 별도문의(사용불가능한 연습실은 등록불가)
              </p>
            </div>

            {/* 공유 버튼 */}
            <div className="guide-share-section">
              <button
                onClick={handleShare}
                className="guide-share-button"
              >
                <i className="ri-share-line guide-share-icon"></i>
                <span>친구에게 공유하기</span>
              </button>
              <p className="guide-share-hint">
                클릭하면 공유할 수 있습니다
              </p>
            </div>

            {/* 연락처 */}
            <div className="guide-contact-section">
              <p className="guide-site-description">
                이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.
              </p>
              <p className="guide-copyright">© since 2025. 제작-joy.</p>
              <p className="guide-contact-info">
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
                  className="guide-phone-link"
                >
                  010-4801-7180
                </a>
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
