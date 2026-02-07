import type { PageServerLoad } from './$types';

const STORY_LIMIT = 30;
const CACHE_TTL_SECONDS = 300;
const STALE_TTL_SECONDS = 600;
const ALGOLIA_BASE = 'https://hn.algolia.com/api/v1';

type HnStory = {
        id: number;
        title: string;
        by: string | null;
        time: number | null;
        score: number | null;
        descendants: number | null;
        url: string | null;
};

type AlgoliaStory = {
        objectID: string;
        title?: string;
        url?: string | null;
        author?: string | null;
        created_at_i?: number | null;
        points?: number | null;
        num_comments?: number | null;
};

type AlgoliaResponse = {
        hits: AlgoliaStory[];
};

const getCacheKey = (request: Request, key: string) => {
	return new Request(`${request.url}-${key}`);
};

const fetchJson = async <T>(url: string) => {
	const response = await fetch(url);
	if (!response.ok) {
		throw new Error(`Failed to fetch ${url}`);
	}
	return (await response.json()) as T;
};

const loadStories = async (request: Request, type: 'top' | 'new', cache?: Cache) => {
        const cacheKey = getCacheKey(request, type);
        const cached = cache ? await cache.match(cacheKey) : undefined;

        if (cached) {
                return (await cached.json()) as HnStory[];
        }

        if (type === 'top') {
                const response = await fetchJson<AlgoliaResponse>(
                        `${ALGOLIA_BASE}/search?tags=front_page&hitsPerPage=${STORY_LIMIT}`
                );
                const stories = response.hits.map((story) => ({
                        id: Number(story.objectID),
                        title: story.title ?? 'Untitled',
                        by: story.author ?? null,
                        time: story.created_at_i ?? null,
                        score: story.points ?? null,
                        descendants: story.num_comments ?? null,
                        url: story.url ?? null
                } satisfies HnStory));

                return await cacheStories(cache, cacheKey, stories);
        }

        const response = await fetchJson<AlgoliaResponse>(
                `${ALGOLIA_BASE}/search_by_date?tags=story&hitsPerPage=${STORY_LIMIT}`
        );
        const stories = response.hits.map((story) => ({
                id: Number(story.objectID),
                title: story.title ?? 'Untitled',
                by: story.author ?? null,
                time: story.created_at_i ?? null,
                score: story.points ?? null,
                descendants: story.num_comments ?? null,
                url: story.url ?? null
        } satisfies HnStory));

        return await cacheStories(cache, cacheKey, stories);
};

const cacheStories = async (cache: Cache | undefined, cacheKey: Request, stories: HnStory[]) => {
        const response = new Response(JSON.stringify(stories), {
                headers: {
                        'content-type': 'application/json',
                        'cache-control': `public, max-age=${CACHE_TTL_SECONDS}, s-maxage=${CACHE_TTL_SECONDS}, stale-while-revalidate=${STALE_TTL_SECONDS}`
                }
        });

        if (cache) {
                await cache.put(cacheKey, response.clone());
        }

        return stories;
};

export const load: PageServerLoad = async ({ request, platform }) => {
        const cache = platform?.caches?.default;
        const [trending, newest] = await Promise.all([
                loadStories(request, 'top', cache),
                loadStories(request, 'new', cache)
        ]);

	return {
		trending,
		newest
	};
};
