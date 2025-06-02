// src/handlers/parser/clineChatParser.ts

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { extractProjectNameFromPath, safeJsonParse } from "./parserUtils.js";

// --- Types ---

interface ClineMessageContentBlock {
  type: "text" | "image" | "document" | "tool_use" | "tool_result";
  text?: string;
  name?: string;
  input?: any;
  content?: any;
  is_error?: boolean;
  // Potentially other fields based on Anthropic.ContentBlockParam
}

interface ClineMessage {
  role: "user" | "assistant";
  content: ClineMessageContentBlock[] | string; // String for simple text, array for complex blocks
}

interface ClineTaskMetadata {
  model?: string;
  title?: string;
  createdAt?: number; // Unix timestamp
  // Add other fields if present in task_metadata.json
}

// This is the main structure returned by getClineConversationHistory
// It holds the parsed data before final formatting for upload.
interface ParsedClineConversation {
  editor: "cline";
  projectPath: string; // Usually targetProjectDir
  projectName: string;
  taskDirectoryName?: string; // Name of the folder like "1747035421190"
  metadata?: ClineTaskMetadata | null; // From task_metadata.json - Allow null
  messages: ClineMessage[]; // Parsed messages from api_conversation_history.json
}

// --- Path Logic ---

function getClineTasksBasePath(): string | null {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case "darwin": // macOS
      return path.join(
        homeDir,
        "Library",
        "Application Support",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "tasks",
      );
    case "win32": // Windows
      if (process.env.APPDATA) {
        return path.join(
          process.env.APPDATA,
          "Code",
          "User",
          "globalStorage",
          "saoudrizwan.claude-dev",
          "tasks",
        );
      }
      return null;
    case "linux":
      return path.join(
        homeDir,
        ".config",
        "Code",
        "User",
        "globalStorage",
        "saoudrizwan.claude-dev",
        "tasks",
      );
    default:
      console.warn(`Unsupported OS for Cline path: ${platform}`);
      return null;
  }
}

async function getLatestTaskDirectory(
  tasksPath: string,
): Promise<string | null> {
  try {
    const entries = await fs.readdir(tasksPath, { withFileTypes: true });
    const taskDirectories = entries.filter(
      (entry) => entry.isDirectory() && /^[0-9]+$/.test(entry.name), // Check if it's a directory and name is all digits
    );

    if (taskDirectories.length === 0) {
      console.warn(`No task directories found in ${tasksPath}`);
      return null;
    }

    let latestMtime = 0;
    let latestTaskDir: string | null = null;

    for (const dirEntry of taskDirectories) {
      const dirPath = path.join(tasksPath, dirEntry.name);
      // Check mtime of api_conversation_history.json or the directory itself
      const conversationFilePath = path.join(
        dirPath,
        "api_conversation_history.json",
      );
      let currentMtime = 0;

      try {
        const stats = await fs.stat(conversationFilePath);
        if (
          (await fs
            .access(conversationFilePath)
            .then(() => true)
            .catch(() => false)) &&
          stats.isFile()
        ) {
          currentMtime = stats.mtimeMs;
        } else {
          // Fallback to directory mtime if file doesn't exist or is not a file
          const dirStats = await fs.stat(dirPath);
          currentMtime = dirStats.mtimeMs;
        }
      } catch (statError: any) {
        // If api_conversation_history.json doesn't exist, try mtime of the folder itself
        try {
          const dirStats = await fs.stat(dirPath);
          currentMtime = dirStats.mtimeMs;
        } catch (dirStatError: any) {
          console.warn(
            `Could not stat ${dirPath} or its conversation file: ${statError.message}, ${dirStatError.message}`,
          );
          continue; // Skip this directory
        }
      }

      if (currentMtime > latestMtime) {
        latestMtime = currentMtime;
        latestTaskDir = dirPath;
      }
    }
    return latestTaskDir;
  } catch (error: any) {
    console.error(
      `Error finding latest Cline task directory in ${tasksPath}: ${error.message}`,
    );
    return null;
  }
}

// --- Content Formatting Logic (adapted from user-provided TypeScript) ---

