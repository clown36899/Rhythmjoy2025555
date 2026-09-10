// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { readInstagramPostDocument } from './benefit-search-utils.mjs';
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
