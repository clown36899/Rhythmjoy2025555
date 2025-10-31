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

// 모바일 기기 감지
const isMobile = (): boolean => {
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

// 카카오 로그인
export const loginWithKakao = (): Promise<KakaoUserInfo> => {
  return new Promise((resolve, reject) => {
    if (!window.Kakao) {
      reject(new Error('카카오 SDK가 초기화되지 않았습니다.'));
      return;
    }

    // 모바일에서는 throughTalk 옵션 추가
    const loginOptions: any = {
      success: () => {
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
    };

    // 모바일에서는 카카오톡 앱으로 전환하도록 시도
    if (isMobile()) {
      loginOptions.throughTalk = true;
    }

    window.Kakao.Auth.login(loginOptions);
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
    if (!window.Kakao || !window.Kakao.Auth.getAccessToken()) {
      resolve();
      return;
    }

    window.Kakao.Auth.logout(() => {
      resolve();
    });
  });
};
