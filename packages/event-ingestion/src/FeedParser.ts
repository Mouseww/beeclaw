// ============================================================================
// FeedParser — RSS/Atom Feed 解析器（纯手写 XML 解析，无外部依赖）
// ============================================================================

import type { ParsedFeed, FeedItem, FeedSourceType } from './types.js';

/**
 * 解析 RSS 或 Atom feed XML 字符串为结构化数据
 */
export function parseFeed(xml: string): ParsedFeed {
  const trimmed = xml.trim();

  if (isAtomFeed(trimmed)) {
    return parseAtomFeed(trimmed);
  }

  return parseRssFeed(trimmed);
}

/**
 * 检测是否为 Atom feed
 */
function isAtomFeed(xml: string): boolean {
  // Atom feed 的根元素通常是 <feed>，且命名空间含 Atom
  return /^<\?xml[^?]*\?>\s*<feed[\s>]/i.test(xml) ||
    /<feed\s[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom["']/i.test(xml) ||
    /^<feed[\s>]/i.test(xml);
}

// ── RSS 2.0 解析 ──

function parseRssFeed(xml: string): ParsedFeed {
  const channel = extractTag(xml, 'channel');
  if (!channel) {
    throw new Error('Invalid RSS feed: missing <channel> element');
  }

  const title = extractTagContent(channel, 'title') ?? 'Unknown Feed';
  const description = extractTagContent(channel, 'description') ?? undefined;
  const link = extractTagContent(channel, 'link') ?? undefined;

  const items = extractAllTags(channel, 'item').map(parseRssItem);

  return { title, description, link, items, type: 'rss' };
}

function parseRssItem(itemXml: string): FeedItem {
  const title = decodeHtmlEntities(extractTagContent(itemXml, 'title') ?? '');
  const descriptionRaw = extractTagContent(itemXml, 'description') ?? '';
  const contentEncoded = extractTagContent(itemXml, 'content:encoded');
  const link = extractTagContent(itemXml, 'link');
  const pubDateStr = extractTagContent(itemXml, 'pubDate');
  const author = extractTagContent(itemXml, 'author') ?? extractTagContent(itemXml, 'dc:creator');
  const guid = extractTagContent(itemXml, 'guid') ?? link ?? `${title}-${pubDateStr ?? ''}`;

  // 优先使用 content:encoded，其次用 description
  // 先解码 HTML 实体（&lt; → <），再去除 HTML 标签
  const content = stripHtmlTags(decodeHtmlEntities(contentEncoded ?? descriptionRaw));

  // 解析分类
  const categories = extractAllTagContents(itemXml, 'category').map(decodeHtmlEntities);

  let pubDate: Date | undefined;
  if (pubDateStr) {
    const parsed = new Date(pubDateStr);
    if (!isNaN(parsed.getTime())) {
      pubDate = parsed;
    }
  }

  return {
    title: title || '无标题',
    content: content || '无内容',
    link: link ?? undefined,
    pubDate,
    author: author ?? undefined,
    categories: categories.length > 0 ? categories : undefined,
    guid,
  };
}

// ── Atom 解析 ──

function parseAtomFeed(xml: string): ParsedFeed {
  const feed = extractTag(xml, 'feed') ?? xml;

  const title = extractTagContent(feed, 'title') ?? 'Unknown Feed';
  const subtitle = extractTagContent(feed, 'subtitle');
  const link = extractAtomLink(feed);

  const items = extractAllTags(feed, 'entry').map(parseAtomEntry);

  return {
    title: decodeHtmlEntities(title),
    description: subtitle ? decodeHtmlEntities(subtitle) : undefined,
    link,
    items,
    type: 'atom',
  };
}

function parseAtomEntry(entryXml: string): FeedItem {
  const title = decodeHtmlEntities(extractTagContent(entryXml, 'title') ?? '');
  const summary = extractTagContent(entryXml, 'summary') ?? '';
  const contentTag = extractTagContent(entryXml, 'content') ?? '';
  const link = extractAtomLink(entryXml);
  const updatedStr = extractTagContent(entryXml, 'updated') ?? extractTagContent(entryXml, 'published');
  const authorName = extractTagContent(extractTag(entryXml, 'author') ?? '', 'name');
  const id = extractTagContent(entryXml, 'id') ?? link ?? `${title}-${updatedStr ?? ''}`;

  const content = decodeHtmlEntities(stripHtmlTags(contentTag || summary));

  const categories = extractAtomCategories(entryXml);

  let pubDate: Date | undefined;
  if (updatedStr) {
    const parsed = new Date(updatedStr);
    if (!isNaN(parsed.getTime())) {
      pubDate = parsed;
    }
  }

  return {
    title: title || '无标题',
    content: content || '无内容',
    link: link ?? undefined,
    pubDate,
    author: authorName ?? undefined,
    categories: categories.length > 0 ? categories : undefined,
    guid: id,
  };
}

/**
 * 提取 Atom link 的 href 属性
 */
function extractAtomLink(xml: string): string | undefined {
  // 收集所有 <link> 标签
  const linkRegex = /<link\s([^>]*?)\/?>/gi;
  let match: RegExpExecArray | null;
  let alternateHref: string | undefined;
  let fallbackHref: string | undefined;

  while ((match = linkRegex.exec(xml)) !== null) {
    const attrs = match[1]!;
    const hrefMatch = attrs.match(/href\s*=\s*["']([^"']+)["']/);
    const relMatch = attrs.match(/rel\s*=\s*["']([^"']+)["']/);

    if (!hrefMatch?.[1]) continue;

    const rel = relMatch?.[1];
    if (rel === 'alternate') {
      alternateHref = hrefMatch[1];
      break; // alternate is highest priority
    }
    if (!rel && !fallbackHref) {
      // no rel attribute → use as fallback
      fallbackHref = hrefMatch[1];
    }
  }

  return alternateHref ?? fallbackHref;
}

/**
 * 提取 Atom category 的 term 属性
 */
function extractAtomCategories(xml: string): string[] {
  const categories: string[] = [];
  const regex = /<category[^>]*term\s*=\s*["']([^"']+)["'][^>]*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    if (match[1]) categories.push(match[1]);
  }
  return categories;
}

// ── XML 工具函数 ──

/**
 * 提取第一个匹配标签的完整内容（含子元素）
 */
function extractTag(xml: string, tagName: string): string | null {
  // 处理自闭合标签
  const selfClosingRegex = new RegExp(`<${tagName}(\\s[^>]*)?\\/>`);
  if (selfClosingRegex.test(xml)) return '';

  const openRegex = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'i');
  const openMatch = openRegex.exec(xml);
  if (!openMatch) return null;

  const startIdx = openMatch.index;
  const contentStart = startIdx + openMatch[0].length;

  // 寻找配对的关闭标签（考虑嵌套）
  let depth = 1;
  let pos = contentStart;
  const openTag = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  const closeTag = new RegExp(`</${tagName}\\s*>`, 'gi');

  openTag.lastIndex = contentStart;
  closeTag.lastIndex = contentStart;

  while (depth > 0 && pos < xml.length) {
    const nextOpen = openTag.exec(xml);
    const nextClose = closeTag.exec(xml);

    if (!nextClose) break;

    if (nextOpen && nextOpen.index < nextClose.index) {
      depth++;
      pos = nextOpen.index + nextOpen[0].length;
      closeTag.lastIndex = pos;
    } else {
      depth--;
      pos = nextClose.index + nextClose[0].length;
      if (depth > 0) {
        openTag.lastIndex = pos;
        closeTag.lastIndex = pos;
      } else {
        return xml.slice(contentStart, nextClose.index);
      }
    }
  }

  // 如果找不到关闭标签，返回到末尾的内容
  return xml.slice(contentStart);
}

