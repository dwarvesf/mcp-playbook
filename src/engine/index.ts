import { processAndExpandQuery, QueryParts } from './queryProcessor.js';
import { buildGitHubQueryStrings } from './githubQueryBuilder.js';
import { rankResults, RankableItem } from './ranker.js';
import { searchCode, getContents } from '../utils/githubApi.js';
import { GetResponseDataTypeFromEndpointMethod } from '@octokit/types';
import { Octokit } from 'octokit'; // Needed for Octokit types

// Infer the type for individual items from the searchCode response
// This requires Octokit to be initialized somewhere or its type utilities to be accessible.
// Assuming octokit.rest.search.code is the method used in searchCode utility.
// This is a bit indirect; ideally, githubApi.ts would export this type.
type GitHubSearchCodeResponse = GetResponseDataTypeFromEndpointMethod<Octokit['rest']['search']['code']>;
type GitHubCodeSearchItem = GitHubSearchCodeResponse['items'][number];


// Define the structure for the final search result item we'll return
export interface EnhancedSearchResult extends RankableItem {
  // We might add or modify fields here compared to RankableItem
  // For now, it can be the same and include the Fuse.js score
}

// Configuration for the search engine
interface SearchEngineConfig {
  targetRepo: string; // e.g., "dwarvesf/runbook"
  additionalQualifiers?: string[]; // e.g., ["language:markdown"]
  maxGitHubResults?: number; // How many results to fetch from GitHub initially (per query, then combined and sliced)
  maxFinalResults?: number; // How many results to return after ranking
}

