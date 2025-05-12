// src/handlers/parser/cursorChatParser.ts

import * as fsSync from "fs"; // Use sync version for existsSync for simplicity
import * as fs from "fs/promises"; // Use promises version for async operations
import * as os from "os";
import * as path from "path";
import type { Database as SqliteDatabaseType } from "sqlite3"; // Explicitly import the type with an alias
import pkg from "sqlite3";
import { URL } from "url"; // Import URL for parsing file paths
const { Database, OPEN_READONLY } = pkg; // Import Database and OPEN_READONLY

// --- Types ---

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  // Add timestamp if available? Could help sorting.
}

interface ComposerMetadata {
  title?: string;
  createdAt?: number; // Unix timestamp (ms)
  lastUpdatedAt?: number; // Unix timestamp (ms)
}

type MessagesByComposer = Map<string, ConversationMessage[]>;
type ComposerMetadataMap = Map<string, ComposerMetadata>;

// Data structure returned by reading a workspace DB
interface WorkspaceDbData {
  projectPaths: string[]; // Potential project root paths from history.entries
  gitRepoPaths: string[]; // Paths from scm:view:visibleRepositories
  debugSelectedRoot: string | null; // Path from debug.selectedroot
  messagesByComposer: MessagesByComposer;
  composerMetadata: ComposerMetadataMap;
}

// Data structure returned by reading the global DB
interface GlobalDbData {
  messagesByComposer: MessagesByComposer;
  composerMetadata: ComposerMetadataMap;
}

// Final structure returned by the main function
interface ConversationHistory {
  editor: "cursor";
  projectPath: string;
  projectName: string; // Added Project Name
  workspaceName?: string; // Optional human-readable workspace name
  // For now, let's return messages grouped by composer ID from the target workspace
  conversations: {
    composerId: string;
    metadata?: ComposerMetadata;
    messages: ConversationMessage[];
  }[];
  // Alternatively, could return just the *latest* conversation's messages:
  // latestConversation?: { composerId: string; metadata?: ComposerMetadata; messages: ConversationMessage[] };
}

// --- SQLite Helpers (openDb, getDbRow, getAllDbRows, closeDb - assumed unchanged) ---
// [Existing helper functions openDb, getDbRow, getAllDbRows, closeDb go here]

// Helper function to open a SQLite database with Promises
// Use the imported type alias
function openDb(
  dbPath: string,
  mode = OPEN_READONLY,
): Promise<SqliteDatabaseType> {
  return new Promise((resolve, reject) => {
    // Note: The 'Database' constructor itself is used here, which is a value
    const db = new Database(dbPath, mode, (err: Error | null) => {
      // Explicitly type err
      if (err) {
        console.error(`Error opening database at ${dbPath}: ${err.message}`);
        reject(err);
      } else {
        resolve(db);
      }
    });
  });
}

// Helper function to run a single query and get one row
// Use the imported type alias
function getDbRow(
  db: SqliteDatabaseType,
  sql: string,
  params: any[] = [],
): Promise<any> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err: Error | null, row: any) => {
      // Explicitly type err and row
      if (err) {
        console.error(`Error running query "${sql}": ${err.message}`);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
}

// Helper function to run a query and get all rows
// Use the imported type alias
function getAllDbRows(
  db: SqliteDatabaseType,
  sql: string,
  params: any[] = [],
): Promise<any[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err: Error | null, rows: any[]) => {
      // Explicitly type err and rows
      if (err) {
        console.error(`Error running query "${sql}": ${err.message}`);
        reject(err);
      } else {
        resolve(rows);
      }
    });
  });
}

// Helper function to close a database connection
// Use the imported type alias
function closeDb(db: SqliteDatabaseType): Promise<void> {
  return new Promise((resolve, reject) => {
    db.close((err: Error | null) => {
      // Explicitly type err
      if (err) {
        console.error(`Error closing database: ${err.message}`);
        reject(err);
      } else {
        resolve();
      }
    });
  });
}

// --- Path/Name Inference Helpers ---

// Safely parse JSON, returning null on error
function safeJsonParse<T = any>(
  jsonString: string | null | undefined,
): T | null {
  if (!jsonString) return null;
  try {
    return JSON.parse(jsonString) as T;
  } catch (e: any) {
    // console.warn(`Failed to parse JSON: ${e.message}`);
    return null;
  }
}

// Extracts a file path from various URI formats (file://, git:, etc.)
function extractPathFromUri(uri: string): string | null {
  try {
    if (uri.startsWith("file:///")) {
      let pathname = new URL(uri).pathname;
      if (process.platform === "win32" && pathname.startsWith("/")) {
        pathname = pathname.substring(1); // Remove leading slash for Windows drive letters
      }
      // Decode URI components like %20
      pathname = decodeURIComponent(pathname);
      // Normalize path separators for the current OS
      return path.normalize(pathname);
    } else if (uri.includes("://")) {
      // Handle other potential schemes like git: by trying to extract the path part
      const pathPart = uri.split("://")[1];
      return pathPart ? path.normalize(decodeURIComponent(pathPart)) : null;
    } else if (path.isAbsolute(uri)) {
      // Assume it's already a potentially valid absolute path
      return path.normalize(uri);
    }
  } catch (error: any) {
    // console.warn(`Could not parse URI/path: ${uri}`, error.message);
  }
  return null;
}

