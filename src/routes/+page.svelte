<script lang="ts">
	import { browser } from '$app/environment';
	import { invalidateAll } from '$app/navigation';
	import { onMount } from 'svelte';
	import type { PageData } from './$types';

	type TabKey = 'trending' | 'new';

	let { data } = $props<{ data: PageData }>();

	let activeTab = $state<TabKey>('trending');
	let selectedId = $state<number | null>(null);
	let refreshPending = $state(false);
	let openMode = $state<'window' | 'tab'>('window');
	let iframeLoading = $state(true);
	let iframeStoryId = $state<number | null>(null);
	let comments = $state<
		{ id: number; by: string | null; time: number | null; text: string | null }[]
	>([]);
	let commentsLoading = $state(false);
	let commentsError = $state<string | null>(null);
	const commentSkeletons = [
		{ id: 0 },
		{ id: 1 },
		{ id: 2 },
		{ id: 3 },
		{ id: 4 }
	];

	const stories = $derived(activeTab === 'trending' ? data.trending : data.newest);
	const selectedStory = $derived(stories.find((story) => story.id === selectedId) ?? stories[0]);

	$effect(() => {
		if (!stories.length) {
			selectedId = null;
			return;
		}

		if (!selectedId || !stories.some((story) => story.id === selectedId)) {
			selectedId = stories[0].id;
		}
	});

	$effect(() => {
		if (!selectedStory || openMode === 'tab') {
			iframeLoading = false;
			iframeStoryId = selectedStory?.id ?? null;
			return;
		}

		if (selectedStory.id !== iframeStoryId) {
			iframeStoryId = selectedStory.id;
			iframeLoading = true;
		}
	});

	onMount(() => {
		const storedMode = browser ? localStorage.getItem('hn-open-mode') : null;
		if (storedMode === 'window' || storedMode === 'tab') {
			openMode = storedMode;
		}
	});

	$effect(() => {
		if (browser) {
			localStorage.setItem('hn-open-mode', openMode);
		}
	});

  $effect(() => {
    if (!selectedStory) {
      comments = [];
      return;
    }

    const controller = new AbortController();
    commentsLoading = true;
    commentsError = null;

    fetch(`/api/comments/${selectedStory.id}`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to load comments');
        }
        return response.json();
      })
      .then((data) => {
        comments = data;
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }
        commentsError = 'Unable to load comments right now.';
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          commentsLoading = false;
        }
      });

    return () => controller.abort();
  });

	const formatDomain = (url: string | null) => {
		if (!url) return 'news.ycombinator.com';

		try {
			return new URL(url).hostname.replace(/^www\./, '');
		} catch {
			return 'news.ycombinator.com';
		}
	};

	const formatTimeAgo = (timestamp: number | null) => {
		if (!timestamp) return 'just now';

		const deltaSeconds = Math.floor(Date.now() / 1000 - timestamp);
		const units = [
			{ label: 'day', value: 86400 },
			{ label: 'hour', value: 3600 },
			{ label: 'minute', value: 60 }
		];

		for (const unit of units) {
			const amount = Math.floor(deltaSeconds / unit.value);
			if (amount >= 1) {
				return `${amount} ${unit.label}${amount === 1 ? '' : 's'} ago`;
			}
		}

		return 'just now';
	};

	const getStoryUrl = (story: { id: number; url: string | null }) => {
		return story.url ?? `https://news.ycombinator.com/item?id=${story.id}`;
	};

	const handleStoryClick = (story: { id: number; url: string | null }) => {
		if (openMode === 'tab') {
			const url = getStoryUrl(story);
			window.open(url, '_blank', 'noopener,noreferrer');
			return;
		}

		selectedId = story.id;
	};

	const refreshStories = async () => {
		refreshPending = true;
		try {
			await invalidateAll();
		} finally {
			refreshPending = false;
		}
	};

	const handleIframeLoad = () => {
		iframeLoading = false;
	};
</script>