/**
 * 提取标签的文本内容（去除子标签）
 */
function extractTagContent(xml: string, tagName: string): string | null {
  const inner = extractTag(xml, tagName);
  if (inner === null) return null;

  // 处理 CDATA
  const cdataMatch = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
  if (cdataMatch?.[1] !== undefined) return cdataMatch[1];

  return inner.trim();
}

/**
 * 提取所有匹配标签的内容
 */
function extractAllTags(xml: string, tagName: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(`<${tagName}(\\s[^>]*)?>`, 'gi');
  let searchFrom = 0;

  let match: RegExpExecArray | null;
  while ((match = regex.exec(xml)) !== null) {
    const sliced = xml.slice(match.index);
    const content = extractTag(sliced, tagName);
    if (content !== null) {
      results.push(content);
      // 跳过已处理的部分
      const closeTag = `</${tagName}>`;
      const closeIdx = xml.indexOf(closeTag, match.index + match[0].length);
      searchFrom = closeIdx >= 0 ? closeIdx + closeTag.length : match.index + match[0].length;
      regex.lastIndex = searchFrom;
    }
  }

  return results;
}

/**
 * 提取所有匹配标签的文本内容
 */
function extractAllTagContents(xml: string, tagName: string): string[] {
  return extractAllTags(xml, tagName)
    .map(inner => {
      const cdataMatch = inner.match(/<!\[CDATA\[([\s\S]*?)\]\]>/);
      return cdataMatch?.[1] ?? inner.trim();
    })
    .filter(Boolean);
}

/**
 * 移除 HTML 标签
 */
function stripHtmlTags(html: string): string {
  return html
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * 解码 HTML 实体
 */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, num) => String.fromCharCode(parseInt(num, 10)))
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}
