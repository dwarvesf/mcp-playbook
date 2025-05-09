import nlp from 'compromise';
import * as path from 'path';
import * as sfs from 'fs'; // Use sfs to avoid conflict with 'fs' type from 'memfs' if it's in global types
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Define a type for our synonyms dictionary
type SynonymDict = { [key: string]: string[] };

// Memoize synonyms loading
let synonyms: SynonymDict | null = null;

export function loadSynonyms(): SynonymDict { // Added export
  if (synonyms === null) {
    try {
      const synonymsPath = path.join(__dirname, 'synonyms.json');
      const rawData = sfs.readFileSync(synonymsPath, 'utf-8');
      synonyms = JSON.parse(rawData) as SynonymDict;
    } catch (error) {
      synonyms = {}; // Fallback to empty synonyms on error
    }
  }
  return synonyms;
}

export interface QueryParts {
  coreTerms: string[];
  expandedTerms: string[];
  originalQuery: string;
}

// A simple list of common stopwords.
// The LLM might handle this, but a small list here can be a fallback.
const defaultStopwords: Set<string> = new Set([
  'a', 'an', 'the', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'should', 'can',
  'could', 'may', 'might', 'must', 'i', 'you', 'he', 'she', 'it', 'we', 'they',
  'me', 'him', 'her', 'us', 'them', 'my', 'your', 'his', 'its', 'our', 'their',
  'mine', 'yours', 'hers', 'ours', 'theirs', 'to', 'of', 'in', 'on', 'at',
  'by', 'for', 'with', 'about', 'against', 'between', 'into', 'through',
  'during', 'before', 'after', 'above', 'below', 'from', 'up', 'down', 'out',
  'over', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when',
  'where', 'why', 'how', 'all', 'any', 'both', 'each', 'few', 'more', 'most',
  'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
  'than', 'too', 'very', 's', 't', 'just', 'don', 'shouldve', 'now', 'd', 'll',
  'm', 'o', 're', 've', 'y', 'ain', 'aren', 'couldn', 'didn', 'doesn', 'hadn',
  'hasn', 'haven', 'isn', 'ma', 'mightn', 'mustn', 'needn', 'shan', 'shouldn',
  'wasn', 'weren', 'won', 'wouldn'
]);


export function processAndExpandQuery(rawQuery: string): QueryParts {
  const loadedSynonyms = loadSynonyms();
  const doc = nlp(rawQuery.toLowerCase());

  // Attempt to extract meaningful parts of speech
  let nouns = doc.nouns().out('array').map((term: string) => nlp(term).nouns().toSingular().out('text') || term);
  let verbs = doc.verbs().out('array').map((term: string) => nlp(term).verbs().toInfinitive().out('text') || term);
  
  // Include adjectives as they can be significant (e.g., "slow database query")
  let adjectives = doc.adjectives().out('array');

  // Combine and deduplicate, prioritizing nouns and verbs
  let coreTerms = [...new Set([...nouns, ...verbs, ...adjectives])];

  // If POS tagging yields very few terms (e.g., for very short or unusual queries),
  // fall back to a simpler tokenization and stopword removal.
  if (coreTerms.length < Math.max(1, rawQuery.split(/\s+/).length / 3) && rawQuery.split(/\s+/).length > 2) {
    const allTokens = doc.terms().out('array') as string[];
    coreTerms = [...new Set(allTokens.filter(token => !defaultStopwords.has(token.toLowerCase())))];
  }
  
  // If still no core terms (e.g. query was only stopwords, or very short like "go"), use all tokens from original query
  if (coreTerms.length === 0) {
    coreTerms = [...new Set(doc.terms().out('array') as string[])];
  }
  // Ensure no empty strings in coreTerms
  coreTerms = coreTerms.filter(term => term.trim() !== '');

  // Get all tokens from the original query, lowercased, non-stopwords
  const originalQueryTokens = [...new Set(
    (doc.terms().out('array') as string[])
      .map(token => token.toLowerCase())
      .filter(token => !defaultStopwords.has(token) && token.trim() !== '')
  )];
  
  // Start expandedTerms with POS-derived coreTerms and all significant original query tokens
  let expandedTerms = [...new Set([...coreTerms, ...originalQueryTokens])];

  // Add synonyms for all terms currently in expandedTerms (this includes original terms and core POS terms)
  // This loop might add synonyms of synonyms if a synonym itself is a key in loadedSynonyms.
  // For simplicity now, we'll allow one level of synonym expansion.
  const termsToGetSynonymsFor = [...expandedTerms]; // Iterate over a copy
  for (const term of termsToGetSynonymsFor) {
    const termSynonyms = loadedSynonyms[term.toLowerCase()]; // Synonyms key should be lowercase
    if (termSynonyms) {
      expandedTerms.push(...termSynonyms);
    }
  }
  
  // Final cleanup: deduplicate, lowercase, remove empty strings
  expandedTerms = [...new Set(expandedTerms.map(term => term.toLowerCase()))].filter(term => term.trim() !== '');

  // Fallback: If expandedTerms is empty (e.g., original query was only stopwords not in synonym list),
  // use the original raw query tokens (split, lowercased, non-empty).
  if (expandedTerms.length === 0) {
    expandedTerms = [...new Set(rawQuery.toLowerCase().split(/\s+/).filter(t => t.trim() !== ''))];
    // If still empty (e.g. rawQuery was empty or only spaces), ensure it's an empty array not an array with an empty string
    if (expandedTerms.length === 1 && expandedTerms[0] === '') {
        expandedTerms = [];
    }
  }

  return {
    coreTerms, // These are POS-derived and somewhat normalized
    expandedTerms,
    originalQuery: rawQuery,
  };
}