export async function performSearch(
  rawQuery: string,
  config: SearchEngineConfig
): Promise<EnhancedSearchResult[]> {
  if (!rawQuery || rawQuery.trim() === '') {
    return [];
  }

  const { 
    targetRepo, 
    additionalQualifiers = [], 
    maxGitHubResults = 30, // This will now apply to the combined, de-duplicated list before content fetching
    maxFinalResults = 10 
  } = config;

  // 1. Process and expand the query
  const processedQuery: QueryParts = processAndExpandQuery(rawQuery);

  if (processedQuery.expandedTerms.length === 0 && processedQuery.coreTerms.length === 0) {
    console.warn('Query processing resulted in no terms, returning empty search results.');
    return [];
  }

  // 2. Build the GitHub query strings
  const queryStrings: string[] = buildGitHubQueryStrings(
    processedQuery,
    targetRepo,
    additionalQualifiers
  );

  if (queryStrings.length === 0) {
    console.warn('Query building resulted in no query strings, returning empty search results.');
    return [];
  }
  
  // 3. Fetch search results from GitHub for each query string
  const [ownerForApi, repoForApi] = targetRepo.split('/');
  if (!ownerForApi || !repoForApi) {
    console.error(`Invalid targetRepo format for API call: ${targetRepo}`);
    return [];
  }

  const repoQualifierString = `repo:${targetRepo}`;
  // const additionalQualifiersString = additionalQualifiers.join(' '); // Not needed for stripping this way

  const searchPromises = queryStrings.map(async (queryString) => {
    // queryString from buildGitHubQueryStrings is: `TERMS repo:OWNER/REPO QUALIFIERS`
    // searchCode function in githubApi.ts expects: `TERMS QUALIFIERS` (it adds repo:OWNER/REPO itself)

    let termsPart = "";
    let qualifiersPart = "";
    let termsForApi = "";

    const repoQualifierIndex = queryString.indexOf(repoQualifierString);

    if (repoQualifierIndex !== -1) {
      termsPart = queryString.substring(0, repoQualifierIndex).trim();
      // Qualifiers are after "repo:owner/repo " (note the space)
      qualifiersPart = queryString.substring(repoQualifierIndex + repoQualifierString.length).trim();
    } else {
      // This case should ideally not be hit if buildGitHubQueryStrings always includes the repo qualifier.
      // If it does, the queryString might be just terms or terms + qualifiers.
      // For safety, we'll assume the queryString is what searchCode needs, minus the repo part it adds.
      // This part is tricky if the structure isn't guaranteed.
      // However, buildGitHubQueryStrings *does* always add it.
      console.warn(`Repo qualifier not found in queryString: ${queryString}. Using as is, which might be incorrect.`);
      termsForApi = queryString.trim(); // Fallback, potentially problematic
    }

    if (repoQualifierIndex !== -1) { // Only construct if repoQualifier was found
        termsForApi = `${termsPart} ${qualifiersPart}`.trim().replace(/\s\s+/g, ' ');
    }
    
    // If, after constructing, termsForApi is empty (e.g., original query was just "repo:owner/repo"), skip.
    if (!termsForApi) {
        console.warn(`Skipping empty query after processing: ${queryString}`);
        return [];
    }

    try {
      // searchCode in githubApi.ts expects owner, repo, query (terms only)
      const searchResponse = await searchCode(ownerForApi, repoForApi, termsForApi);
      return searchResponse.items || []; 
    } catch (error) {
      console.error(`Error fetching search results from GitHub for query "${termsForApi}" in ${targetRepo}:`, error);
      return []; // Return empty for this query on error
    }
  });

  const settledSearchResults = await Promise.allSettled(searchPromises);
  const allGithubItems: GitHubCodeSearchItem[] = [];

  settledSearchResults.forEach(result => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allGithubItems.push(...result.value);
    }
  });

  // De-duplicate items based on path
  const uniqueGithubItemsMap = new Map<string, GitHubCodeSearchItem>();
  allGithubItems.forEach(item => {
    // Ensure item and item.path are valid before setting
    if (item && typeof item.path === 'string' && !uniqueGithubItemsMap.has(item.path)) {
      uniqueGithubItemsMap.set(item.path, item);
    }
  });
  
  const uniqueItemsPreSlice = Array.from(uniqueGithubItemsMap.values());

  if (uniqueItemsPreSlice.length === 0) {
    return [];
  }

  // Slice to maxGitHubResults *before* mapping to RankableItem and fetching content
  const itemsToFetchContentFor = uniqueItemsPreSlice.slice(0, maxGitHubResults);

  // Map to RankableItem structure
  let githubItems: RankableItem[] = itemsToFetchContentFor.map((item: GitHubCodeSearchItem) => {
    // Transform text_matches to be compatible with RankableItem
    const transformedTextMatches = item.text_matches?.map(tm => ({
      ...tm,
      object_type: tm.object_type === null ? undefined : tm.object_type, // Coalesce null to undefined
    }));

    return {
      name: item.name,
      path: item.path,
      html_url: item.html_url,
      score: item.score, 
      text_matches: transformedTextMatches,
      // full_content and fuseScore will be added later
    };
  });

  // 4. Fetch full content for each item
  const itemsWithContent: RankableItem[] = await Promise.all(
    githubItems.map(async (item) => {
      try {
        const rawContentData = await getContents(ownerForApi, repoForApi, item.path);
        let decodedContent: string | null = null;

        if (rawContentData && !Array.isArray(rawContentData) && 'content' in rawContentData && 'encoding' in rawContentData) {
          if (rawContentData.encoding === 'base64' && typeof rawContentData.content === 'string') {
            decodedContent = Buffer.from(rawContentData.content, 'base64').toString('utf-8');
          } else {
            console.warn(`Unexpected content encoding for ${item.path}: ${rawContentData.encoding}`);
            decodedContent = rawContentData.content as string; 
          }
        } else if (Array.isArray(rawContentData)) {
          console.warn(`Expected file content but received directory listing for ${item.path}`);
        }
        return { ...item, full_content: decodedContent };
      } catch (error) {
        console.error(`Failed to fetch content for ${item.path} in ${targetRepo}:`, error);
        return { ...item, full_content: null }; 
      }
    })
  );

  // 5. Rank the results
  const rankedItems: RankableItem[] = rankResults(itemsWithContent, processedQuery.originalQuery);

  // 6. Return the top N results
  return rankedItems.slice(0, maxFinalResults) as EnhancedSearchResult[];
}