// Helper to infer project path from history entries (adapted from existing)
function inferProjectPathFromHistoryEntries(
  historyEntriesJson: string | null,
): string | null {
  const historyEntries = safeJsonParse<any[]>(historyEntriesJson);
  if (!Array.isArray(historyEntries)) {
    return null;
  }

  const paths: string[] = [];
  for (const entry of historyEntries) {
    const resourceUri = entry?.editor?.resource;
    if (resourceUri && typeof resourceUri === "string") {
      const extractedPath = extractPathFromUri(resourceUri);
      if (extractedPath) {
        paths.push(extractedPath);
      }
    }
  }

  if (paths.length === 0) return null;

  // Find the longest common path prefix
  let commonPrefix = paths[0];
  for (let i = 1; i < paths.length; i++) {
    while (!paths[i].startsWith(commonPrefix) && commonPrefix.length > 0) {
      // Go up one level by finding the last directory separator
      const lastSepIndex = commonPrefix.lastIndexOf(path.sep);
      if (lastSepIndex === -1) {
        // No separator found, possibly at root or invalid
        commonPrefix = "";
        break;
      }
      commonPrefix = commonPrefix.substring(0, lastSepIndex);
    }
    if (commonPrefix.length === 0) break;
  }

  // Ensure the common prefix is a directory path
  if (commonPrefix.length > 0) {
    try {
      // Check if the path exists and is a file. If so, take its directory.
      if (
        fsSync.existsSync(commonPrefix) &&
        fsSync.statSync(commonPrefix).isFile()
      ) {
        return path.dirname(commonPrefix);
      }
      // If it exists and is a directory, or doesn't exist (might be a workspace root placeholder), return it.
      return commonPrefix;
    } catch (e: any) {
      // console.warn("Could not stat common prefix:", e.message);
      // If stat fails, return the prefix as is - it's the best guess.
      return commonPrefix;
    }
  }

  return null;
}

// Ported/Adapted from cursor-view/server.py: extract_project_name_from_path
export function extractProjectNameFromPath(rootPath: string | null): string {
  if (!rootPath || rootPath === path.sep) {
    return "Root";
  }

  // Normalize and split path
  const normalizedPath = path.normalize(rootPath);
  const pathParts = normalizedPath.split(path.sep).filter((p) => p); // Remove empty parts

  if (pathParts.length === 0) {
    return "Root"; // Handle edge case after filtering
  }

  const homeDir = os.homedir();
  const isUserPath = normalizedPath.startsWith(homeDir);
  const username = path.basename(homeDir);

  let projectName: string | null = null;

  // --- Heuristics based on Python script ---

  // 1. Check if it's just the user's home directory
  if (normalizedPath === homeDir) {
    return "Home Directory";
  }

  // 2. Identify project name if it's deeper within the user's path
  if (isUserPath) {
    const homeParts = homeDir.split(path.sep).filter((p) => p);
    const relativePathParts = pathParts.slice(homeParts.length);

    if (relativePathParts.length === 0) {
      return "Home Directory"; // Path is exactly home dir
    }

    // Prioritize known project names (example list, customize as needed)
    const knownProjects = [
      "genaisf",
      "cursor-view",
      "mcp-playbook",
      "universal-github",
      "inquiry",
    ];
    for (let i = relativePathParts.length - 1; i >= 0; i--) {
      if (knownProjects.includes(relativePathParts[i])) {
        projectName = relativePathParts[i];
        break;
      }
    }

    // Handle common container structures like Documents/codebase/project
    if (
      !projectName &&
      relativePathParts.includes("Documents") &&
      relativePathParts.includes("codebase")
    ) {
      const codebaseIndex = relativePathParts.indexOf("codebase");
      if (codebaseIndex + 1 < relativePathParts.length) {
        projectName = relativePathParts[codebaseIndex + 1];
      }
    }

    // Default to the last part of the path if no specific rule matched
    if (!projectName && relativePathParts.length > 0) {
      projectName = relativePathParts[relativePathParts.length - 1];
    }

    // Avoid using username or generic container names as the project name
    const commonContainers = [
      "Documents",
      "Projects",
      "Code",
      "workspace",
      "repos",
      "git",
      "src",
      "codebase",
      "Downloads",
      "Desktop",
      "VCS",
    ];
    if (
      projectName === username ||
      (projectName && commonContainers.includes(projectName))
    ) {
      // If the 'project name' is a container, try the part *before* it if possible
      if (projectName && commonContainers.includes(projectName)) {
        const containerIndex = relativePathParts.lastIndexOf(projectName);
        // If there's something *after* the container, maybe use that? (Less common)
        // Example: /Users/me/Code/company/project -> project
        if (containerIndex + 1 < relativePathParts.length) {
          projectName = relativePathParts[containerIndex + 1];
        }
        // If there's something *before* the container (and not just user dir), use that?
        // Example: /Users/me/company/Code -> company (less likely)
        // Let's stick to using the last part, or the part after codebase for now.
        // If the last part was a container, we might fall back to "Home Directory" or "Unknown"
        else {
          projectName = "Unknown Project"; // Or maybe keep the container name? Let's try Unknown.
        }
      } else if (projectName === username) {
        projectName = "Home Directory";
      }
    }
  } else {
    // If not in a user directory, use the last part of the path
    projectName = pathParts[pathParts.length - 1];
  }

  // Final fallback
  return projectName || "Unknown Project";
}

