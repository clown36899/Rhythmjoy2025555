// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { readInstagramCarouselDocument, readInstagramPostDocument, readInstagramProfileDocument } from './benefit-search-utils.mjs';
afterEach(() => { document.body.innerHTML = ''; });
it('excludes recommendation media and captions while retaining the opened post and its hidden carousel images', () => {
  window.history.replaceState({}, '', '/owner/p/current/');
  document.body.innerHTML = `<img src="/primary.jpg" alt="current social">
    <a href="/owner/p/other/"><img src="/other.jpg" alt="wrong date and DJ"></a>
    <a href="/p/current/"><img src="/same.jpg" alt="same post"></a>
    <div hidden><img src="/carousel.jpg" alt="second slide"></div>`;
  expect(readInstagramPostDocument().images.map(i => i.alt)).toEqual(['current social', 'same post', 'second slide']);
});
it('keeps legacy article scope instead of importing other page media', () => {
  document.body.innerHTML = '<article><img src="/poster.jpg" alt="official"></article><img src="/outside.jpg" alt="outside">';
  expect(readInstagramPostDocument().images.map(i => i.alt)).toEqual(['official']);
});

it('reads icon-only pinned markers and keeps monthly pinned posts after recent posts', () => {
  document.body.innerHTML = `<a href="/owner/p/old/"><svg aria-label="고정 게시물"></svg></a>
    <a href="/owner/p/monthly/"><img alt="Pinned post"></a>
    <a href="/owner/p/new/?tracking=1"><img alt="new social"></a>
    <a href="/owner/p/new/">duplicate</a>
    <a href="/owner/p/legacy/">Pinned</a>
    <a href="/owner/reel/next/">new</a>`;
  expect(readInstagramProfileDocument().links.map(url => new URL(url).pathname)).toEqual([
    '/owner/p/new/', '/owner/reel/next/', '/owner/p/old/', '/owner/p/monthly/', '/owner/p/legacy/',
  ]);
});


it('visits later carousel slides, deduplicates images and flags a bounded incomplete scan', async () => {
  let index = 0;
  const page = {url:()=> 'https://www.instagram.com/owner/p/current/',
    evaluate:async()=>({images:[{src:`poster-${index}`,w:1440,h:1920}],articleText:`day ${index}`}),
    waitForTimeout:async()=>{},
    getByRole:()=>({count:async()=> index < 5 ? 1 : 0,isVisible:async()=>true,click:async()=>{index+=1;}})};
  const data = await readInstagramCarouselDocument(page);
  expect(data.images.map(i=>i.src)).toEqual(Array.from({length:6},(_,i)=>`poster-${i}`));
  expect(data.carouselIncomplete).toBe(false);
  index=0;
  const bounded=await readInstagramCarouselDocument(page,{maxSlides:3});
  expect(bounded.images).toHaveLength(3);
  expect(bounded.carouselIncomplete).toBe(true);
});
it('refuses media when a Next action leaves the original post', async () => {
  let moved=false;
  const page={url:()=>`https://www.instagram.com/owner/p/${moved?'other':'current'}/`,
    evaluate:async()=>({images:[],articleText:'current post caption'}),waitForTimeout:async()=>{},
    getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{moved=true;}})};
  await expect(readInstagramCarouselDocument(page)).rejects.toThrow('left the source post');
});

it('keeps original evidence pending when the carousel control is obstructed', async () => {
  const page={url:()=> 'https://www.instagram.com/owner/p/current/',
    evaluate:async()=>({images:[{src:'poster'}],articleText:'verified original'}),waitForTimeout:async()=>{},
    getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{throw new Error('overlay');}})};
  const data=await readInstagramCarouselDocument(page);
  expect(data.images).toEqual([{src:'poster'}]);
  expect(data.carouselIncomplete).toBe(true);
  expect(data.carouselError).toContain('unavailable');
});

it('distinguishes an access dialog from ordinary login links and hidden dialogs', () => {
  document.body.innerHTML = '<article><span>좋아요 또는 댓글을 남기려면 로그인.</span></article><div role="dialog" hidden>Instagram에 가입 로그인</div>';
  expect(readInstagramPostDocument().accessDialogText).toBe('');
  document.body.innerHTML += '<div role="dialog">latin_gangnam님의 게시물을 놓치지 마세요 Instagram에 가입 로그인</div>';
  expect(readInstagramPostDocument().accessDialogText).toContain('게시물을 놓치지');
});

it('stops at a login wall even when the underlying post contains images', async () => {
  let clicks=0;
  const page={url:()=> 'https://www.instagram.com/owner/p/current/',
    evaluate:async()=>({images:[{src:'poster'}],accessDialogText:'Instagram에 가입 로그인'}),
    getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{clicks+=1;}})};
  await expect(readInstagramCarouselDocument(page)).rejects.toThrow('login required');
  expect(clicks).toBe(0);
});

it('stops and keeps the post retryable if an access wall appears during carousel navigation', async () => {
  let clicks=0;
  const page={url:()=> 'https://www.instagram.com/owner/p/current/',
    evaluate:async()=>({images:[{src:'poster'}],articleText:'original caption',accessDialogText:clicks?'Instagram에 가입 로그인':''}),
    getByRole:()=>({count:async()=>1,isVisible:async()=>true,click:async()=>{clicks+=1;throw new Error('overlay');}})};
  await expect(readInstagramCarouselDocument(page)).rejects.toThrow('login required');
  expect(clicks).toBe(1);
});

it('waits for a post body after a blank application shell and distinguishes an empty response from no content', async () => {
  let reads = 0;
  const page = {url:()=> 'https://www.instagram.com/owner/p/current/',
    evaluate:async()=> ++reads === 1 ? {images:[],articleText:''} : {images:[],articleText:'dated official notice'},
    waitForTimeout:async()=>{}, getByRole:()=>({count:async()=>0})};
  expect((await readInstagramCarouselDocument(page)).articleText).toBe('dated official notice');
  page.evaluate = async()=>({images:[],articleText:''});
  await expect(readInstagramCarouselDocument(page,{readinessMs:0})).rejects.toThrow('content not ready');
});

it('rejects a redirected profile or other post while permitting canonical URLs for the same post', async () => {
  const page = {url:()=> 'https://www.instagram.com/owner/',
    evaluate:async()=>({images:[],articleText:'unrelated profile'}),getByRole:()=>({count:async()=>0})};
  await expect(readInstagramCarouselDocument(page,{expectedUrl:'https://www.instagram.com/owner/p/current/'})).rejects.toThrow('URL mismatch');
  page.url = ()=> 'https://www.instagram.com/p/current/';
  expect((await readInstagramCarouselDocument(page,{expectedUrl:'https://www.instagram.com/owner/p/current/'})).articleText).toBe('unrelated profile');
});
