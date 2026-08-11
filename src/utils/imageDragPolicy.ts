const IMAGE_DRAG_OPT_IN_SELECTOR = '[data-image-drag="allow"]';

function isImageDragAllowed(image: HTMLImageElement) {
  return Boolean(image.closest(IMAGE_DRAG_OPT_IN_SELECTOR));
}

function disableNativeImageDrag(image: HTMLImageElement) {
  if (isImageDragAllowed(image)) return;
  if (image.draggable) image.draggable = false;
  if (image.getAttribute('draggable') !== 'false') image.setAttribute('draggable', 'false');
}

function applyPolicyToNode(node: Node) {
  if (node instanceof HTMLImageElement) disableNativeImageDrag(node);
  if (!(node instanceof Element)) return;
  node.querySelectorAll<HTMLImageElement>('img').forEach(disableNativeImageDrag);
}

function getEventPath(event: Event): EventTarget[] {
  if (typeof event.composedPath === 'function') return event.composedPath();

  const path: EventTarget[] = [];
  let current = event.target as Node | null;
  while (current) {
    path.push(current);
    current = current.parentNode;
  }
  path.push(window);
  return path;
}

/**
 * mobile-drag-drop otherwise promotes an image's draggable link/card ancestor
 * to the drag source even after the image itself has draggable=false. Reject a
 * touch that started on a normal image before the polyfill captures it.
 */
export function findMobileDragTarget(event: TouchEvent): HTMLElement | undefined {
  const path = getEventPath(event);
  const image = path.find((item): item is HTMLImageElement => item instanceof HTMLImageElement);
  if (image && !isImageDragAllowed(image)) return undefined;

  return path.find((item): item is HTMLElement => (
    item instanceof HTMLElement && item.draggable
  ));
}

/**
 * Native image dragging is opt-in across the site. This keeps a vertical swipe
 * over a poster/thumbnail attached to the surrounding scroll container instead
 * of starting Chrome/Safari's translucent image drag preview.
 *
 * A future editor that genuinely needs native image dragging must mark the
 * image or an ancestor with data-image-drag="allow" and set draggable="true".
 */
export function installGlobalImageDragPolicy(root: Document = document) {
  root.querySelectorAll<HTMLImageElement>('img').forEach(disableNativeImageDrag);

  const handleDragStart = (event: Event) => {
    const path = getEventPath(event);
    const image = path.find((item): item is HTMLImageElement => item instanceof HTMLImageElement);
    if (image && !isImageDragAllowed(image)) event.preventDefault();
  };
  root.addEventListener('dragstart', handleDragStart, true);

  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') {
        applyPolicyToNode(mutation.target);
        continue;
      }
      mutation.addedNodes.forEach(applyPolicyToNode);
    }
  });
  observer.observe(root.documentElement, {
    attributes: true,
    attributeFilter: ['draggable', 'data-image-drag'],
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    root.removeEventListener('dragstart', handleDragStart, true);
  };
}