// Ported/Adapted from cursor-view/server.py: extract_project_from_git_repos
function extractProjectNameFromGitRepoPaths(
  gitRepoPathsJson: string | null,
): string | null {
  const gitData = safeJsonParse<{ all?: string[] }>(gitRepoPathsJson);
  const repos = gitData?.all;

  if (!Array.isArray(repos) || repos.length === 0) {
    return null;
  }

  for (const repoUri of repos) {
    if (typeof repoUri === "string") {
      // Example format: git:Git:file:///Users/name/Projects/my-project?rev=...
      const pathPartMatch = repoUri.match(/file:\/\/([^?]+)/);
      if (pathPartMatch && pathPartMatch[1]) {
        const extractedPath = extractPathFromUri(`file://${pathPartMatch[1]}`);
        if (extractedPath) {
          // Use the basename of the extracted path as the project name
          const potentialName = path.basename(extractedPath);
          // Basic check: avoid returning just 'Users' or drive letters
          if (
            potentialName &&
            !potentialName.match(/^[A-Z]:$/) &&
            potentialName.toLowerCase() !== "users"
          ) {
            return potentialName;
          }
        }
      }
    }
  }
  return null; // No suitable name found
}

// --- Database Reading Functions ---

// Reads relevant data from the WORKSPACE state.vscdb
async function readWorkspaceDb(dbPath: string): Promise<WorkspaceDbData> {
  let db: SqliteDatabaseType | null = null;
  const messagesByComposer: MessagesByComposer = new Map();
  const composerMetadata: ComposerMetadataMap = new Map();
  let projectPaths: string[] = [];
  let gitRepoPathsJson: string | null = null;
  let debugSelectedRootJson: string | null = null;

  try {
    db = await openDb(dbPath);

    // Keys to query from ItemTable
    const keysToQuery = [
      "history.entries",
      "workbench.panel.aichat.view.aichat.chatdata",
      "composer.composerData",
      "scm:view:visibleRepositories", // For Git repo inference
      "debug.selectedroot", // Fallback project path
      // Add AI service keys (might need LIKE query)
    ];
    // AI service keys often have dynamic parts, use LIKE
    const aiServicePromptKeysSql =
      "SELECT key, value FROM ItemTable WHERE key LIKE 'aiService.prompts%'";
    const aiServiceGenKeysSql =
      "SELECT key, value FROM ItemTable WHERE key LIKE 'aiService.generations%'";

    // Fetch standard keys
    const placeholders = keysToQuery.map(() => "?").join(",");
    const sql = `SELECT key, value FROM ItemTable WHERE key IN (${placeholders})`;
    const rows = await getAllDbRows(db, sql, keysToQuery);

    // Fetch AI service keys
    const aiPromptRows = await getAllDbRows(db, aiServicePromptKeysSql);
    const aiGenRows = await getAllDbRows(db, aiServiceGenKeysSql);

    const allRows = [...rows, ...aiPromptRows, ...aiGenRows];

    for (const row of allRows) {
      const key: string = row.key;
      const valueJson: string | null = row.value;

      if (!valueJson) continue;

      // --- Process known keys ---
      if (key === "history.entries") {
        const inferredPath = inferProjectPathFromHistoryEntries(valueJson);
        if (inferredPath) projectPaths = [inferredPath]; // Store inferred path
        // Note: Python script uses common prefix of all paths, let's stick to that
        // Re-implement common prefix logic inside inferProjectDetails if needed based on all paths
      } else if (key === "scm:view:visibleRepositories") {
        gitRepoPathsJson = valueJson; // Store for later parsing
      } else if (key === "debug.selectedroot") {
        debugSelectedRootJson = valueJson; // Store for later parsing
      } else if (key === "workbench.panel.aichat.view.aichat.chatdata") {
        const chatData = safeJsonParse<{ tabs?: any[] }>(valueJson);
        chatData?.tabs?.forEach((tab) => {
          const composerId = tab?.tabId;
          if (!composerId) return;
          const currentMessages = messagesByComposer.get(composerId) ?? [];
          tab.bubbles?.forEach((bubble: any) => {
            const text = bubble?.text || bubble?.content;
            const role = bubble?.type === "user" ? "user" : "assistant";
            if (text && typeof text === "string") {
              currentMessages.push({ role, content: text.trim() });
            }
          });
          if (currentMessages.length > 0) {
            messagesByComposer.set(composerId, currentMessages);
          }
          // Add basic metadata if not already present
          if (!composerMetadata.has(composerId)) {
            composerMetadata.set(composerId, {
              title: `Chat ${composerId.substring(0, 8)}`,
            });
          }
        });
      } else if (key === "composer.composerData") {
        const composerData = safeJsonParse<{ allComposers?: any[] }>(valueJson);
        composerData?.allComposers?.forEach((comp) => {
          const composerId = comp?.composerId;
          if (!composerId) return;
          const currentMessages = messagesByComposer.get(composerId) ?? [];
          comp.messages?.forEach((msg: any) => {
            const role = msg?.role;
            const content = msg?.content;
            if (role && content && typeof content === "string") {
              currentMessages.push({ role, content: content.trim() });
            }
          });
          if (currentMessages.length > 0) {
            messagesByComposer.set(composerId, currentMessages);
          }
          // Update metadata
          const meta = composerMetadata.get(composerId) ?? {};
          meta.title =
            comp.name || meta.title || `Composer ${composerId.substring(0, 8)}`;
          meta.createdAt = comp.createdAt || meta.createdAt;
          meta.lastUpdatedAt = comp.lastUpdatedAt || meta.lastUpdatedAt;
          composerMetadata.set(composerId, meta);
        });
      } else if (
        key.startsWith("aiService.prompts") ||
        key.startsWith("aiService.generations")
      ) {
        const aiData = safeJsonParse<any[]>(valueJson);
        const role = key.startsWith("aiService.prompts") ? "user" : "assistant";
        aiData?.forEach((item) => {
          const composerId = item?.id; // Assuming 'id' relates to composerId
          const text = item?.text;
          if (composerId && text && typeof text === "string") {
            const currentMessages = messagesByComposer.get(composerId) ?? [];
            currentMessages.push({ role, content: text.trim() });
            messagesByComposer.set(composerId, currentMessages);
            // Add basic metadata if not present
            if (!composerMetadata.has(composerId)) {
              composerMetadata.set(composerId, {
                title: `AI Service ${composerId.substring(0, 8)}`,
              });
            }
          }
        });
      }
    }
  } catch (error: any) {
    console.error(
      `Error reading WORKSPACE database at ${dbPath}: ${error.message}`,
    );
  } finally {
    if (db) {
      await closeDb(db);
    }
  }

  // Parse paths from stored JSON after DB is closed
  const parsedDebugSelectedRoot = safeJsonParse<string>(debugSelectedRootJson);
  const finalDebugSelectedRoot = parsedDebugSelectedRoot
    ? extractPathFromUri(parsedDebugSelectedRoot)
    : null;
  const finalGitRepoPaths = extractProjectNameFromGitRepoPaths(gitRepoPathsJson)
    ? [extractProjectNameFromGitRepoPaths(gitRepoPathsJson)!]
    : []; // Simplified to just return the first name found for now

  return {
    projectPaths, // Path from history.entries common prefix
    gitRepoPaths: finalGitRepoPaths, // Project names derived from Git paths
    debugSelectedRoot: finalDebugSelectedRoot, // Path from debug.selectedroot
    messagesByComposer,
    composerMetadata,
  };
}

