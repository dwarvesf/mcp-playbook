import { QueryParts, loadSynonyms } from './queryProcessor.js'; // Added loadSynonyms

export function buildGitHubQueryStrings( // Renamed function and changed return type
  processedQuery: QueryParts,
  targetRepo: string, // Expecting a single repo string like "owner/repo"
  additionalQualifiers: string[] = []
): string[] { // Return type is now string[]
  if (!targetRepo || typeof targetRepo !== 'string' || !targetRepo.includes('/')) {
    throw new Error('Invalid targetRepo format. Expected "owner/repo".');
  }

  const MAX_QUERIES = 4;
  const generatedQueries: string[] = [];
  const { coreTerms } = processedQuery; // coreTerms are generally more stable for query construction
  const allSynonyms = loadSynonyms();

  // Helper to construct a query string from a list of terms
  const constructQuery = (terms: string[]): string => {
    // Quote terms with spaces or special characters that might break GitHub search
    const processedTerms = terms.map(term => {
      if (term.includes(' ') || term.includes(':') || term.includes('"')) {
        // Basic quoting, ensure internal quotes are handled if necessary (though unlikely for synonyms)
        return `"${term.replace(/"/g, '\\"')}"`; 
      }
      return term;
    });
    const termsString = processedTerms.join(' ');
    const queryString = `${termsString} repo:${targetRepo} ${additionalQualifiers.join(' ')}`.trim();
    // Replace multiple spaces with single space
    return queryString.replace(/\s\s+/g, ' ');
  };

  // 1. Base Query: Uses the core terms derived from the query.
  // These are typically nouns, verbs, adjectives, somewhat normalized.
  if (coreTerms.length > 0) {
    generatedQueries.push(constructQuery(coreTerms));
  } else if (processedQuery.expandedTerms.length > 0) {
    // Fallback if coreTerms is empty but expandedTerms exist (e.g. query was only stopwords but had synonyms)
    // Construct a query from the first few expanded terms (up to a reasonable number, e.g., 3)
    // This is a simple fallback; could be made more sophisticated.
    const fallbackTerms = processedQuery.expandedTerms.slice(0, 3);
    if (fallbackTerms.length > 0) {
      generatedQueries.push(constructQuery(fallbackTerms));
    }
  }


  // 2. Synonym Substitution Queries
  // Only proceed if we haven't reached MAX_QUERIES and there are core terms to substitute
  if (generatedQueries.length < MAX_QUERIES && coreTerms.length > 0) {
    // Determine the maximum number of synonyms any core term has, to set iteration depth
    const maxSynonymDepth = Math.max(0, ...coreTerms.map(ct => (allSynonyms[ct.toLowerCase()] || []).length));

    for (let synIdx = 0; synIdx < maxSynonymDepth; synIdx++) {
      for (let termIdx = 0; termIdx < coreTerms.length; termIdx++) {
        if (generatedQueries.length >= MAX_QUERIES) break; // Check before generating new query

        const currentCoreTerm = coreTerms[termIdx];
        const synonymsForCoreTerm = allSynonyms[currentCoreTerm.toLowerCase()] || [];

        if (synIdx < synonymsForCoreTerm.length) {
          const synonymToUse = synonymsForCoreTerm[synIdx];
          if (synonymToUse.toLowerCase() !== currentCoreTerm.toLowerCase()) { // Avoid redundant query if synonym is same as core term
            const queryTerms = [...coreTerms];
            queryTerms[termIdx] = synonymToUse; // Substitute
            const newQuery = constructQuery(queryTerms);
            // Add only if it's different from existing queries to avoid duplicates from this stage
            if (!generatedQueries.includes(newQuery)) {
                 generatedQueries.push(newQuery);
            }
          }
        }
      }
      if (generatedQueries.length >= MAX_QUERIES) break; // Check after iterating all core terms for a synonym index
    }
  }
  
  // If after all that, generatedQueries is empty (e.g., rawQuery was empty or only unexpandable stopwords),
  // and original expandedTerms had something, create one query from all expanded terms.
  // This is a last resort to ensure at least one query if possible.
  if (generatedQueries.length === 0 && processedQuery.expandedTerms.length > 0) {
    const termsString = processedQuery.expandedTerms.join(' OR '); // Use OR for this broad fallback
    const queryString = `${termsString} repo:${targetRepo} ${additionalQualifiers.join(' ')}`.trim();
    generatedQueries.push(queryString.replace(/\s\s+/g, ' '));
  }


  // Ensure unique queries and adhere to MAX_QUERIES strictly.
  // The generation logic tries to avoid duplicates, but Set is a final guarantee.
  // Slice to ensure we don't exceed MAX_QUERIES if the last-resort query was added.
  return [...new Set(generatedQueries)].slice(0, MAX_QUERIES);
}
