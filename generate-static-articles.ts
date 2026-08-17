import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import pkg from 'pg';
const { Pool } = pkg;

function escapeHTML(s: any): string {
  return String(s || '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c] || c));
}

function cleanExcerpt(str: any): string {
  if (!str) return '';
  let s = String(str).trim();
  if ((s.startsWith('{') && s.endsWith('}')) || (s.startsWith('[') && s.endsWith(']'))) {
    try {
      const p = JSON.parse(s);
      if (p && p.html) return cleanExcerpt(p.html);
      if (p && p.excerpt) return cleanExcerpt(p.excerpt);
      if (p && p.text) return cleanExcerpt(p.text);
    } catch (e) {}
  }
  s = s.replace(/^\{\s*"html"\s*:\s*"?/i, '');
  s = s.replace(/^"html"\s*:\s*"?/i, '');
  s = s.replace(/^\{\s*"blocks"\s*:\s*"?/i, '');
  s = s.replace(/<[^>]*>/g, ' ');
  s = s.replace(/["'\}]+$/, '');
  return s.replace(/\s+/g, ' ').trim();
}

function fmtDate(iso: any): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.valueOf())) return String(iso);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return String(iso);
  }
}

function parseCategoryStr(catStr: any) {
  if (!catStr) return { main: 'News', sub: '' };
  const parts = String(catStr).split(/\s*>\s*/);
  return { main: parts[0] || 'News', sub: parts[1] || '' };
}

function getImgHTML(src: string, alt: string, cat: string, extraClass = '', otherAttrs = ''): string {
  const { main } = parseCategoryStr(cat);
  const safeAlt = escapeHTML(alt);
  const safeCat = escapeHTML(main);

  if (!src || src.trim() === '') {
    return `<div class="ad-slot image-fallback ${extraClass}"><div class="ad-label fallback-cat">${safeCat}</div></div>`;
  }

  const safeCatAttr = String(main).replace(/'/g, "\\'").replace(/"/g, '&quot;');
  return `<img src="${src}" alt="${safeAlt}" class="img-loaded ${extraClass}" onerror="window.handleImageError(this, '${safeCatAttr}', '', '${extraClass}')" ${otherAttrs} />`;
}

function renderEditorJSBlocks(data: any): string {
  if (!data) return '';
  if (typeof data === 'string') {
    let s = data.trim();
    if (s.startsWith('{') || s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        return renderEditorJSBlocks(parsed);
      } catch (e) {}
    }
    if (s.startsWith('<') || s.includes('<p>')) {
      return s;
    }
    return `<p class="ce-paragraph">${escapeHTML(s)}</p>`;
  }
  if (typeof data === 'object' && data !== null) {
    if (typeof data.html === 'string') {
      return data.html;
    }
    if (Array.isArray(data)) {
      return data.map(p => {
        if (typeof p === 'string') {
          return (p.trim().startsWith('<') || p.includes('<p>')) ? p : `<p class="ce-paragraph">${escapeHTML(p)}</p>`;
        }
        if (p && typeof p === 'object' && p.type && p.data) {
          return renderSingleBlock(p);
        }
        return `<p class="ce-paragraph">${escapeHTML(JSON.stringify(p))}</p>`;
      }).join('\n');
    }
    if (Array.isArray(data.blocks)) {
      return data.blocks.map(block => renderSingleBlock(block)).join('\n');
    }
  }
  return `<p class="ce-paragraph">${escapeHTML(String(data))}</p>`;
}

function renderSingleBlock(block: any): string {
  const type = block.type;
  const bData = block.data || {};
  switch (type) {
    case 'header': {
      const level = bData.level || 2;
      return `<h${level} class="ce-header h${level}">${bData.text || ''}</h${level}>`;
    }
    case 'paragraph': {
      return `<p class="ce-paragraph">${bData.text || ''}</p>`;
    }
    case 'list': {
      const tag = bData.style === 'ordered' ? 'ol' : 'ul';
      const items = Array.isArray(bData.items) ? bData.items : [];
      const itemsHtml = items.map((item: any) => {
        const content = typeof item === 'string' ? item : (item.content || item.text || '');
        return `<li>${content}</li>`;
      }).join('');
      return `<${tag} class="cdx-list">${itemsHtml}</${tag}>`;
    }
    case 'image': {
      const url = bData.file ? bData.file.url : (bData.url || '');
      const caption = bData.caption || '';
      return `<figure class="cdx-image-block" style="margin: 24px 0; text-align: center;"><img src="${escapeHTML(url)}" alt="${escapeHTML(caption)}" style="max-width: 100%; border-radius: 8px;" />${caption ? `<figcaption style="font-size: 13px; color: var(--text-secondary); margin-top: 8px;">${escapeHTML(caption)}</figcaption>` : ''}</figure>`;
    }
    case 'quote': {
      return `<blockquote class="cdx-quote"><p>${bData.text || ''}</p>${bData.caption ? `<cite style="font-size: 14px; color: var(--text-secondary); display: block; margin-top: 6px;">— ${escapeHTML(bData.caption)}</cite>` : ''}</blockquote>`;
    }
    case 'warning': {
      return `<div class="cdx-warning"><strong>${escapeHTML(bData.title || 'Warning')}:</strong> ${bData.message || ''}</div>`;
    }
    case 'code': {
      return `<pre style="background: var(--surface-2, #1e293b); color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;"><code>${escapeHTML(bData.code || '')}</code></pre>`;
    }
    case 'checklist': {
      const items = Array.isArray(bData.items) ? bData.items : [];
      return `<ul style="list-style: none; padding-left: 0;">${items.map((item: any) => `<li style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;"><input type="checkbox" ${item.checked ? 'checked' : ''} disabled /><span>${item.text || ''}</span></li>`).join('')}</ul>`;
    }
    case 'table': {
      const content = Array.isArray(bData.content) ? bData.content : [];
      const withHeadings = bData.withHeadings;
      return `<div style="overflow-x: auto; margin: 20px 0;"><table style="width: 100%; border-collapse: collapse; border: 1px solid var(--border-color);"><tbody>${content.map((row: any[], rIdx: number) => `<tr>${row.map((cell: any) => { const isHeader = withHeadings && rIdx === 0; const cellTag = isHeader ? 'th' : 'td'; return `<${cellTag} style="border: 1px solid var(--border-color); padding: 8px 12px; text-align: left;">${cell}</${cellTag}>`; }).join('')}</tr>`).join('')}</tbody></table></div>`;
    }
    case 'delimiter': {
      return `<div class="ce-delimiter">***</div>`;
    }
    case 'raw': {
      return `<div class="cdx-raw">${bData.html || ''}</div>`;
    }
    case 'embed': {
      let embedUrl = bData.embed || bData.source || '';
      if (embedUrl.includes('youtube.com/watch?v=')) {
        const vId = embedUrl.split('v=')[1]?.split('&')[0];
        embedUrl = `https://www.youtube.com/embed/${vId}`;
      } else if (embedUrl.includes('youtu.be/')) {
        const vId = embedUrl.split('youtu.be/')[1]?.split('?')[0];
        embedUrl = `https://www.youtube.com/embed/${vId}`;
      }
      return `<div class="embed-responsive-wrapper"><iframe src="${escapeHTML(embedUrl)}" allowfullscreen loading="lazy"></iframe></div>${bData.caption ? `<div style="font-size: 13px; color: var(--text-secondary); text-align: center; margin-top: -12px; margin-bottom: 20px;">${escapeHTML(bData.caption)}</div>` : ''}`;
    }
    default: {
      return `<p class="ce-paragraph">${bData.text || ''}</p>`;
    }
  }
}

function buildArticleHtmlPage(article: any, latestArticles: any[]): string {
  const title = article.title || 'Untitled';
  const excerpt = cleanExcerpt(article.excerpt || '');
  const author = 'The Times Patriot';
  const dateIso = article.date || new Date().toISOString();
  const formattedDate = fmtDate(dateIso);
  const readMinute = article.read_time || article.readTime || '3 min read';
  const category = article.category || 'News';
  const caption = article.caption && article.caption.trim() ? article.caption.trim() : category;
  const image = article.image || '';
  
  let slug = article.id;
  if (article.article_link) {
    const cleanLink = article.article_link.replace(/^\/+article\/+/, '').replace(/\.html$/, '');
    if (cleanLink) slug = cleanLink;
  }
  const canonicalUrl = `/article/${encodeURIComponent(slug)}.html`;

  const bodyContentHtml = renderEditorJSBlocks(article.body);

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": title,
    "image": image ? [image] : [],
    "datePublished": dateIso,
    "dateModified": dateIso,
    "author": [{
      "@type": "Person",
      "name": author
    }],
    "publisher": {
      "@type": "Organization",
      "name": "The Times Patriot",
      "logo": {
        "@type": "ImageObject",
        "url": "/favicon.ico"
      }
    },
    "description": excerpt,
    "articleSection": category
  }, null, 2);

  // Filter latest articles so current article isn't duplicated
  const sideArticles = latestArticles.filter(a => a.id !== article.id).slice(0, 5);

  return `<!DOCTYPE html><html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="theme-color" content="#B91C1C">
<meta name="description" content="${escapeHTML(excerpt)}">
<meta name="robots" content="index, follow">
<title>${escapeHTML(title)} — The Times Patriot</title>

<meta property="og:type" content="article">
<meta property="og:site_name" content="The Times Patriot">
<meta property="og:title" content="${escapeHTML(title)} — The Times Patriot">
<meta property="og:description" content="${escapeHTML(excerpt)}">
<meta property="og:image" content="${escapeHTML(image)}">
<meta property="og:url" content="${canonicalUrl}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHTML(title)} — The Times Patriot">
<meta name="twitter:description" content="${escapeHTML(excerpt)}">
<meta name="twitter:image" content="${escapeHTML(image)}">

<!-- Links & Fonts -->
<link rel="canonical" href="${canonicalUrl}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="">
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,700;0,800;0,900;1,700&amp;family=Public+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/style.css">
<link rel="manifest" href="/manifest.json">
<link rel="apple-touch-icon" href="/img/icon-192.png">
<script type="application/ld+json">
${jsonLd}
</script>
<script src="/assets/js/pwa-install.js" defer=""></script>
</head>

<body data-testid="article-page">
<div id="root"></div>

<!-- TOP STRIP -->


<!-- MASTHEAD -->
<header class="masthead" role="banner">
<div class="container">
<div class="masthead-inner">
<div style="display:flex; align-items:center; gap:8px;">
<button class="icon-btn" data-testid="open-sidebar-btn" aria-label="Open menu">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
</button>
<a href="/" class="brand" data-testid="brand-home-link"><div class="brand-logo" style="border-radius: 100px;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 1000" width="100%" height="100%"><defs><style>.bg-red { fill: #9e1a1b; fill-opacity:0.00001}.ring { fill: none; stroke: #ffffff; stroke-width: 4;fill: #9e1a1b; }.dashed-box { fill: #000000; stroke: #ffffff; stroke-width: 6; stroke-dasharray: 14, 14; }.yellow-box { fill: #fadd5a; }.text-sans { font-family: Arial, Helvetica, sans-serif; font-weight: bold; fill: #ffffff; text-anchor: middle; font-size: 42px; letter-spacing: 1px; }.text-serif-white { font-family: "Playfair Display", Georgia, "Times New Roman", serif; font-weight: 900; fill: #ffffff; text-anchor: middle; }.text-serif-black { font-family: "Playfair Display", Georgia, "Times New Roman", serif; font-weight: 900; fill: #000000; text-anchor: middle; }</style></defs><rect class="bg-red" width="1000" height="1000"></rect><circle class="ring" cx="500" cy="500" r="485"></circle><text class="text-sans" x="500" y="120">@TheTimesPatriot</text><rect class="dashed-box" x="170" y="145" width="660" height="710"></rect><text class="text-serif-white" x="500" y="325" font-size="160">The</text><rect class="yellow-box" x="240" y="400" width="520" height="390"></rect><text class="text-serif-black" x="500" y="535" font-size="145">Times</text><text class="text-serif-black" x="500" y="745" font-size="145">Patriot</text><text class="text-serif-white" x="500" y="905" font-size="45">Digital News</text><text class="text-serif-white" x="500" y="965" font-size="45">Channel</text></svg></div></a></div><div class="masthead-center"><a href="/" data-testid="brand-title-link"><div class="brand-title">The Times <em>Patriot</em></div></a></div><div class="masthead-actions" data-testid="masthead-actions"><button class="icon-btn" data-testid="theme-toggle" aria-label="Toggle dark mode" title="Toggle dark mode"><span data-theme-icon=""></span></button></div></div></div>


<nav class="primary-nav" aria-label="Primary">
  <div class="container">
    <a href="/" class="active">Home</a></div>
</nav>
</header>

<!-- SIDEBAR DRAWER -->
<div class="drawer-backdrop" data-testid="drawer-backdrop"></div>
<aside class="drawer" data-testid="sidebar-drawer" aria-label="Site menu">
<div class="drawer-head">
<div class="drawer-title">Menu</div>
<button class="icon-btn" data-testid="close-sidebar-btn" aria-label="Close menu">
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
</button>
</div>
<div class="drawer-section">
<h4>Company</h4>
<ul>
<li><a href="/about.html" data-testid="drawer-link-about">About Us</a></li>
<li><a href="/contact.html" data-testid="drawer-link-contact">Contact</a></li>
<li><a href="/ads.html" data-testid="drawer-link-ads">Advertise With Us</a></li>
</ul>
</div>
<div class="drawer-section">
<h4>Legal</h4>
<ul>
<li><a href="/terms.html" data-testid="drawer-link-terms">Terms of Service</a></li>
<li><a href="/privacy.html" data-testid="drawer-link-privacy">Privacy Policy</a></li>
</ul>
</div>

<div class="drawer-section">
<h4>Sections</h4>
<ul style="list-style:none; padding:0; margin:0; line-height: 2;">
<li><a href="/">Home</a></li>
</ul>
</div>
<div class="drawer-section"><h4>Follow Us</h4>
<div class="drawer-social">
<a href="https://paypal.me/thetimespatriot" target="_blank" rel="noopener" aria-label="Paypal" data-testid="social-paypal"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 640 850"><path fill="currentColor" d="M232 407q-23 0-40 14t-22 38l-35 208H21q-9 0-15-7t-5-16l52-337L96 36q2-12 11-20t21-8h233q55 0 100 16t70 47q18 21 25 38q9 20 9 43v11q-1 6-1 12t-2 14q-1 4-1 7t-1 6q-20 104-84 154t-176 51h-68zm375-189q21 25 26 60t-3 78q-10 52-32 87t-52 58t-69 31t-83 10h-18q-11 0-19 6t-10 18l-2 8l-22 145l-2 6q-2 11-9 18t-19 7H173l45-283q2-11 14-11h68q128 0 205-61t102-177z"></path></svg></a>
<a href="https://patreon.com/Thetimespatriot" target="_blank" rel="noopener" aria-label="Patreon" data-testid="social-patreon"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24"><path fill="currentColor" d="M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65c0 4.755 3.877 8.623 8.641 8.623c4.75 0 8.615-3.868 8.615-8.623C24 4.36 20.136.48 15.385.48z"></path></svg></a>
<a href="https://www.youtube.com/@thetimespatriot" target="_blank" rel="noopener" aria-label="YouTube" data-testid="social-youtube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg></a>
<a href="https://x.com/thetimespatriot/" target="_blank" rel="noopener" aria-label="X" data-testid="social-x"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg></a>
<a href="https://www.facebook.com/TheTimesPatriot/" target="_blank" rel="noopener" aria-label="Facebook" data-testid="social-facebook"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"></path></svg></a>
<a href="https://www.instagram.com/thetimespatriot/" target="_blank" rel="noopener" aria-label="Instagram" data-testid="social-instagram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919C8.416 2.175 8.796 2.163 12 2.163zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"></path></svg></a>
<a href="https://www.threads.com/@thetimespatriot" target="_blank" rel="noopener" aria-label="Threads" data-testid="social-threads"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.4 11.06c-.07-.03-.14-.07-.21-.1-.13-2.4-1.45-3.78-3.65-3.79h-.03c-1.32 0-2.41.56-3.09 1.59l1.22.83c.5-.76 1.3-.93 1.87-.93h.02c.71 0 1.25.21 1.6.61.26.3.42.7.5 1.21-.6-.1-1.24-.13-1.93-.09-1.95.11-3.2 1.25-3.12 2.83.04.8.44 1.49 1.12 1.94.58.38 1.32.56 2.1.52 1.02-.06 1.83-.45 2.39-1.17.43-.55.7-1.26.82-2.15.49.3.85.69 1.05 1.16.34.8.36 2.11-.71 3.18-.94.93-2.07 1.34-3.78 1.35-1.9-.01-3.34-.62-4.28-1.81-.88-1.11-1.34-2.72-1.36-4.78.02-2.06.48-3.67 1.36-4.78.94-1.19 2.38-1.8 4.28-1.81 1.92.01 3.38.62 4.35 1.81.48.59.84 1.33 1.08 2.2l1.43-.38c-.29-1.07-.74-2-1.36-2.76C18.13 2.62 16.27 1.78 13.9 1.77h-.01c-2.36.01-4.19.85-5.45 2.49-1.12 1.46-1.7 3.49-1.72 6.04v.01c.02 2.55.6 4.58 1.72 6.04 1.26 1.64 3.09 2.48 5.45 2.49h.01c2.1-.01 3.58-.57 4.8-1.79 1.6-1.6 1.55-3.6.93-4.97-.27-.6-.69-1.13-1.23-1.56zm-3.55 2.42c-.86.05-1.76-.34-1.81-1.17-.03-.62.45-1.31 1.86-1.39.16-.01.32-.01.47-.01.51 0 .98.05 1.41.14-.16 2-1.1 2.38-1.93 2.43z"></path></svg></a>
<a href="https://www.linkedin.com/company/thetimespatriot" target="_blank" rel="noopener" aria-label="LinkedIn" data-testid="social-linkedin"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.27 2.38 4.27 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM3.56 20.45h3.56V9H3.56v11.45z"></path></svg></a>
</div>
</div>
<div class="drawer-section">
<div class="drawer-section-actions">

<button class="drawer-btn drawer-btn-secondary" data-testid="theme-toggle-drawer"><span data-theme-icon="" style="display:inline-flex; align-items:center;"></span><span>Toggle Dark Mode</span></button>
</div>
</div>
</aside>

<!-- Main Content Area -->
<main class="article-wrap">
  <div class="container">
    <div class="article-layout">
      <article data-testid="article-root">
        <header class="article-head">
          <h1 class="article-title" data-testid="article-title">${escapeHTML(title)}</h1>
          <p class="article-deck" data-testid="article-excerpt">${escapeHTML(excerpt)}</p>
          <div class="container">
            <div class="ad-slot leaderboard" style="margin-top:24px;" data-testid="ad-slot-top">
              <div class="ad-label">Advertisement</div>
              <div class="ad-size">Google AdSense — 970 x 90 Large Leaderboard</div>
            </div>
          </div>
          <br>
          <div class="article-byline" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
            <div style="display: flex; align-items: center; gap: 12px; flex: 1; min-width: 250px;">
              <div class="byline-author-link" style="display: flex; align-items: center; gap: 12px; color: inherit;">
                <div class="byline-avatar">T</div>
                <div class="byline-meta">
                  <b data-testid="article-author">Reported by The Times Patriot</b>
                  <span data-testid="article-date">${formattedDate} &middot; ${escapeHTML(readMinute)}</span>
                </div>
              </div>
            </div>
            <div class="byline-spacer" style="flex: 1; min-width: 20px; display: none;"></div>
            <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
              <div class="share" data-testid="article-share">
              <div class="share-dropdown-container">
                <button type="button" class="share-btn-trigger" id="article-share-trigger" aria-expanded="false" aria-label="Share article" data-testid="share-trigger-btn">
                  <svg class="share-icon-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path>
                    <polyline points="16 6 12 2 8 6"></polyline>
                    <line x1="12" y1="2" x2="12" y2="15"></line>
                  </svg>
                  <span class="share-btn-text">Share</span>
                  <svg class="share-chevron-svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </button>
                <div class="share-dropdown-menu" id="article-share-menu" hidden aria-hidden="true">
                  <div class="share-menu-header">
                    <span>Share Story</span>
                    <button type="button" class="share-menu-close" id="article-share-close" aria-label="Close share menu">&times;</button>
                  </div>
                  <div class="share-options-grid">
                    <button type="button" class="share-option-btn share-x" id="share-opt-x" title="Share on X" aria-label="Share on X" data-testid="share-x">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
                      <span>X / Twitter</span>
                    </button>
                    <button type="button" class="share-option-btn share-fb" id="share-opt-fb" title="Share on Facebook" aria-label="Share on Facebook" data-testid="share-fb">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M22 12c0-5.523-4.477-10-10-10S2 6.477 2 12c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V12h2.54V9.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V12h2.773l-.443 2.89h-2.33v6.988C18.343 21.128 22 16.991 22 12z"/></svg>
                      <span>Facebook</span>
                    </button>
                    <button type="button" class="share-option-btn share-linkedin" id="share-opt-linkedin" title="Share on LinkedIn" aria-label="Share on LinkedIn" data-testid="share-linkedin">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.45 20.45h-3.55v-5.57c0-1.33-.03-3.04-1.85-3.04-1.85 0-2.13 1.45-2.13 2.94v5.67H9.36V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.38-1.85 3.61 0 4.27 2.38 4.27 5.47v6.27zM5.34 7.43a2.06 2.06 0 1 1 0-4.12 2.06 2.06 0 0 1 0 4.12zM3.56 20.45h3.56V9H3.56v11.45z"/></svg>
                      <span>LinkedIn</span>
                    </button>
                    <button type="button" class="share-option-btn share-whatsapp" id="share-opt-whatsapp" title="Share on WhatsApp" aria-label="Share on WhatsApp" data-testid="share-whatsapp">
                      <svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.031 2c-5.517 0-9.993 4.476-9.993 9.993 0 1.764.459 3.487 1.333 5.003L2 22l5.129-1.346a9.96 9.96 0 004.902 1.28h.004c5.516 0 9.992-4.476 9.992-9.993 0-2.67-1.04-5.18-2.928-7.069A9.923 9.923 0 0012.031 2zm0 18.272h-.003a8.28 8.28 0 01-4.225-1.161l-.303-.18-3.041.797.811-2.965-.197-.314a8.273 8.273 0 01-1.272-4.456c0-4.571 3.72-8.291 8.291-8.291 2.215 0 4.298.863 5.864 2.43 1.566 1.566 2.428 3.649 2.428 5.864 0 4.571-3.72 8.291-8.291 8.291zm4.544-6.208c-.249-.125-1.472-.726-1.7-.809-.228-.083-.394-.125-.561.125-.166.249-.644.809-.789.975-.145.166-.29.187-.539.062a6.792 6.792 0 01-1.998-1.232 7.483 7.483 0 01-1.383-1.722c-.145-.249-.015-.384.109-.507.112-.111.249-.29.373-.435.125-.145.166-.249.249-.415.083-.166.042-.311-.021-.435-.062-.125-.561-1.35-.769-1.848-.202-.486-.407-.42-.561-.428l-.477-.008c-.166 0-.435.062-.663.311s-.871.851-.871 2.075c0 1.224.892 2.407 1.017 2.573.125.166 1.756 2.681 4.254 3.761.594.257 1.058.411 1.42.526.598.19 1.142.163 1.572.099.48-.071 1.472-.602 1.679-1.183.208-.581.208-1.079.145-1.183-.062-.104-.228-.166-.477-.291z"/></svg>
                      <span>WhatsApp</span>
                    </button>
                    <button type="button" class="share-option-btn share-email" id="share-opt-email" title="Share via Email" aria-label="Share via Email" data-testid="share-email">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                      <span>Email</span>
                    </button>
                    <button type="button" class="share-option-btn share-native" id="share-opt-native" title="More Options" aria-label="More share options" data-testid="share-native">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>
                      <span>More...</span>
                    </button>
                  </div>
                  <div class="share-copy-section">
                    <label for="share-url-field" class="share-copy-label">Article Link</label>
                    <div class="share-copy-box">
                      <input type="text" id="share-url-field" class="share-url-input" readonly value="" />
                      <button type="button" class="share-copy-btn" id="share-copy-btn" aria-label="Copy link to clipboard" data-testid="share-copy-btn">
                        <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                        <span class="copy-text">Copy</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>
        <figure class="article-hero">
          ${getImgHTML(image, title, category, 'article-hero-fallback', 'data-testid="article-hero-image"')}
          <figcaption>${escapeHTML(caption)}</figcaption>
        </figure>
        <div class="article-body" data-testid="article-body">
          ${bodyContentHtml}
        </div>
        <div id="crisis-note-wrapper"></div>
      </article>
      <aside data-testid="article-aside">
        <div class="ad-slot rectangle" data-testid="ad-slot-aside">
          <div class="ad-label">Advertisement</div>
          <div class="ad-size">Google AdSense &mdash; 300 x 250 Medium Rectangle</div>
        </div> <br/>
        <div class="aside-block">
          <h4>Latest stories</h4>
          <div class="aside-list">
            ${sideArticles.map((r, i) => {
              let rSlug = r.id;
              if (r.article_link) {
                const cl = r.article_link.replace(/^\/+article\/+/, '').replace(/\.html$/, '');
                if (cl) rSlug = cl;
              }
              return `
              <a class="aside-item" href="/article/${encodeURIComponent(rSlug)}.html" data-testid="latest-link-${i}">
                ${getImgHTML(r.image, r.title, r.category, 'aside-fallback-img', 'loading="lazy"')}
                <div>
                  <div class="t">${escapeHTML(r.title)}</div>
                  <div class="m">${fmtDate(r.date)}</div>
                </div>
              </a>`;
            }).join('\n')}
          </div>
        </div>
      </aside>
    </div>
  </div>
  <div class="container">
    <div class="ad-slot leaderboard" style="margin-top:24px; margin-bottom:24px;" data-testid="ad-slot-bottom">
      <div class="ad-label">Advertisement</div>
      <div class="ad-size">Google AdSense — 970 x 90 Large Leaderboard</div>
    </div>
  </div>
</main>

<!-- FOOTER -->
<footer class="site-footer" role="contentinfo">
<div class="container">
<div class="footer-grid">
  <div class="footer-brand">
    <h3>The Times Patriot</h3>
    <p>Independent journalism. Politics, local affairs, and in-depth reporting since 2026.</p>
    
<div class="footer-social" style="margin-top:18px;">
  <a href="https://paypal.me/thetimespatriot" target="_blank" rel="noopener" aria-label="Paypal" data-testid="footer-social-paypal"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 640 850"><path fill="currentColor" d="M232 407q-23 0-40 14t-22 38l-35 208H21q-9 0-15-7t-5-16l52-337L96 36q2-12 11-20t21-8h233q55 0 100 16t70 47q18 21 25 38q9 20 9 43v11q-1 6-1 12t-2 14q-1 4-1 7t-1 6q-20 104-84 154t-176 51h-68zm375-189q21 25 26 60t-3 78q-10 52-32 87t-52 58t-69 31t-83 10h-18q-11 0-19 6t-10 18l-2 8l-22 145l-2 6q-2 11-9 18t-19 7H173l45-283q2-11 14-11h68q128 0 205-61t102-177z"></path></svg></a>
  <a href="https://patreon.com/Thetimespatriot" target="_blank" rel="noopener" aria-label="Patreon" data-testid="footer-social-patreon"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24"><path fill="currentColor" d="M0 .48v23.04h4.22V.48zm15.385 0c-4.764 0-8.641 3.88-8.641 8.65c0 4.755 3.877 8.623 8.641 8.623c4.75 0 8.615-3.868 8.615-8.623C24 4.36 20.136.48 15.385.48z"></path></svg></a>
  <a href="https://www.youtube.com/@thetimespatriot" rel="noopener" aria-label="YouTube" data-testid="footer-social-youtube"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg></a>
  <a href="https://x.com/thetimespatriot/" target="_blank" rel="noopener" aria-label="X" data-testid="footer-social-x"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></svg></a>
  <a href="https://www.facebook.com/TheTimesPatriot/" target="_blank" rel="noopener" aria-label="Facebook" data-testid="footer-social-facebook"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 24 24"><path fill="currentColor" d="M9.602 21.026v-7.274H6.818a.545.545 0 0 1-.545-.545V10.33a.545.545 0 0 1 .545-.545h2.773V7a4.547 4.547 0 0 1 4.86-4.989h2.32a.556.556 0 0 1 .557.546v2.436a.557.557 0 0 1-.557.545h-1.45c-1.566 0-1.867.742-1.867 1.833v2.413h3.723a.533.533 0 0 1 .546.603l-.337 2.888a.545.545 0 0 1-.545.476h-3.364v7.274a.962.962 0 0 1-.975.974h-1.937a.961.961 0 0 1-.963-.974"></path></svg></a>
  <a href="https://www.instagram.com/thetimespatriot/" target="_blank" rel="noopener" aria-label="Instagram" data-testid="footer-social-instagram"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919C8.416 2.175 8.796 2.163 12 2.163zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.881 1.44 1.44 0 0 0 0-2.881z"></path></svg></a>
  <a href="https://www.threads.com/@thetimespatriot" target="_blank" rel="noopener" aria-label="Threads" data-testid="social-threads"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M17.4 11.06c-.07-.03-.14-.07-.21-.1-.13-2.4-1.45-3.78-3.65-3.79h-.03c-1.32 0-2.41.56-3.09 1.59l1.22.83c.5-.76 1.3-.93 1.87-.93h.02c.71 0 1.25.21 1.6.61.26.3.42.7.5 1.21-.6-.1-1.24-.13-1.93-.09-1.95.11-3.2 1.25-3.12 2.83.04.8.44 1.49 1.12 1.94.58.38 1.32.56 2.1.52 1.02-.06 1.83-.45 2.39-1.17.43-.55.7-1.26.82-2.15.49.3.85.69 1.05 1.16.34.8.36 2.11-.71 3.18-.94.93-2.07 1.34-3.78 1.35-1.9-.01-3.34-.62-4.28-1.81-.88-1.11-1.34-2.72-1.36-4.78.02-2.06.48-3.67 1.36-4.78.94-1.19 2.38-1.8 4.28-1.81 1.92.01 3.38.62 4.35 1.81.48.59.84 1.33 1.08 2.2l1.43-.38c-.29-1.07-.74-2-1.36-2.76C18.13 2.62 16.27 1.78 13.9 1.77h-.01c-2.36.01-4.19.85-5.45 2.49-1.12 1.46-1.7 3.49-1.72 6.04v.01c.02 2.55.6 4.58 1.72 6.04 1.26 1.64 3.09 2.48 5.45 2.49h.01c2.1-.01 3.58-.57 4.8-1.79 1.6-1.6 1.55-3.6.93-4.97-.27-.6-.69-1.13-1.23-1.56zm-3.55 2.42c-.86.05-1.76-.34-1.81-1.17-.03-.62.45-1.31 1.86-1.39.16-.01.32-.01.47-.01.51 0 .98.05 1.41.14-.16 2-1.1 2.38-1.93 2.43z"></path></svg></a>
  <a href="https://www.linkedin.com/company/thetimespatriot/posts" target="_blank" rel="noopener" aria-label="LinkedIn" data-testid="footer-social-linkedin"><svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 432 432"><path fill="currentColor" d="M319 221.5q-8-10.5-30-10.5q-27 0-38 16t-11 45v146q0 5-3 8t-8 3h-76q-4 0-7.5-3t-3.5-8V148q0-4 3.5-7.5t7.5-3.5h74q4 0 6.5 2t3.5 6v5q1 2 1 7q28-27 76-27q53 0 83 27t30 79v182q0 5-3.5 8t-7.5 3h-78q-4 0-7.5-3t-3.5-8V254q0-22-8-32.5zM88 91.5Q73 107 51.5 107T15 91.5t-15-37T15 18T51.5 3T88 18t15 36.5t-15 37zm13 56.5v270q0 5-3.5 8t-7.5 3H14q-5 0-8-3t-3-8V148q0-4 3-7.5t8-3.5h76q4 0 7.5 3.5t3.5 7.5z"></path></svg></a>
</div>
  </div>
  <div class="footer-col">
    <h5>Company</h5>
    <ul>
      <li><a href="/about.html">About Us</a></li>
      <li><a href="/contact.html">Contact</a></li>
      <li><a href="/ads.html">Advertise</a></li>
    </ul>
  </div>
  <div class="footer-col">
    <h5>Legal &amp; Governance</h5>
    <ul>
      <li><a href="/terms.html">Terms of Service</a></li>
      <li><a href="/privacy.html">Privacy Policy</a></li>
    </ul>
  </div>
  <div class="footer-col">
    
    <h5>Sections</h5>
    <ul style="list-style:none; padding:0; margin:0; line-height:1.8;">
      <li><a href="/">Home</a></li>
    </ul>
  </div>
</div>
<div class="footer-bottom">
  <div>© <span data-testid="footer-year">2026</span> The Times Patriot. All rights reserved.</div>
  <div>Made for free press and informed citizens.</div>
</div>
</div>
</footer>
<script src="/assets/js/main.js" defer=""></script>
<script src="/assets/js/article.js" defer=""></script>

</body></html>`;
}

export async function generateAllStaticArticles() {
  console.log('Starting static article generation...');
  const articleDir = path.join(process.cwd(), 'article');
  if (!fs.existsSync(articleDir)) {
    fs.mkdirSync(articleDir, { recursive: true });
  }

  let articlesToGenerate: any[] = [];

  // Try fetching from PostgreSQL database first if configured
  if (process.env.DATABASE_URL) {
    try {
      const pool = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
        max: 5
      });
      const res = await pool.query(`
        SELECT id, title, article_link, author, date, read_time, category, image, caption, excerpt, body
        FROM articles
        ORDER BY date DESC
      `);
      articlesToGenerate = res.rows;
      console.log(`Fetched ${articlesToGenerate.length} articles from PostgreSQL.`);
      await pool.end();
    } catch (e: any) {
      console.warn('Could not query PostgreSQL, falling back to static data files:', e.message);
    }
  }

  // Fallback to data/home*.json if DB is not available
  if (articlesToGenerate.length === 0) {
    const dataDir = path.join(process.cwd(), 'data');
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('home') && f.endsWith('.json') && f !== 'home.json')
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });

      const seenIds = new Set<string>();
      for (const file of files) {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dataDir, file), 'utf8'));
          const list = Array.isArray(content) ? content : (content.articles || []);
          for (const a of list) {
            if (a && a.id && !seenIds.has(a.id)) {
              seenIds.add(a.id);
              articlesToGenerate.push(a);
            }
          }
        } catch (err) {}
      }
      console.log(`Loaded ${articlesToGenerate.length} articles from data/home*.json.`);
    }
  }

  const latestArticles = articlesToGenerate.slice(0, 8);
  let generatedCount = 0;
  const batchSize = 100;

  for (let i = 0; i < articlesToGenerate.length; i += batchSize) {
    const batch = articlesToGenerate.slice(i, i + batchSize);
    await Promise.all(batch.map(async (article) => {
      let filename = article.id;
      if (article.article_link) {
        const cleanLink = article.article_link.replace(/^\/+article\/+/, '').replace(/\.html$/, '');
        if (cleanLink) filename = cleanLink;
      }

      if (!filename.endsWith('.html')) {
        filename += '.html';
      }

      const html = buildArticleHtmlPage(article, latestArticles);
      const filePath = path.join(articleDir, filename);
      fs.writeFileSync(filePath, html, 'utf8');

      if (article.id && !filename.startsWith(article.id)) {
        const altPath = path.join(articleDir, `${article.id}.html`);
        if (!fs.existsSync(altPath)) {
          fs.writeFileSync(altPath, html, 'utf8');
        }
      }

      generatedCount++;
    }));
    console.log(`Generated ${generatedCount} / ${articlesToGenerate.length} static HTML pages...`);
  }

  console.log(`Successfully generated all ${generatedCount} static HTML pages in /article/!`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  generateAllStaticArticles()
    .then(() => {
      console.log('Done.');
      process.exit(0);
    })
    .catch((err) => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}
