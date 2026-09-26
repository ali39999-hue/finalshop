import { DomainError } from "../errors";
import type { BlockRegistry } from "../builder/registry";
import { collectValidationErrors } from "../builder/registry";
import type { PageNode } from "../cms/page";

/**
 * Template registry (THEME-002): a theme ships page/section/pattern
 * templates as ASTs; every referenced block type must exist in the block
 * registry so a theme can never render an unknown block.
 */

export type TemplateKind = "page" | "section" | "pattern";

export interface ThemeTemplate {
  id: string;
  name: string;
  kind: TemplateKind;
  root: PageNode;
}

export function assertTemplateValidAgainstRegistry(
  template: ThemeTemplate,
  registry: BlockRegistry,
): void {
  const errors = collectValidationErrors(template.root, registry);
  if (errors.length > 0) {
    throw new DomainError(
      "TEMPLATE_INVALID",
      `template ${template.name} references unknown or invalid blocks: ${errors
        .map((e) => `${e.nodeId}:${e.code}`)
        .join(", ")}`,
    );
  }
}
