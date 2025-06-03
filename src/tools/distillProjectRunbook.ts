import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "../types.js";

export const DistillProjectRunbookArgsSchema = z.object({
  target_project_dir: z
    .string()
    .describe("The absolute path to the root of the target project directory."),
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
    "Use this tool to append content to the central 'Project Runbook' file located at `docs/runbook.md` within the `target_project_dir`.\n**Before calling this tool, you MUST:**\n1. Thoroughly analyze all relevant project documents (ADRs, specs, changelogs, code, etc.) within the `target_project_dir`.\n2. If `docs/runbook.md` already exists, **you MUST review its current content** as part of your analysis to avoid duplicating information.\n3. Synthesize all gathered information into new, additive content for the Project Runbook. This runbook serves as the primary, evolving knowledge base for understanding feature flows, key components, interactions, and operational procedures.\n4. The `content` you provide to this tool **must be new content to be appended** to the existing `docs/runbook.md` file.\n**IMPORTANT:** This tool *only appends* content. If you need to perform significant rewrites, corrections, or manual edits to the `docs/runbook.md` file, you should use `commander-edit_block` for surgical changes or `commander-write_file` with `mode: 'rewrite'` if a complete overhaul is necessary. The frontmatter of the runbook will be automatically updated with the current date and any source references you provide.",
  inputSchema: zodToJsonSchema(DistillProjectRunbookArgsSchema),
  annotations: {
    title: "Append to Project Runbook",
    readOnlyHint: false, // It writes a file
    destructiveHint: false, // It appends, not overwrites
    idempotentHint: false, // Appending same content twice results in different state
    openWorldHint: false, // Interacts with local filesystem
  },
};
