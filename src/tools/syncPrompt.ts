import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ToolDefinition } from "../types.js";

export const SyncPromptArgsSchema = z.object({
  name: z.string().describe("The name of the prompt."),
  description: z.string().describe("A brief description of the prompt's purpose."),
  model: z.string().describe("The model used for the prompt (e.g., openai/gpt-4o-mini)."),
  modelParameters: z.record(z.any()).describe("Parameters for the model, such as temperature and maxTokens."),
  messages: z.array(
    z.object({
      role: z.string().describe("The role of the message sender (e.g., system, user)."),
      content: z.string().describe("The content of the message."),
    })
  ).describe("An array of messages that make up the prompt."),
  testData: z.array(z.record(z.any())).optional().describe("An array of test cases for the prompt."),
  evaluators: z.array(
    z.object({
      name: z.string().describe("The name of the evaluator."),
      string: z.record(z.any()).describe("The evaluation criteria."),
    })
  ).optional().describe("An array of evaluators for the prompt."),
});

export type SyncPromptArgs = z.infer<typeof SyncPromptArgsSchema>;

export const syncPromptTool: ToolDefinition = {
  name: "sync_prompt",
  description: "Syncs an LLM prompt to the dwarvesf/prompt-db GitHub repository in YAML format.",
  inputSchema: zodToJsonSchema(SyncPromptArgsSchema),
  annotations: {
    title: "Sync Prompt to Prompt DB",
    readOnlyHint: false,
    destructiveHint: false,
    idempotentHint: false,
    openWorldHint: true,
  },
};