// Reads relevant data from the GLOBAL state.vscdb / *.sqlite
async function readGlobalDb(dbPath: string): Promise<GlobalDbData> {
  let db: SqliteDatabaseType | null = null;
  const messagesByComposer: MessagesByComposer = new Map();
  const composerMetadata: ComposerMetadataMap = new Map();

  try {
    db = await openDb(dbPath);

    // Check if cursorDiskKV table exists
    const tableCheck = await getDbRow(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='cursorDiskKV'",
    );

    if (tableCheck) {
      // 1. Query bubbles from cursorDiskKV
      const bubbleRows = await getAllDbRows(
        db,
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'bubbleId:%' ORDER BY rowid",
      );
      for (const row of bubbleRows) {
        const key: string = row.key;
        const valueJson: string = row.value;
        const composerIdMatch = key.match(/^bubbleId:([^:]+):/); // Extract composerId (middle part)
        const composerId = composerIdMatch ? composerIdMatch[1] : null;

        if (!composerId) continue;

        const bubbleData = safeJsonParse<{
          text?: string;
          richText?: string;
          type?: number;
        }>(valueJson);
        if (bubbleData) {
          const text = (bubbleData.text || bubbleData.richText || "").trim();
          if (text) {
            const role = bubbleData.type === 1 ? "user" : "assistant"; // Type 1 = user
            const currentMessages = messagesByComposer.get(composerId) ?? [];
            currentMessages.push({ role, content: text });
            messagesByComposer.set(composerId, currentMessages);
          }
          // Add basic metadata if not present
          if (!composerMetadata.has(composerId)) {
            composerMetadata.set(composerId, {
              title: `Global Chat ${composerId.substring(0, 8)}`,
            });
          }
        }
      }

      // 2. Query composer data from cursorDiskKV
      const composerRows = await getAllDbRows(
        db,
        "SELECT key, value FROM cursorDiskKV WHERE key LIKE 'composerData:%'",
      );
      for (const row of composerRows) {
        const key: string = row.key;
        const valueJson: string = row.value;
        const composerIdMatch = key.match(/^composerData:(.+)/); // Extract composerId
        const composerId = composerIdMatch ? composerIdMatch[1] : null;

        if (!composerId) continue;

        const composerData = safeJsonParse<{
          name?: string;
          createdAt?: number;
          lastUpdatedAt?: number;
          conversation?: any[];
        }>(valueJson);
        if (composerData) {
          // Update metadata
          const meta = composerMetadata.get(composerId) ?? {};
          meta.title =
            composerData.name ||
            meta.title ||
            `Global Composer ${composerId.substring(0, 8)}`;
          meta.createdAt = composerData.createdAt || meta.createdAt;
          meta.lastUpdatedAt = composerData.lastUpdatedAt || meta.lastUpdatedAt;
          composerMetadata.set(composerId, meta);

          // Extract messages from conversation array within composer data
          const currentMessages = messagesByComposer.get(composerId) ?? [];
          composerData.conversation?.forEach((msg) => {
            const type = msg?.type; // Type 1 = user, Type 2 = assistant
            const text = msg?.text;
            if (type !== undefined && text && typeof text === "string") {
              const role = type === 1 ? "user" : "assistant";
              currentMessages.push({ role, content: text.trim() });
            }
          });
          if (currentMessages.length > 0) {
            messagesByComposer.set(composerId, currentMessages);
          }
        }
      }
    }

    // 3. Query ItemTable in Global DB (less common but possible)
    const globalItemTableCheck = await getDbRow(
      db,
      "SELECT name FROM sqlite_master WHERE type='table' AND name='ItemTable'",
    );
    if (globalItemTableCheck) {
      const globalChatDataRow = await getDbRow(
        db,
        "SELECT value FROM ItemTable WHERE key = 'workbench.panel.aichat.view.aichat.chatdata'",
      );
      if (globalChatDataRow?.value) {
        const chatData = safeJsonParse<{ tabs?: any[] }>(
          globalChatDataRow.value,
        );
        chatData?.tabs?.forEach((tab) => {
          const composerId = tab?.tabId;
          if (!composerId) return;
          const currentMessages = messagesByComposer.get(composerId) ?? [];
          tab.bubbles?.forEach((bubble: any) => {
            const text = bubble?.text || bubble?.content;
            const role = bubble?.type === "user" ? "user" : "assistant";
            if (text && typeof text === "string") {
              currentMessages.push({ role, content: text.trim() });
            }
          });
          if (currentMessages.length > 0) {
            messagesByComposer.set(composerId, currentMessages);
          }
          // Add basic metadata if not already present
          if (!composerMetadata.has(composerId)) {
            composerMetadata.set(composerId, {
              title: `Global Tab ${composerId.substring(0, 8)}`,
            });
          }
        });
      }
      // Could potentially query composer.composerData etc. from global ItemTable too if needed
    }
  } catch (error: any) {
    console.error(
      `Error reading GLOBAL database at ${dbPath}: ${error.message}`,
    );
  } finally {
    if (db) {
      await closeDb(db);
    }
  }

  return { messagesByComposer, composerMetadata };
}

