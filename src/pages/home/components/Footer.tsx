
export default function Footer() {
  return (
    <footer className="bg-[#1f1f1f] text-white py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid grid-cols-1 gap-8">
          {/* Company Info */}
          <div className="text-center">
            <div className="mb-6">
              <p className="text-gray-400 mb-4">누구나 무료로 입력가능, 춤추고 놀기위한 일정표</p>
            </div>
            <div className="flex justify-center space-x-4">
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
            </div>
          </div>
        </div>

        <div className="border-t border-gray-800 mt-8 pt-8 flex flex-col md:flex-row justify-between items-center">
          <div className="text-center md:text-left">
            <p className="text-gray-400 text-sm">
              © 2024 행사공지. All rights reserved.
            </p>
            <p className="text-gray-500 text-xs mt-1">
              Made by joy | Contact:{" "}
              <a
                href="tel:010-4801-7180"
                onClick={(e) => {
                  // 데스크탑인 경우 번호 복사, 모바일인 경우 전화 걸기
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
  );
}
