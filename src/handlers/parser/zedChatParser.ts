// src/handlers/parser/zedChatParser.ts

import * as fs from "fs/promises";
import * as os from "os";
import * as path from "path";
import { extractProjectNameFromPath, safeJsonParse } from "./parserUtils.js"; // Reuse helper

// --- Types ---

// Structure matching the observed Zed JSON format
interface ZedRawConversation {
  id: string;
  zed?: string; // Optional fields based on example
  version?: string;
  text: string; // The full text containing all messages concatenated
  messages: ZedRawMessage[];
  summary?: string; // Can be used as a title
  // other fields ignored for now
}

interface ZedRawMessage {
  id: { replica_id: number; value: number };
  start: number; // Start index in the main 'text' field
  metadata: {
    role: "user" | "assistant"; // Assuming only these roles
    status?: string;
    timestamp?: { replica_id: number; value: number }; // Simple timestamp structure
    // other metadata ignored
  };
}

// Structure for extracted messages
interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp?: number; // Optional: Convert Zed timestamp if needed/possible
}

// Final structure returned by the main function
interface ZedConversationHistory {
  editor: "zed";
  projectPath: string; // The targetProjectDir passed in
  projectName: string; // Inferred from projectPath
  conversations: {
    conversationId: string; // Filename or Zed's internal ID
    metadata?: { title?: string; lastUpdatedAt?: number }; // Use 'summary' and file mtime
    messages: ConversationMessage[];
  }[];
}

// --- Helper Functions ---

// Get platform-specific Zed conversation directory
function getZedConversationDir(): string | null {
  const platform = os.platform();
  const homeDir = os.homedir();

  switch (platform) {
    case "darwin":
      return path.join(homeDir, ".config", "zed", "conversations");
    case "linux":
      return path.join(homeDir, ".local", "share", "zed", "conversations");
    case "win32":
      const localAppData = process.env.LOCALAPPDATA;
      if (localAppData) {
        return path.join(localAppData, "Zed", "conversations");
      }
      console.error("Could not determine LocalAppData path on Windows.");
      return null;
    default:
      console.error(`Unsupported OS for Zed conversation path: ${platform}`);
      return null;
  }
}

// Find the latest .zed.json file in a directory
async function findLatestZedFile(
  dirPath: string,
): Promise<{ filePath: string; mtime: Date } | null> {
  try {
    const files = await fs.readdir(dirPath, { withFileTypes: true });
    let latestFile: { filePath: string; mtime: Date } | null = null;

    for (const file of files) {
      if (file.isFile() && file.name.endsWith(".zed.json")) {
        const filePath = path.join(dirPath, file.name);
        try {
          const stats = await fs.stat(filePath);
          if (!latestFile || stats.mtime > latestFile.mtime) {
            latestFile = { filePath, mtime: stats.mtime };
          }
        } catch (statErr: any) {
          console.warn(`Could not stat file ${filePath}: ${statErr.message}`);
        }
      }
    }
    return latestFile;
  } catch (err: any) {
    if (err.code === "ENOENT") {
      console.warn(`Zed conversation directory not found: ${dirPath}`);
    } else {
      console.error(`Error reading Zed directory ${dirPath}: ${err.message}`);
    }
    return null;
  }
}

// --- Main Parser Function ---

export async function getZedConversationHistory(
  targetProjectDir: string,
): Promise<ZedConversationHistory | null> {
  console.error(
    `Attempting to parse Zed chat history, target project directory: ${targetProjectDir}`,
  );

  const conversationDir = getZedConversationDir();
  if (!conversationDir) {
    console.error("Could not determine Zed conversation directory.");
    return null;
  }
  console.error(`Zed Conversation Directory: ${conversationDir}`);

  const latestZedFileInfo = await findLatestZedFile(conversationDir);
  if (!latestZedFileInfo) {
    console.error("No Zed conversation files (.zed.json) found or accessible.");
    return null;
  }

  console.error(
    `Found latest Zed file: ${latestZedFileInfo.filePath} (modified: ${latestZedFileInfo.mtime})`,
  );

  try {
    const fileContent = await fs.readFile(latestZedFileInfo.filePath, "utf-8");
    const rawData = safeJsonParse<ZedRawConversation>(fileContent);

    if (!rawData || !rawData.messages || !rawData.text) {
      console.error(
        `Failed to parse or invalid format for Zed file: ${latestZedFileInfo.filePath}`,
      );
      return null;
    }

    // Sort messages by start index to ensure correct order
    const sortedMessages = [...rawData.messages].sort(
      (a, b) => a.start - b.start,
    );

    const extractedMessages: ConversationMessage[] = [];
    for (let i = 0; i < sortedMessages.length; i++) {
      const currentMsg = sortedMessages[i];
      const nextMsg = sortedMessages[i + 1];
      const end = nextMsg ? nextMsg.start : rawData.text.length; // End is start of next or end of text
      const content = rawData.text.substring(currentMsg.start, end).trim();

      if (content) {
        // Only add messages with actual content
        extractedMessages.push({
          role: currentMsg.metadata.role, // Assuming role is always correct
          content: content,
          // Timestamp conversion logic could be added here if needed
          // timestamp: currentMsg.metadata.timestamp ? ... : undefined
        });
      }
    }

    if (extractedMessages.length === 0) {
      console.warn(
        `No messages extracted from Zed file: ${latestZedFileInfo.filePath}`,
      );
      // Return null or an empty history? Let's return null for now to match cursor parser's failure modes.
      return null;
    }

    // Infer project name from the target directory
    const projectName = extractProjectNameFromPath(targetProjectDir);
    console.error(`Inferred Project Name: ${projectName}`);

    // Assemble the final structure
    const history: ZedConversationHistory = {
      editor: "zed",
      projectPath: path.normalize(targetProjectDir), // Normalize the input path
      projectName: projectName,
      conversations: [
        {
          conversationId:
            rawData.id || path.basename(latestZedFileInfo.filePath), // Use Zed ID or filename fallback
          metadata: {
            title:
              rawData.summary ||
              `Zed Conversation ${rawData.id ? rawData.id.substring(0, 8) : ""}`, // Use summary or generate title
            lastUpdatedAt: latestZedFileInfo.mtime.getTime(), // Use file modification time
          },
          messages: extractedMessages,
        },
      ],
    };

    return history;
  } catch (error: any) {
    console.error(
      `Error reading or processing Zed file ${latestZedFileInfo.filePath}: ${error.message}`,
    );
    return null;
  }
}

// --- Formatting Function ---

export function formatZedConversationHistory(
  history: ZedConversationHistory,
): string {
  if (
    !history ||
    !Array.isArray(history.conversations) ||
    history.conversations.length === 0
  ) {
    return "";
  }

  const convo = history.conversations[0];

  if (!convo || !Array.isArray(convo.messages) || convo.messages.length === 0) {
    return "";
  }

  let formattedMessages = "";
  convo.messages.forEach((message) => {
    formattedMessages += `${message.role === "user" ? "user" : "assistant"}: ${message.content || ""}\n\n`;
  });

  return formattedMessages;
}