// --- Main Function ---

// Finds the OS-specific path to the global storage DB
async function findGlobalDbPath(userDataPath: string): Promise<string | null> {
  const globalStorageDirPath = path.join(userDataPath, "globalStorage");
  const primaryDbPath = path.join(globalStorageDirPath, "state.vscdb");

  if (fsSync.existsSync(primaryDbPath)) {
    try {
      const stats = await fs.stat(primaryDbPath);
      if (stats.size > 0) return primaryDbPath;
    } catch (e) {
      /* Ignore stat errors */
    }
  }

  // Legacy paths (similar to Python script)
  const legacyDirs = [
    path.join(globalStorageDirPath, "cursor.cursor"),
    path.join(globalStorageDirPath, "cursor"),
  ];

  for (const dirPath of legacyDirs) {
    if (fsSync.existsSync(dirPath)) {
      try {
        const files = await fs.readdir(dirPath);
        for (const file of files) {
          if (file.endsWith(".sqlite")) {
            // Prioritize .sqlite
            const legacyDbPath = path.join(dirPath, file);
            try {
              const stats = await fs.stat(legacyDbPath);
              if (stats.size > 0) return legacyDbPath;
            } catch (e) {
              /* Ignore stat errors */
            }
          }
        }
        // Fallback to .db if no .sqlite found
        for (const file of files) {
          if (file.endsWith(".db")) {
            const legacyDbPath = path.join(dirPath, file);
            try {
              const stats = await fs.stat(legacyDbPath);
              if (stats.size > 0) return legacyDbPath;
            } catch (e) {
              /* Ignore stat errors */
            }
          }
        }
      } catch (e) {
        /* Ignore readdir errors */
      }
    }
  }

  // Last check for any .db or .sqlite directly in globalStorage
  if (fsSync.existsSync(globalStorageDirPath)) {
    try {
      const files = await fs.readdir(globalStorageDirPath);
      for (const file of files) {
        if (file.endsWith(".sqlite") || file.endsWith(".db")) {
          const directDbPath = path.join(globalStorageDirPath, file);
          try {
            const stats = await fs.stat(directDbPath);
            if (stats.size > 0) return directDbPath;
          } catch (e) {
            /* Ignore stat errors */
          }
        }
      }
    } catch (e) {
      /* Ignore readdir errors */
    }
  }

  console.warn(
    "Could not find a valid global Cursor database (state.vscdb, *.sqlite, *.db).",
  );
  return null;
}

