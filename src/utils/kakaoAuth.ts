// 카카오 로그인 유틸리티

declare global {
  interface Window {
    Kakao: any;
  }
}

export interface KakaoUserInfo {
  id: number;
  kakao_account: {
    email?: string;
    name?: string;
    phone_number?: string;
  };
}

// 카카오 SDK 초기화
export const initKakaoSDK = () => {
  return new Promise<void>((resolve, reject) => {
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        // const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
        const jsKey = '4f36c4e35ab80c9bff7850e63341daa6'; // Share 기능과 키 일치시킴
        console.log('[KakaoAuth] Initializing with key:', jsKey);
        if (!jsKey) {
          reject(new Error('카카오 JavaScript 키가 설정되지 않았습니다.'));
          return;
        }
        window.Kakao.init(jsKey);
      }
      resolve();
    } else {
      // SDK 로드 (캐시 방지 캐시버스터 추가)
      const script = document.createElement('script');
      script.src = `https://developers.kakao.com/sdk/js/kakao.js?cb=${new Date().getTime()}`;
      script.onload = () => {
        // const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
        const jsKey = '4f36c4e35ab80c9bff7850e63341daa6'; // Share 기능과 키 일치시킴
        if (!jsKey) {
          reject(new Error('카카오 JavaScript 키가 설정되지 않았습니다.'));
          return;
        }
        window.Kakao.init(jsKey);
        resolve();
      };
      script.onerror = () => {
        reject(new Error('카카오 SDK 로드 실패'));
      };
      document.head.appendChild(script);
    }
  });
};



// 카카오 로그인 (리다이렉트 방식)
export const loginWithKakao = (): void => {
  if (!window.Kakao) {
    throw new Error('카카오 SDK가 초기화되지 않았습니다.');
  }

  // 현재 페이지 URL 저장 (로그인 후 복귀용)
  sessionStorage.setItem('kakao_login_return_url', window.location.pathname + window.location.search);

  // 리다이렉트 방식으로 카카오 로그인
  window.Kakao.Auth.authorize({
    redirectUri: `${window.location.origin}/auth/kakao-callback`,
    scope: 'account_email,profile_nickname,name,phone_number',
  });

  // 리다이렉트되므로 이 함수는 여기서 종료됨
};


// 카카오 액세스 토큰 가져오기
export const getKakaoAccessToken = (): string | null => {
  if (!window.Kakao || !window.Kakao.Auth) {
    return null;
  }
  return window.Kakao.Auth.getAccessToken();
};

// 카카오 로그아웃
export const logoutKakao = (): Promise<void> => {
  return new Promise((resolve) => {
    console.log('[KakaoAuth.logoutKakao] 시작');
    console.log('[KakaoAuth.logoutKakao] Kakao SDK 존재:', !!window.Kakao);
    console.log('[KakaoAuth.logoutKakao] Kakao.Auth 존재:', !!window.Kakao?.Auth);
    console.log('[KakaoAuth.logoutKakao] Access Token:', window.Kakao?.Auth?.getAccessToken());

    // SDK가 없거나 토큰이 없으면 즉시 종료
    if (!window.Kakao || !window.Kakao.Auth || !window.Kakao.Auth.getAccessToken()) {
      console.log('[KakaoAuth.logoutKakao] SDK 없음 또는 토큰 없음 - 즉시 종료');
      resolve();
      return;
    }

    // 1초 타임아웃 레이스 (SDK 응답 없음을 대비, 웹 브라우저 호환성 개선)
    const timeoutId = setTimeout(() => {
      console.warn('[KakaoAuth.logoutKakao] ⚠️ 타임아웃 (1초) - 강제 진행');
      resolve();
    }, 1000);

    try {
      console.log('[KakaoAuth.logoutKakao] Kakao.Auth.logout() 호출');
      window.Kakao.Auth.logout(() => {
        console.log('[KakaoAuth.logoutKakao] ✓ 콜백 실행됨');
        clearTimeout(timeoutId);
        resolve();
      });
    } catch (err) {
      console.error('[KakaoAuth.logoutKakao] ❌ 에러 발생:', err);
      clearTimeout(timeoutId);
      resolve();
    }
  });
};
