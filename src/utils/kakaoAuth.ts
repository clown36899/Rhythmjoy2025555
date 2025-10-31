// 카카오 로그인 유틸리티

declare global {
  interface Window {
    Kakao: any;
  }
}

export interface KakaoUserInfo {
  id: number;
  kakao_account: {
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
    email?: string;
    name?: string;
  };
}

// 카카오 SDK 초기화
export const initKakaoSDK = () => {
  return new Promise<void>((resolve, reject) => {
    if (window.Kakao) {
      if (!window.Kakao.isInitialized()) {
        const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
        if (!jsKey) {
          reject(new Error('카카오 JavaScript 키가 설정되지 않았습니다.'));
          return;
        }
        window.Kakao.init(jsKey);
      }
      resolve();
    } else {
      // SDK 로드
      const script = document.createElement('script');
      script.src = 'https://developers.kakao.com/sdk/js/kakao.js';
      script.onload = () => {
        const jsKey = import.meta.env.VITE_KAKAO_JAVASCRIPT_KEY;
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

// 카카오 로그인
export const loginWithKakao = (): Promise<KakaoUserInfo> => {
  return new Promise((resolve, reject) => {
    if (!window.Kakao) {
      reject(new Error('카카오 SDK가 초기화되지 않았습니다.'));
      return;
    }

    window.Kakao.Auth.login({
      success: (authObj: any) => {
        // 사용자 정보 요청
        window.Kakao.API.request({
          url: '/v2/user/me',
          success: (response: KakaoUserInfo) => {
            resolve(response);
          },
          fail: (error: any) => {
            reject(new Error('사용자 정보 요청 실패: ' + error.msg));
          },
        });
      },
      fail: (error: any) => {
        reject(new Error('카카오 로그인 실패: ' + error.error_description));
      },
    });
  });
};

// 카카오 로그아웃
export const logoutKakao = (): Promise<void> => {
  return new Promise((resolve) => {
    if (!window.Kakao || !window.Kakao.Auth.getAccessToken()) {
      resolve();
      return;
    }

    window.Kakao.Auth.logout(() => {
      resolve();
    });
  });
};
