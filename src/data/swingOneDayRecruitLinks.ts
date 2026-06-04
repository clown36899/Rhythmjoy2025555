export interface SwingOneDayRecruitLogo {
  sourceUrl?: string;
  micro?: string;
  thumbnail?: string;
  medium?: string;
  full?: string;
  storagePath?: string;
  updatedAt?: string;
}

export interface SwingOneDayRecruitLink {
  id: string;
  community: string;
  venue?: string;
  region: string;
  area: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  url: string;
  logoSourceUrl?: string;
  logo?: SwingOneDayRecruitLogo;
}

export const swingOneDayRecruitLinks: SwingOneDayRecruitLink[] = [
  {
    id: 'swingscandal-littly',
    community: '스윙스캔들',
    venue: '사보이',
    region: '서울',
    area: '서울 관악',
    coordinates: { lat: 37.4784, lng: 126.9516 },
    url: 'https://litt.ly/hi_swingscandal',
    logoSourceUrl: 'https://cdn.litt.ly/images/vzsOyoPuCyctOAAZXVnAvIDbKcuLoAkG?s=1200x630&m=inside',
  },
  {
    id: 'swingkids-littly',
    community: '스윙키즈',
    venue: '피에스타',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://litt.ly/swingkids',
    logoSourceUrl: 'https://ugc.production.linktr.ee/007c01f9-60b7-458d-b11a-22d206c98688_51852459-328729544427043-4724087193759383552-n.jpeg',
  },
  {
    id: 'swingfriends-littly',
    community: '스윙프렌즈',
    venue: '타임',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://litt.ly/swingfriends',
    logoSourceUrl: 'https://cdn.litt.ly/images/McR6j42D3iRRpZInU0Sq7DV9cYyfG1NA?s=1200x630&m=inside',
  },
  {
    id: 'neoswing-linktree',
    community: '네오스윙',
    venue: '해피홀',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://linktr.ee/neoswing',
    logoSourceUrl: 'https://ugc.production.linktr.ee/vXVHYcQTfyWHAgnQKkx2_SsRy5dLw5pGFurtA',
  },
  {
    id: 'swingtown-bongcheonsalon',
    community: '스윙타운',
    venue: '봉천살롱',
    region: '서울',
    area: '서울 관악',
    coordinates: { lat: 37.4784, lng: 126.9516 },
    url: 'https://linktr.ee/BongcheonSalon',
    logoSourceUrl: 'https://ugc.production.linktr.ee/bfb38c82-5ae4-430e-9c3f-538b53ec0533_438242728-122142537692188072-11339055112714209-n.jpeg',
  },
  {
    id: 'swingfamily-linktree',
    community: '스윙패밀리',
    venue: '봉천살롱',
    region: '서울',
    area: '서울 관악',
    coordinates: { lat: 37.4784, lng: 126.9516 },
    url: 'https://linktr.ee/swingfamily',
    logoSourceUrl: 'https://ugc.production.linktr.ee/xCOZqSdKR06lA8PPI1kq_CeFz0QK7sI36RYWQ',
  },
  {
    id: 'allaboutswing-1day',
    community: '올어바웃스윙',
    venue: '경성홀',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://allaboutswing.co.kr/1day',
    logoSourceUrl: 'https://cdn.imweb.me/upload/S201808105b6cf5f19bb78/43e7437c7b7a0.png',
  },
  {
    id: 'swinghouse-littly',
    community: '스윙하우스',
    venue: '비밥바',
    region: '인천',
    area: '인천',
    coordinates: { lat: 37.4563, lng: 126.7052 },
    url: 'https://litt.ly/swinghouse',
    logoSourceUrl: 'https://cdn.litt.ly/images/oufLbp7g7CaUYhfMxRbB7v8lPEhhVAeG?s=1200x630&m=inside',
  },
  {
    id: 'sweetyswing-daum',
    community: '스위티스윙',
    venue: '타임',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://m.cafe.daum.net/sweetyswing/5ngW',
    logoSourceUrl: 'https://yt3.googleusercontent.com/ytc/AIdro_lzjkOO8MRv9qRDQKu6-Os6BUKetXoJ4gbAuf6IN-ZPnw=s900-c-k-c0x00ffffff-no-rj',
  },
  {
    id: 'balboaland-linktree',
    community: '발보아랜드',
    venue: '피에스타',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://linktr.ee/balboaland',
    logoSourceUrl: 'https://ugc.production.linktr.ee/fb98d3aa-e03f-4f0b-af81-800351801513_500.jpeg',
  },
  {
    id: 'swingfever-linktree',
    community: '스윙피버',
    venue: '스윙잇',
    region: '대전',
    area: '대전',
    coordinates: { lat: 36.3504, lng: 127.3845 },
    url: 'https://linktr.ee/swingfever.daejeon',
    logoSourceUrl: 'https://ugc.production.linktr.ee/4a161591-6bf6-4957-8743-4cc0c5f498e9_286969785-417173286948255-4953446003136974641-n.jpeg',
  },
  {
    id: 'swingcats-linktree',
    community: '스윙캣츠클럽',
    venue: '루나',
    region: '대전·세종',
    area: '대전/세종',
    coordinates: { lat: 36.4800, lng: 127.3000 },
    url: 'https://linktr.ee/swingcats',
    logoSourceUrl: 'https://ugc.production.linktr.ee/752bf0db-01f1-4f35-922f-29c8b899f8ce_-------.jpeg',
  },
  {
    id: 'swinguniverse-linktree',
    community: '스윙유니버스',
    venue: '오나다/스파',
    region: '대전·청주',
    area: '대전/청주',
    coordinates: { lat: 36.3504, lng: 127.3845 },
    url: 'https://linktr.ee/SwingUniverse',
    logoSourceUrl: 'https://ugc.production.linktr.ee/8043cdbe-32de-419d-881b-26e0166e9139_------------.zip---3.png',
  },
  {
    id: 'swingpop-linktree',
    community: '스윙팝',
    venue: 'Dialogue/KP댄스홀',
    region: '서울',
    area: '서울',
    coordinates: { lat: 37.5665, lng: 126.9780 },
    url: 'https://linktr.ee/swingpopseoul',
    logoSourceUrl: 'https://ugc.production.linktr.ee/36ef071d-6893-4818-9e33-ff89b4bd6627_logo.jpeg',
  },
  {
    id: 'goldenswing-linktree',
    community: '골든스윙',
    venue: '골든스윙',
    region: '청주',
    area: '청주',
    coordinates: { lat: 36.6424, lng: 127.4890 },
    url: 'https://linktr.ee/goldenswing',
    logoSourceUrl: 'https://ugc.production.linktr.ee/gdUXlMqnTg6QiVZK7V66_qIy9sDf6yGbajCy5',
  },
].sort((a, b) => a.region.localeCompare(b.region, 'ko') || a.community.localeCompare(b.community, 'ko'));
