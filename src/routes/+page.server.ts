import type { PageServerLoad } from './$types';

const STORY_LIMIT = 30;
const CACHE_TTL_SECONDS = 300;
const STALE_TTL_SECONDS = 600;
const HN_BASE = 'https://hacker-news.firebaseio.com/v0';

type HnStory = {
	id: number;
	title: string;
	by: string | null;
	time: number | null;
	score: number | null;
	descendants: number | null;
	url: string | null;
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

	const ids = await fetchJson<number[]>(`${HN_BASE}/${type}stories.json`);
	const limited = ids.slice(0, STORY_LIMIT);
	const stories = await Promise.all(
		limited.map(async (id) => {
			const story = await fetchJson<Partial<HnStory>>(`${HN_BASE}/item/${id}.json`);
			return {
				id: story.id ?? id,
				title: story.title ?? 'Untitled',
				by: story.by ?? null,
				time: story.time ?? null,
				score: story.score ?? null,
				descendants: story.descendants ?? null,
				url: story.url ?? null
			} satisfies HnStory;
		})
	);

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
