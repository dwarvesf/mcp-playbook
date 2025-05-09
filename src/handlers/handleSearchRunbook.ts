import {
  SearchRunbookArgs,
  SearchRunbookArgsSchema,
} from "../tools/searchRunbook.js";
import { validateArgs } from "../utils/validationUtils.js";
import { performSearch, EnhancedSearchResult } from "../engine/index.js";

// Define the expected structure for the final output of this handler
interface HandleSearchRunbookResult {
  results: {
    path: string;
    snippet?: string; // Snippet might come from text_matches or be generated
    full_content: string | null;
    url: string;
    score?: number; // Fuse.js score
  }[];
  total_count?: number; // This might be harder to get accurately with multi-stage processing
  message: string;
}

export async function handleSearchRunbook(
  args: SearchRunbookArgs,
): Promise<HandleSearchRunbookResult> {
  try {
    const { keyword } = validateArgs(SearchRunbookArgsSchema, args);
    console.error(`Handling search_runbook for keyword: ${keyword}`);

    const searchConfig = {
      targetRepo: "dwarvesf/runbook",
      additionalQualifiers: ["language:markdown", "in:file,path"],
      maxGitHubResults: 30, // Fetch more from GitHub for better local ranking
      maxFinalResults: 5,  // Return top 5 after ranking
    };

    const enhancedResults: EnhancedSearchResult[] = await performSearch(keyword, searchConfig);

    // Transform EnhancedSearchResult to the desired output format
    const finalResults = enhancedResults.map(item => {
      // Attempt to get a snippet from text_matches if available
      let snippet = "No snippet available";
      if (item.text_matches && item.text_matches.length > 0 && item.text_matches[0].fragment) {
        snippet = item.text_matches[0].fragment;
      } else if (item.full_content) {
        // Fallback: generate a snippet from full_content if no text_matches
        const firstNChars = 200; // Or some other logic
        snippet = item.full_content.substring(0, firstNChars) + (item.full_content.length > firstNChars ? "..." : "");
      }

      return {
        path: item.path,
        snippet: snippet,
        full_content: item.full_content === undefined ? null : item.full_content, // Ensure null if undefined
        url: item.html_url,
        score: item.score, // Fuse.js score
      };
    });
    
    // total_count from the initial GitHub query might not be as relevant after re-ranking.
    // For now, we can omit it or acknowledge it's from the pre-ranked set.
    // Let's report the number of results *after* ranking.
    return {
      results: finalResults,
      // total_count: initialGitHubTotalCount, // This would require performSearch to return it
      message: `Found and ranked ${finalResults.length} results for "${keyword}".`,
    };

  } catch (e: any) {
    console.error(`Error during runbook search for keyword "${args.keyword}": ${e.message}`);
    return {
      results: [],
      message: `An error occurred during runbook search: ${e.message}`,
    };
  }
}
