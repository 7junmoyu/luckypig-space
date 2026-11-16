// Rebuild trusted element types from an inert document; never inject CMS HTML.
const allowed = new Set('p h1 h2 h3 h4 h5 h6 ul ol li blockquote pre code strong em b i u s del br hr a img video source figure figcaption table thead tbody tr td th span div'.split(' '));
const blocked = new Set('script style iframe object embed svg math link meta base form input button textarea template noscript'.split(' '));

export function contentUrl(value, base) {
  if (typeof value !== 'string' || !value || /[\u0000-\u0020\u007f\\]/.test(value)) return '';
  try {
    const url = new URL(value, base);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return '';
    if (url.origin === new URL(base).origin && url.pathname.startsWith('/upload/')) return `/media/halo${url.pathname}${url.search}${url.hash}`;
    return url.href;
  } catch { return ''; }
}

export function renderRichContent(html, base) {
  const parsed = new DOMParser().parseFromString(String(html), 'text/html');
  function clean(node) {
    if (node.nodeType === 3) return document.createTextNode(node.textContent);
    const result = document.createDocumentFragment();
    if (node.nodeType !== 1 || blocked.has(node.localName)) return result;
    const tag = node.localName;
    const element = allowed.has(tag) ? document.createElement(tag) : result;
    if (['a', 'img', 'video', 'source'].includes(tag)) {
      const key = tag === 'a' ? 'href' : 'src';
      const url = contentUrl(node.getAttribute(key), base);
      if (url) element.setAttribute(key, url);
      if (tag === 'a') {
        element.target = '_blank'; element.rel = 'noopener noreferrer';
        if (url.startsWith('/media/halo/upload/') && /\.(?:txt|md|csv|rtf|docx?|pptx?|xlsx?|odt|ods|odp)$/i.test(url.split(/[?#]/)[0])) {
          element.download = ''; element.removeAttribute('target');
        }
      }
      if (tag === 'img') { element.alt = node.getAttribute('alt') || '作品图片'; element.loading = 'lazy'; }
      if (tag === 'video') {
        element.controls = true; element.playsInline = true; element.preload = 'metadata';
        const poster = contentUrl(node.getAttribute('poster'), base);
        if (poster) element.poster = poster;
      }
      if (tag === 'source' && /^video\/[a-z0-9.+-]+$/i.test(node.getAttribute('type') || '')) element.type = node.getAttribute('type');
    }
    for (const child of node.childNodes) element.append(clean(child));
    return element;
  }
  const fragment = document.createDocumentFragment();
  for (const child of parsed.body.childNodes) fragment.append(clean(child));
  return fragment;
}
