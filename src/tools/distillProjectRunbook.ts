import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "../types.js";

export const DistillProjectRunbookArgsSchema = z.object({
  target_project_dir: z
    .string()
    .describe(
      "The absolute path to the root of the target project directory.",
    ),
  content: z
    .string()
    .describe(
      "The complete markdown content for the `docs/runbook.md` file, that references the existing file and is additive. This should be a comprehensive play-by-play guide.",
    ),
  source_document_references: z
    .array(z.string())
    .optional()
    .describe(
      "Optional. An array of paths or descriptive references to the key source documents the LLM used for the latest distillation/update (e.g., ['docs/adr/0001-auth-decision.md', 'src/auth/service.ts']).",
    ),
});

export type DistillProjectRunbookArgs = z.infer<
  typeof DistillProjectRunbookArgsSchema
>;

export const distillProjectRunbookTool: ToolDefinition = {
  name: "distill_project_runbook",
  description:
    "Use this tool to create or update the central 'Project Runbook' file located at `docs/runbook.md` within the `target_project_dir`.\n**Before calling this tool, you MUST:**\n1. Thoroughly analyze all relevant project documents (ADRs, specs, changelogs, code, etc.) within the `target_project_dir`.\n2. If `docs/runbook.md` already exists, **you MUST review its current content** as part of your analysis.\n3. Synthesize all gathered information (including from any existing `runbook.md`) into an updated and comprehensive Project Runbook. This runbook serves as the primary, evolving knowledge base for understanding feature flows, key components, interactions, and operational procedures.\n4. The `content` you provide to this tool **must be the complete and final markdown content** for the entire `docs/runbook.md` file.\nThis tool will then save your generated content to `docs/runbook.md`, overwriting the previous version. The frontmatter will be updated with the current date and any source references you provide.",
  inputSchema: zodToJsonSchema(DistillProjectRunbookArgsSchema),
  annotations: {
    title: "Create or Update Project Runbook",
    readOnlyHint: false, // It writes a file
    destructiveHint: true, // It overwrites docs/runbook.md
    idempotentHint: true, // Calling twice with same content results in same state
    openWorldHint: false, // Interacts with local filesystem
  },
};