// Main function to get conversation history
export async function getCursorConversationHistory(
  targetProjectDir: string,
): Promise<ConversationHistory | null> {
  console.error(
    `Attempting to parse Cursor chat history, target project directory: ${targetProjectDir}`,
  ); // Use log instead of error

  let tempWorkspaceDbSqlitePath: string | null = null;
  let tempGlobalDbSqlitePath: string | null = null;

  try {
    // 1. Determine OS and locate Cursor User data directory
    const platform = os.platform();
    let userDataPath: string;

    switch (platform) {
      case "darwin":
        userDataPath = path.join(
          os.homedir(),
          "Library",
          "Application Support",
          "Cursor",
          "User",
        );
        break;
      case "win32":
        userDataPath = path.join(process.env.APPDATA!, "Cursor", "User");
        break;
      case "linux":
        userDataPath = path.join(os.homedir(), ".config", "Cursor", "User");
        break;
      default:
        console.error(`Unsupported OS: ${platform}`);
        return null;
    }
    console.error(`User Data Path: ${userDataPath}`);

    // 2. Find Latest Workspace Directory and DB Path
    const workspaceStoragePath = path.join(userDataPath, "workspaceStorage");
    if (!fsSync.existsSync(workspaceStoragePath)) {
      console.error(
        `Workspace storage directory not found: ${workspaceStoragePath}`,
      );
      return null;
    }

    const workspaceDirs = (
      await fs.readdir(workspaceStoragePath, { withFileTypes: true })
    )
      .filter((dirent) => dirent.isDirectory())
      .map((dirent) => dirent.name);
    if (workspaceDirs.length === 0) {
      console.error("No workspace directories found.");
      return null;
    }

    let latestWorkspaceDirName: string | null = null;
    let latestMtime = 0;
    let latestWorkspaceDbPath: string | null = null;

    for (const dirName of workspaceDirs) {
      const stateVscdbPath = path.join(
        workspaceStoragePath,
        dirName,
        "state.vscdb",
      );
      try {
        const stats = await fs.stat(stateVscdbPath);
        if (stats.size > 0 && stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
          latestWorkspaceDirName = dirName;
          latestWorkspaceDbPath = stateVscdbPath;
        }
      } catch (error: any) {
        if (error.code !== "ENOENT")
          console.warn(`Error stat-ing ${stateVscdbPath}: ${error.message}`);
      }
    }

    if (!latestWorkspaceDirName || !latestWorkspaceDbPath) {
      console.error("No workspace directory with a valid state.vscdb found.");
      return null;
    }
    const latestWorkspaceDirPath = path.join(
      workspaceStoragePath,
      latestWorkspaceDirName,
    );
    console.error(`Found latest workspace dir: ${latestWorkspaceDirPath}`);
    console.error(`Latest workspace DB path: ${latestWorkspaceDbPath}`);

    // 3. Find Global DB Path
    const globalDbPath = await findGlobalDbPath(userDataPath);
    if (!globalDbPath) {
      console.error("Could not find global database path.");
      // Proceed without global data? Or return null? Let's try proceeding.
      // return null;
    } else {
      console.error(`Found global DB path: ${globalDbPath}`);
    }

    // 4. Copy DBs to temporary locations
    tempWorkspaceDbSqlitePath = path.join(
      os.tmpdir(),
      `cursor_workspace_${latestWorkspaceDirName}_${Date.now()}.sqlite`,
    );
    await fs.copyFile(latestWorkspaceDbPath, tempWorkspaceDbSqlitePath);
    console.error(`Copied workspace DB to ${tempWorkspaceDbSqlitePath}`);

    if (globalDbPath) {
      tempGlobalDbSqlitePath = path.join(
        os.tmpdir(),
        `cursor_global_${Date.now()}.sqlite`,
      );
      await fs.copyFile(globalDbPath, tempGlobalDbSqlitePath);
      console.error(`Copied global DB to ${tempGlobalDbSqlitePath}`);
    }

    // 5. Read Data from Copied DBs
    const workspaceData = await readWorkspaceDb(tempWorkspaceDbSqlitePath);
    const globalData = tempGlobalDbSqlitePath
      ? await readGlobalDb(tempGlobalDbSqlitePath)
      : { messagesByComposer: new Map(), composerMetadata: new Map() };

    // 6. Merge Data from Workspace and Global DBs
    const allMessagesByComposer: MessagesByComposer = new Map(
      workspaceData.messagesByComposer,
    );
    const allComposerMetadata: ComposerMetadataMap = new Map(
      workspaceData.composerMetadata,
    );

    // Merge global messages, avoiding duplicates (simple check based on content for now)
    globalData.messagesByComposer.forEach((messages, composerId) => {
      const existingMessages = allMessagesByComposer.get(composerId) ?? [];
      const existingContent = new Set(existingMessages.map((m) => m.content));
      const newMessages = messages.filter(
        (m: ConversationMessage) => !existingContent.has(m.content),
      );
      allMessagesByComposer.set(composerId, [
        ...existingMessages,
        ...newMessages,
      ]);
    });

    // Merge global metadata, prioritizing workspace data if keys conflict
    globalData.composerMetadata.forEach((meta, composerId) => {
      if (!allComposerMetadata.has(composerId)) {
        allComposerMetadata.set(composerId, meta);
      } else {
        // Optionally merge fields: title, createdAt (take earliest?), lastUpdatedAt (take latest?)
        const existingMeta = allComposerMetadata.get(composerId)!;
        existingMeta.title = existingMeta.title || meta.title; // Prefer existing title
        existingMeta.createdAt = Math.min(
          existingMeta.createdAt || Infinity,
          meta.createdAt || Infinity,
        );
        existingMeta.lastUpdatedAt = Math.max(
          existingMeta.lastUpdatedAt || 0,
          meta.lastUpdatedAt || 0,
        );
        allComposerMetadata.set(composerId, existingMeta);
      }
    });

    // --- Project/Workspace Identification ---

    // Try to get a human-readable workspace name from workspace.json
    let workspaceName: string | undefined = undefined;
    const workspaceJsonPath = path.join(
      latestWorkspaceDirPath,
      "workspace.json",
    );
    try {
      const workspaceJsonContent = await fs.readFile(
        workspaceJsonPath,
        "utf-8",
      );
      const wsConfig = safeJsonParse<any>(workspaceJsonContent);
      if (wsConfig?.folder && typeof wsConfig.folder === "string") {
        const folderPath = extractPathFromUri(wsConfig.folder);
        if (folderPath) workspaceName = path.basename(folderPath);
      } else if (
        Array.isArray(wsConfig?.folders) &&
        wsConfig.folders.length > 0
      ) {
        const firstFolderPath = extractPathFromUri(wsConfig.folders[0]?.path);
        if (firstFolderPath) workspaceName = path.basename(firstFolderPath);
      }
    } catch (error: any) {
      if (error.code !== "ENOENT")
        console.warn(`Could not read/parse workspace.json: ${error.message}`);
    }

    // Infer Project Path and Name
    let finalProjectPath: string | null = null;
    // Priority: 1. history.entries common prefix, 2. Git repo path, 3. debug.selectedroot
    if (workspaceData.projectPaths.length > 0) {
      finalProjectPath = workspaceData.projectPaths[0]; // Use the common prefix derived earlier
    } else if (workspaceData.gitRepoPaths.length > 0) {
      // This currently holds project *name* based on git path basename, not the full path.
      // Need to refine `readWorkspaceDb` / `extractProjectNameFromGitRepoPaths` if full path is needed here.
      // For now, we can't reliably set finalProjectPath from this.
      console.warn(
        "Cannot set project path from Git data as only name is extracted currently.",
      );
      // Let's try using targetProjectDir as a fallback if other methods fail
      if (fsSync.existsSync(targetProjectDir)) {
        // Basic check
        finalProjectPath = targetProjectDir;
      }
    } else if (workspaceData.debugSelectedRoot) {
      finalProjectPath = workspaceData.debugSelectedRoot;
    } else {
      // Ultimate fallback: use the target dir passed to the function
      finalProjectPath = targetProjectDir;
    }

    // Normalize the final path
    finalProjectPath = finalProjectPath
      ? path.normalize(finalProjectPath)
      : targetProjectDir; // Ensure we have *some* path

    // Extract a user-friendly project name from the determined path
    let finalProjectName = extractProjectNameFromPath(finalProjectPath);

    // If the name is still generic ('Unknown Project', 'Home Directory'), and we got a workspace name, use that.
    if (
      (finalProjectName === "Unknown Project" ||
        finalProjectName === "Home Directory") &&
      workspaceName
    ) {
      finalProjectName = workspaceName;
    }
    // If still generic, try the Git-derived name as a last resort
    if (
      (finalProjectName === "Unknown Project" ||
        finalProjectName === "Home Directory") &&
      workspaceData.gitRepoPaths.length > 0
    ) {
      finalProjectName = workspaceData.gitRepoPaths[0]; // Use the name derived from Git path
    }

    // 7. Format Output
    const conversations: ConversationHistory["conversations"] = [];
    allMessagesByComposer.forEach((messages, composerId) => {
      // Filter to include only conversations potentially relevant to this workspace?
      // For now, include all merged conversations. We might need a way to link composer IDs to workspaces.
      // The Python script links via comp2ws map derived during workspace processing. Let's try that.

      // Simple approach: If a composerId was seen in the workspaceDB metadata, include it.
      if (workspaceData.composerMetadata.has(composerId)) {
        const metadata = allComposerMetadata.get(composerId);
        // Sort messages? Maybe later if timestamps are added.
        conversations.push({
          composerId,
          metadata,
          messages,
        });
      }
    });

    // Sort conversations by last updated time (most recent first)
    conversations.sort(
      (a, b) =>
        (b.metadata?.lastUpdatedAt || 0) - (a.metadata?.lastUpdatedAt || 0),
    );

    return {
      editor: "cursor",
      projectPath: finalProjectPath,
      projectName: finalProjectName,
      workspaceName: workspaceName,
      conversations: conversations, // Return all conversations from the merged data associated with workspace
    };
  } catch (error: any) {
    console.error(
      "An unexpected error occurred during Cursor chat parsing:",
      error.message,
      error.stack,
    );
    return null;
  } finally {
    // 8. Clean up temporary files
    if (
      tempWorkspaceDbSqlitePath &&
      fsSync.existsSync(tempWorkspaceDbSqlitePath)
    ) {
      try {
        await fs.unlink(tempWorkspaceDbSqlitePath);
        console.error(`Cleaned up ${tempWorkspaceDbSqlitePath}`);
      } catch (e: any) {
        console.error(
          `Error cleaning up ${tempWorkspaceDbSqlitePath}: ${e.message}`,
        );
      }
    }
    if (tempGlobalDbSqlitePath && fsSync.existsSync(tempGlobalDbSqlitePath)) {
      try {
        await fs.unlink(tempGlobalDbSqlitePath);
        console.error(`Cleaned up ${tempGlobalDbSqlitePath}`);
      } catch (e: any) {
        console.error(
          `Error cleaning up ${tempGlobalDbSqlitePath}: ${e.message}`,
        );
      }
    }
  }
}

