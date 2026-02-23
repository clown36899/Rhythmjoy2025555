// 카카오 로그인 유틸리티

interface KakaoAuth {
  authorize: (options: { redirectUri: string; scope: string }) => void;
  getAccessToken: () => string | null;
  logout: (callback: () => void) => void;
}

interface Kakao {
  init: (key: string) => void;
  isInitialized: () => boolean;
  Auth: KakaoAuth;
}

declare global {
  interface Window {
    Kakao: Kakao;
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
      const isAlreadyInitialized = window.Kakao.isInitialized();

      if (!isAlreadyInitialized) {
        const jsKey = '4f36c4e35ab80c9bff7850e63341daa6'; // Share 기능과 키 일치시킴

        if (!jsKey) {
          console.error('[KakaoAuth.initKakaoSDK] ❌ JavaScript 키 없음');
          reject(new Error('카카오 JavaScript 키가 설정되지 않았습니다.'));
          return;
        }

        window.Kakao.init(jsKey);
      }

      resolve();
    } else {
      console.error('[KakaoAuth.initKakaoSDK] ❌ window.Kakao not found.');
      reject(new Error('카카오 SDK가 로드되지 않았습니다.'));
    }
  });
};

// 카카오 로그인 (리다이렉트 방식)
export const loginWithKakao = (): void => {
  if (!window.Kakao) {
    console.error('[KakaoAuth.loginWithKakao] ❌ SDK 초기화 안됨');
    throw new Error('카카오 SDK가 초기화되지 않았습니다.');
  }

  // 현재 페이지 URL 저장 (로그인 후 복귀용)
  const returnUrl = window.location.pathname + window.location.search;
  sessionStorage.setItem('kakao_login_return_url', returnUrl);

  const redirectUri = `${window.location.origin}/auth/kakao-callback`;

  window.Kakao.Auth.authorize({
    redirectUri,
    scope: 'account_email,profile_nickname,name,phone_number,openid',
  });
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
    // SDK가 없거나 토큰이 없으면 즉시 종료
    if (!window.Kakao || !window.Kakao.Auth || !window.Kakao.Auth.getAccessToken()) {
      resolve();
      return;
    }

    // 1초 타임아웃 레이스
    const timeoutId = setTimeout(() => {
      console.warn('[KakaoAuth.logoutKakao] ⚠️ 타임아웃 (1초) - 강제 진행');
      resolve();
    }, 1000);

    try {
      window.Kakao.Auth.logout(() => {
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
