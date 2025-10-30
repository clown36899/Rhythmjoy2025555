import SimpleHeader from "../../components/SimpleHeader";

export default function GuidePage() {
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
        <div className="max-w-2xl mx-auto py-8 space-y-6">
          <div className="text-gray-300 space-y-4">
            <p className="text-lg leading-relaxed">
              광고판은 강습과 행사 정보를 공유하는 플랫폼입니다.
            </p>
            <p className="leading-relaxed">
              무료로 이벤트를 등록하고, 날짜별로 확인할 수 있습니다.
            </p>
          </div>

          <div className="border-t border-gray-700 pt-6">
            <h3 className="text-xl font-bold text-white mb-3">문의</h3>
            <p className="text-gray-300">
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
  );
}