// This helper formats a single content block from Cline's conversation
function formatContentBlockToMarkdown_cline(
  block: ClineMessageContentBlock,
): string {
  switch (block.type) {
    case "text":
      return block.text || "";
    case "image":
      return "[Image]"; // Placeholder for image
    case "document":
      return "[Document]"; // Placeholder for document
    case "tool_use":
      let inputStr = "";
      if (block.input && typeof block.input === "object") {
        inputStr = Object.entries(block.input)
          .map(
            ([key, value]) =>
              `${key.charAt(0).toUpperCase() + key.slice(1)}: ${value}`,
          )
          .join("\\n"); // Use \\n for literal newline in markdown string
      } else {
        inputStr = String(block.input);
      }
      return `[Tool Use: ${block.name || "Unknown Tool"}]\\n${inputStr}`;
    case "tool_result":
      let toolContent = "";
      if (typeof block.content === "string") {
        toolContent = block.content;
      } else if (Array.isArray(block.content)) {
        toolContent = block.content
          .map((contentBlock) =>
            formatContentBlockToMarkdown_cline(
              contentBlock as ClineMessageContentBlock,
            ),
          )
          .join("\\n");
      }
      return `[Tool Result${block.is_error ? " (Error)" : ""}]\\n${toolContent}`;
    default:
      // Attempt to handle unexpected block types gracefully
      if (typeof (block as any).text === "string") return (block as any).text;
      return "[Unexpected content type]";
  }
}

// This helper formats the array of messages into a single markdown string for the body of the chat log
function formatClineMessagesToMarkdownBody(messages: ClineMessage[]): string {
  return messages
    .map((message) => {
      const role = message.role === "user" ? "user:" : "assistant:";
      let contentStr = "";
      if (Array.isArray(message.content)) {
        contentStr = message.content
          .map(formatContentBlockToMarkdown_cline)
          .join("\n\n");
      } else if (typeof message.content === "string") {
        contentStr = message.content;
      } else if (
        message.content &&
        typeof (message.content as any).type === "string"
      ) {
        contentStr = formatContentBlockToMarkdown_cline(
          message.content as ClineMessageContentBlock,
        );
      }

      return `${role} ${contentStr}\n\n`;
    })
    .join("\n\n");
}

// --- Main Export Functions ---

export async function getClineConversationHistory(
  targetProjectDir: string,
): Promise<ParsedClineConversation | null> {
  console.error(
    "Attempting to parse Cline chat history, target project directory: " +
      targetProjectDir,
  );

  const tasksBasePath = getClineTasksBasePath();
  if (!tasksBasePath) {
    console.error(
      "Could not determine Cline tasks base path for the current OS.",
    );
    return null;
  }

  try {
    await fs.access(tasksBasePath);
  } catch (error) {
    console.error("Cline tasks directory not accessible: " + tasksBasePath);
    return null;
  }

  const latestTaskDir = await getLatestTaskDirectory(tasksBasePath);
  if (!latestTaskDir) {
    console.error("Could not find the latest Cline task directory.");
    return null;
  }
  console.error("Latest Cline task directory found: " + latestTaskDir);

  const conversationFilePath = path.join(
    latestTaskDir,
    "api_conversation_history.json",
  );
  const metadataFilePath = path.join(latestTaskDir, "task_metadata.json");

  try {
    const rawConversation = await fs.readFile(conversationFilePath, "utf-8");
    const messages: ClineMessage[] | null =
      safeJsonParse<ClineMessage[]>(rawConversation);

    if (!Array.isArray(messages)) {
      console.error(
        "Parsed conversation data is not an array as expected:",
        messages,
      );
      return null;
    }

    let metadata: ClineTaskMetadata | null | undefined;
    try {
      const rawMetadata = await fs.readFile(metadataFilePath, "utf-8");
      metadata = safeJsonParse<ClineTaskMetadata>(rawMetadata);
    } catch (metaError: any) {
      console.warn(
        "Could not read or parse Cline task_metadata.json: " +
          metaError.message,
      );
      // Proceed without metadata
    }

    const projectPath = path.resolve(targetProjectDir); // Ensure absolute path
    const projectName = extractProjectNameFromPath(projectPath);
    const taskDirectoryName = path.basename(latestTaskDir);

    return {
      editor: "cline",
      projectPath,
      projectName,
      taskDirectoryName,
      metadata,
      messages,
    };
  } catch (error: any) {
    console.error(
      "Error reading or parsing Cline conversation files from " +
        latestTaskDir +
        ": " +
        error.message,
    );
    return null;
  }
}

// This function formats the ParsedClineConversation object into the final markdown string for upload.
// It's analogous to formatCursorHistory or formatZedHistory.
export function formatClineChatLogForUpload(
  parsedHistory: ParsedClineConversation,
): string {
  if (
    !parsedHistory ||
    !parsedHistory.messages ||
    parsedHistory.messages.length === 0
  ) {
    return "";
  }

  return formatClineMessagesToMarkdownBody(parsedHistory.messages);
}
