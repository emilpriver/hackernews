import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const HN_BASE = 'https://hacker-news.firebaseio.com/v0';
const CACHE_TTL_SECONDS = 180;
const STALE_TTL_SECONDS = 300;
const MAX_COMMENTS = 40;

type HnItem = {
  id: number;
  by?: string;
  time?: number;
  text?: string;
  kids?: number[];
  type?: string;
  deleted?: boolean;
  dead?: boolean;
};

const fetchJson = async <T>(url: string) => {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return (await response.json()) as T;
};

const getCacheKey = (request: Request, key: string) => {
  return new Request(`${request.url}-${key}`);
};

const loadComments = async (request: Request, storyId: string, cache?: Cache) => {
  const cacheKey = getCacheKey(request, storyId);
  const cached = cache ? await cache.match(cacheKey) : undefined;

  if (cached) {
    return (await cached.json()) as { id: number; by: string | null; time: number | null; text: string | null }[];
  }

  const story = await fetchJson<HnItem>(`${HN_BASE}/item/${storyId}.json`);
  const kids = story.kids ?? [];
  const ids = kids.slice(0, MAX_COMMENTS);
  const comments = await Promise.all(
    ids.map(async (id) => {
      const comment = await fetchJson<HnItem>(`${HN_BASE}/item/${id}.json`);
      if (comment.type !== 'comment' || comment.deleted || comment.dead) {
        return null;
      }
      return {
        id: comment.id,
        by: comment.by ?? null,
        time: comment.time ?? null,
        text: comment.text ?? null,
      };
    })
  );

  const responseBody = comments.filter(Boolean) as {
    id: number;
    by: string | null;
    time: number | null;
    text: string | null;
  }[];

  if (cache) {
    const response = new Response(JSON.stringify(responseBody), {
      headers: {
        'content-type': 'application/json',
        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_TTL_SECONDS}`,
      },
    });
    await cache.put(cacheKey, response.clone());
  }

  return responseBody;
};

export const GET: RequestHandler = async ({ params, request, platform }) => {
  const cache = platform?.caches?.default;
  const comments = await loadComments(request, params.id, cache);

  return json(comments, {
    headers: {
      'cache-control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_TTL_SECONDS}`,
    },
  });
};
