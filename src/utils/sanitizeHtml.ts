const URI_ATTRS = new Set(['href', 'src']);
const ALLOWED_URI_PREFIXES = ['http:', 'https:', 'mailto:', 'tel:', 'blob:'];

const sanitizeElement = (element: Element) => {
    for (const attr of Array.from(element.attributes)) {
        const name = attr.name.toLowerCase();
        const value = attr.value.trim();

        if (name.startsWith('on') || name === 'style' || name === 'srcdoc') {
            element.removeAttribute(attr.name);
            continue;
        }

        if (URI_ATTRS.has(name)) {
            if (value.startsWith('#')) continue;

            try {
                const url = new URL(value, window.location.origin);
                if (!ALLOWED_URI_PREFIXES.includes(url.protocol)) {
                    element.removeAttribute(attr.name);
                }
            } catch {
                element.removeAttribute(attr.name);
            }
        }
    }
};

export const sanitizeHtml = (html: string | null | undefined): string => {
    if (!html || typeof window === 'undefined') return html || '';

    const template = document.createElement('template');
    template.innerHTML = html;

    template.content.querySelectorAll('script, iframe, object, embed, link, meta, form, input, button, textarea, select').forEach(node => node.remove());
    template.content.querySelectorAll('*').forEach(sanitizeElement);

    return template.innerHTML;
};
