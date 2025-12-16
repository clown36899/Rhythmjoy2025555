import { useRoutes } from "react-router-dom";
import { routes } from "./router/routes";
import { Suspense, useEffect } from "react";

function App() {
  const element = useRoutes(routes);

  // Calculate and set address bar height dynamically
  useEffect(() => {
    const updateAddressBarHeight = () => {
      // Check if mobile device
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);

      console.log('User Agent:', navigator.userAgent);
      console.log('Is Mobile:', isMobile);

      if (isMobile) {
        // Mobile: Calculate using 100vh vs window.innerHeight
        // 100vh includes the address bar space, innerHeight doesn't
        const testDiv = document.createElement('div');
        testDiv.style.position = 'fixed';
        testDiv.style.top = '0';
        testDiv.style.height = '100vh';
        testDiv.style.width = '1px';
        testDiv.style.visibility = 'hidden';
        testDiv.style.pointerEvents = 'none';
        document.body.appendChild(testDiv);

        const vh100 = testDiv.offsetHeight;
        document.body.removeChild(testDiv);

        let addressBarHeight = Math.max(0, vh100 - window.innerHeight);

        // If calculation returns 0 (e.g., in emulator), use typical mobile address bar height
        if (addressBarHeight === 0) {
          addressBarHeight = 80; // Typical mobile browser address bar height
          console.log('Mobile - Using default address bar height (emulator or hidden):', addressBarHeight);
        } else {
          console.log('Mobile - Calculated address bar height:', addressBarHeight);
        }

        // Set CSS variable with address bar height
        document.documentElement.style.setProperty('--header-height', `${addressBarHeight}px`);
      } else {
        // Desktop: Use default value
        document.documentElement.style.setProperty('--header-height', '51px');
        console.log('Desktop - Setting header height to 51px');
      }
    };

    // Initial calculation
    updateAddressBarHeight();

    // Update on resize (when address bar shows/hides on mobile)
    window.addEventListener('resize', updateAddressBarHeight);

    return () => {
      window.removeEventListener('resize', updateAddressBarHeight);
    };
  }, []);

  return (
    <Suspense fallback={
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#000000', color: 'white' }}>
        <div style={{ textAlign: 'center' }}>
          <i className="ri-loader-4-line text-4xl animate-spin text-blue-500 mb-4"></i>
          <p>로딩 중...</p>
        </div>
      </div>
    }>
      {element}
    </Suspense>
  );
}

export default App;
