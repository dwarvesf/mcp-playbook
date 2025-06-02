import * as path from "path";
import {
  DistillProjectRunbookArgs,
  DistillProjectRunbookArgsSchema,
} from "../tools/distillProjectRunbook.js";
import * as fsUtils from "../utils/fsUtils.js";
import { validateArgs } from "../utils/validationUtils.js";

export async function handleDistillProjectRunbook(
  args: DistillProjectRunbookArgs,
): Promise<any> {
  try {
    const { target_project_dir, content, source_document_references } =
      validateArgs(DistillProjectRunbookArgsSchema, args);

    const absoluteTargetProjectDir = path.resolve(target_project_dir);
    console.error(
      `Handling distill_project_runbook for: ${absoluteTargetProjectDir}`,
    );

    // The runbook is now always in the 'docs' directory, named 'runbook.md'
    const docsDir = fsUtils.joinProjectPath(absoluteTargetProjectDir, "docs");

    // Ensure 'docs' directory exists
    fsUtils.createDirectory(docsDir);

    const runbookFilePath = fsUtils.joinProjectPath(docsDir, "runbook.md");

    // Prepare frontmatter
    const frontmatterParts = [
      "---",
      'title: "Project Runbook"', // Fixed title
      `last_updated: "${new Date().toISOString()}"`, // ISO string for timestamp
    ];
    if (source_document_references && source_document_references.length > 0) {
      frontmatterParts.push("distilled_from:");
      source_document_references.forEach((ref: string) => {
        // Basic sanitization for references to avoid breaking YAML structure
        const sanitizedRef = ref.replace(/"/g, '\\"').replace(/\n/g, ' ');
        frontmatterParts.push(`  - "${sanitizedRef}"`);
      });
    }
    frontmatterParts.push("---", ""); // Add a blank line after frontmatter

    const finalContent = frontmatterParts.join("\n") + content;

    // Write/overwrite the content to the runbook.md file
    fsUtils.writeFile(runbookFilePath, finalContent);

    return {
      status: "success",
      path: runbookFilePath,
      message: `Project runbook saved successfully to: ${runbookFilePath}`,
    };
  } catch (e: any) {
    console.error(`Error in handleDistillProjectRunbook: ${e.message}`);
    return {
      status: "error",
      message: `Failed to save project runbook: ${e.message}`,
    };
  }
}
