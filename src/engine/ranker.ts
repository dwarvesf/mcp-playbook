import Fuse, { IFuseOptions } from 'fuse.js';

// Define a more specific type for the items we'll be ranking,
// ensuring they have the necessary fields for Fuse.js and for our output.
// This should align with what searchCode from githubApi.ts returns and what handleSearchRunbook/Prompts expect.
export interface RankableItem {
  path: string;
  name: string; // from GitHub API (name of the file)
  html_url: string; // from GitHub API
  score?: number; // GitHub's score, might be useful
  text_matches?: { // from GitHub API, provides snippets
    object_url?: string;
    object_type?: string;
    property?: string;
    fragment?: string;
    matches?: {
      text?: string;
      indices?: number[];
    }[];
  }[];
  full_content?: string | null; // We'll add this after fetching
  // Add any other fields from GitHubSearchResult that we want to preserve
}

// Options for Fuse.js
// We'll search in the 'name' (filename) and 'full_content'.
// 'path' can also be useful.
const fuseOptions: IFuseOptions<RankableItem> = {
  keys: [
    { name: 'name', weight: 0.4 }, // Filename is important
    { name: 'path', weight: 0.3 }, // Path can give context
    { name: 'full_content', weight: 0.3 }, // Content is key
  ],
  includeScore: true, // To get the Fuse.js score for ranking
  threshold: 0.6, // Adjust as needed; lower is more lenient
  minMatchCharLength: 2,
  // ignoreLocation: true, // If true, match anywhere in the string
  // useExtendedSearch: true, // Allows for more complex queries if needed, but simple string is fine for now
};

export function rankResults(
  items: RankableItem[],
  originalQuery: string
): RankableItem[] {
  if (!items || items.length === 0) {
    return [];
  }

  // Filter out items that don't have full_content, as they are less useful for ranking by content.
  // However, we might still want to rank by name/path if content is missing.
  // For now, let's assume full_content is essential for good ranking.
  // If an item is missing full_content, it might get a very poor score or be excluded.
  const itemsWithContent = items.filter(item => typeof item.full_content === 'string' && item.full_content.length > 0);
  
  // If no items have content, we can't rank by content.
  // In this scenario, we could fall back to ranking by name/path only, or return as is.
  // For now, let's proceed with itemsWithContent. If it's empty, Fuse will return empty.
  
  const fuse = new Fuse(itemsWithContent, fuseOptions);
  const fuseResults = fuse.search(originalQuery);

  // Fuse.js results are in the format { item: RankableItem, score: number, refIndex: number }
  // The score is 0 for a perfect match and 1 for a complete mismatch.
  // We want to sort by this score (ascending).
  return fuseResults.map(result => ({
    ...result.item,
    score: result.score, // Overwrite GitHub's score with Fuse.js's score
  }));
}
