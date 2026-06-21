# 댄스빌보드 공유 등록 확장

Chrome Web Store 등록 없이 내 컴퓨터에서만 테스트하는 압축해제 확장 프로그램입니다. 데스크톱 Chrome에서는 기본 브라우저 공유 버튼이 PWA share target을 안정적으로 노출하지 않으므로, 이 확장을 데스크톱 공유 등록 경로로 사용합니다.

## 설치

1. Chrome 주소창에 `chrome://extensions` 입력
2. 오른쪽 위 `개발자 모드` 켜기
3. `압축해제된 확장 프로그램 로드` 클릭
4. 이 폴더 선택:
   `/Users/inteyeo/Rhythmjoy2025555-5/extension/sns-clipper`

코드를 수정한 뒤에는 `chrome://extensions`에서 이 확장프로그램 카드의 새로고침 아이콘을 눌러 다시 로드하세요.
재생목록/폴더 동기화를 위해 `swingenjoy.com`과 로컬 개발 서버 접근 권한을 사용합니다. 권한 변경 뒤에는 확장 새로고침이 필요합니다.

## 사용

1. YouTube 또는 Instagram 게시물 페이지 열기
2. Chrome 툴바의 `댄스빌보드 공유 등록` 아이콘 클릭
3. 필요하면 자료 유형, 재생목록/폴더, 태그, 장르 입력
4. `공유 등록폼 열기` 클릭
5. 열린 댄스빌보드 등록폼에서 확인 후 저장

확장은 저장할 원본 URL을 주소의 `#clipper?...` 해시로 전달합니다. 서버에는 이 값이 전송되지 않아서 긴 YouTube/Instagram URL 때문에 차단될 가능성을 줄입니다.
Instagram이나 일반 링크에서는 현재 탭의 `og:image`, `video poster`, 큰 이미지 후보를 읽어 `썸네일 URL`도 함께 전달합니다. 페이지 구조나 로그인 상태에 따라 썸네일 후보가 없을 수도 있습니다.
YouTube에서는 페이지 HTML의 `ytInitialPlayerResponse`와 화면의 설명 영역을 우선 읽어 원본 설명을 등록폼의 `원본 설명 / 메모`로 전달합니다. 모바일 PWA 공유는 OS가 넘겨주는 제목/텍스트/URL만 받을 수 있으므로, 앱 등록폼이 `/api/fetch-og-image`로 서버에서 다시 조회해 비어 있는 설명을 보강합니다.
재생목록/폴더 목록은 앱의 `sns_media_playlists`에서 불러옵니다. 기존 폴더를 고르면 `playlistId`가 등록폼에 전달되고, 새 폴더를 입력하면 `newPlaylistName`과 `newPlaylistParentId`가 전달됩니다.

## 대상

- `운영 사이트`: `https://swingenjoy.com/forum/media`
- `로컬 개발 서버`: `http://127.0.0.1:5173/forum/media`

로컬 서버를 쓰려면 repo 루트에서 `npm run dev -- --host 127.0.0.1`을 먼저 실행하세요.
