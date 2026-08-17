import { drizzle } from 'drizzle-orm/node-postgres';
import pkg from 'pg';
const { Pool } = pkg;
import * as schema from './schema.ts';

declare global {
  var _postgresPool: typeof Pool.prototype | null | undefined;
  var _dbAvailable: boolean | undefined;
}

export const isDbConfigured = () => {
  return !!(process.env.DATABASE_URL || (process.env.SQL_HOST && process.env.SQL_HOST.trim() !== ''));
};

export const isDbAvailable = () => {
  return isDbConfigured() && (global._dbAvailable ?? false);
};

export const createPool = () => {
  if (!isDbConfigured()) {
    return null;
  }
  if (global._postgresPool === undefined) {
    try {
      global._postgresPool = new Pool(
        process.env.DATABASE_URL 
          ? { connectionString: process.env.DATABASE_URL, max: 8, ssl: { rejectUnauthorized: false } } 
          : {
              host: process.env.SQL_HOST,
              user: process.env.SQL_USER,
              password: process.env.SQL_PASSWORD,
              database: process.env.SQL_DB_NAME,
              max: 8,
              idleTimeoutMillis: 10000,
              connectionTimeoutMillis: 5000,
              keepAlive: true,
              keepAliveInitialDelayMillis: 5000,
              maxUses: 2000,
            }
      );

      global._postgresPool.on('error', (err: any) => {
        console.warn('Postgres pool background client error (auto-reconnecting):', err?.message || err);
      });
    } catch (e) {
      global._postgresPool = null;
      global._dbAvailable = false;
    }
  }
  return global._postgresPool;
};

const pool = createPool();

export async function withDbRetry<T>(fn: () => Promise<T>, maxRetries = 5, delayMs = 150): Promise<T> {
  let lastError: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: any) {
      lastError = err;
      const errMsg = (
        String(err?.message || '') + ' ' +
        String(err?.cause?.message || '') + ' ' +
        String(err?.cause || '') + ' ' +
        String(err?.code || '') + ' ' +
        String(err)
      ).toLowerCase();

      const isQuotaError = errMsg.includes('quota') || errMsg.includes('exceeded') || errMsg.includes('transfer');
      if (isQuotaError) {
        global._dbAvailable = false;
        throw err;
      }

      const isConnectionError = 
        errMsg.includes('connection terminated') ||
        errMsg.includes('closed') ||
        errMsg.includes('econnreset') ||
        errMsg.includes('57p01') ||
        errMsg.includes('57p02') ||
        errMsg.includes('57p03') ||
        errMsg.includes('08000') ||
        errMsg.includes('08003') ||
        errMsg.includes('08006') ||
        errMsg.includes('timeout') ||
        errMsg.includes('socket') ||
        errMsg.includes('failed query') ||
        errMsg.includes('terminat') ||
        errMsg.includes('connection');

      if (isConnectionError && attempt < maxRetries) {
        await new Promise(r => setTimeout(r, delayMs * Math.pow(1.5, attempt)));
        continue;
      }
      throw err;
    }
  }
  throw lastError;
}

function autoRetryDb(rawDrizzle: any) {
  if (!rawDrizzle) return rawDrizzle;

  const wrapBuilder = (target: any): any => {
    if (!target || (typeof target !== 'object' && typeof target !== 'function')) {
      return target;
    }

    return new Proxy(target, {
      get(obj, prop, receiver) {
        if (prop === 'then') {
          return function (onFulfilled?: any, onRejected?: any) {
            const execFn = typeof obj.execute === 'function'
              ? () => obj.execute()
              : () => new Promise((resolve, reject) => {
                  const orig = obj.then;
                  orig.call(obj, resolve, reject);
                });
            return withDbRetry(execFn).then(onFulfilled, onRejected);
          };
        }
        const val = Reflect.get(obj, prop, receiver);
        if (typeof val === 'function') {
          return function (...args: any[]) {
            const result = val.apply(obj, args);
            return wrapBuilder(result);
          };
        }
        if (typeof val === 'object' && val !== null) {
          return wrapBuilder(val);
        }
        return val;
      }
    });
  };

  return wrapBuilder(rawDrizzle);
}

