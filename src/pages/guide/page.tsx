import SimpleHeader from "../../components/SimpleHeader";

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
    <div className="min-h-screen" style={{ backgroundColor: "var(--page-bg-color)" }}>
      {/* Fixed Header */}
      <div
        className="fixed top-0 left-0 w-full z-30 border-b border-[#22262a]"
        style={{ backgroundColor: "var(--header-bg-color)" }}
      >
        <SimpleHeader title="안내" />
      </div>

      {/* Guide Content */}
      <div className="pt-16 pb-16 px-4">
        <div className="p-6 text-white">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-bold mb-4 text-blue-400">광고판 사용 안내</h2>
            
            {/* 주 문구 */}
            <div className="mb-6">
              <p className="text-yellow-400 mb-4 text-base font-bold animate-pulse">
                누구나 일정 무료 등록가능 (로그인 x),
              </p>

              <p className="text-gray-400 text-sm mb-1">
                사용방법 <br />
                달력을 두번 클릭하면 일정등록폼이 나옵니다.<br />
                자율등록하시고 비번설정으로 수정가능
                <br />공공의 이익에 해가되면 삭제수정될수있습니다.
              </p>

              <p className="text-orange-400 text-base font-semibold mt-4">
                연습실 등록은 별도문의(사용불가능한 연습실은 등록불가)
              </p>
            </div>

            {/* 공유 버튼 */}
            <div className="mt-6">
              <button
                onClick={handleShare}
                className="bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-6 rounded-lg transition-all duration-200 flex items-center justify-center gap-2 mx-auto shadow-lg"
              >
                <i className="ri-share-line text-xl"></i>
                <span>친구에게 공유하기</span>
              </button>
              <p className="text-xs text-gray-500 mt-2">
                클릭하면 공유할 수 있습니다
              </p>
            </div>

            {/* 연락처 */}
            <div className="mt-8 pt-6 border-t border-gray-700">
              <p className="text-gray-400 text-sm mb-2">
                이 사이트는 누구나 자유롭게 입력 및 공유할 수 있습니다.
              </p>
              <p className="text-gray-400 text-sm">© since 2025. 제작-joy.</p>
              <p className="text-gray-500 text-xs mt-2">
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
                  className="text-blue-400 hover:text-blue-300 underline cursor-pointer"
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