// Helper to format the conversation history into a markdown string
// **Updated to handle the new ConversationHistory structure**
export function formatConversationHistory(
  history: ConversationHistory,
): string {
  let markdown = `# Conversation History\n\n`;

  markdown += `**Editor:** ${history.editor.charAt(0).toUpperCase() + history.editor.slice(1)}\n`;
  markdown += `**Project Name:** ${history.projectName || "Unknown"}\n`;
  markdown += `**Project Path:** ${history.projectPath || "Unknown"}\n`;
  if (history.workspaceName) {
    markdown += `**Workspace Name:** ${history.workspaceName}\n`;
  }
  markdown += `\n---\n`;

  if (
    Array.isArray(history.conversations) &&
    history.conversations.length > 0
  ) {
    // Option 1: Format only the most recent conversation
    const latestConvo = history.conversations[0]; // Assumes sorted by lastUpdatedAt desc
    markdown += `\n## Latest Conversation (${latestConvo.metadata?.title || latestConvo.composerId})\n\n`;
    if (latestConvo.metadata?.createdAt) {
      markdown += `**Created:** ${new Date(latestConvo.metadata.createdAt).toLocaleString()}\n`;
    }
    if (latestConvo.metadata?.lastUpdatedAt) {
      markdown += `**Last Updated:** ${new Date(latestConvo.metadata.lastUpdatedAt).toLocaleString()}\n`;
    }
    markdown += `\n`;

    latestConvo.messages.forEach((message) => {
      markdown += `**${message.role === "user" ? "User" : "Assistant"}:**\n`;
      markdown += `${message.content || ""}\n\n`;
    });

    // Option 2: Format all conversations (could be very long)
    /*
         history.conversations.forEach((convo) => {
             markdown += `\n## Conversation: ${convo.metadata?.title || convo.composerId}\n\n`;
              if (convo.metadata?.createdAt) markdown += `**Created:** ${new Date(convo.metadata.createdAt).toLocaleString()}\n`;
              if (convo.metadata?.lastUpdatedAt) markdown += `**Last Updated:** ${new Date(convo.metadata.lastUpdatedAt).toLocaleString()}\n\n`;

             convo.messages.forEach((message) => {
                 markdown += `**${message.role === 'user' ? 'User' : 'Assistant'}:**\n`;
                 markdown += `${message.content || ''}\n\n`;
             });
             markdown += `---\n`;
         });
         */
  } else {
    markdown +=
      "_No relevant conversation history found for this workspace._\\n\\n";
  }

  return markdown;
}

// Ensure sqlite3 dependency is added: npm install sqlite3 @types/sqlite3
