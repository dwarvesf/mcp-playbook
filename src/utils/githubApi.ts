import { RequestError } from "@octokit/request-error";
import {
  Endpoints,
  GetResponseDataTypeFromEndpointMethod,
  RequestParameters,
} from "@octokit/types";
import { Buffer } from "buffer";
import { Octokit } from "octokit";
import * as path from "path";

// In-memory cache for search results
const searchCache = new Map<string, any>();
// In-memory cache for getContents results
const getContentsCache = new Map<string, any>();
const CACHE_TTL = 15 * 60 * 1000 * 1000; // 15 minutes

const octokit = new Octokit({
  auth: process.env.GITHUB_PERSONAL_ACCESS_TOKEN,
});

// Define a type that can be a single item or an array of items using Octokit's type
type GitHubContentsResponse = GetResponseDataTypeFromEndpointMethod<
  typeof octokit.rest.repos.getContent
>;

export async function getContents(
  owner: string,
  repo: string,
  filePath: string, // This is the path WITHIN the GitHub repo
  branch: string = "main", // Default branch
): Promise<GitHubContentsResponse> {
  const cacheKey = `${owner}/${repo}/${filePath}@${branch}`;
  const cachedResult = getContentsCache.get(cacheKey);

  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    console.error(`Returning cached getContents result for ${cacheKey}`);
    return cachedResult.data;
  }

  console.error(
    `Attempting to get contents from GitHub: ${owner}/${repo}/${filePath} on branch ${branch}`,
  );

  try {
    const response = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: filePath,
      ref: branch,
    });

    // Store the result in cache with a timestamp
    getContentsCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });

    // The response data structure depends on whether filePath is a file or a directory.
    // Octokit's type definition for getContent is a bit complex, so we'll cast for now.
    // We also need to handle the case where the content is not found (404), which Octokit throws as an error.
    return response.data as GitHubContentsResponse;
  } catch (e: any) {
    if (e instanceof RequestError && e.status === 404) {
      console.error(`Content not found at ${filePath}. Returning empty.`);
      // Cache the 404 result as an empty array
      getContentsCache.set(cacheKey, {
        data: [] as GitHubContentsResponse,
        timestamp: Date.now(),
      });
      return [] as GitHubContentsResponse; // Return empty array for consistency when listing directory contents
    }
    console.error(`GitHub API GET request error for ${filePath}: ${e.message}`);
    throw e; // Re-throw for the tool handler
  }
}

// Git Database API Functions for creating a single commit

