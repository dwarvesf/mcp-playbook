import { ToolDefinition } from "../types.js";
import { createAdrTool } from "./createAdr.js";
import { createChangelogTool } from "./createChangelog.js";
import { createSpecTool } from "./createSpec.js";
import { initPlaybookTool } from "./initPlaybook.js";
import { saveAndUploadChatLogTool } from "./saveAndUploadChatLog.js";
import { searchPromptsTool } from "./searchPrompts.js";
import { searchRunbookTool } from "./searchRunbook.js";
import { suggestRunbookTool } from "./suggestRunbook.js";
import { syncPromptTool } from "./syncPrompt.js";
import { thinkTool } from "./thinkTool.js";
import { distillProjectRunbookTool } from "./distillProjectRunbook.js";

// Array holding all the tool definitions for the mcp-playbook server
export const toolDefinitions: ToolDefinition[] = [
  initPlaybookTool,
  createSpecTool,
  createAdrTool,
  createChangelogTool,
  saveAndUploadChatLogTool,
  searchRunbookTool,
  searchPromptsTool,
  suggestRunbookTool,
  syncPromptTool,
  thinkTool,
  distillProjectRunbookTool,
];

export default toolDefinitions;
