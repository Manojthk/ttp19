import { boolean, integer, json, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  name: text('name').notNull(),
  username: text('username').unique(),
  picture: text('picture'),
  isAuthor: boolean('is_author').notNull().default(false),
  paypalMe: text('paypal_me'),
  isBanned: boolean('is_banned').notNull().default(false),
  monetizationStatus: text('monetization_status').notNull().default('not_applied'),
  monetizationAppliedAt: timestamp('monetization_applied_at'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  deletionScheduledAt: timestamp('deletion_scheduled_at'),
});

export const siteSettings = pgTable('site_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const articles = pgTable('articles', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  category: text('category').notNull(),
  author: text('author').notNull(),
  authorUserId: text('author_user_id'),
  date: text('date').notNull(),
  readTime: text('read_time').notNull(),
  articleLink: text('article_link'),
  image: text('image').notNull(),
  caption: text('caption'),
  excerpt: text('excerpt').notNull(),
  featured: boolean('featured').notNull().default(false),
  body: json('body').notNull(),
  tags: json('tags').notNull(),
  views: integer('views').notNull().default(0),
  isDraft: boolean('is_draft').notNull().default(false),
  isPrivate: boolean('is_private').notNull().default(false),
  status: text('status').notNull().default('published'),
  isMonetized: boolean('is_monetized').notNull().default(true),
});

export const articleViews = pgTable('article_views', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id),
  ipAddress: text('ip_address').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const comments = pgTable('comments', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id),
  userId: text('user_id').notNull().references(() => users.id),
  parentId: text('parent_id'), 
  content: text('content').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const guidelineFlags = pgTable('guideline_flags', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  category: text('category').notNull(), // 'porn', 'fraud', 'scam', 'malicious_intent', 'terror_link'
  severity: text('severity').notNull().default('HIGH'), // 'CRITICAL', 'HIGH', 'MEDIUM'
  reasons: text('reasons').notNull(),
  evidenceSnippet: text('evidence_snippet'),
  status: text('status').notNull().default('flagged'), // 'flagged', 'dismissed', 'actioned'
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const contactMessages = pgTable('contact_messages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  topic: text('topic').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const adInquiries = pgTable('ad_inquiries', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull(),
  company: text('company'),
  phone: text('phone'),
  packageType: text('package_type').notNull(),
  message: text('message').notNull(),
  isRead: boolean('is_read').notNull().default(false),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const coverImage = pgTable('coverimage', {
  id: text('id').primaryKey(),
  articleId: text('article_id').notNull().references(() => articles.id, { onDelete: 'cascade' }),
  dataUrl: text('data_url').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const coverImages = coverImage;



