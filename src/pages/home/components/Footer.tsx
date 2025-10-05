
export default function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
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
              Made by joy | Contact: 010-4801-7180
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
