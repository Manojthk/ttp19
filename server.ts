import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';

const app = express();
const port = 3000;
const __dirname = path.resolve();

app.set('trust proxy', true);
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// In-memory cache loaded purely from static data files (Zero DB dependency)
let articlesMap = new Map<string, any>();
let articlesList: any[] = [];
let latestStories: any[] = [];

function loadStaticData() {
  try {
    const dataDir = path.join(__dirname, 'data');
    const articlesLoaded: any[] = [];
    const seenIds = new Set<string>();

    // Load from data/home*.json
    if (fs.existsSync(dataDir)) {
      const files = fs.readdirSync(dataDir)
        .filter(f => f.startsWith('home') && f.endsWith('.json') && f !== 'home.json')
        .sort((a, b) => {
          const numA = parseInt(a.replace(/\D/g, ''), 10) || 0;
          const numB = parseInt(b.replace(/\D/g, ''), 10) || 0;
          return numA - numB;
        });

      for (const file of files) {
        try {
          const raw = fs.readFileSync(path.join(dataDir, file), 'utf8');
          const content = JSON.parse(raw);
          const list = Array.isArray(content) ? content : (content.articles || []);
          for (const a of list) {
            if (a && a.id && !seenIds.has(a.id)) {
              seenIds.add(a.id);
              const formatted = {
                id: a.id,
                title: a.title || 'Untitled',
                article_link: a.article_link || `/article/${a.id}.html`,
                author: 'The Times Patriot',
                date: a.date || new Date().toISOString(),
                read_time: a.read_time || a.readTime || '3 min read',
                category: a.category || 'News',
                image: a.image || a.coverImage || '',
                caption: a.caption || '',
                excerpt: typeof a.excerpt === 'string' ? a.excerpt : '',
                body: a.body || { html: '' },
                tags: a.tags || '',
                views: a.views || 0,
                status: 'published'
              };
              articlesLoaded.push(formatted);
              articlesMap.set(a.id, formatted);
              if (formatted.article_link) {
                const slug = formatted.article_link.replace(/^\/+article\/+/, '').replace(/\.html$/, '');
                if (slug) articlesMap.set(slug, formatted);
              }
            }
          }
        } catch (e) {}
      }
    }

    articlesList = articlesLoaded;
    latestStories = articlesList.slice(0, 10).map(a => ({
      id: a.id,
      title: a.title,
      date: a.date,
      image: a.image,
      category: a.category,
      article_link: a.article_link
    }));

    console.log(`Loaded ${articlesList.length} static articles into memory cache.`);
  } catch (err) {
    console.error('Error loading static articles:', err);
  }
}

loadStaticData();

// Static file handlers
app.use(express.static(__dirname, { extensions: ['html'] }));
app.use('/data', express.static(path.join(__dirname, 'data')));
app.use('/article', express.static(path.join(__dirname, 'article'), { extensions: ['html'] }));

// Article direct routing
app.get('/article/:slug', (req, res, next) => {
  let slug = req.params.slug;
  if (!slug) return next();
  if (slug.endsWith('.html')) slug = slug.slice(0, -5);
  
  const articleFile = path.join(__dirname, 'article', `${slug}.html`);
  if (fs.existsSync(articleFile)) {
    return res.sendFile(articleFile);
  }

  // Fallback to dynamic article.html template if static file not yet present
  res.sendFile(path.join(__dirname, 'article.html'));
});

// JSON API routes (Serve directly from memory/static data without DB)
app.get('/api/articles', (req, res) => {
  const category = req.query.category as string;
  if (category) {
    const filtered = articlesList.filter(a => 
      a.category && a.category.toLowerCase().includes(category.toLowerCase())
    );
    return res.json(filtered);
  }
  res.json(articlesList);
});

app.get('/api/articles/:id', (req, res) => {
  let id = req.params.id || '';
  if (id.endsWith('.html')) id = id.slice(0, -5);
  try {
    id = decodeURIComponent(id);
  } catch (e) {}

  const article = articlesMap.get(id);
  if (article) {
    return res.json(article);
  }

  // Look up by prefix or slug
  const found = articlesList.find(a => 
    a.id === id || 
    (a.article_link && a.article_link.includes(id)) ||
    a.id.toLowerCase() === id.toLowerCase()
  );

  if (found) {
    return res.json(found);
  }

  res.status(404).json({ error: 'Article not found' });
});

app.get('/api/latest-stories', (req, res) => {
  res.json(latestStories);
});

app.post('/api/ad-inquiries', (req, res) => {
  res.json({ success: true, message: 'Ad inquiry received.' });
});

app.post('/api/contact-messages', (req, res) => {
  res.json({ success: true, message: 'Message received.' });
});

// Fallback SPA route
app.use((req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`The Times Patriot static server running on port ${port} (zero database dependency)`);
});