<div class="min-h-screen bg-stone-50 text-slate-900">
	<div class="flex min-h-screen w-full flex-col gap-6 px-6 py-6">
		<header
			class="flex flex-col gap-4 rounded-3xl border border-stone-200 bg-white px-6 py-5 shadow-sm sm:flex-row sm:items-center sm:justify-between"
		>
			<div class="flex items-center gap-3">
				<span
					class="flex h-10 w-10 items-center justify-center rounded-full bg-orange-500 text-sm font-semibold text-white"
					>Y</span
				>
				<div>
					<p class="text-sm font-semibold tracking-tight text-slate-900">Hacker News</p>
					<p class="text-xs text-slate-500">A better reading experience</p>
				</div>
			</div>
			<div class="flex flex-wrap gap-3">
				<div class="flex gap-2">
					<button
						type="button"
						aria-pressed={activeTab === 'trending'}
						class={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
							activeTab === 'trending'
								? 'border-orange-200 bg-orange-50 text-orange-700'
								: 'border-stone-200 bg-white text-slate-600 hover:border-orange-200'
						}`}
						on:click={() => {
							activeTab = 'trending';
							selectedId = null;
						}}
					>
						Trending
					</button>
					<button
						type="button"
						aria-pressed={activeTab === 'new'}
						class={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition ${
							activeTab === 'new'
								? 'border-orange-200 bg-orange-50 text-orange-700'
								: 'border-stone-200 bg-white text-slate-600 hover:border-orange-200'
						}`}
						on:click={() => {
							activeTab = 'new';
							selectedId = null;
						}}
					>
						New
					</button>
				</div>
				<div class="flex items-center gap-2 rounded-full border border-stone-200 bg-stone-50 px-2 py-1 text-xs">
					<span class="px-2 text-slate-500">Open in</span>
					<button
						type="button"
						class={`rounded-full px-3 py-1 text-xs font-semibold transition ${
							openMode === 'window'
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'
						}`}
						on:click={() => {
							openMode = 'window';
						}}
					>
						Window
					</button>
					<button
						type="button"
						class={`rounded-full px-3 py-1 text-xs font-semibold transition ${
							openMode === 'tab'
								? 'bg-white text-slate-900 shadow-sm'
								: 'text-slate-500 hover:text-slate-700'
						}`}
						on:click={() => {
							openMode = 'tab';
						}}
					>
						New tab
					</button>
				</div>
			</div>
		</header>

		<section class="flex flex-1 flex-col gap-6 lg:flex-row">
			<aside class="w-full shrink-0 rounded-3xl border border-stone-200 bg-white shadow-sm lg:w-96">
				<div class="flex items-center justify-between border-b border-stone-100 px-5 py-4">
					<div>
						<p class="text-sm font-semibold text-slate-900 capitalize">{activeTab}</p>
						<p class="text-xs text-slate-500">{stories.length} stories</p>
					</div>
					<button
						type="button"
						class="rounded-full border border-stone-200 px-3 py-1 text-xs text-slate-500 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-not-allowed disabled:opacity-60"
						disabled={refreshPending}
						on:click={refreshStories}
					>
						{refreshPending ? 'Refreshing…' : 'Refresh'}
					</button>
				</div>
				<ul class="divide-y divide-stone-100">
					{#each stories as story}
						<li>
							<button
								type="button"
								class={`group flex w-full flex-col gap-2 px-5 py-4 text-left transition hover:bg-orange-50/60 ${
									story.id === selectedId ? 'bg-orange-50/80' : 'bg-white'
								}`}
								on:click={() => handleStoryClick(story)}
							>
								<div class="flex items-start justify-between gap-3">
									<span
										class="cursor-pointer text-sm font-semibold text-slate-900 underline-offset-4 transition group-hover:text-orange-600 group-hover:underline"
									>
										{story.title}
									</span>
									<span class="text-xs font-semibold text-orange-500">{story.score ?? 0}</span>
								</div>
								<div class="flex flex-wrap items-center gap-2 text-xs text-slate-500">
									<span>{formatDomain(story.url)}</span>
									<span>·</span>
									<span>{formatTimeAgo(story.time)}</span>
									<span>·</span>
									<span>{story.descendants ?? 0} comments</span>
								</div>
							</button>
						</li>
					{/each}
				</ul>
			</aside>

			<main
				class="flex min-h-[520px] flex-1 flex-col rounded-3xl border border-stone-200 bg-white shadow-sm"
			>
				{#if selectedStory}
					<div class="flex flex-col gap-3 border-b border-stone-100 px-6 py-4">
						<div class="flex items-start justify-between gap-4">
							<div>
								<p class="text-sm font-semibold text-slate-900">{selectedStory.title}</p>
								<p class="text-xs text-slate-500">
									{selectedStory.score ?? 0} points · by {selectedStory.by ?? 'unknown'} ·
									{formatTimeAgo(selectedStory.time)}
								</p>
							</div>
                                                        <a
                                                                class="text-xs font-semibold text-orange-600 hover:text-orange-500"
                                                                href={getStoryUrl(selectedStory)}
                                                                target="_blank"
                                                                rel="noreferrer"
                                                        >
								Open original
							</a>
						</div>
					</div>
					<div class="relative flex-1 overflow-hidden">
						{#if iframeLoading}
							<div class="absolute inset-0 z-10 flex flex-col gap-4 bg-white/90 p-6">
								<div class="h-4 w-2/3 rounded-full bg-stone-200 animate-pulse"></div>
								<div class="h-3 w-1/3 rounded-full bg-stone-200 animate-pulse"></div>
								<div class="mt-4 flex-1 rounded-2xl bg-stone-200 animate-pulse"></div>
							</div>
						{/if}
						{#key selectedStory.id}
							<iframe
								title={selectedStory.title}
								class={`h-full w-full border-none transition ${
									iframeLoading ? 'opacity-0' : 'opacity-100'
								}`}
								src={getStoryUrl(selectedStory)}
								on:load={handleIframeLoad}
							></iframe>
						{/key}
					</div>
					<div class="border-t border-stone-100 px-6 py-4">
						<div class="flex items-center justify-between">
							<p class="text-sm font-semibold text-slate-900">Comments</p>
							<p class="text-xs text-slate-500">{selectedStory.descendants ?? comments.length}</p>
						</div>
						{#if commentsLoading}
							<ul class="mt-4 space-y-4">
								{#each commentSkeletons as skeleton}
									<li class="rounded-2xl border border-stone-100 bg-stone-50/60 p-3">
										<div class="h-3 w-1/4 rounded-full bg-stone-200 animate-pulse"></div>
										<div class="mt-3 h-3 w-5/6 rounded-full bg-stone-200 animate-pulse"></div>
										<div class="mt-2 h-3 w-2/3 rounded-full bg-stone-200 animate-pulse"></div>
									</li>
								{/each}
							</ul>
						{:else if commentsError}
							<p class="mt-3 text-xs text-orange-600">{commentsError}</p>
						{:else if comments.length === 0}
							<p class="mt-3 text-xs text-slate-500">No comments yet.</p>
						{:else}
							<ul class="mt-4 max-h-64 space-y-4 overflow-y-auto pr-2">
								{#each comments as comment}
									<li class="rounded-2xl border border-stone-100 bg-stone-50/60 p-3">
										<p class="text-xs font-semibold text-slate-600">
											{comment.by ?? 'unknown'} · {formatTimeAgo(comment.time)}
										</p>
										<div class="prose prose-sm mt-2 max-w-none text-slate-700">
											{@html comment.text ?? ''}
										</div>
									</li>
								{/each}
							</ul>
						{/if}
					</div>
				{:else}
					<div class="flex flex-1 items-center justify-center text-sm text-slate-500">
						Select a story to start reading.
					</div>
				{/if}
			</main>
		</section>
	</div>
</div>
