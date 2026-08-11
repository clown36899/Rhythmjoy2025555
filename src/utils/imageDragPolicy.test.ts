import { afterEach, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { findMobileDragTarget, installGlobalImageDragPolicy } from './imageDragPolicy';

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

  it('stops the mobile polyfill from promoting an image link to the drag source', () => {
    document.body.innerHTML = '<a id="poster-link" href="/event"><img id="poster" src="/poster.jpg"></a>';
    cleanup = installGlobalImageDragPolicy();

    const image = document.getElementById('poster') as HTMLImageElement;
    const link = document.getElementById('poster-link') as HTMLAnchorElement;
    const touch = {
      target: image,
      composedPath: () => [image, link, document.body, document.documentElement, document, window],
    } as unknown as TouchEvent;

    expect(link.draggable).toBe(true);
    expect(findMobileDragTarget(touch)).toBeUndefined();
  });

  it('preserves explicit mobile drag tools and ordinary non-image drag sources', () => {
    document.body.innerHTML = [
      '<div data-image-drag="allow"><img id="editor-image" draggable="true"></div>',
      '<div id="resource" draggable="true">resource</div>',
    ].join('');
    cleanup = installGlobalImageDragPolicy();

    const editorImage = document.getElementById('editor-image') as HTMLImageElement;
    const editorTouch = {
      target: editorImage,
      composedPath: () => [editorImage, editorImage.parentElement!, document.body, document.documentElement, document, window],
    } as unknown as TouchEvent;
    expect(findMobileDragTarget(editorTouch)).toBe(editorImage);

    const resource = document.getElementById('resource') as HTMLDivElement;
    const resourceTouch = {
      target: resource,
      composedPath: () => [resource, document.body, document.documentElement, document, window],
    } as unknown as TouchEvent;
    expect(findMobileDragTarget(resourceTouch)).toBe(resource);
  });

  it('ships the same non-drag default in global CSS without disabling clicks', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');
    const main = readFileSync(resolve(process.cwd(), 'src/main.tsx'), 'utf8');
    expect(css).toContain('img:not([data-image-drag="allow"])');
    expect(css).toContain('-webkit-user-drag: none !important');
    expect(css).not.toMatch(/img:not\(\[data-image-drag="allow"\]\)[^{]*\{[^}]*pointer-events:\s*none/s);
    expect(main.indexOf('installGlobalImageDragPolicy()')).toBeLessThan(main.indexOf('polyfill({'));
    expect(main).toContain('tryFindDraggableTarget: findMobileDragTarget');
  });

  it('marks only the two native image editors as opt-in surfaces', () => {
    const universalEditor = readFileSync(resolve(
      process.cwd(),
      'src/components/UniversalEditor/Core/UniversalEditor.tsx',
    ), 'utf8');
    const webzineEditor = readFileSync(resolve(
      process.cwd(),
      'src/pages/admin/webzine/WebzineEditor.tsx',
    ), 'utf8');

    expect(universalEditor).toContain("'data-image-drag': readOnly ? 'block' : 'allow'");
    expect(webzineEditor).toContain("'data-image-drag': 'allow'");
  });
});
