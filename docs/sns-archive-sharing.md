# SNS Archive Sharing Contract

SNS 아카이브 등록은 두 경로를 같은 기능으로 유지한다.

## Supported Paths

- Mobile PWA share: `public/manifest.json`의 `share_target`이 `/forum/media/share`로 들어오고, `public/service-worker.js`가 payload를 임시 cache에 저장한 뒤 `/forum/media/share?share_id=...`로 넘긴다. 앱에서는 `src/pages/forum/media/MediaArchivePage.tsx`가 이를 읽어 등록폼을 연다. 출처 맥락은 `모바일 공유`로 저장한다.
- Desktop Chrome share: 데스크톱 Chrome 기본 공유 버튼은 PWA share target을 안정적으로 노출하지 않으므로 `extension/sns-clipper` 확장을 데스크톱 공유 등록 경로로 사용한다. 확장은 `/forum/media#clipper?...`로 같은 등록폼을 연다. 출처 맥락은 `데스크톱 공유`로 저장한다. 확장 팝업도 앱과 같은 `자료 유형`, `재생목록/폴더`, `새 재생목록`, `새 재생목록 위치`, `태그`, `장르` 개념을 써야 한다.

## Change Rule

SNS 아카이브 공유/등록 흐름을 수정할 때는 반드시 두 경로를 함께 확인한다.

- 모바일 PWA 공유로 YouTube 또는 Instagram URL을 보내 등록폼이 열리는지 확인한다.
- 데스크톱 Chrome 확장으로 같은 URL을 보내 등록폼이 열리는지 확인한다.
- 제목, 설명, 썸네일, 자료 유형, 재생목록/폴더, 새 재생목록, 컬렉션 fallback, 태그, 장르, 출처 맥락 중 하나라도 수정하면 모바일 PWA 공유, 데스크톱 Chrome 확장, 저장된 카드 수정 화면의 payload 매핑을 같이 갱신한다.
- 사용자에게 보이는 명칭은 `공유 등록`으로 통일한다. 구현상 확장 이름이나 이전 데이터에 `클리퍼`가 남아 있어도 새 저장값은 `데스크톱 공유`로 정규화한다.

## Edit And Playlist Contract

- 저장된 SNS 카드는 작성자 또는 관리자가 수정할 수 있어야 한다. 수정 화면은 신규 등록과 같은 필드 세트를 유지한다.
- 사용자 재생목록/폴더는 `sns_media_playlists`에 저장한다. `parent_id`로 자유 계층을 만들 수 있어야 하며, 예를 들어 `댄스 > 린디합 > lindy hop pattern > 스윙아웃` 같은 구조를 허용한다.
- 카드는 `playlist_id`로 연결하고, 기존 검색/비교/컬렉션 호환을 위해 같은 이름을 `collection_name`에도 저장한다.
- 재생목록 이름, 상위 폴더, 분류, 장르, 태그를 바꾸면 재생목록 보기와 카드 편집 선택지에 함께 반영되어야 한다.
- 재생목록 위치 이동은 보기 화면의 `정리` 모드에서 처리한다. 정리 모드에서는 행 전체를 드래그할 수 있어야 하며, 다른 재생목록 위에 놓으면 그 하위로, 상단 경로/상위 영역에 놓으면 해당 위치로 이동한다. 평소 카드/썸네일 스크롤과 섞이지 않도록 일반 상태에서는 이미지 드래그를 막는다.
- 데스크톱 확장은 `sns_media_playlists`를 조회해서 폴더 경로를 보여주고, 기존 폴더 선택은 `playlistId`, 새 폴더 생성은 `newPlaylistName`과 `newPlaylistParentId`로 앱 등록폼에 전달한다.
