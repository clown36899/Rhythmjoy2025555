// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { readNaverArticleDocument, readNaverArticleListDocument, waitForNaverArticleFrame, naverScheduleOverviewPriority } from './benefit-search-utils.mjs';
afterEach(() => { document.body.innerHTML = ''; });

it('reads the article body without author, comments or their images from the outer wrapper', () => {
  document.body.innerHTML = `<div class="ArticleContentBox">
    <div class="article_header"><h3 class="title_text">2026.09.24 스윙스캔들 목요소셜 DJ</h3>
      <div class="ArticleWriter">77L 주스<img src="/author.jpg"><span class="date">2026.09.22 11:31</span></div></div>
    <div class="article_container"><div class="article_viewer"><div class="se-main-container">해림님 입니다~!!!<img src="/poster.png" width="1080" height="1350"></div></div>
      <div class="ReplyBox">DJ 댓글이름<img src="/comment.jpg"></div></div></div>`;
  expect(readNaverArticleDocument()).toMatchObject({
    title: '2026.09.24 스윙스캔들 목요소셜 DJ', text: '해림님 입니다~!!!', publishedAt: '2026.09.22 11:31',
    images: [{ src: expect.stringContaining('/poster.png'), w: 1080, h: 1350 }],
  });
  expect(readNaverArticleDocument({ readyOnly: true })).toBe(true);
});

it('waits through a metadata-only page and accepts an image-only original article', () => {
  document.body.innerHTML = '<div class="ArticleContentBox"><h3 class="title_text">9월 24일 목요 소셜 DJ</h3><div class="ArticleWriter">작성자 77L 주스<img src="/avatar.jpg"></div></div>';
  expect(readNaverArticleDocument({ readyOnly: true })).toBe(false);
  expect(readNaverArticleDocument()).toMatchObject({ text: '', images: [] });
  document.querySelector('.ArticleContentBox').innerHTML += '<div class="article_viewer"><img data-src="/original.png"></div>';
  expect(readNaverArticleDocument({ readyOnly: true })).toBe(true);
  expect(readNaverArticleDocument().images[0].src).toBe('/original.png');
});

it.each(['#tbody', '.NHN_Writeform_Main', '.post_ct', '.ContentRenderer'])('preserves legacy body and poster ownership (%s)', selector => {
  const attribute = selector.startsWith('#') ? 'id' : 'class';
  document.body.innerHTML = `<div class="tit_area"><span class="tit">9월 30일 소셜</span></div><div ${attribute}="${selector.slice(1)}">DJ 나리<img src="/legacy.png"></div><img src="/outside.jpg">`;
  expect(readNaverArticleDocument()).toMatchObject({ title: '9월 30일 소셜', text: 'DJ 나리', images: [{ src: expect.stringContaining('/legacy.png') }] });
});

it('preserves dated lesson titles instead of replacing them with comment counts', () => {
  const url = 'https://cafe.naver.com/f-e/cafes/16855256/articles/2039?menuid=1';
  document.body.innerHTML = `<ul><li><a class="article" href="${url}">살사 왕초보 10월 1일 개강</a>
    <a class="cmt" href="${url}&commentFocus=true"><span>댓글수</span>[25]</a></li>
    <li><a href="https://cafe.naver.com/f-e/cafes/16855256/articles/5420">여자27번 왕초보 신청</a></li></ul>`;
  const links = readNaverArticleListDocument();
  expect(links).toHaveLength(2);
  expect(links[0].title).toBe('살사 왕초보 10월 1일 개강');
  const priority = row => naverScheduleOverviewPriority(`${row.title} ${row.rowText}`, '2026-09-23', { allowedActivityTypes: ['class'] });
  expect(priority(links[0])).toBeLessThan(priority(links[1]));
});

it('keeps legacy article links and original poster information', () => {
  document.body.innerHTML = '<table><tr><td><a class="article" href="https://cafe.naver.com/ArticleRead.nhn?clubid=123&articleid=456">9월 30일 소셜 DJ 나리</a><img src="/poster.jpg"></td></tr></table>';
  const [link] = readNaverArticleListDocument();
  expect(link.title).toBe('9월 30일 소셜 DJ 나리');
  expect(link.href).toContain('ArticleRead.nhn?clubid=123&articleid=456');
  expect(link.posterUrl).toContain('/poster.jpg');
});


it('selects a late cafe_main frame instead of permanently waiting in the outer page', async () => {
  const outer = { name: () => '', evaluate: vi.fn(async () => false) };
  const article = { name: () => 'cafe_main', evaluate: vi.fn(async () => true) };
  let attached = false;
  const page = { mainFrame: () => outer, frames: () => attached ? [outer, article] : [outer],
    waitForTimeout: vi.fn(async () => { attached = true; }) };
  expect(await waitForNaverArticleFrame(page, 8000)).toBe(article);
  expect(article.evaluate).toHaveBeenCalledWith(readNaverArticleDocument, { readyOnly: true });
});

it('records sticky notices without confusing them with ordinary course posts', () => {
  document.body.innerHTML = `<table><tr class="board-notice type_main"><td><a href="https://cafe.naver.com/f-e/cafes/10342583/articles/1">운영 공지</a></td></tr>
    <tr><td><a href="https://cafe.naver.com/f-e/cafes/10342583/articles/2">10/26 신규 강습</a></td></tr></table>`;
  expect(readNaverArticleListDocument().map(row => row.isNotice)).toEqual([true, false]);
});


it('reads the original editor body before the cafe-wide board rules', () => {
  document.body.innerHTML = `<div class="article_viewer"><div class="FormNoticeContent">게시판 규정: 정모와 겹치는 홍보 금지<img src="/guide.jpg"></div>
    <div class="se-main-container">송송이&amp;레드홍 Blues Dance Workshop\n●장소\n사당 연습실\n2026년 11월 1일 첫 수업<img src="/original.jpg"></div></div>`;
  const article = readNaverArticleDocument();
  expect(article.text).not.toContain('게시판 규정');
  expect(article.text).toContain('●장소');
  expect(article.images.map(image => image.src)).toEqual([expect.stringContaining('/original.jpg')]);
});