export async function getRef(
  owner: string,
  repo: string,
  ref: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.getRef>
> {
  console.error(`Attempting to get ref from GitHub: ${owner}/${repo}/${ref}`);

  try {
    const response = await octokit.rest.git.getRef({
      owner,
      repo,
      ref,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API GET ref error for ${ref}: ${e.message}`);
    throw e;
  }
}

export async function getCommit(
  owner: string,
  repo: string,
  commitSha: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.getCommit>
> {
  console.error(
    `Attempting to get commit from GitHub: ${owner}/${repo}/${commitSha}`,
  );

  try {
    const response = await octokit.rest.git.getCommit({
      owner,
      repo,
      commit_sha: commitSha,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API GET commit error for ${commitSha}: ${e.message}`);
    throw e;
  }
}

export async function getTree(
  owner: string,
  repo: string,
  treeSha: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.getTree>
> {
  console.error(
    `Attempting to get tree from GitHub: ${owner}/${repo}/${treeSha}`,
  );

  try {
    const response = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: treeSha,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API GET tree error for ${treeSha}: ${e.message}`);
    throw e;
  }
}

export async function createBlob(
  owner: string,
  repo: string,
  content: string,
  encoding: string = "utf-8",
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.createBlob>
> {
  console.error(`Attempting to create blob in GitHub: ${owner}/${repo}`);

  const payload = {
    content: content,
    encoding: encoding,
  };

  try {
    const response = await octokit.rest.git.createBlob({
      owner,
      repo,
      ...payload,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API POST blob error: ${e.message}`);
    throw e;
  }
}

export type GitHubCreateTreeItem = RequestParameters &
  Endpoints["POST /repos/{owner}/{repo}/git/trees"]["parameters"]["tree"][number];

export async function createTree(
  owner: string,
  repo: string,
  treeItems: GitHubCreateTreeItem[],
  baseTreeSha?: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.createTree>
> {
  console.error(`Attempting to create tree in GitHub: ${owner}/${repo}`);

  const payload: any = {
    tree: treeItems,
  };
  if (baseTreeSha) {
    payload.base_tree = baseTreeSha;
  }

  try {
    const response = await octokit.rest.git.createTree({
      owner,
      repo,
      ...payload,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API POST tree error: ${e.message}`);
    throw e;
  }
}

export async function createCommit(
  owner: string,
  repo: string,
  message: string,
  treeSha: string,
  parentCommitSha: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.createCommit>
> {
  console.error(`Attempting to create commit in GitHub: ${owner}/${repo}`);

  const payload = {
    message: message,
    tree: treeSha,
    parents: [parentCommitSha],
  };

  try {
    const response = await octokit.rest.git.createCommit({
      owner,
      repo,
      ...payload,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API POST commit error: ${e.message}`);
    throw e;
  }
}

export async function updateRef(
  owner: string,
  repo: string,
  ref: string,
  commitSha: string,
  force: boolean = false,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.updateRef>
> {
  console.error(`Attempting to update ref in GitHub: ${owner}/${repo}/${ref}`);

  const payload = {
    sha: commitSha,
    force: force,
  };

  try {
    const response = await octokit.rest.git.updateRef({
      owner,
      repo,
      ref,
      ...payload,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API PATCH ref error: ${e.message}`);
    throw e;
  }
}

export async function searchCode(
  owner: string,
  repo: string,
  query: string,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.search.code>
> {
  console.error(
    `Attempting to search code in GitHub: ${owner}/${repo} with query "${query}"`,
  );

  const cacheKey = `${owner}/${repo}:${query}`; // Corrected cache key
  const cachedResult = searchCache.get(cacheKey);

  if (cachedResult && Date.now() - cachedResult.timestamp < CACHE_TTL) {
    console.error(`Returning cached search result for ${cacheKey}`);
    return cachedResult.data;
  }

  try {
    let searchQuery = `${query}`;

    console.error(`Using search query: ${searchQuery}`);

    const response = await octokit.rest.search.code({
      q: `repo:${owner}/${repo} ${searchQuery}`,
      // GitHub Search API requires a specific Accept header for text matches
      headers: {
        Accept: "application/vnd.github.text-match+json",
      },
    });

    // Store the result in cache with a timestamp
    searchCache.set(cacheKey, {
      data: response.data,
      timestamp: Date.now(),
    });

    return response.data; // Return Octokit's type directly
  } catch (e: any) {
    console.error(`GitHub API GET search code error: ${e.message}`);
    throw e;
  }
}

// Function to create a new branch
export async function createBranch(
  owner: string,
  repo: string,
  branch: string,
  fromBranch: string = "main",
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.git.createRef>
> {
  console.error(
    `Attempting to create branch ${branch} from ${fromBranch} in ${owner}/${repo}`,
  );
  try {
    // Get the SHA of the branch to fork from
    const ref = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${fromBranch}`,
    });
    const sha = ref.data.object.sha;

    // Create the new branch
    const response = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branch}`,
      sha,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API create branch error: ${e.message}`);
    throw e;
  }
}

// Function to get a pull request
export async function getPullRequest(
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.pulls.get>
> {
  console.error(`Attempting to get PR ${pullNumber} from ${owner}/${repo}`);
  try {
    const response = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: pullNumber,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API get PR error: ${e.message}`);
    throw e;
  }
}

// Function to create a pull request
export async function createPullRequest(
  owner: string,
  repo: string,
  title: string,
  head: string, // branch with changes
  base: string, // branch to merge into
  body?: string,
  draft?: boolean,
  maintainerCanModify?: boolean,
): Promise<
  GetResponseDataTypeFromEndpointMethod<typeof octokit.rest.pulls.create>
> {
  console.error(
    `Attempting to create PR in ${owner}/${repo} from ${head} to ${base}`,
  );
  try {
    const response = await octokit.rest.pulls.create({
      owner,
      repo,
      title,
      head,
      base,
      body,
      draft,
      maintainer_can_modify: maintainerCanModify,
    });
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API create PR error: ${e.message}`);
    throw e;
  }
}

// Function to get the authenticated user
export async function getMe(): Promise<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.rest.users.getAuthenticated
  >
> {
  console.error("Attempting to get authenticated GitHub user");
  try {
    const response = await octokit.rest.users.getAuthenticated();
    return response.data;
  } catch (e: any) {
    console.error(`GitHub API get authenticated user error: ${e.message}`);
    throw e;
  }
}

// Utility to derive a project name from a path
export function deriveProjectNameFromPath(projectPath: string): string {
  const normalizedPath = path.normalize(projectPath);
  // Return the last segment of the path as the project name
  return path.basename(normalizedPath);
}

// Keep the old createOrUpdateFileInRepo for now, although it won't be used by chat log sync
export async function createOrUpdateFileInRepo(
  owner: string,
  repo: string,
  filePath: string, // This is the path WITHIN the GitHub repo (e.g., project-name/.chat/log.md)
  content: string,
  message: string,
  branch: string = "main", // Default branch, can make configurable
  sha?: string, // Optional SHA for updates
): Promise<
  GetResponseDataTypeFromEndpointMethod<
    typeof octokit.rest.repos.createOrUpdateFileContents
  >
> {
  // Changed return type to any as it's not used by the new sync logic
  console.error(
    `Attempting to create/update file in GitHub: ${owner}/${repo}/${filePath} on branch ${branch}`,
  );

  const payload: any = {
    owner,
    repo,
    path: filePath,
    message,
    content: Buffer.from(content, "utf-8").toString("base64"),
    branch,
  };

  if (sha) {
    payload.sha = sha;
  }

  try {
    const response: any =
      await octokit.rest.repos.createOrUpdateFileContents(payload);

    console.error(`GitHub API response status: ${response.status}`);

    if (response.status === 201) {
      console.error(`Successfully created file in GitHub: ${filePath}`);
    } else if (response.status === 200) {
      console.error(`Successfully updated file in GitHub: ${filePath}`);
    } else {
      console.warn(
        `Unexpected successful GitHub API status code: ${response.status} for ${filePath}`,
      );
      // Still consider it a success if status is 200 or 201, but log the unexpected code
    }

    return response.data;
  } catch (e: any) {
    console.error(`GitHub API request error for ${filePath}: ${e.message}`);
    throw e; // Re-throw for the tool handler
  }
}
