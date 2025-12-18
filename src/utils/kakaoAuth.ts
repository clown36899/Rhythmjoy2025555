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

    const loginOptions: any = {
      scope: 'account_email,name,phone_number', // 이메일, 본명, 전화번호 권한 요청
      throughTalk: false, // 웹 브라우저에서는 항상 웹 기반 OAuth 사용 (intent:// 에러 방지)
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
        const currentUrl = window.location.origin;
        let errorMessage = '카카오 로그인 실패';

        // 에러 코드별 한글 메시지
        if (error.error === 'KOE004') {
          errorMessage = '카카오 로그인이 비활성화되어 있습니다. 개발자 콘솔에서 활성화해주세요.';
        } else if (error.error === 'KOE005') {
          errorMessage = '테스트 계정이 팀원으로 등록되지 않았습니다. 개발자 콘솔 > 팀 관리에서 초대해주세요.';
        } else if (error.error === 'KOE006' || error.error === 'invalid_request') {
          errorMessage = `Redirect URI가 등록되지 않았습니다.\\n현재 URL: ${currentUrl}\\n카카오 개발자 콘솔에 이 URL을 등록해주세요.`;
        } else if (error.error_description) {
          errorMessage += ': ' + error.error_description;
        }

        console.error('[카카오 로그인 실패]', {
          error: error.error,
          description: error.error_description,
          currentUrl
        });

        reject(new Error(errorMessage));
      },
    };

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
