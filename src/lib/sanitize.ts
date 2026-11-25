import DOMPurify from 'dompurify';

/**
 * Narrative HTML from a medical file is untrusted. Only plain formatting survives:
 * no scripts, no event handlers, no links, no images, no styles — so it can neither
 * execute code nor trigger a network request.
 */
export function sanitizeNarrative(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['div', 'p', 'span', 'b', 'i', 'u', 'em', 'strong', 'br', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'h1', 'h2', 'h3', 'h4', 'sub', 'sup', 'pre', 'caption'],
    ALLOWED_ATTR: ['colspan', 'rowspan'],
  });
}
