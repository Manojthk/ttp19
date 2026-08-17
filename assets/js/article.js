function cleanExcerpt(str) {
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

function escapeHTML(s) {
  return String(s || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function formatViews(views) {
  const num = Number(views) || 0;
  if (num < 1000) return num.toString();
  if (num < 1000000) {
    const val = Math.floor((num / 1000) * 10) / 10;
    return (val % 1 === 0 ? val.toFixed(0) : val.toString()) + 'K';
  }
  const val = Math.floor((num / 1000000) * 10) / 10;
  return (val % 1 === 0 ? val.toFixed(0) : val.toString()) + 'M';
}

function injectDynamicSEO(article) {
  const titleEl = document.querySelector('[data-testid="article-title"]');
  const excerptEl = document.querySelector('[data-testid="article-excerpt"]');
  const imageEl = document.querySelector('[data-testid="article-hero-image"]');
  const authorEl = document.querySelector('[data-testid="article-author"]');
  const dateEl = document.querySelector('[data-testid="article-date"]');
  const categoryEl = document.querySelector('[data-testid="article-category"]');

  const title = (article && article.title) ? article.title : (titleEl ? titleEl.textContent.trim() : document.title);
  const excerpt = cleanExcerpt((article && article.excerpt) ? article.excerpt : (excerptEl ? excerptEl.textContent.trim() : ''));
  const image = (article && article.image) ? article.image : (imageEl ? imageEl.src : '');
  const category = (article && article.category) ? article.category : (categoryEl ? categoryEl.textContent.trim() : 'News');
  let author = 'The Times Patriot';
  if (article && article.author) {
    author = 'The Times Patriot';
  } else if (authorEl) {
    author = 'The Times Patriot';
  }

  let dateIso = new Date().toISOString();
  if (article && article.date) {
    const d = new Date(article.date);
    if (!isNaN(d.valueOf())) dateIso = d.toISOString();
  } else if (dateEl) {
    const dateText = dateEl.textContent.split('·')[0].trim();
    const d = new Date(dateText);
    if (!isNaN(d.valueOf())) dateIso = d.toISOString();
  }

  document.title = `${title} — The Times Patriot`;

  function updateMeta(nameOrProperty, key, value) {
    if (!value) return;
    let meta = document.querySelector(`meta[${nameOrProperty}="${key}"]`);
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute(nameOrProperty, key);
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', value);
  }

  updateMeta('name', 'description', excerpt);
  updateMeta('property', 'og:title', title);
  updateMeta('property', 'og:description', excerpt);
  updateMeta('name', 'twitter:description', excerpt);
  updateMeta('property', 'og:image', image);
  updateMeta('property', 'og:type', 'article');
  updateMeta('property', 'og:url', window.location.href);

  // Set meta keywords with tags and category separately
  let tagsList = [];
  if (article && article.tags) {
    if (Array.isArray(article.tags)) {
      tagsList = article.tags;
    } else if (typeof article.tags === 'string') {
      try {
        const parsed = JSON.parse(article.tags);
        tagsList = Array.isArray(parsed) ? parsed : article.tags.split(',').map(s => s.trim()).filter(Boolean);
      } catch (e) {
        tagsList = article.tags.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  const keywordsParts = [];
  if (tagsList.length > 0) {
    keywordsParts.push(tagsList.join(', '));
  }
  if (category) {
    keywordsParts.push(category.replace(/ > /g, ', '));
  }
  const keywordsVal = keywordsParts.join(', ');
  if (keywordsVal) {
    updateMeta('name', 'keywords', keywordsVal);
  }

  const existingLd = document.querySelector('script[type="application/ld+json"]');
  if (existingLd) existingLd.remove();
  const ld = document.createElement('script');
  ld.type = 'application/ld+json';
  ld.textContent = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'NewsArticle',
    headline: title,
    image: image ? [image] : [],
    datePublished: dateIso,
    dateModified: dateIso,
    author: [{ '@type': 'Person', name: author }],
    publisher: {
       '@type': 'Organization',
       name: 'The Times Patriot',
       logo: { '@type': 'ImageObject', url: window.location.origin + '/favicon.ico' }
     },
    description: excerpt,
    articleSection: category,
  });
  document.head.appendChild(ld);
}

function getCategorySlug(catName) {
  if (!catName) return 'National-News';
  const clean = catName.trim();
  const mainCatMap = {
    'National News': 'National-News',
    'National': 'National-News',
    'Business & Economy': 'Business-Economy',
    'Business': 'Business-Economy',
    'Economy': 'Business-Economy',
    'Sports': 'Sports',
    'Entertainment & Lifestyle': 'Entertainment-Lifestyle',
    'Tech, Gadgets & Science': 'Tech-Gadgets-Science',
    'Technology': 'Tech-Gadgets-Science',
    'International': 'International',
    'World': 'International'
  };
  if (mainCatMap[clean]) return mainCatMap[clean];

  return clean
    .replace(/ & /g, '-')
    .replace(/, /g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '');
}

function getSubcategorySlug(subName) {
  if (!subName) return '';
  const clean = subName.trim();
  const subCatMap = {
    'State, City & Local News': 'State-City-Local-News',
    'Industry & Startups': 'Industry-Startups',
    'Bollywood & Cinema': 'Bollywood-Cinema',
    'Fashion & Trends': 'Fashion-Trends',
    'Travel & Food': 'Travel-Food',
    'Education & Jobs': 'Education-Jobs',
    'Personal Finance': 'Personal-Finance',
    'Regional News': 'Regional-News',
    'Multi-Sport': 'Multi-Sport'
  };
  if (subCatMap[clean]) return subCatMap[clean];

  return clean
    .replace(/ & /g, '-')
    .replace(/, /g, '-')
    .replace(/\s+/g, '-')
    .replace(/[^\w\-]+/g, '');
}

function formatCategoryLinks(categoryStr) {
  if (!categoryStr) return 'News';
  
  const parts = categoryStr.split(/\s*>\s*/);
  
  if (parts.length === 1) {
    const mainCat = parts[0].trim();
    const mainSlug = getCategorySlug(mainCat);
    return `${escapeHTML(mainCat)}`;
  }
  
  const mainCat = parts[0].trim();
  const mainSlug = getCategorySlug(mainCat);
  const mainLink = `${escapeHTML(mainCat)}`;
  
  let subPart = parts[1].trim();
  let locName = '';
  
  const locMatch = subPart.match(/^(.*?)\s*\(([^)]+)\)$/);
  if (locMatch) {
    subPart = locMatch[1].trim();
    locName = locMatch[2].trim();
  }
  
  const subItems = subPart.split(',').map(s => s.trim()).filter(Boolean);
  const subLinks = subItems.map(item => {
    const itemSlug = getSubcategorySlug(item);
    return `${escapeHTML(item)}`;
  }).join(', ');
  
  let result = `${mainLink} &gt; ${subLinks}`;
  
  if (locName) {
    const locSlug = locName.replace(/\s+/g, '-');
    const locLink = `(${escapeHTML(locName)})`;
    result += ` ${locLink}`;
  }
  
  return result;
}

(function () {
  'use strict';
  
  function escapeHTML(s) {
     return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  } function fmtDate(iso) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (isNaN(d.valueOf())) return iso;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch (e) {
    return iso;
  }
}
  const articleRoot = document.querySelector('[data-testid="article-root"]');
  const asideRoot = document.querySelector('[data-testid="article-aside"]');

  if (!articleRoot && !asideRoot) return;
  
  window.scrollTo(0, 0); // scroll to top when article is loaded

  
  const pathMatch = window.location.pathname.match(/\/article\/([^?#]+)/);
  if (pathMatch && pathMatch[1].endsWith('.html')) {
    pathMatch[1] = pathMatch[1].replace('.html', '');
  }

  let rawArticleId = pathMatch ? pathMatch[1] : new URLSearchParams(window.location.search).get('id');
  if (rawArticleId && rawArticleId.endsWith('/')) {
    rawArticleId = rawArticleId.slice(0, -1);
  }
  let currentArticleId = rawArticleId || '';
  if (currentArticleId) {
    try {
      currentArticleId = decodeURIComponent(currentArticleId);
    } catch (e) {}
  }

  if (!currentArticleId) {
    if (articleRoot) {
      articleRoot.innerHTML = `
        <div style="text-align: center; padding: 60px 20px; margin: 60px auto; max-width: 600px; background: var(--surface-1, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
          <h2 style="font-size: 24px; font-weight: 700; margin: 0 0 12px 0; color: var(--text-primary, #0f172a);">Article Not Found</h2>
          <p style="font-size: 16px; color: var(--text-secondary, #64748b); margin: 0 0 28px 0; line-height: 1.5;">The article you are looking for does not exist or has been removed.</p>
          <a href="/" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--surface-3, #f1f5f9); border: 1px solid var(--border-color, #e2e8f0); color: var(--text-primary, #0f172a); border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 14px;">
            Return to Home
          </a>
        </div>
      `;
    }
    return;
  }

  function renderEditorJSBlocks(bodyData) {
    if (!bodyData) return '';
    let data = bodyData;
    if (typeof data === 'string') {
      try {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          data = parsed;
        }
      } catch(e) {
        // Not JSON
      }
    }

    if (typeof data === 'string') {
      if (data.trim().startsWith('<') || data.includes('<p>') || data.includes('<h1>') || data.includes('<h2>') || data.includes('<div>') || data.includes('<figure>')) {
        return data;
      }
      return `<p>${escapeHTML(data)}</p>`;
    }

    if (typeof data === 'object' && data !== null) {
      if (typeof data.html === 'string') {
        return data.html;
      }
      if (Array.isArray(data)) {
        return data.map(p => {
          if (typeof p === 'string') {
            return (p.trim().startsWith('<') || p.includes('<p>')) ? p : `<p>${escapeHTML(p)}</p>`;
          }
          return `<p>${escapeHTML(JSON.stringify(p))}</p>`;
        }).join('');
      }
      if (!Array.isArray(data.blocks)) {
        return `<p>${escapeHTML(JSON.stringify(data))}</p>`;
      }
    }

    return data.blocks.map(block => {
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
          const itemsHtml = items.map(item => {
            const content = typeof item === 'string' ? item : (item.content || item.text || '');
            return `<li>${content}</li>`;
          }).join('');
          return `<${tag} class="cdx-list">${itemsHtml}</${tag}>`;
        }
        case 'image': {
          const url = bData.file ? bData.file.url : (bData.url || '');
          const caption = bData.caption || '';
          return `
            <figure class="cdx-image-block" style="margin: 24px 0; text-align: center;">
              <img src="${escapeHTML(url)}" alt="${escapeHTML(caption)}" style="max-width: 100%; border-radius: 8px;" />
              ${caption ? `<figcaption style="font-size: 13px; color: var(--text-secondary); margin-top: 8px;">${escapeHTML(caption)}</figcaption>` : ''}
            </figure>
          `;
        }
        case 'quote': {
          return `
            <blockquote class="cdx-quote">
              <p>${bData.text || ''}</p>
              ${bData.caption ? `<cite style="font-size: 14px; color: var(--text-secondary); display: block; margin-top: 6px;">— ${escapeHTML(bData.caption)}</cite>` : ''}
            </blockquote>
          `;
        }
        case 'warning': {
          return `
            <div class="cdx-warning">
              <strong>${escapeHTML(bData.title || 'Warning')}:</strong> ${bData.message || ''}
            </div>
          `;
        }
        case 'code': {
          return `
            <pre style="background: var(--surface-2, #1e293b); color: #e2e8f0; padding: 16px; border-radius: 8px; overflow-x: auto; font-family: monospace;"><code>${escapeHTML(bData.code || '')}</code></pre>
          `;
        }
        case 'checklist': {
          const items = Array.isArray(bData.items) ? bData.items : [];
          return `
            <ul style="list-style: none; padding-left: 0;">
              ${items.map(item => `
                <li style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                  <input type="checkbox" ${item.checked ? 'checked' : ''} disabled />
                  <span>${item.text || ''}</span>
                </li>
              `).join('')}
            </ul>
          `;
        }
        case 'table': {
          const content = Array.isArray(bData.content) ? bData.content : [];
          const withHeadings = bData.withHeadings;
          return `
            <div style="overflow-x: auto; margin: 20px 0;">
              <table style="width: 100%; border-collapse: collapse; border: 1px solid var(--border-color);">
                <tbody>
                  ${content.map((row, rIdx) => `
                    <tr>
                      ${row.map(cell => {
                        const isHeader = withHeadings && rIdx === 0;
                        const cellTag = isHeader ? 'th' : 'td';
                        return `<${cellTag} style="border: 1px solid var(--border-color); padding: 8px 12px; text-align: left;">${cell}</${cellTag}>`;
                      }).join('')}
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `;
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

          return `
            <div class="embed-responsive-wrapper">
              <iframe src="${escapeHTML(embedUrl)}" allowfullscreen loading="lazy"></iframe>
            </div>
            ${bData.caption ? `<div style="font-size: 13px; color: var(--text-secondary); text-align: center; margin-top: -12px; margin-bottom: 20px;">${escapeHTML(bData.caption)}</div>` : ''}
          `;
        }
        default: {
          return `<p>${bData.text || ''}</p>`;
        }
      }
    }).join('');
  }

  function insertArticleAds(articleBodyElement) {
    if (!articleBodyElement) return;

    const existingInlineAds = articleBodyElement.querySelectorAll('.ad-inline-container');
    existingInlineAds.forEach(ad => ad.remove());

    const totalCharCount = (articleBodyElement.textContent || '').trim().length;
    if (totalCharCount < 500) return;

    const targetAdCount = 1 + Math.floor((totalCharCount - 500) / 1000);
    if (targetAdCount <= 0) return;

    const paragraphs = Array.from(articleBodyElement.querySelectorAll('p'));
    if (paragraphs.length === 0) return;

    let accumulatedChars = 0;
    let placedAds = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const p = paragraphs[i];
      accumulatedChars += (p.textContent || '').length;

      const nextThreshold = 500 + placedAds * 1000;
      if (placedAds < targetAdCount && accumulatedChars >= nextThreshold) {
        const adContainer = document.createElement('div');
        adContainer.className = 'container ad-inline-container';
        adContainer.style.cssText = 'text-align: center; margin: 28px auto; width: 100%; display: flex; justify-content: center;';
        adContainer.innerHTML = `
          <div class="ad-slot leaderboard" style="margin-top:24px; display: inline-block; width: 100%; max-width: 970px;" data-testid="ad-slot-article">
            <div class="ad-label">Advertisement</div>
            <div class="ad-size">Google AdSense — 970 x 90 Large Leaderboard</div>
          </div>
        `;
        p.after(adContainer);
        placedAds++;
      }
    }

    if (placedAds < targetAdCount) {
      for (let i = paragraphs.length - 1; i >= 0 && placedAds < targetAdCount; i--) {
        const p = paragraphs[i];
        if (p.nextElementSibling && p.nextElementSibling.classList.contains('ad-inline-container')) {
          continue;
        }
        const adContainer = document.createElement('div');
        adContainer.className = 'container ad-inline-container';
        adContainer.style.cssText = 'text-align: center; margin: 28px auto; width: 100%; display: flex; justify-content: center;';
        adContainer.innerHTML = `
          <div class="ad-slot leaderboard" style="margin-top:24px; display: inline-block; width: 100%; max-width: 970px;" data-testid="ad-slot-article">
            <div class="ad-label">Advertisement</div>
            <div class="ad-size">Google AdSense — 970 x 90 Large Leaderboard</div>
          </div>
        `;
        p.after(adContainer);
        placedAds++;
      }
    }
  }

  window.insertArticleAds = insertArticleAds;

  function initFontSizeControls() {
    const DEFAULT_SIZE = 18; // px
    const MIN_SIZE = 14; // px
    const MAX_SIZE = 26; // px
    const STEP = 2; // px
    const STORAGE_KEY = 'ttp-article-font-size';

    let currentSize = parseInt(localStorage.getItem(STORAGE_KEY), 10) || DEFAULT_SIZE;
    if (isNaN(currentSize) || currentSize < MIN_SIZE || currentSize > MAX_SIZE) {
      currentSize = DEFAULT_SIZE;
    }

    function applyFontSize(size) {
      currentSize = Math.max(MIN_SIZE, Math.min(MAX_SIZE, size));
      localStorage.setItem(STORAGE_KEY, currentSize.toString());

      const articleBodies = document.querySelectorAll('[data-testid="article-body"], .article-body');
      articleBodies.forEach(body => {
        body.style.setProperty('--article-body-font-size', `${currentSize}px`);
        body.style.fontSize = `${currentSize}px`;
      });

      const pct = Math.round((currentSize / DEFAULT_SIZE) * 100);

      document.querySelectorAll('.font-size-indicator').forEach(el => {
        el.textContent = `${pct}%`;
      });

      document.querySelectorAll('.btn-font-decrease').forEach(btn => {
        btn.disabled = (currentSize <= MIN_SIZE);
      });

      document.querySelectorAll('.btn-font-increase').forEach(btn => {
        btn.disabled = (currentSize >= MAX_SIZE);
      });

      document.querySelectorAll('.btn-font-reset').forEach(btn => {
        btn.style.opacity = currentSize === DEFAULT_SIZE ? '0.5' : '1';
        btn.style.pointerEvents = currentSize === DEFAULT_SIZE ? 'none' : 'auto';
      });
    }

    applyFontSize(currentSize);

    if (!window._fontSizeControlsInitialized) {
      window._fontSizeControlsInitialized = true;
      document.addEventListener('click', (e) => {
        const decBtn = e.target.closest('.btn-font-decrease');
        if (decBtn) {
          e.preventDefault();
          const cur = parseInt(localStorage.getItem(STORAGE_KEY), 10) || DEFAULT_SIZE;
          applyFontSize(cur - STEP);
          return;
        }

        const incBtn = e.target.closest('.btn-font-increase');
        if (incBtn) {
          e.preventDefault();
          const cur = parseInt(localStorage.getItem(STORAGE_KEY), 10) || DEFAULT_SIZE;
          applyFontSize(cur + STEP);
          return;
        }

        const resetBtn = e.target.closest('.btn-font-reset');
        if (resetBtn) {
          e.preventDefault();
          applyFontSize(DEFAULT_SIZE);
          return;
        }
      });
    }
  }

  window.initFontSizeControls = initFontSizeControls;

  /* --- Text to Speech (TTS) System --- */
  function injectTTSStyles() {
    if (document.getElementById('tts-dynamic-styles')) return;
    const style = document.createElement('style');
    style.id = 'tts-dynamic-styles';
    style.textContent = `
      .tts-active-mode .tts-readable-item {
        transition: background-color 0.25s ease, box-shadow 0.25s ease, padding 0.2s ease;
        border-radius: 4px;
      }
      .tts-active-mode .tts-readable-item:hover {
        outline: 1px dashed rgba(37, 99, 235, 0.35);
        cursor: pointer;
      }
      .tts-active-highlight {
        background-color: rgba(37, 99, 235, 0.16) !important;
        box-shadow: -4px 0 0 0 #2563eb, 0 0 0 2px rgba(37, 99, 235, 0.22) !important;
        padding-left: 8px !important;
        padding-right: 8px !important;
        border-radius: 4px !important;
        transition: background-color 0.25s ease, box-shadow 0.25s ease !important;
      }
      [data-theme="dark"] .tts-active-highlight,
      body.dark-theme .tts-active-highlight {
        background-color: rgba(59, 130, 246, 0.28) !important;
        box-shadow: -4px 0 0 0 #60a5fa, 0 0 0 2px rgba(96, 165, 250, 0.35) !important;
      }
    `;
    document.head.appendChild(style);
  }

  function initTextToSpeech() {
    injectTTSStyles();

    if (!('speechSynthesis' in window)) {
      console.warn('Text-to-Speech is not supported in this browser.');
      document.querySelectorAll('.tts-controls-group, .tts-header-btn-wrap').forEach(el => el.style.display = 'none');
      return;
    }

    const listenBtns = document.querySelectorAll('#btn-tts-listen, #btn-tts-header-listen');
    const stopBtns = document.querySelectorAll('#btn-tts-stop, #btn-tts-header-stop');
    const speedSelects = document.querySelectorAll('#tts-speed-select');

    const articleBody = document.querySelector('[data-testid="article-body"], .article-body');
    if (!articleBody) return;

    let items = [];
    let currentIdx = -1;
    let isPlaying = false;
    let isPaused = false;

    function buildReadableItems() {
      items = [];

      // Only read article content paragraphs, headings, blockquotes, lists inside articleBody
      // (do NOT read article title or excerpt)
      const candidates = Array.from(articleBody.querySelectorAll('p, h2, h3, h4, h5, blockquote, li'));
      candidates.forEach(el => {
        if (el.closest('.ad-slot, .ad-label, .ad-size, #crisis-note-wrapper')) return;
        const text = el.textContent.trim();
        if (text.length > 0) {
          items.push({ el, text });
        }
      });

      items.forEach((item, index) => {
        item.el.classList.add('tts-readable-item');
        if (!item.el._ttsListenerAdded) {
          item.el._ttsListenerAdded = true;
          item.el.addEventListener('click', (e) => {
            if (e.target.closest('a, button, input')) return;
            // Only jump to paragraph if TTS is currently active and playing!
            if (isPlaying) {
              window.speechSynthesis.cancel();
              startSpeechFromIndex(index);
            }
          });
        }
      });
    }

    function updateUIState() {
      listenBtns.forEach(btn => {
        const textSpan = btn.querySelector('span');
        if (isPlaying && !isPaused) {
          if (textSpan) textSpan.textContent = 'Pause';
          btn.style.background = 'var(--brand-red, #dc2626)';
        } else if (isPlaying && isPaused) {
          if (textSpan) textSpan.textContent = 'Resume';
          btn.style.background = 'var(--primary, #2563eb)';
        } else {
          if (textSpan) textSpan.textContent = 'Listen';
          btn.style.background = 'var(--primary, #2563eb)';
        }
      });

      stopBtns.forEach(btn => {
        btn.style.display = isPlaying ? 'inline-flex' : 'none';
      });

      if (isPlaying) {
        articleBody.classList.add('tts-active-mode');
      } else {
        articleBody.classList.remove('tts-active-mode');
      }
    }

    function clearHighlight() {
      document.querySelectorAll('.tts-active-highlight').forEach(el => {
        el.classList.remove('tts-active-highlight');
      });
    }

    function highlightElement(el) {
      clearHighlight();
      if (el) {
        el.classList.add('tts-active-highlight');
        const rect = el.getBoundingClientRect();
        const inView = rect.top >= 80 && rect.bottom <= (window.innerHeight - 80);
        if (!inView) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }
    }

    function speakNextIndex(index) {
      if (!isPlaying) return;
      if (index >= items.length) {
        stopSpeech();
        return;
      }

      currentIdx = index;
      const item = items[currentIdx];
      highlightElement(item.el);

      const utter = new SpeechSynthesisUtterance(item.text);
      const speedVal = speedSelects[0] ? parseFloat(speedSelects[0].value) : 1.0;
      utter.rate = isNaN(speedVal) ? 1.0 : speedVal;

      utter.onend = () => {
        if (isPlaying && !isPaused) {
          speakNextIndex(currentIdx + 1);
        }
      };

      utter.onerror = (e) => {
        console.warn('TTS utterance error:', e);
        if (isPlaying && !isPaused) {
          speakNextIndex(currentIdx + 1);
        }
      };

      window.speechSynthesis.speak(utter);
    }

    function startSpeechFromIndex(index) {
      buildReadableItems();
      if (items.length === 0) return;
      window.speechSynthesis.cancel();

      isPlaying = true;
      isPaused = false;
      updateUIState();
      speakNextIndex(index);
    }

    function togglePlayPause() {
      if (!isPlaying) {
        startSpeechFromIndex(0);
      } else if (isPlaying && !isPaused) {
        window.speechSynthesis.pause();
        isPaused = true;
        updateUIState();
      } else if (isPlaying && isPaused) {
        window.speechSynthesis.resume();
        isPaused = false;
        updateUIState();
      }
    }

    function stopSpeech() {
      isPlaying = false;
      isPaused = false;
      currentIdx = -1;
      window.speechSynthesis.cancel();
      clearHighlight();
      updateUIState();
    }

    listenBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        togglePlayPause();
      });
    });

    stopBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        stopSpeech();
      });
    });

    speedSelects.forEach(select => {
      select.addEventListener('change', (e) => {
        const newSpeed = e.target.value;
        speedSelects.forEach(s => s.value = newSpeed);
        if (isPlaying && !isPaused && currentIdx >= 0) {
          const savedIdx = currentIdx;
          window.speechSynthesis.cancel();
          speakNextIndex(savedIdx);
        }
      });
    });

    window.addEventListener('beforeunload', () => {
      window.speechSynthesis.cancel();
    });
    window.addEventListener('popstate', () => {
      window.speechSynthesis.cancel();
    });
  }

  window.initTextToSpeech = initTextToSpeech;

  // Initial check for existing static article content
  document.addEventListener('DOMContentLoaded', () => {
    initFontSizeControls();
    const staticBody = document.querySelector('[data-testid="article-body"]');
    if (staticBody && staticBody.children.length > 0) {
      insertArticleAds(staticBody);
    }
  });

  // Fetch specific article for the main content
  const isPreRendered = articleRoot && articleRoot.querySelector('[data-testid="article-title"]') !== null;

  if (isPreRendered) {
    const titleText = document.querySelector('[data-testid="article-title"]')?.textContent || '';
    const excerptText = document.querySelector('[data-testid="article-excerpt"]')?.textContent || '';
    initShareDropdown({ title: titleText, excerpt: excerptText });
    insertArticleAds(articleRoot.querySelector('[data-testid="article-body"]'));
    initFontSizeControls();
    initTextToSpeech();
  } else if (articleRoot) {
    articleRoot.innerHTML = `
      <div class="skeleton-card" style="border:none; background:transparent; padding:0;">
        <div class="skeleton-box skeleton-cat"></div>
        <div class="skeleton-box skeleton-title" style="height:48px;"></div>
        <div class="skeleton-box skeleton-p"></div>
        <div class="skeleton-box skeleton-p" style="width:70%;"></div>
        <div class="skeleton-box skeleton-img" style="height:400px; margin-top:20px;"></div>
      </div>
    `;

    const token = localStorage.getItem('ttp-auth-token');
    const headers = {};
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    fetch(`/api/articles/${encodeURIComponent(currentArticleId)}`, { headers })
      .then(async (res) => {
        const contentType = res.headers.get("content-type") || "";
        let data = null;
        if (contentType.includes("json")) {
          data = await res.json().catch(() => null);
        }

        if (!res.ok || !data) throw new Error("Article not found");
        if (data) {
          data.isPrivate = false;
          data.author = 'The Times Patriot';
        }
        return data;
      })
      .then((article) => {
        if (!article) return;
        const authorName = 'The Times Patriot';
        window.currentArticleAuthor = authorName;
        let bodyHtml = renderEditorJSBlocks(article.body);
        
        articleRoot.innerHTML = `
          <header class="article-head">
            <h1 class="article-title" data-testid="article-title">${escapeHTML(article.title)}</h1>
            <p class="article-deck" data-testid="article-excerpt">${escapeHTML(cleanExcerpt(article.excerpt))}</p>
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
                    <span data-testid="article-date">${fmtDate(article.date)} &middot; ${escapeHTML(article.readTime)}</span>
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
                        <input type="text" id="share-url-field" class="share-url-input" readonly value="${escapeHTML(window.location.href)}" />
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
            ${window.getImgHTML(article.image, article.title, article.category, article.subcategory, 'article-hero-fallback', '', 'data-testid="article-hero-image"')}
            <figcaption>${escapeHTML(article.caption && article.caption.trim() ? article.caption : article.category)}</figcaption>
          </figure>
          <div class="article-body" data-testid="article-body">
            ${bodyHtml}
          </div>
          <div id="crisis-note-wrapper"></div>
        `;
        injectDynamicSEO(article);
        initShareDropdown(article);
        insertArticleAds(articleRoot.querySelector('[data-testid="article-body"]'));
        initFontSizeControls();
        initTextToSpeech();

        if (typeof isCrisisRelatedArticle === 'function' && isCrisisRelatedArticle(article)) {
          const wrapper = articleRoot.querySelector('#crisis-note-wrapper');
          if (wrapper) {
            renderCrisisCommunityNote(wrapper);
          }
        }
      })
      .catch((err) => {
        console.error(err);
        articleRoot.innerHTML = `
          <div style="text-align: center; padding: 60px 20px; margin: 60px auto; max-width: 600px; background: var(--surface-1, #ffffff); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; box-shadow: 0 10px 25px -5px rgba(0,0,0,0.05);">
            <h2 style="font-size: 24px; font-weight: 700; margin: 0 0 12px 0; color: var(--text-primary, #0f172a);">Article Not Found</h2>
            <p style="font-size: 16px; color: var(--text-secondary, #64748b); margin: 0 0 28px 0; line-height: 1.5;">The requested article could not be found or may have been deleted.</p>
            <a href="/" style="display: inline-flex; align-items: center; gap: 8px; padding: 10px 20px; background: var(--surface-3, #f1f5f9); border: 1px solid var(--border-color, #e2e8f0); color: var(--text-primary, #0f172a); border-radius: 6px; font-weight: 600; text-decoration: none; font-size: 14px;">
              Return to Home
            </a>
          </div>
        `;
      });
  }

  // Fetch all articles to display latest ones if not already pre-rendered
  const isAsidePreRendered = asideRoot && asideRoot.querySelector('.aside-item') !== null;
  if (!isAsidePreRendered && asideRoot) {
    let asideSkeleton = '<div class="aside-block"><h4>Latest stories</h4><div class="aside-list">';
    for (let i = 0; i < 5; i++) {
      asideSkeleton += `
        <div class="aside-item skeleton-aside-item" style="border:none; padding-bottom:16px;">
          <div class="skeleton-box skeleton-img" style="width:64px; height:64px; border-radius:2px;"></div>
          <div style="display: flex; flex-direction: column; gap: 6px; justify-content: center;">
            <div class="skeleton-box skeleton-title-2" style="width:90%; height:16px;"></div>
            <div class="skeleton-box skeleton-title-2" style="width:60%; height:16px;"></div>
            <div class="skeleton-box skeleton-meta" style="margin-top:4px; height:11px;"></div>
          </div>
        </div>
      `;
    }
    asideSkeleton += '</div></div>';
    asideRoot.innerHTML = asideSkeleton;

    async function fetchLatestArticlesWithRetry(retries = 2, delay = 300) {
      try {
        const response = await fetch('/api/latest-stories');
        const ct = response.headers.get("content-type") || "";
        if (!response.ok || !ct.includes("json")) throw new Error("Network response was not ok");
        const data = await response.json();
        if (!Array.isArray(data)) throw new Error("Invalid response format");
        return data;
      } catch (err) {
        if (retries > 0) {
          await new Promise(r => setTimeout(r, delay));
          return fetchLatestArticlesWithRetry(retries - 1, delay * 1.5);
        }
        throw err;
      }
    }

    fetchLatestArticlesWithRetry()
      .then((allArticles) => {
        const latest = allArticles
          .filter((a) => a.id !== currentArticleId)
          .slice(0, 5);

        asideRoot.innerHTML = `
          <div class="ad-slot rectangle" data-testid="ad-slot-aside">
            <div class="ad-label">Advertisement</div>
            <div class="ad-size">Google AdSense &mdash; 300 x 250 Medium Rectangle</div>
          </div> <br/>
          <div class="aside-block">
            <h4>Latest stories</h4>
            <div class="aside-list">
              ${latest.map((r, i) => `
                <a class="aside-item" href="/article/${encodeURIComponent(r.id)}" data-testid="latest-link-${i}">
                  ${window.getImgHTML(r.image, r.title, r.category, r.subcategory, 'aside-fallback-img', '', 'loading="lazy"')}
                  <div>
                    <div class="t">${escapeHTML(r.title)}</div>
                    <div class="m">${fmtDate(r.date)}</div>
                  </div>
                </a>
              `).join('')}
            </div>
          </div>
        `;
      })
      .catch((err) => {
        console.error('Aside load error:', err);
        asideRoot.innerHTML = `<div class="aside-error">Unable to load related stories.</div>`;
      });
  }

  function initShareDropdown(article) {
    const trigger = document.getElementById('article-share-trigger');
    const menu = document.getElementById('article-share-menu');
    const closeBtn = document.getElementById('article-share-close');
    const urlField = document.getElementById('share-url-field');
    const copyBtn = document.getElementById('share-copy-btn');

    if (!trigger || !menu) return;

    if (urlField) {
      urlField.value = window.location.href;
    }

    const toggleMenu = (show) => {
      const isVisible = show !== undefined ? show : menu.hidden;
      menu.hidden = !isVisible;
      menu.setAttribute('aria-hidden', (!isVisible).toString());
      trigger.setAttribute('aria-expanded', isVisible.toString());
    };

    trigger.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleMenu(menu.hidden);
    });

    if (closeBtn) {
      closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleMenu(false);
      });
    }

    document.addEventListener('click', (e) => {
      if (!menu.hidden && !menu.contains(e.target) && !trigger.contains(e.target)) {
        toggleMenu(false);
      }
    });

    menu.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    const title = article ? article.title : document.title;
    const currentUrl = window.location.href;

    document.getElementById('share-opt-x')?.addEventListener('click', () => {
      window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(currentUrl)}`, '_blank', 'noopener,noreferrer');
    });

    document.getElementById('share-opt-fb')?.addEventListener('click', () => {
      window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(currentUrl)}`, '_blank', 'noopener,noreferrer');
    });

    document.getElementById('share-opt-linkedin')?.addEventListener('click', () => {
      window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(currentUrl)}`, '_blank', 'noopener,noreferrer');
    });

    document.getElementById('share-opt-whatsapp')?.addEventListener('click', () => {
      window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(title + ' ' + currentUrl)}`, '_blank', 'noopener,noreferrer');
    });

    document.getElementById('share-opt-email')?.addEventListener('click', () => {
      window.location.href = `mailto:?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(currentUrl)}`;
    });

    const nativeBtn = document.getElementById('share-opt-native');
    if (nativeBtn) {
      if (navigator.share) {
        nativeBtn.addEventListener('click', async () => {
          try {
            await navigator.share({ title: title, url: currentUrl });
          } catch (err) {
            console.log('Share canceled', err);
          }
        });
      } else {
        nativeBtn.style.display = 'none';
      }
    }

    if (copyBtn) {
      copyBtn.addEventListener('click', async () => {
        const textToCopy = urlField ? urlField.value : window.location.href;
        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
          } else {
            if (urlField) {
              urlField.select();
              document.execCommand('copy');
            }
          }
          copyBtn.classList.add('copied');
          copyBtn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
            <span class="copy-text">Copied!</span>
          `;
          setTimeout(() => {
            copyBtn.classList.remove('copied');
            copyBtn.innerHTML = `
              <svg class="copy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
              <span class="copy-text">Copy</span>
            `;
          }, 2500);
        } catch (err) {
          console.error('Failed to copy', err);
        }
      });
    }
  }

  /* --- Community Note & Crisis Helpline System --- */
  const CRISIS_HELPLINES = {
    IN: {
      countryName: 'India 🇮🇳',
      helplines: [
        { name: 'KIRAN Mental Health Helpline', phone: '1800-599-0019', hours: '24/7 Toll-Free (13 Languages)', type: 'Govt of India', link: 'https://socialjustice.gov.in' },
        { name: 'Tele-MANAS Helpline', phone: '14416 / 1800-891-4416', hours: '24/7 Toll-Free National Service', type: 'Govt of India', link: 'https://telemanas.mohfw.gov.in' },
        { name: 'Vandrevala Foundation', phone: '+91 9999 666 555', hours: '24/7 Free Mental Health Counseling', type: 'NGO', link: 'https://www.vandrevalafoundation.com' },
        { name: 'AASRA Suicide Prevention', phone: '+91 9820466726', hours: '24/7 Confidential Helpline', type: 'NGO', link: 'http://www.aasra.info' },
        { name: 'SNEHA India', phone: '+91 44 2464 0050', hours: '24/7 Crisis Intervention', type: 'NGO', link: 'https://snehaindia.org' }
      ]
    },
    US: {
      countryName: 'United States 🇺🇸',
      helplines: [
        { name: '988 Suicide & Crisis Lifeline', phone: '988 (Call or Text)', hours: '24/7 Free & Confidential', type: 'Govt / SAMHSA', link: 'https://988lifeline.org' },
        { name: 'Crisis Text Line', phone: 'Text HOME to 741741', hours: '24/7 Free Text Support', type: 'NGO', link: 'https://www.crisistextline.org' },
        { name: 'The Trevor Project (LGBTQ Youth)', phone: '1-866-488-7386 or Text START to 678-678', hours: '24/7 Crisis Counseling', type: 'NGO', link: 'https://www.thetrevorproject.org' },
        { name: 'Veterans Crisis Line', phone: 'Call 988 then Press 1', hours: '24/7 Support for Veterans', type: 'Govt', link: 'https://www.veteranscrisisline.net' }
      ]
    },
    CA: {
      countryName: 'Canada 🇨🇦',
      helplines: [
        { name: '988 Suicide Crisis Helpline', phone: '988 (Call or Text)', hours: '24/7 Free & Confidential', type: 'Govt & NGO', link: 'https://988.ca' },
        { name: 'Kids Help Phone', phone: '1-800-668-6868 or Text 686868', hours: '24/7 Youth Crisis Support', type: 'NGO', link: 'https://kidshelpphone.ca' },
        { name: 'Hope for Wellness Helpline', phone: '1-855-242-3310', hours: '24/7 Culturally Competent Support', type: 'Govt / Indigenous', link: 'https://www.hopeforwellness.ca' }
      ]
    },
    UK: {
      countryName: 'United Kingdom 🇬🇧',
      helplines: [
        { name: 'Samaritans UK', phone: '116 123', hours: '24/7 Free Call from any phone', type: 'NGO', link: 'https://www.samaritans.org' },
        { name: 'NHS Mental Health Services', phone: '111', hours: '24/7 Urgent Advice', type: 'Govt / NHS', link: 'https://www.nhs.uk/nhs-services/mental-health-services' },
        { name: 'PAPYRUS HOPELINE247', phone: '0800 068 4141 or Text 07860 039967', hours: '24/7 Prevention for Youth Under 35', type: 'NGO', link: 'https://www.papyrus-uk.org' }
      ]
    },
    AU: {
      countryName: 'Australia 🇦🇺',
      helplines: [
        { name: 'Lifeline Australia', phone: '13 11 14 or Text 0477 13 11 14', hours: '24/7 Crisis Support', type: 'NGO', link: 'https://www.lifeline.org.au' },
        { name: 'Beyond Blue', phone: '1300 22 4636', hours: '24/7 Mental Health Support', type: 'Govt / NGO', link: 'https://www.beyondblue.org.au' },
        { name: 'Kids Helpline', phone: '1800 55 1800', hours: '24/7 Youth Support (Ages 5-25)', type: 'NGO', link: 'https://kidshelpline.com.au' }
      ]
    },
    EU: {
      countryName: 'Germany & European Union 🇪🇺',
      helplines: [
        { name: 'TelefonSeelsorge Deutschland', phone: '0800 111 0 111 / 0800 111 0 222', hours: '24/7 Free Anonymous Support', type: 'NGO', link: 'https://www.telefonseelsorge.de' },
        { name: 'European Emergency Number', phone: '112', hours: '24/7 Free Medical Emergency', type: 'Govt', link: 'https://ec.europa.eu' },
        { name: 'Nummer gegen Kummer', phone: '116 111', hours: 'Mon-Sat 2pm-8pm Support for Youth', type: 'NGO', link: 'https://www.nummergegenkummer.de' }
      ]
    },
    CN: {
      countryName: 'China / Hong Kong 🇨🇳',
      helplines: [
        { name: 'Beijing Suicide Prevention Hotline', phone: '010-82951332 / 800-810-1117', hours: '24/7 Crisis Support', type: 'Govt / Hospital', link: 'http://www.bjcrisis.org' },
        { name: 'Samaritan Befrienders Hong Kong', phone: '2389 2222', hours: '24/7 Confidential Line', type: 'NGO', link: 'https://sbhk.org.hk' },
        { name: 'Suicide Prevention Services HK', phone: '2382 0000', hours: '24/7 Support Line', type: 'NGO', link: 'https://www.sps.org.hk' }
      ]
    },
    JP: {
      countryName: 'Japan 🇯🇵',
      helplines: [
        { name: 'Inochi no Denwa (Lifeline Japan)', phone: '0570-783-556 / 0120-783-556', hours: 'Daily Suicide Prevention Line', type: 'NGO', link: 'https://www.inochinodenwa.org' },
        { name: 'TELL Lifeline Japan', phone: '03-5774-0992', hours: 'English & Japanese Support', type: 'NGO', link: 'https://telljp.com' }
      ]
    },
    KR: {
      countryName: 'South Korea 🇰🇷',
      helplines: [
        { name: 'Korea Suicide Prevention Line', phone: '109 / 1393', hours: '24/7 Emergency Line', type: 'Govt', link: 'https://www.spc.or.kr' },
        { name: 'LifeLine Korea', phone: '1588-9191', hours: '24/7 Counseling', type: 'NGO', link: 'https://www.lifeline.or.kr' }
      ]
    },
    GLOBAL: {
      countryName: 'Global / Other Countries 🌐',
      helplines: [
        { name: 'Befrienders Worldwide', phone: 'Directory for 40+ countries', hours: '24/7 Global Directory', type: 'Global NGO', link: 'https://www.befrienders.org' },
        { name: 'International Assoc for Suicide Prevention', phone: 'Global Crisis Centres Directory', hours: 'Global Directory', type: 'Global NGO', link: 'https://www.iasp.info/resources/Crisis_Centres/' },
        { name: 'Find A Helpline', phone: 'Free support in 130+ countries', hours: '24/7 Directory', type: 'Global Service', link: 'https://findahelpline.com/' }
      ]
    }
  };

  function isCrisisRelatedArticle(article) {
    if (!article) return false;
    const rawText = [
      article.title || '',
      article.excerpt || '',
      article.category || '',
      article.subcategory || '',
      typeof article.body === 'string' ? article.body : JSON.stringify(article.body || {}),
      Array.isArray(article.tags) ? article.tags.join(' ') : (article.tags || '')
    ].join(' ').toLowerCase();

    const keywords = [
      'suicide', 'suicidal', 'self-harm', 'self harm', 'selfharm', 'cutting oneself',
      'take my life', 'take one\'s life', 'took his life', 'took her life', 'took their life',
      'end my life', 'ended his life', 'ended her life', 'ended their life', 'ending one\'s life',
      'end one\'s life', 'kill oneself', 'killing himself', 'killing herself', 'killing oneself',
      'overdose', 'hanging', 'suicide attempt', 'suicide thoughts', 'suicidal ideation',
      'mental health crisis', 'crisis helpline', 'lifeline', 'hopelessness', 'depressive episode',
      'mental distress'
    ];

    return keywords.some(kw => rawText.includes(kw));
  }

  function detectDefaultCountryKey() {
    try {
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
      if (tz.includes('Kolkata') || tz.includes('Calcutta') || tz.includes('Katmandu') || tz.includes('Dhaka')) return 'IN';
      if (tz.includes('America/New_York') || tz.includes('America/Chicago') || tz.includes('America/Denver') || tz.includes('America/Los_Angeles') || tz.includes('America/Phoenix')) return 'US';
      if (tz.includes('Toronto') || tz.includes('Vancouver') || tz.includes('Edmonton') || tz.includes('Winnipeg') || tz.includes('Halifax')) return 'CA';
      if (tz.includes('London') || tz.includes('Belfast')) return 'UK';
      if (tz.includes('Sydney') || tz.includes('Melbourne') || tz.includes('Brisbane') || tz.includes('Perth') || tz.includes('Adelaide')) return 'AU';
      if (tz.includes('Berlin') || tz.includes('Paris') || tz.includes('Rome') || tz.includes('Madrid') || tz.includes('Amsterdam') || tz.includes('Vienna')) return 'EU';
      if (tz.includes('Shanghai') || tz.includes('Hong_Kong') || tz.includes('Beijing')) return 'CN';
      if (tz.includes('Tokyo')) return 'JP';
      if (tz.includes('Seoul')) return 'KR';
    } catch(e) {}
    return 'IN';
  }

  function renderCrisisHelplineCards(countryKey, cardsContainer) {
    if (!cardsContainer) return;
    const data = CRISIS_HELPLINES[countryKey] || CRISIS_HELPLINES.GLOBAL;

    cardsContainer.innerHTML = data.helplines.map(h => {
      const rawTel = h.phone.replace(/[^0-9+]/g, '');
      const telHref = rawTel && rawTel.length >= 3 ? `tel:${rawTel}` : (h.link || '#');
      return `
        <div style="background: var(--surface-1, #ffffff); border: 1px solid var(--border-color, #cbd5e1); border-radius: 8px; padding: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.03); display: flex; flex-direction: column; justify-content: space-between;">
          <div>
            <div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; margin-bottom: 6px;">
              <strong style="font-size: 14px; color: var(--text-primary, #0f172a); line-height: 1.3;">${escapeHTML(h.name)}</strong>
              <span style="font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; background: rgba(37, 99, 235, 0.1); color: var(--primary, #2563eb); white-space: nowrap;">${escapeHTML(h.type)}</span>
            </div>
            <div style="font-size: 15px; font-weight: 700; color: #0284c7; margin: 8px 0 4px 0; word-break: break-word;">
              📞 <a href="${telHref}" style="color: #0284c7; text-decoration: none;">${escapeHTML(h.phone)}</a>
            </div>
            <div style="font-size: 12px; color: var(--text-secondary, #64748b);">
              🕒 ${escapeHTML(h.hours)}
            </div>
          </div>
          ${h.link ? `
            <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed var(--border-color, #e2e8f0); font-size: 12px;">
              <a href="${h.link}" target="_blank" rel="noopener noreferrer" style="color: var(--primary, #2563eb); font-weight: 600; text-decoration: underline; display: inline-flex; align-items: center; gap: 4px;">
                Official Website &rarr;
              </a>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');
  }

  function renderCrisisCommunityNote(wrapperEl) {
    if (!wrapperEl) return;
    const initialCountryKey = detectDefaultCountryKey();

    wrapperEl.innerHTML = `
      <div class="community-note-crisis-banner" style="margin: 32px 0; padding: 24px; background: linear-gradient(135deg, rgba(37, 99, 235, 0.05) 0%, rgba(13, 148, 136, 0.08) 100%); border: 1.5px solid #38bdf8; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.04);">
        <div style="display: flex; align-items: flex-start; gap: 16px;">
          <div style="width: 44px; height: 44px; min-width: 44px; border-radius: 50%; background: #0284c7; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 22px; box-shadow: 0 2px 8px rgba(2, 132, 199, 0.3);">
            💙
          </div>
          <div>
            <div style="display: inline-block; background: #e0f2fe; color: #0369a1; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; padding: 3px 10px; border-radius: 4px; margin-bottom: 6px;">
              Community Note & Crisis Support
            </div>
            <h3 style="margin: 0 0 6px 0; font-size: 20px; font-weight: 700; color: var(--text-primary, #0f172a);">
              You are not alone. Help is available.
            </h3>
            <p style="margin: 0; font-size: 15px; color: var(--text-secondary, #334155); line-height: 1.5;">
              If you or someone you know is going through a difficult time, struggling with thoughts of self-harm, depression, or emotional distress, please reach out. Free, confidential support from trained government and non-profit professionals is available 24/7.
            </p>
          </div>
        </div>

        <div style="margin-top: 20px; padding-top: 16px; border-top: 1px solid rgba(0,0,0,0.08); display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <label for="crisis-country-select" style="font-weight: 700; font-size: 14px; color: var(--text-primary, #0f172a);">Select Country / Region:</label>
            <select id="crisis-country-select" style="padding: 8px 12px; border-radius: 6px; border: 1px solid var(--border-color, #cbd5e1); background: var(--surface-1, #ffffff); color: var(--text-primary, #0f172a); font-weight: 600; font-size: 14px; cursor: pointer;">
              ${Object.keys(CRISIS_HELPLINES).map(k => `
                <option value="${k}" ${k === initialCountryKey ? 'selected' : ''}>${CRISIS_HELPLINES[k].countryName}</option>
              `).join('')}
            </select>
          </div>
          <span id="crisis-detect-status" style="font-size: 12px; color: var(--text-secondary, #64748b); font-weight: 500;">📍 Location auto-detected</span>
        </div>

        <div id="crisis-helpline-cards" style="margin-top: 16px; display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px;">
        </div>
      </div>
    `;

    const selectEl = wrapperEl.querySelector('#crisis-country-select');
    const cardsEl = wrapperEl.querySelector('#crisis-helpline-cards');
    const statusEl = wrapperEl.querySelector('#crisis-detect-status');

    renderCrisisHelplineCards(initialCountryKey, cardsEl);

    if (selectEl) {
      selectEl.addEventListener('change', (e) => {
        renderCrisisHelplineCards(e.target.value, cardsEl);
        if (statusEl) statusEl.textContent = `📍 Selected: ${CRISIS_HELPLINES[e.target.value]?.countryName || 'Global'}`;
      });
    }

    // IP Geolocation auto-detection refine
    try {
      fetch('https://ipapi.co/json/', { signal: AbortSignal.timeout(3000) })
        .then(res => (res.ok && (res.headers.get('content-type') || '').includes('json')) ? res.json() : null)
        .then(data => {
          if (data && data.country_code) {
            const cc = data.country_code.toUpperCase();
            let targetKey = 'GLOBAL';
            if (cc === 'IN') targetKey = 'IN';
            else if (cc === 'US') targetKey = 'US';
            else if (cc === 'CA') targetKey = 'CA';
            else if (cc === 'GB' || cc === 'UK') targetKey = 'UK';
            else if (cc === 'AU' || cc === 'NZ') targetKey = 'AU';
            else if (['DE', 'FR', 'IT', 'ES', 'NL', 'BE', 'AT', 'CH', 'SE', 'NO', 'DK', 'FI', 'IE', 'PT', 'GR'].includes(cc)) targetKey = 'EU';
            else if (cc === 'CN' || cc === 'HK' || cc === 'MO' || cc === 'TW') targetKey = 'CN';
            else if (cc === 'JP') targetKey = 'JP';
            else if (cc === 'KR') targetKey = 'KR';

            if (selectEl) selectEl.value = targetKey;
            if (statusEl) statusEl.textContent = `📍 Auto-detected location: ${data.country_name || cc}`;
            renderCrisisHelplineCards(targetKey, cardsEl);
          }
        })
        .catch(() => {});
    } catch(e) {}
  }
})();
