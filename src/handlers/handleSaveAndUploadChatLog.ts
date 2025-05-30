// src/handlers/handleSaveAndUploadChatLog.ts

import { Buffer } from "buffer"; // Required for base64 encoding
import * as fs from "fs/promises"; // Use promises version for async operations
import fetch from "node-fetch"; // Import node-fetch
import * as path from "path";

import {
  formatClineChatLogForUpload,
  getClineConversationHistory,
} from "./parser/clineChatParser.js"; // Import Cline parser and formatter
import {
  formatConversationHistory as formatCursorHistory, // Alias Cursor formatter
  getCursorConversationHistory,
} from "./parser/cursorChatParser.js"; // Import with .js extension
import {
  formatZedConversationHistory as formatZedHistory, // Import Zed formatter
  getZedConversationHistory,
} from "./parser/zedChatParser.js"; // Import Zed parser

// Assuming the tool definition in src/index.ts will call this function
// with targetProjectDir, userId, and optionally editorType.
export async function handleSaveAndUploadChatLog(
  targetProjectDir: string,
  userId: string,
  editorType: string, // Made editorType a required parameter
): Promise<any> {
  console.error(
    `Handling save and upload chat log for user: ${userId} in project: ${targetProjectDir}`,
  );
  console.error(`Attempting to get history for editor type: ${editorType}`);

  let conversationHistory: any = null; // Using any for now due to dynamic nature from parser

  // Get conversation history based on editor type
  let formatFunction: (history: any) => string; // Function to format the history

  if (editorType === "cursor") {
    // Pass the targetProjectDir to the Cursor parser
    conversationHistory = await getCursorConversationHistory(targetProjectDir);
    formatFunction = formatCursorHistory; // Use Cursor formatter
  } else if (editorType === "zed") {
    conversationHistory = await getZedConversationHistory(targetProjectDir);
    formatFunction = formatZedHistory; // Use Zed formatter
  } else if (editorType === "cline") {
    // Add Cline case
    conversationHistory = await getClineConversationHistory(targetProjectDir);
    formatFunction = formatClineChatLogForUpload; // Use Cline formatter
  } else {
    console.warn(`Unsupported editor type: ${editorType}`);
    return {
      status: "error",
      message: `Unsupported editor type: ${editorType}`,
    };
  }

  // Check if history was successfully retrieved
  // Adjust check based on the new structure returned by the parser
  if (
    !conversationHistory ||
    (editorType === "cline" &&
      (!conversationHistory.messages || // Check messages directly
        !Array.isArray(conversationHistory.messages) ||
        conversationHistory.messages.length === 0)) ||
    (editorType !== "cline" &&
      (!Array.isArray(conversationHistory.conversations) ||
        conversationHistory.conversations.length === 0))
  ) {
    const message = `Could not retrieve or found no relevant conversation history for editor type: ${editorType} in workspace associated with project ${targetProjectDir}.`;
    console.error(message);
    // Return an error as there's no history to save based on the current logic.
    return { status: "error", message: message };
  }

  // Format the retrieved history into markdown
  const chatLogContent = formatFunction(conversationHistory); // Use the selected formatter

  // --- Logic to save and upload the file using Node.js APIs ---
  const timestamp = new Date().toISOString().replace(/[:.-]/g, "_");

  // Sanitize userId and projectName for use in paths
  const safeUserId = userId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const safeProjectName =
    conversationHistory.projectName && // Check if projectName exists and is not generic
    conversationHistory.projectName !== "Unknown Project" &&
    conversationHistory.projectName !== "Home Directory" &&
    conversationHistory.projectName !== "Root"
      ? conversationHistory.projectName.replace(/[^a-zA-Z0-9_-]/g, "_")
      : "unknown-project"; // Fallback project name

  // Define the source type (since we format to markdown, it's .chat)
  const sourceDirName = ".chat";

  // Define paths
  // Local path: targetProjectDir/.chat/
  const localChatDir = path.join(targetProjectDir, sourceDirName);
  const chatLogFilename = `chat_log_${editorType}_${safeUserId}_${safeProjectName}_${timestamp}.md`; // Include user/project in filename for local clarity
  const localFilePath = path.join(localChatDir, chatLogFilename);

  // GitHub path: project-logs/[PROJECT]/[USERID]/[SOURCE]/[FILENAME]
  // Keep the simpler timestamp-based filename for GitHub upload as context is in the path
  const githubChatLogFilename = `chat_log_${editorType}_${timestamp}.md`;
  const githubFilePath = `project-logs/${safeProjectName}/${safeUserId}/${sourceDirName}/${githubChatLogFilename}`;

  console.error(`Local Log Path: ${localFilePath}`);
  console.error(`GitHub Log Path: ${githubFilePath}`);

  try {
    // Ensure the local .chat directory exists
    await fs.mkdir(localChatDir, { recursive: true });
    console.error(`Local directory ensured: ${localChatDir}`);

    // Save the chat log locally
    await fs.writeFile(localFilePath, chatLogContent, "utf-8");
    console.error(`Chat log saved locally: ${localFilePath}`);

    // --- GitHub API Upload Implementation ---
    const githubOwner = "dwarvesf";
    const githubRepo = "prompt-log"; // Target repo is prompt-log
    const githubBranch = "main";
    const githubToken = process.env.GITHUB_PERSONAL_ACCESS_TOKEN;

    if (!githubToken) {
      console.warn(
        "GITHUB_PERSONAL_ACCESS_TOKEN environment variable is not set. Upload skipped.",
      );
      return {
        status: "success",
        local_path: localFilePath,
        github_path: null,
        github_url: null,
        commit_sha: null,
        commit_url: null,
        message:
          "Chat log saved locally. GitHub upload skipped due to missing token.",
      };
    }

    console.error(
      `Attempting to upload to github.com/${githubOwner}/${githubRepo}/contents/${githubFilePath} on branch ${githubBranch}`,
    );

    const githubApiUrl = `https://api.github.com/repos/${githubOwner}/${githubRepo}/contents/${githubFilePath}`; // Correct API URL
    const base64Content = Buffer.from(chatLogContent).toString("base64");
    const commitMessage = `sync: Add ${sourceDirName} log for ${safeUserId} in ${safeProjectName} (${timestamp})`; // Commit message reflects source

    const uploadResponse = await fetch(githubApiUrl, {
      method: "PUT",
      headers: {
        Authorization: `token ${githubToken}`,
        "Content-Type": "application/json",
        Accept: "application/vnd.github.v3+json",
      },
      body: JSON.stringify({
        message: commitMessage,
        content: base64Content,
        branch: githubBranch,
      }),
    });

    if (!uploadResponse.ok) {
      let errorBodyText = "Unknown error";
      try {
        errorBodyText = await uploadResponse.text();
      } catch (parseErr) {
        /* Ignore */
      }
      console.error(
        `GitHub API upload failed: ${uploadResponse.status} ${uploadResponse.statusText}`,
        errorBodyText,
      );
      return {
        status: "partial_success",
        local_path: localFilePath,
        github_path: githubFilePath,
        message: `Chat log saved locally, but GitHub upload failed: ${uploadResponse.statusText}. Error: ${errorBodyText}`,
      };
    }

    const uploadResult: any = await uploadResponse.json();
    console.error("Chat log uploaded to GitHub successfully.");

    return {
      status: "success",
      local_path: localFilePath,
      github_path: githubFilePath,
      github_url: uploadResult.content?.html_url,
      commit_sha: uploadResult.commit?.sha,
      commit_url: uploadResult.commit?.html_url,
      message:
        "Chat log saved locally and uploaded to GitHub using standardized path.",
    };
    // --- End GitHub API Upload Implementation ---
  } catch (error: any) {
    console.error(
      "An unexpected error occurred during save and upload:",
      error,
    );
    return {
      status: "error",
      message: `An unexpected error occurred: ${error.message}`,
    };
  }
}

// Note: This handler now uses Node.js built-in modules and node-fetch.
// Ensure node-fetch is installed (`npm install node-fetch @types/node-fetch`).
// Ensure the GITHUB_PERSONAL_ACCESS_TOKEN environment variable is set with 'repo' scope
// for the server process to allow uploading to the dwarvesf/prompt-log repository.
