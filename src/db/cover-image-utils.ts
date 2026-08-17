import fs from 'fs';
import path from 'path';
import { db, isDbAvailable } from './index.ts';
import { articles, coverImage } from './schema.ts';
import { eq } from 'drizzle-orm';

const __dirname = path.resolve();

export async function fetchRemoteImageAsDataUrl(url: string): Promise<string | null> {
  if (!url || (!url.startsWith('http://') && !url.startsWith('https://'))) return null;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length < 100) return null;
    return `data:${contentType};base64,${buffer.toString('base64')}`;
  } catch (err) {
    return null;
  }
}

export function localPathToDataUrl(imagePath: string): string | null {
  if (!imagePath) return null;
  if (imagePath.startsWith('data:image/')) return imagePath;

  try {
    let cleanPath = imagePath.startsWith('/') ? imagePath.slice(1) : imagePath;
    let fullPath = path.join(__dirname, cleanPath);
    
    if (!fs.existsSync(fullPath)) {
      const basename = path.basename(cleanPath);
      fullPath = path.join(__dirname, 'article', 'img', basename);
    }
    
    if (!fs.existsSync(fullPath)) {
      fullPath = path.join(__dirname, 'img', path.basename(cleanPath));
    }

    if (fs.existsSync(fullPath)) {
      const buffer = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      let mime = 'image/jpeg';
      if (ext === '.png') mime = 'image/png';
      else if (ext === '.webp') mime = 'image/webp';
      else if (ext === '.svg') mime = 'image/svg+xml';
      else if (ext === '.gif') mime = 'image/gif';

      return `data:${mime};base64,${buffer.toString('base64')}`;
    }
  } catch (err) {
    console.error('Error converting local image path to Data URL:', err);
  }

  return null;
}

export async function upsertCoverImage(articleId: string, imageSource: string): Promise<string | null> {
  if (!isDbAvailable() || !db || !articleId) return null;

  try {
    let dataUrl: string | null = null;
    if (imageSource && imageSource.startsWith('data:image/')) {
      dataUrl = imageSource;
    } else if (imageSource && (imageSource.startsWith('http://') || imageSource.startsWith('https://'))) {
      dataUrl = await fetchRemoteImageAsDataUrl(imageSource);
    } else if (imageSource) {
      dataUrl = localPathToDataUrl(imageSource);
    }

    if (!dataUrl) {
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#1e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="36" font-weight="bold">Cover Image</text></svg>`;
      dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
    }

    const coverId = `cover-${articleId}`;
    const now = new Date();

    // Verify article exists in articles table to prevent foreign key constraint violation
    const artExists = await db.select({ id: articles.id }).from(articles).where(eq(articles.id, articleId)).limit(1);
    if (artExists.length === 0) {
      return dataUrl;
    }

    const existing = await db.select().from(coverImage).where(eq(coverImage.articleId, articleId)).limit(1);

    if (existing.length > 0) {
      await db.update(coverImage).set({
        dataUrl,
        updatedAt: now
      }).where(eq(coverImage.articleId, articleId));
    } else {
      await db.insert(coverImage).values({
        id: coverId,
        articleId,
        dataUrl,
        createdAt: now,
        updatedAt: now
      }).onConflictDoNothing();
    }

    return dataUrl;
  } catch (err) {
    console.error(`Error upserting cover image for article ${articleId}:`, err);
    return null;
  }
}

let hasSyncedCoverImages = false;

export async function syncExistingCoverImages() {
  if (hasSyncedCoverImages || !isDbAvailable() || !db) return;
  hasSyncedCoverImages = true;

  try {
    const allArticles = await db.select().from(articles);
    if (!allArticles || allArticles.length === 0) return;

    const existingCovers = await db.select({ articleId: coverImage.articleId }).from(coverImage);
    const existingSet = new Set(existingCovers.map(c => c.articleId));

    for (const art of allArticles) {
      if (!art || !art.id) continue;
      if (existingSet.has(art.id)) continue;

      let dataUrl: string | null = null;
      if (art.image) {
        if (art.image.startsWith('data:image/')) {
          dataUrl = art.image;
        } else if (art.image.startsWith('http://') || art.image.startsWith('https://')) {
          dataUrl = await fetchRemoteImageAsDataUrl(art.image);
        } else {
          dataUrl = localPathToDataUrl(art.image);
        }
      }

      if (!dataUrl) {
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720"><rect width="1280" height="720" fill="#1e293b"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="36" font-weight="bold">${art.category || 'Cover Image'}</text></svg>`;
        dataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
      }

      await db.insert(coverImage).values({
        id: `cover-${art.id}`,
        articleId: art.id,
        dataUrl,
        createdAt: new Date(),
        updatedAt: new Date()
      }).onConflictDoNothing();
    }
  } catch (err: any) {
    console.error('Error syncing existing cover images:', err);
    const errMsg = (String(err?.message || '') + ' ' + String(err)).toLowerCase();
    if (errMsg.includes('quota') || errMsg.includes('exceeded') || errMsg.includes('transfer')) {
      // @ts-ignore
      global._dbAvailable = false;
    }
    hasSyncedCoverImages = false;
  }
}
