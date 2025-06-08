import { RequestError } from "@octokit/request-error";
import yaml from "js-yaml";
import * as path from "path";
import { SyncPromptArgs, SyncPromptArgsSchema } from "../tools/syncPrompt.js";
import * as githubApi from "../utils/githubApi.js";
import { validateArgs } from "../utils/validationUtils.js";

export async function handleSyncPrompt(args: SyncPromptArgs): Promise<any> {
  try {
    const validatedArgs = validateArgs(SyncPromptArgsSchema, args);
    const { projectName, name, ...promptData } = validatedArgs;

    console.error(
      `Handling sync_prompt for project: ${projectName}, prompt: ${name}`,
    );

    const githubOwner = "dwarvesf";
    const githubRepo = "prompt-db";
    const targetFolder = "prompts";
    const baseBranch = "main";

    // Convert the prompt data to YAML format
    const yamlContent = yaml.dump({ name, ...promptData });

    const targetFilePath = path.posix.join(
      targetFolder,
      projectName,
      `${name.replace(/\s+/g, '-').toLowerCase()}.prompt.yml`,
    );

    let existingFileSha: string | undefined;

    try {
      const existingContent = await githubApi.getContents(
        githubOwner,
        githubRepo,
        targetFilePath,
        baseBranch,
      );
      if (!Array.isArray(existingContent) && existingContent.type === "file") {
        existingFileSha = existingContent.sha;
        console.error(`Found existing file with SHA: ${existingFileSha}`);
      }
    } catch (e: any) {
      if (e instanceof RequestError && e.status === 404) {
        console.error(
          `File not found at ${targetFilePath} on branch ${baseBranch}. This is expected for a new file.`,
        );
      } else {
        throw e;
      }
    }

    const latestRef = await githubApi.getRef(
      githubOwner,
      githubRepo,
      `heads/${baseBranch}`,
    );
    const latestCommitSha = latestRef.object.sha;

    const latestCommit = await githubApi.getCommit(
      githubOwner,
      githubRepo,
      latestCommitSha,
    );
    const baseTreeSha = latestCommit.tree.sha;

    const blob = await githubApi.createBlob(
      githubOwner,
      githubRepo,
      yamlContent,
      "utf-8",
    );
    const blobSha = blob.sha;

    const treeItems: githubApi.GitHubCreateTreeItem[] = [
      {
        path: targetFilePath,
        mode: "100644",
        type: "blob",
        sha: blobSha,
      },
    ];

    const newTree = await githubApi.createTree(
      githubOwner,
      githubRepo,
      treeItems,
      baseTreeSha,
    );
    const newTreeSha = newTree.sha;

    const commitMessage = existingFileSha
      ? `sync: update prompt ${projectName}/${name}`
      : `sync: add new prompt ${projectName}/${name}`;

    const newCommit = await githubApi.createCommit(
      githubOwner,
      githubRepo,
      commitMessage,
      newTreeSha,
      latestCommitSha,
    );
    const newCommitSha = newCommit.sha;

    await githubApi.updateRef(
      githubOwner,
      githubRepo,
      `heads/${baseBranch}`,
      newCommitSha,
    );

    const githubFileUrl = `https://github.com/${githubOwner}/${githubRepo}/blob/${baseBranch}/${targetFilePath}`;

    console.error(`Prompt synced successfully to ${githubFileUrl}`);

    return {
      status: "success",
      github_path: targetFilePath,
      github_url: githubFileUrl,
      commit_sha: newCommitSha,
      message: existingFileSha
        ? `Successfully updated prompt ${projectName}/${name}`
        : `Successfully synced prompt ${projectName}/${name}`,
    };
  } catch (e: any) {
    console.error(`Error in handleSyncPrompt: ${e.message}`);
    return {
      status: "error",
      message: `Failed to sync prompt: ${e.message}`,
    };
  }
}
