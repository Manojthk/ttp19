import { GoogleGenAI } from '@google/genai';
import { db, isDbAvailable } from '../db/index.ts';
import { articles } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';

const __dirname = path.resolve();

function getAiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || !apiKey.trim() || apiKey.trim() === 'undefined' || !apiKey.trim().startsWith('AIza')) {
    return null;
  }
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

export function cleanExcerptText(text: string): string {
  if (!text) return '';
  let str = String(text).trim();

  // If stringified JSON object like {"html":"..."} or {"blocks":...}
  if ((str.startsWith('{') && str.endsWith('}')) || (str.startsWith('[') && str.endsWith(']'))) {
    try {
      const parsed = JSON.parse(str);
      if (typeof parsed === 'object' && parsed !== null) {
        if (parsed.html) return cleanExcerptText(parsed.html);
        if (parsed.text) return cleanExcerptText(parsed.text);
        if (parsed.excerpt) return cleanExcerptText(parsed.excerpt);
        if (Array.isArray(parsed.blocks)) {
          const joined = parsed.blocks
            .map((b: any) => b?.data?.text || '')
            .filter(Boolean)
            .join(' ');
          return cleanExcerptText(joined);
        }
      }
    } catch (e) {
      // ignore
    }
  }

  // Remove JSON string remnants like {"html":" or "html":" or {"blocks": if any slipped through
  str = str.replace(/^\{\s*"html"\s*:\s*"?/i, '');
  str = str.replace(/^"html"\s*:\s*"?/i, '');
  str = str.replace(/^\{\s*"blocks"\s*:\s*"?/i, '');
  str = str.replace(/^\{\s*"text"\s*:\s*"?/i, '');

  // Strip HTML tags
  str = str.replace(/<[^>]*>/g, ' ');

  // Unescape HTML entities
  str = str
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");

  // Remove trailing JSON syntax junk if any
  str = str.replace(/["'\}]+$/, '');

  // Normalize whitespace
  return str.replace(/\s+/g, ' ').trim();
}

export function stripHtmlAndFormatting(content: any): string {
  if (!content) return '';

  if (typeof content === 'string') {
    const trimmed = content.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        const parsed = JSON.parse(trimmed);
        return stripHtmlAndFormatting(parsed);
      } catch (e) {
        // Not valid JSON string, process as raw text
      }
    }
    return cleanExcerptText(content);
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => stripHtmlAndFormatting(item))
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  if (typeof content === 'object' && content !== null) {
    if (content.html) {
      return stripHtmlAndFormatting(content.html);
    }
    if (Array.isArray(content.blocks)) {
      return content.blocks
        .map((block: any) => {
          if (block?.data?.text) return stripHtmlAndFormatting(block.data.text);
          if (Array.isArray(block?.data?.items)) {
            return block.data.items.map((i: any) => stripHtmlAndFormatting(i)).join(' ');
          }
          return '';
        })
        .filter(Boolean)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
    }
    if (content.text) return stripHtmlAndFormatting(content.text);
    if (content.data && content.data.text) return stripHtmlAndFormatting(content.data.text);
    if (content.content) return stripHtmlAndFormatting(content.content);
  }

  return cleanExcerptText(String(content));
}

export function createFallbackExcerpt(title: string, bodyContent: any): string {
  const cleanBody = stripHtmlAndFormatting(bodyContent);
  const cleanTitle = cleanExcerptText(title || '');
  const sourceText = cleanBody.length > 0 ? cleanBody : cleanTitle;

  if (!sourceText || sourceText.trim().length === 0) {
    return 'Summary not available for this article.';
  }

  const cleanedSource = cleanExcerptText(sourceText);

  if (cleanedSource.length <= 280) {
    return cleanedSource.trim();
  }

  // Find sentence end before 280 chars
  const truncated = cleanedSource.slice(0, 290);
  const lastPeriod = Math.max(truncated.lastIndexOf('. '), truncated.lastIndexOf('? '), truncated.lastIndexOf('! '));

  if (lastPeriod > 100) {
    return truncated.slice(0, lastPeriod + 1).trim();
  }

  // Fallback to word boundary
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 50) {
    return truncated.slice(0, lastSpace).trim() + '...';
  }

  return truncated.slice(0, 290).trim() + '...';
}

export async function generateAiExcerpt(title: string, bodyContent: any): Promise<string> {
  const cleanBody = stripHtmlAndFormatting(bodyContent);
  const cleanTitle = cleanExcerptText(title || '');
  const promptText = `Title: ${cleanTitle || 'Untitled'}\n\nArticle Content:\n${cleanBody.slice(0, 3500)}`;

  const ai = getAiClient();
  if (ai) {
    try {
      const response = await ai.models.generateContent({
        model: 'gemini-3.6-flash',
        contents: promptText,
        config: {
          systemInstruction:
            'You are an expert news editor. Write a compelling, concise excerpt/short description for this news article. The description MUST be STRICTLY maximum 290 characters long (and never exceed 300 characters). Do NOT include quotes, title headers, JSON formatting, or markdown. Output ONLY the raw plain text excerpt.',
          temperature: 0.3,
        },
      });

      let aiText = response.text ? response.text.trim() : '';
      if (aiText) {
        aiText = cleanExcerptText(aiText);
        // Strip quotes if wrapped
        if ((aiText.startsWith('"') && aiText.endsWith('"')) || (aiText.startsWith("'") && aiText.endsWith("'"))) {
          aiText = aiText.slice(1, -1).trim();
        }
        if (aiText.length > 297) {
          const cut = aiText.slice(0, 295);
          const lastSpace = cut.lastIndexOf(' ');
          aiText = (lastSpace > 100 ? cut.slice(0, lastSpace) : cut).trim() + '...';
        }
        return aiText;
      }
    } catch (err) {
      console.warn('Gemini AI Excerpt generation fallback:', (err as any)?.message || err);
    }
  }

  return cleanExcerptText(createFallbackExcerpt(title, bodyContent));
}
