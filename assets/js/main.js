
function parseCategoryStr(catStr) {
  if (!catStr) return { main: 'News', sub: '' };
  const parts = String(catStr).split(/\s*>\s*/);
  return { main: parts[0], sub: '' };
}

window.handleImageError = function(img, cat, subcat, extraClass) {
  const fallback = document.createElement('div');
  fallback.className = `ad-slot image-fallback ${extraClass || ''}`;
  
  let { main } = parseCategoryStr(cat);
  
  let html = `<div class="ad-label fallback-cat">${main}</div>`;
  fallback.innerHTML = html;
  
  if (img && img.parentNode) {
    img.replaceWith(fallback);
  }
};

window.getImgHTML = function(src, alt, cat, subcat, extraClass = '', imgClass = '', otherAttrs = '') {
  let { main } = parseCategoryStr(cat);

  const safeCatRaw = String(cat || '').replace(/'/g, "\\\'").replace(/"/g, '&quot;');
  const safeSubcatRaw = subcat ? String(subcat).replace(/'/g, "\\\'").replace(/"/g, '&quot;') : '';
  const safeClass = String(extraClass || '').replace(/'/g, "\\\'").replace(/"/g, '&quot;');
  const safeAlt = String(alt || '').replace(/"/g, '&quot;');
  
  const escapeHTML = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  
  if (!src) {
    let html = `<div class="ad-slot image-fallback ${safeClass}"><div class="ad-label fallback-cat">${escapeHTML(main)}</div></div>`;
    return html;
  }
  
  const combinedClass = (`skeleton ${imgClass || ''}`).trim();
  
  return `<img src="${src}" alt="${safeAlt}" class="${combinedClass}" onload="this.classList.remove('skeleton'); this.classList.add('img-loaded');" onerror="window.handleImageError(this, '${safeCatRaw}', '${safeSubcatRaw}', '${safeClass}')" ${otherAttrs} onloadstart="if(this.complete){this.classList.remove('skeleton');this.classList.add('img-loaded');}" />`;
};
// Handles: dark mode, sidebar drawer, current date, feed rendering, load more, infinite scroll.

(function () {
  'use strict';

  // ---------- DARK MODE ----------
  const root = document.documentElement;
  const THEME_KEY = 'ttp-theme';
  const stored = localStorage.getItem(THEME_KEY);
  const systemDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const startDark = stored ? stored === 'dark' : systemDark;
  if (startDark) root.classList.add('dark');

  function setTheme(isDark) {
    root.classList.toggle('dark', isDark);
    localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
    updateThemeIcon(isDark);
  }
  function updateThemeIcon(isDark) {
    const currentIsDark = isDark !== undefined ? isDark : root.classList.contains('dark');
    document.querySelectorAll('[data-theme-icon]').forEach((el) => {
      el.innerHTML = currentIsDark
        ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>'
        : '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
    });
  }

  window.updateThemeIcon = updateThemeIcon;
  window.toggleTheme = () => setTheme(!root.classList.contains('dark'));

  updateThemeIcon(root.classList.contains('dark'));
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => updateThemeIcon(root.classList.contains('dark')));
  } else {
    updateThemeIcon(root.classList.contains('dark'));
  }

  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#dashboard-theme-toggle, [data-testid="theme-toggle"], [data-testid="theme-toggle-drawer"]');
    if (btn) {
      e.preventDefault();
      setTheme(!root.classList.contains('dark'));
    }
  });

  // honor system changes if user hasn't manually picked
  if (!stored && window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', (e) => {
      if (!localStorage.getItem(THEME_KEY)) setTheme(e.matches);
    });
  }

  
  // ---------- ACTIVE PRIMARY NAV LINK ----------
  const currentNavPath = window.location.pathname;
  const primaryNavLinks = document.querySelectorAll('.primary-nav a, .drawer a');
  primaryNavLinks.forEach(link => {
    const href = link.getAttribute('href');
    if (href === currentNavPath || (href !== '/' && currentNavPath.startsWith(href))) {
      link.classList.add('active');
    } else {
      link.classList.remove('active');
    }
  });
  if (currentNavPath === '/' || currentNavPath === '/index.html') {
    document.querySelectorAll('.primary-nav a[href="/"], .drawer a[href="/"]').forEach(l => l.classList.add('active'));
  }

  // ---------- SIDEBAR DRAWER ----------
  const drawer = document.querySelector('[data-testid="sidebar-drawer"]');
  const backdrop = document.querySelector('[data-testid="drawer-backdrop"]');
  function openDrawer() { drawer && drawer.classList.add('open'); backdrop && backdrop.classList.add('open'); document.body.style.overflow = 'hidden'; }
  function closeDrawer() { drawer && drawer.classList.remove('open'); backdrop && backdrop.classList.remove('open'); document.body.style.overflow = ''; }
  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-testid="open-sidebar-btn"]')) { e.preventDefault(); openDrawer(); return; }
    if (e.target.closest('[data-testid="close-sidebar-btn"]') || e.target.closest('[data-testid="drawer-backdrop"]')) { e.preventDefault(); closeDrawer(); return; }
    if (drawer && drawer.classList.contains('open') && !drawer.contains(e.target) && !e.target.closest('[data-testid="open-sidebar-btn"]')) {
      closeDrawer();
      return;
    }
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeDrawer(); });

  // ---------- CURRENT DATE ----------
  const dateEl = document.querySelector('[data-testid="masthead-date"]');
  if (dateEl) {
    const d = new Date();
    dateEl.textContent = d.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  }
  document.querySelectorAll('[data-testid="footer-year"]').forEach((el) => { el.textContent = new Date().getFullYear(); });

  // ---------- HELPERS ----------
  function formatViews(views) {
    const num = Number(views) || 0;
    if (num < 1000) {
      return num.toString();
    }
    if (num < 1000000) {
      const val = Math.floor((num / 1000) * 10) / 10;
      return (val % 1 === 0 ? val.toFixed(0) : val.toString()) + 'K';
    }
    const val = Math.floor((num / 1000000) * 10) / 10;
    return (val % 1 === 0 ? val.toFixed(0) : val.toString()) + 'M';
  }
  window.formatViews = formatViews;

  function fmtDate(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.valueOf())) return iso;
      return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    }
    catch { return iso; }
  }
  function articleHref(a) {
    if (a && a.id) return `/article/${encodeURIComponent(a.id)}.html`;
    if (a && a.articleLink) {
      const parts = a.articleLink.split('/').filter(Boolean);
      const last = parts[parts.length - 1];
      if (last) {
          const id = last.endsWith('.html') ? last : `${last}.html`;
          return `/article/${encodeURIComponent(id)}`;
      }
    }
    return '#';
  }
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

  function cardHTML(a, idx) {
    const viewStr = '';
    return `
      <article class="card" data-testid="article-card-${idx}">
        <a href="${articleHref(a)}" class="card-img" data-testid="article-card-link-${idx}">
          ${window.getImgHTML(a.image, a.title, a.category, a.subcategory, 'card-fallback-img', '', 'loading="lazy"')}
        </a>
        <a href="${articleHref(a)}"><h3 class="card-title">${escapeHTML(a.title)}</h3></a>
        <p class="card-excerpt">${escapeHTML(cleanExcerpt(a.excerpt))}</p>
        <div class="card-meta">By <b>The Times Patriot</b> &middot; ${fmtDate(a.date)} &middot; ${a.readTime || '3 min read'}${viewStr}</div>
      </article>
    `;
  }
  function escapeHTML(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

    // ---------- HOME FEED ----------
  const feed = document.querySelector('[data-testid="article-feed"]');
  if (feed) {
    const PAGE = 6;
    let allArticles = [];
    let shown = 0;
    let currentCategoryName = "";
    const loadBtn = document.querySelector('[data-testid="load-more-btn"]');
    const status = document.querySelector('[data-testid="feed-status"]');

    function renderHero(articles) {
      const heroWrap = document.querySelector('[data-testid="hero-wrap"]');
      if (!heroWrap || articles.length < 4) return;
      const lead = articles[0];
      const side = articles.slice(1, 4);
      heroWrap.innerHTML = `
        <div class="hero-grid">
          <a class="hero-article" href="${articleHref(lead)}" data-testid="hero-lead-link">
            <div class="hero-img">${window.getImgHTML(lead.image || lead.coverImage, lead.title, lead.category, lead.subcategory, 'hero-fallback-img', '', '')}</div>
            <h1 class="hero-title">${escapeHTML(lead.title)}</h1>
            <p class="hero-excerpt">${escapeHTML(cleanExcerpt(lead.excerpt))}</p>
            <div class="hero-meta">By <b>The Times Patriot</b> &middot; ${fmtDate(lead.date)} &middot; ${lead.readTime || '3 min read'}</div>
          </a>
          <aside class="hero-side">
            ${side.map((a, i) => `
              <a class="side-article" href="${articleHref(a)}" data-testid="hero-side-link-${i}">
                <div class="side-img">${window.getImgHTML(a.image || a.coverImage, a.title, a.category, a.subcategory, 'side-fallback-img', '', 'loading="lazy"')}</div>
                <div>
                  <h3 class="side-title">${escapeHTML(a.title)}</h3>
                  <div class="side-meta">${fmtDate(a.date)} &middot; ${a.readTime || '3 min read'}</div>
                </div>
              </a>
            `).join('')}
          </aside>
        </div>
      `;
    }

    function renderNext() {
      if (!allArticles || allArticles.length === 0) {
        if (feed) {
          feed.innerHTML = `
            <div style="grid-column: 1 / -1; padding: 40px 20px; text-align: center; background: var(--surface-1, #f8fafc); border: 1px solid var(--border-color, #e2e8f0); border-radius: 12px; margin: 20px 0;">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" style="color: var(--text-secondary); margin-bottom: 10px;"><circle cx="12" cy="12" r="10"></circle><path d="M12 8v4"></path><path d="M12 16h.01"></path></svg>
              <h3 style="font-size: 17px; font-weight: 700; color: var(--text-primary); margin-bottom: 6px;">No stories available in ${escapeHTML(currentCategoryName || 'this section')}</h3>
              <p style="font-size: 13.5px; color: var(--text-secondary); max-width: 460px; margin: 0 auto;">There are currently no articles published under this category. Check back soon for fresh coverage or explore our top categories above.</p>
            </div>
          `;
        }
        if (loadBtn) loadBtn.style.display = 'none';
        if (status) status.textContent = '0 stories available';
        return;
      }

      const next = allArticles.slice(shown, shown + PAGE);
      let html = '';
      next.forEach((a, i) => {
        html += cardHTML(a, shown + i);
        // inject an ad slot after every 6 cards
        if ((shown + i + 1) % 6 === 0) {
          html += `
            <div class="ad-slot leaderboard feed-ad" data-testid="ad-slot-feed-${shown + i}">
              <div class="ad-label">Advertisement</div>
              <div class="ad-size">Google AdSense &mdash; 728 x 90 Leaderboard</div>
            </div>`;
        }
      });
      feed.insertAdjacentHTML('beforeend', html);
      shown += next.length;
    }

    function renderSkeletons() {
      let html = '';
      for (let i = 0; i < 6; i++) {
        html += `
          <div class="card skeleton">
            <div class="card-img" style="background:var(--skeleton-base); min-height:180px;"></div>
            <div style="height:12px; width:40px; background:var(--skeleton-highlight); margin-top:12px; border-radius:2px;"></div>
            <div style="height:20px; width:85%; background:var(--skeleton-highlight); margin-top:8px; border-radius:4px;"></div>
            <div style="height:20px; width:60%; background:var(--skeleton-highlight); margin-top:4px; border-radius:4px;"></div>
          </div>
        `;
      }
      if (feed) feed.innerHTML = html;
    }

    renderSkeletons();

    const path = window.location.pathname;
    const isHomePage = path === '/' || path === '/index.html' || path === '';
    
    if (isHomePage) {
        let jsonFilesList = [];
        let currentFileIndex = 0;
        
        async function loadNextJsonFile() {
            if (currentFileIndex >= jsonFilesList.length) return [];
            const res = await fetch(jsonFilesList[currentFileIndex]);
            const data = await res.json();
            currentFileIndex++;
            return data.articles || [];
        }

        async function initHomeFeed() {
            if (feed) feed.innerHTML = '';
            try {
                const res = await fetch('/data/home.json');
                if (!res.ok) {
                    console.error('Failed to load home.json, status:', res.status);
                    throw new Error('Failed to load JSON');
                }
                const data = await res.json();
                jsonFilesList = data.files || [];
                
                if (jsonFilesList.length > 0) {
                    const firstPage = await loadNextJsonFile();
                    if (firstPage.length >= 4) {
                        const heroPool = firstPage.slice(0, 4);
                        renderHero(heroPool);
                        allArticles = firstPage.slice(4);
                    } else {
                        allArticles = firstPage;
                    }
                    renderNextHome();
                } else {
                    if (feed) feed.innerHTML = 'No stories found.';
                    if (loadBtn) loadBtn.style.display = 'none';
                }
            } catch (e) {
                console.error("Error loading home JSON", e);
                if (status) status.textContent = 'Unable to load stories.';
            }
        }

        function renderNextHome() {
            let html = '';
            allArticles.forEach((a, i) => {
                a.image = a.image || a.coverImage;
                html += cardHTML(a, shown + i);
                if ((shown + i + 1) % 6 === 0) {
                    html += `
                        <div class="ad-slot leaderboard feed-ad" data-testid="ad-slot-feed-${shown + i}">
                            <div class="ad-label">Advertisement</div>
                            <div class="ad-size">Google AdSense &mdash; 728 x 90 Leaderboard</div>
                        </div>`;
                }
            });
            feed.insertAdjacentHTML('beforeend', html);
            shown += allArticles.length;
            allArticles = [];
            
            if (currentFileIndex >= jsonFilesList.length) {
                if (loadBtn) loadBtn.style.display = 'none';
                if (status) status.textContent = '';
            } else {
                if (loadBtn) loadBtn.style.display = 'flex';
                if (status) status.textContent = '';
            }
        }

        if (loadBtn) {
            loadBtn.addEventListener('click', async () => {
                if (loadBtn.disabled) return;
                const origHTML = loadBtn.innerHTML;
                loadBtn.disabled = true;
                loadBtn.innerHTML = `
                    <svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;">
                        <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                        <path d="M12 2 a 10 10 0 0 1 10 10"></path>
                    </svg>
                    <span>Loading stories...</span>
                `;
                try {
                    allArticles = await loadNextJsonFile();
                    renderNextHome();
                } catch (err) {
                    console.error('Error loading stories:', err);
                    if (typeof showToast === 'function') {
                        showToast('Failed to load stories. Please try again.');
                    }
                } finally {
                    loadBtn.disabled = false;
                    loadBtn.innerHTML = origHTML;
                    if (currentFileIndex >= jsonFilesList.length) {
                        loadBtn.style.display = 'none';
                    }
                }
            });
        }
        initHomeFeed();
        
    } else {
        async function loadArticlesWithRetry(retries = 2, delay = 300) {
          try {
            const r = await fetch('/api/articles');
            const ct = r.headers.get("content-type") || "";
            if (!r.ok || !ct.includes("json")) throw new Error(`HTTP ${r.status}`);
            const data = await r.json();
            if (!Array.isArray(data)) throw new Error("Articles data is not an array");
            return data;
          } catch (err) {
            if (retries > 0) {
              await new Promise(res => setTimeout(res, delay));
              return loadArticlesWithRetry(retries - 1, delay * 1.5);
            }
            throw err;
          }
        }

        loadArticlesWithRetry()
          .then((data) => {
            if (feed) feed.innerHTML = '';
            data.sort((a, b) => {
              const timeA = new Date(a.date).getTime() || 0;
              const timeB = new Date(b.date).getTime() || 0;
              if (timeA !== timeB) return timeB - timeA;
              return (b.id || '').localeCompare(a.id || '');
            });
            let filteredData = data;
            const path = window.location.pathname;
            let isCategory = false;
            let categoryName = "";

            function normStr(str) {
              if (!str) return '';
              return String(str).toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/s+/g, ' ').trim();
            }
            
            if (path.startsWith('/category/')) {
               isCategory = true;
               const cleanPath = path.replace('.html', '');
               const parts = cleanPath.split('/').filter(Boolean);
               
               const rawMainSlug = parts[1] || '';
               const normMain = normStr(rawMainSlug);
               const mainTitleMap = {
                 'national news': 'National News',
                 'national': 'National News',
                 'business economy': 'Business & Economy',
                 'business': 'Business & Economy',
                 'sports': 'Sports',
                 'entertainment lifestyle': 'Entertainment & Lifestyle',
                 'tech gadgets science': 'Tech, Gadgets & Science',
                 'technology': 'Tech, Gadgets & Science',
                 'international': 'International',
                 'world': 'International'
               };
               const mainDisplayTitle = mainTitleMap[normMain] || decodeURIComponent(rawMainSlug).replace(/-/g, ' ');
               if (parts[2] && parts[2].toLowerCase() === 'local' && parts[3]) {
                   const city = decodeURIComponent(parts[3]).replace(/-/g, ' ').trim();
                   const normCity = normStr(city);
                   categoryName = city + " Local";
                   
                   filteredData = data.filter(a => {
                     if (!a) return false;
                     const fullText = normStr((a.category || '') + ' ' + (a.title || '') + ' ' + (a.excerpt || '') + ' ' + (a.body ? JSON.stringify(a.body) : ''));
                     return fullText.includes(normCity);
                   });
               } else if (parts[2]) {
                   const rawSubSlug = parts[2] || '';
                   const normSub = normStr(rawSubSlug);
                   const subTitleMap = {
                     'politics': 'Politics',
                     'regional news': 'Regional News',
                     'state city local news': 'State, City & Local News',
                     'markets': 'Markets',
                     'personal finance': 'Personal Finance',
                     'industry startups': 'Industry & Startups',
                     'cricket': 'Cricket',
                     'multi sport': 'Multi-Sport',
                     'bollywood cinema': 'Bollywood & Cinema',
                     'fashion trends': 'Fashion & Trends',
                     'travel food': 'Travel & Food',
                     'education jobs': 'Education & Jobs',
                     'tech education': 'Tech & Education',
                     'gadgets science': 'Gadgets & Science',
                     'general international': 'General International'
                   };
                   const subDisplayTitle = subTitleMap[normSub] || decodeURIComponent(rawSubSlug).replace(/-/g, ' ');
                   categoryName = `${mainDisplayTitle} > ${subDisplayTitle}`;

                   filteredData = data.filter(a => {
                     if (!a) return false;
                     const artCatNorm = normStr(a.category || '');
                     const artSubNorm = normStr(a.subcategory || '');
                     if (artCatNorm === normMain && artSubNorm === normSub) return true;
                     const artFullNorm = artCatNorm + " " + artSubNorm;
                     if (normSub === 'politics' && artFullNorm.includes('politic')) return true;
                     if (normSub === 'cricket' && artFullNorm.includes('cricket')) return true;
                     return false;
                   });
               } else {
                   categoryName = mainDisplayTitle;
                   filteredData = data.filter(a => {
                     if (!a) return false;
                     const artCatNorm = normStr(a.category || '');
                     const artSubNorm = normStr(a.subcategory || '');
                     if (artCatNorm === normMain) return true;
                     const artFullNorm = artCatNorm + " " + artSubNorm;
                     if (normMain === 'national news' || normMain === 'national') {
                       if (artFullNorm.includes('national') && !artFullNorm.includes('international')) return true;
                       return false;
                     }
                     if ((normMain === 'national news' || normMain === 'national') && artFullNorm.includes('national') && !artFullNorm.startsWith('international')) return true;
                     if (normMain === 'business economy' && artFullNorm.includes('business')) return true;
                     if (normMain === 'sports' && artFullNorm.includes('sport')) return true;
                     if (normMain === 'entertainment lifestyle' && (artFullNorm.includes('entertainment') || artFullNorm.includes('lifestyle'))) return true;
                     if (normMain === 'tech gadgets science' && (artFullNorm.includes('tech') || artFullNorm.includes('gadget') || artFullNorm.includes('science'))) return true;
                     if (normMain === 'international' && artFullNorm.includes('international')) return true;
                     return false;
                   });
               }
            }

            if (isCategory) {
               const hero = document.querySelector('.hero-section');
               if (hero) hero.style.display = 'none';
               
               const head = document.querySelector('#latest h2');
               if (head) {
                   head.style.textTransform = 'none';
                   head.textContent = categoryName.endsWith('News') ? categoryName : categoryName + " News";
                   
                   let subNavHtml = "";
                   if (subNavHtml) {
                     const sectionHead = document.querySelector('.section-head');
                     if (sectionHead && !document.querySelector('.sub-nav')) {
                       const subNavEl = document.createElement('div');
                       subNavEl.className = 'sub-nav';
                       subNavEl.innerHTML = subNavHtml;
                       sectionHead.insertAdjacentElement('afterend', subNavEl);
                       
                       // Highlight active subnav
                       const links = subNavEl.querySelectorAll('a');
                       links.forEach(link => {
                         const href = link.getAttribute('href');
                         if (href === path || href === path + '.html' || path.startsWith(href + '/')) {
                           link.classList.add('active');
                         }
                       });
                     }
                   }
               }
               currentCategoryName = categoryName;
               allArticles = filteredData;
            } else {
               const heroPool = filteredData.slice(0, 4);
               filteredData = filteredData.slice(4);
               renderHero(heroPool);
               allArticles = filteredData;
            }

            renderNext();
          })
          .catch((err) => { console.error('feed load error', err); status && (status.textContent = 'Unable to load stories.'); });

        if (loadBtn) {
          loadBtn.addEventListener('click', async () => {
            if (loadBtn.disabled) return;
            const origHTML = loadBtn.innerHTML;
            loadBtn.disabled = true;
            loadBtn.innerHTML = `
              <svg class="btn-spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="display:inline-block; vertical-align:middle; margin-right:6px;">
                <circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle>
                <path d="M12 2 a 10 10 0 0 1 10 10"></path>
              </svg>
              <span>Loading stories...</span>
            `;
            try {
              await new Promise(r => setTimeout(r, 300));
              renderNext();
            } catch (err) {
              console.error('Error loading stories:', err);
              if (typeof showToast === 'function') {
                showToast('Failed to load stories. Please try again.');
              }
            } finally {
              if (shown < allArticles.length) {
                loadBtn.disabled = false;
                loadBtn.innerHTML = origHTML;
              }
            }
          });
        }

        // infinite scroll: when sentinel near viewport, load more
        const sentinel = document.querySelector('[data-testid="feed-sentinel"]');
        if (sentinel && 'IntersectionObserver' in window) {
          const io = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
              if (entry.isIntersecting && shown > 0 && shown < allArticles.length) renderNext();
            });
          }, { rootMargin: '600px 0px' });
          io.observe(sentinel);
        }
    }
  }

  // ---------- HEADER SEARCH & RESPONSIVE CONTROLS ----------
  function initHeaderSearch() {
    const searchContainer = document.getElementById('masthead-search-container');
    const searchInput = document.getElementById('masthead-search-input');
    const searchBtn = document.getElementById('masthead-search-btn');
    const inputWrapper = document.getElementById('search-input-wrapper');
    const clearBtn = document.getElementById('search-clear-btn');
    const searchDropdown = document.getElementById('search-results-dropdown');

    if (!searchContainer || !searchInput) return;

    let debounceTimer;

    function toggleMobileSearch() {
      if (!inputWrapper) return;
      const isOpen = inputWrapper.classList.contains('active');
      if (isOpen) {
        closeSearch();
      } else {
        inputWrapper.classList.add('active');
        searchContainer.classList.add('search-active');
        searchInput.focus();
      }
    }

    function closeSearch() {
      if (inputWrapper) inputWrapper.classList.remove('active');
      if (searchContainer) searchContainer.classList.remove('search-active');
      if (searchDropdown) searchDropdown.style.display = 'none';
    }

    if (searchBtn) {
      searchBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        toggleMobileSearch();
      });
    }

    // Ensure dedicated Search button exists inside inputWrapper
    let searchSubmitBtn = document.getElementById('search-submit-btn') || (inputWrapper ? inputWrapper.querySelector('.search-submit-btn') : null);
    if (!searchSubmitBtn && inputWrapper) {
      searchSubmitBtn = document.createElement('button');
      searchSubmitBtn.type = 'button';
      searchSubmitBtn.className = 'search-submit-btn';
      searchSubmitBtn.id = 'search-submit-btn';
      searchSubmitBtn.setAttribute('data-testid', 'search-submit-btn');
      searchSubmitBtn.setAttribute('aria-label', 'Search articles');
      searchSubmitBtn.textContent = 'Search';
      inputWrapper.appendChild(searchSubmitBtn);
    }

    if (searchSubmitBtn) {
      searchSubmitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerImmediateSearch();
      });
    }

    const searchIconInside = inputWrapper ? inputWrapper.querySelector('.search-input-icon') : null;
    if (searchIconInside) {
      searchIconInside.style.cursor = 'pointer';
      searchIconInside.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        triggerImmediateSearch();
      });
    }

    async function triggerImmediateSearch() {
      const query = searchInput.value.trim();

      if (query.length === 0) {
        if (searchDropdown) searchDropdown.style.display = 'none';
        return;
      }

      if (searchDropdown) {
        searchDropdown.innerHTML = '<div class="search-no-results">Searching news database...</div>';
        searchDropdown.style.display = 'block';
      }

      try {
        let results = [];
        const res = await fetch(`/api/articles/search?q=${encodeURIComponent(query)}`);
        if (res.ok && (res.headers.get("content-type") || "").includes("json")) {
          results = await res.json();
        }

        if (!searchDropdown) return;

        if (!Array.isArray(results) || results.length === 0) {
          searchDropdown.innerHTML = `<div class="search-no-results">No articles found matching "<b>${escapeHTML(query)}</b>"</div>`;
        } else {
          searchDropdown.innerHTML = results.map(article => {
            const link = (article.articleLink && typeof article.articleLink === 'string' && article.articleLink.startsWith('/') && !article.articleLink.endsWith('.html'))
              ? article.articleLink
              : `/article/${encodeURIComponent(article.id)}`;
            const formattedDate = fmtDate(article.date) || article.date;
            return `
              <a href="${link}" class="search-result-item" data-testid="search-result-item">
                <div class="search-result-title">${escapeHTML(article.title)}</div>
                <div class="search-result-meta">
                  <span class="search-result-badge">${escapeHTML(article.category || 'News')}</span>
                  <span>&middot; ${escapeHTML(article.author || 'The Times Patriot')}</span>
                  <span>&middot; ${escapeHTML(formattedDate)}</span>
                </div>
              </a>
            `;
          }).join('');
        }
        searchDropdown.style.display = 'block';
      } catch (error) {
        console.error('Error fetching search results:', error);
        if (searchDropdown) {
          searchDropdown.innerHTML = '<div class="search-no-results">Error performing search. Please try again.</div>';
        }
      }
    }

    // Do NOT load auto on typing; only hide dropdown if query is cleared
    const handleSearchInput = () => {
      const query = searchInput.value.trim();
      if (query.length === 0) {
        if (searchDropdown) searchDropdown.style.display = 'none';
      }
    };

    searchInput.addEventListener('input', handleSearchInput);

    // Trigger search on Enter key press
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        triggerImmediateSearch();
      }
    });

    document.addEventListener('click', (e) => {
      if (searchContainer && !searchContainer.contains(e.target)) {
        if (searchDropdown) searchDropdown.style.display = 'none';
        if (inputWrapper && window.innerWidth < 768) {
          inputWrapper.classList.remove('active');
        }
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        closeSearch();
      }
    });
  }

  // ---------- MORE OPTIONS DROPDOWN (RESPONSIVE SMALL SCREEN) ----------
  function initHeaderMoreMenu() {
    const moreBtn = document.getElementById('masthead-more-btn');
    const moreDropdown = document.getElementById('masthead-more-dropdown');
    const searchItemBtn = document.getElementById('more-dropdown-search-btn');
    const searchInput = document.getElementById('masthead-search-input');
    const inputWrapper = document.getElementById('search-input-wrapper');
    const themeLabelText = document.getElementById('theme-label-text');

    function updateDropdownThemeText() {
      if (themeLabelText) {
        const isDark = document.documentElement.classList.contains('dark');
        themeLabelText.textContent = isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode';
      }
    }

    updateDropdownThemeText();

    // Observe root class changes to update theme label
    const observer = new MutationObserver(() => updateDropdownThemeText());
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    if (moreBtn && moreDropdown) {
      moreBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        const isOpen = moreDropdown.style.display === 'flex';
        moreDropdown.style.display = isOpen ? 'none' : 'flex';
      });

      if (searchItemBtn) {
        searchItemBtn.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          moreDropdown.style.display = 'none';
          if (inputWrapper) {
            inputWrapper.classList.add('active');
          }
          if (searchInput) {
            searchInput.focus();
          }
        });
      }

      document.addEventListener('click', (e) => {
        const fbTrigger = e.target.closest('#more-dropdown-feedback-btn, #drawer-feedback-btn, [data-action="open-feedback"], [data-testid="drawer-feedback-btn"]');
        if (fbTrigger) {
          e.preventDefault();
          if (moreDropdown) moreDropdown.style.display = 'none';
          if (typeof window.openFeedbackModal === 'function') {
            window.openFeedbackModal();
          }
          return;
        }

        if (moreDropdown && !moreBtn.contains(e.target) && !moreDropdown.contains(e.target)) {
          moreDropdown.style.display = 'none';
        }
      });

      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          moreDropdown.style.display = 'none';
        }
      });
    }
  }

  initHeaderSearch();
  initHeaderMoreMenu();
})();