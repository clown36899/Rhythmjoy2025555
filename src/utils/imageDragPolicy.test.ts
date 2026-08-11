import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { installGlobalImageDragPolicy } from './imageDragPolicy';

describe('global image drag policy', () => {
  let cleanup: (() => void) | undefined;

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    document.body.replaceChildren();
  });

  it('turns off native dragging for existing and dynamically inserted images', async () => {
    document.body.innerHTML = '<img id="existing" src="/poster.jpg">';
    cleanup = installGlobalImageDragPolicy();

    const existing = document.getElementById('existing') as HTMLImageElement;
    expect(existing.draggable).toBe(false);
    expect(existing.getAttribute('draggable')).toBe('false');

    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    existing.dispatchEvent(dragStart);
    expect(dragStart.defaultPrevented).toBe(true);

    const dynamic = document.createElement('img');
    dynamic.draggable = true;
    document.body.append(dynamic);
    await new Promise(resolveMutation => setTimeout(resolveMutation, 0));
    expect(dynamic.draggable).toBe(false);
  });

  it('keeps native dragging available only behind the explicit opt-in marker', () => {
    document.body.innerHTML = '<div data-image-drag="allow"><img id="allowed" draggable="true"></div>';
    cleanup = installGlobalImageDragPolicy();

    const allowed = document.getElementById('allowed') as HTMLImageElement;
    const dragStart = new Event('dragstart', { bubbles: true, cancelable: true });
    allowed.dispatchEvent(dragStart);

    expect(allowed.draggable).toBe(true);
    expect(dragStart.defaultPrevented).toBe(false);
  });

  it('ships the same non-drag default in global CSS without disabling clicks', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(css).toContain('img:not([data-image-drag="allow"])');
    expect(css).toContain('-webkit-user-drag: none !important');
    expect(css).not.toMatch(/img:not\(\[data-image-drag="allow"\]\)[^{]*\{[^}]*pointer-events:\s*none/s);
    expect(main.indexOf('installGlobalImageDragPolicy()')).toBeLessThan(main.indexOf('polyfill({'));
  });
});
