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
  console.log('[KakaoAuth.initKakaoSDK] 🚀 SDK 초기화 시작');
  return new Promise<void>((resolve, reject) => {
    console.log('[KakaoAuth.initKakaoSDK] window.Kakao 존재 여부:', !!window.Kakao);

    if (window.Kakao) {
      const isAlreadyInitialized = window.Kakao.isInitialized();
      console.log('[KakaoAuth.initKakaoSDK] 이미 초기화됨:', isAlreadyInitialized);

      if (!isAlreadyInitialized) {
        // const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
        const jsKey = '4f36c4e35ab80c9bff7850e63341daa6'; // Share 기능과 키 일치시킴
        console.log('[KakaoAuth.initKakaoSDK] 초기화 시도 - Key:', jsKey?.substring(0, 10) + '...');

        if (!jsKey) {
          console.error('[KakaoAuth.initKakaoSDK] ❌ JavaScript 키 없음');
          reject(new Error('카카오 JavaScript 키가 설정되지 않았습니다.'));
          return;
        }

        window.Kakao.init(jsKey);
        console.log('[KakaoAuth.initKakaoSDK] ✅ SDK 초기화 완료');
      } else {
        console.log('[KakaoAuth.initKakaoSDK] ✅ 이미 초기화된 SDK 사용');
      }

      resolve();
    } else {
      // SDK가 로드되지 않은 경우 (index.html에서 로드 실패 등)
      // 중복 로드 방지를 위해 에러 반환 (또는 재시도 로직으로 변경 가능)
      console.error('[KakaoAuth.initKakaoSDK] ❌ window.Kakao not found. Check index.html script tag.');
      reject(new Error('카카오 SDK가 로드되지 않았습니다. 새로고침 해주세요.'));
    }
  });
};



// 카카오 로그인 (리다이렉트 방식)
export const loginWithKakao = (): void => {
  console.log('[KakaoAuth.loginWithKakao] 🔐 카카오 로그인 시작');
  console.log('[KakaoAuth.loginWithKakao] window.Kakao 존재:', !!window.Kakao);

  if (!window.Kakao) {
    console.error('[KakaoAuth.loginWithKakao] ❌ SDK 초기화 안됨');
    throw new Error('카카오 SDK가 초기화되지 않았습니다.');
  }

  // 현재 페이지 URL 저장 (로그인 후 복귀용)
  const returnUrl = window.location.pathname + window.location.search;
  console.log('[KakaoAuth.loginWithKakao] 복귀 URL 저장:', returnUrl);
  sessionStorage.setItem('kakao_login_return_url', returnUrl);

  // 리다이렉트 방식으로 카카오 로그인
  const redirectUri = `${window.location.origin}/auth/kakao-callback`;
  console.log('[KakaoAuth.loginWithKakao] 리다이렉트 URI:', redirectUri);
  console.log('[KakaoAuth.loginWithKakao] 요청 스코프: account_email, profile_nickname, name, phone_number');

  window.Kakao.Auth.authorize({
    redirectUri,
    scope: 'account_email,profile_nickname,name,phone_number',
  });

  console.log('[KakaoAuth.loginWithKakao] ➡️ 카카오 인증 페이지로 리다이렉트 중...');
};


// 카카오 액세스 토큰 가져오기
export const getKakaoAccessToken = (): string | null => {
  console.log('[KakaoAuth.getKakaoAccessToken] 🔑 토큰 조회 시도');
  console.log('[KakaoAuth.getKakaoAccessToken] SDK 존재:', !!window.Kakao);
  console.log('[KakaoAuth.getKakaoAccessToken] Auth 존재:', !!window.Kakao?.Auth);

  if (!window.Kakao || !window.Kakao.Auth) {
    console.log('[KakaoAuth.getKakaoAccessToken] ❌ SDK 또는 Auth 없음');
    return null;
  }

  const token = window.Kakao.Auth.getAccessToken();
  console.log('[KakaoAuth.getKakaoAccessToken] 토큰 존재:', !!token);
  if (token) {
    console.log('[KakaoAuth.getKakaoAccessToken] 토큰 길이:', token.length);
  }

  return token;
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
