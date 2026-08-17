import fs from 'fs';
import path from 'path';
import { db } from './index.ts';
import { articles } from './schema.ts';
import { sql } from 'drizzle-orm';
import * as dotenv from 'dotenv';
dotenv.config();

const __dirname = path.resolve();

async function seed() {
  const newsPath = path.join(__dirname, 'news.json');
  const newsData = JSON.parse(fs.readFileSync(newsPath, 'utf8'));

  const articlesData = newsData.articles;

  for (const article of articlesData) {
    await db.insert(articles).values({
      id: article.id,
      title: article.title,
      category: article.category,
      author: article.author,
      date: article.date,
      readTime: article.readTime,
      articleLink: article.articleLink,
      image: article.image,
      excerpt: article.excerpt,
      featured: article.featured || false,
      body: article.body,
      tags: article.tags
    }).onConflictDoNothing();
  }
  
  console.log('Seeded successfully!');
  process.exit(0);
}

seed().catch(console.error);
