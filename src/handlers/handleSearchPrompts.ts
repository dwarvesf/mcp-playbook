import {
  SearchPromptsArgs,
  SearchPromptsArgsSchema,
} from "../tools/searchPrompts.js";
import { validateArgs } from "../utils/validationUtils.js";
import { performSearch, EnhancedSearchResult } from "../engine/index.js";

// Define the expected structure for the final output of this handler
interface HandleSearchPromptsResult {
  results: {
    path: string;
    snippet?: string;
    full_content: string | null;
    url: string;
    score?: number; // Fuse.js score
  }[];
  message: string;
}

export async function handleSearchPrompts(
  args: SearchPromptsArgs,
): Promise<HandleSearchPromptsResult> {
  try {
    const { keyword } = validateArgs(SearchPromptsArgsSchema, args);
    console.error(`Handling search_prompts for keyword: ${keyword}`);

    const searchConfig = {
      targetRepo: "dwarvesf/prompt-db",
      additionalQualifiers: ["-path:synced_prompts", "in:file,path"], // Exclude the synced_prompts directory
      maxGitHubResults: 30, // Fetch more from GitHub for better local ranking
      maxFinalResults: 5,   // Return top 5 after ranking
    };

    const enhancedResults: EnhancedSearchResult[] = await performSearch(keyword, searchConfig);

    const finalResults = enhancedResults.map(item => {
      let snippet = "No snippet available";
      if (item.text_matches && item.text_matches.length > 0 && item.text_matches[0].fragment) {
        snippet = item.text_matches[0].fragment;
      } else if (item.full_content) {
        const firstNChars = 200;
        snippet = item.full_content.substring(0, firstNChars) + (item.full_content.length > firstNChars ? "..." : "");
      }

      return {
        path: item.path,
        snippet: snippet,
        full_content: item.full_content === undefined ? null : item.full_content,
        url: item.html_url,
        score: item.score,
      };
    });

    return {
      results: finalResults,
      message: `Found and ranked ${finalResults.length} results for "${keyword}" in prompt-db.`,
    };

  } catch (e: any) {
    console.error(`Error during prompt search for keyword "${args.keyword}": ${e.message}`);
    return {
      results: [],
      message: `An error occurred during prompt search: ${e.message}`,
    };
  }
}