const rawDb = pool ? drizzle(pool, { schema }) : (null as any);
export const db = autoRetryDb(rawDb);

let initPromise: Promise<void> | null = null;

export const initDb = async () => {
  if (!isDbConfigured() || !pool) {
    global._dbAvailable = false;
    return;
  }
  if (!initPromise) {
    initPromise = (async () => {
      let adminPool: typeof Pool.prototype | null = null;
      try {
        adminPool = new Pool(
          process.env.DATABASE_URL
            ? { connectionString: process.env.DATABASE_URL, max: 2 }
            : {
                host: process.env.SQL_HOST,
                user: process.env.SQL_ADMIN_USER || process.env.SQL_USER,
                password: process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD,
                database: process.env.SQL_DB_NAME,
                max: 2,
                connectionTimeoutMillis: 5000,
              }
        );

        const client = await adminPool.connect();
        try {
          const appUser = process.env.SQL_USER;
          const queries = [
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS subcategory TEXT;',
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS location_name TEXT;',
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS author_user_id TEXT;',
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS caption TEXT;',
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS is_private BOOLEAN DEFAULT false;',
            'ALTER TABLE articles ADD COLUMN IF NOT EXISTS status TEXT DEFAULT \'published\';',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMP;',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS paypal_me TEXT;',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS is_banned BOOLEAN DEFAULT false;',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS monetization_status TEXT DEFAULT \'not_applied\';',
            'ALTER TABLE users ADD COLUMN IF NOT EXISTS monetization_applied_at TIMESTAMP;',
            'CREATE TABLE IF NOT EXISTS site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
            'INSERT INTO site_settings (key, value) VALUES (\'page_rpm\', \'1.0\') ON CONFLICT (key) DO NOTHING;',
            'CREATE TABLE IF NOT EXISTS contact_messages (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, topic TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
            'CREATE INDEX IF NOT EXISTS idx_contact_messages_created ON contact_messages(created_at);',
            'CREATE TABLE IF NOT EXISTS ad_inquiries (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL, company TEXT, phone TEXT, package_type TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
            'CREATE INDEX IF NOT EXISTS idx_ad_inquiries_created ON ad_inquiries(created_at);',
            'CREATE TABLE IF NOT EXISTS coverimage (id TEXT PRIMARY KEY, article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE, data_url TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
            'CREATE INDEX IF NOT EXISTS idx_coverimage_article_id ON coverimage(article_id);',
            'CREATE TABLE IF NOT EXISTS user_feedbacks (id TEXT PRIMARY KEY, user_id TEXT, user_name TEXT NOT NULL, user_email TEXT NOT NULL, message TEXT NOT NULL, is_read BOOLEAN DEFAULT false, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP);',
            'CREATE INDEX IF NOT EXISTS idx_user_feedbacks_created ON user_feedbacks(created_at);',
          ];
          if (appUser) {
            queries.push(`GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO "${appUser}";`);
            queries.push(`GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO "${appUser}";`);
          }
          for (const q of queries) {
            try {
              await client.query(q);
            } catch (e: any) {
              // Ignore ownership or column exists errors gracefully
            }
          }
          global._dbAvailable = true;
        } finally {
          client.release();
          await adminPool.end();
        }
      } catch (err: any) {
        console.error('Database migration check failed:', err);
        const errMsg = (String(err?.message || '') + ' ' + String(err)).toLowerCase();
        if (errMsg.includes('quota') || errMsg.includes('exceeded') || errMsg.includes('transfer')) {
          global._dbAvailable = false;
        } else {
          // Fallback flag to true if pool works
          global._dbAvailable = true;
        }
      }
    })();
  }
  return initPromise;
};

