import { DomainError } from "../errors";
import { NODE_ID_REGEX } from "../cms/page";
import type { PageNode } from "../cms/page";

/**
 * Builder kernel (W8, BLD-001..005): capability-based block/section
 * definitions with typed prop fields. The visual editor (canvas/inspector)
 * is UI; these are the contracts it consumes — registry, validation, and
 * inspector field descriptors.
 *
 * Blocks follow the roadmap §10.1 categories via their type prefix:
 * commerce.* / content.* / layout.* / growth.* / extension.*
 */

export type BlockKind = "commerce" | "content" | "layout" | "growth" | "extension";

export type PropFieldType =
  | "string"
  | "text"
  | "number"
  | "boolean"
  | "enum"
  | "asset"
  | "page"
  | "collection"
  | "product"
  | "color";

export interface PropField {
  type: PropFieldType;
  required?: boolean | undefined;
  enumValues?: string[] | undefined;
  min?: number | undefined;
  max?: number | undefined;
  /** Inspector label (BLD-005). */
  label?: string | undefined;
}

export interface BlockDefinition {
  /** Dot-namespaced: `<kind>.<name>`, e.g. "commerce.productGrid". */
  type: string;
  name: string;
  kind: BlockKind;
  fields: Record<string, PropField>;
  /** When set, only these child types are allowed. */
  allowedChildren?: string[] | undefined;
  /** Sections may appear as direct children of the page root. */
  isSection?: boolean | undefined;
}

const BLOCK_TYPE_REGEX = new RegExp(
  `^(commerce|content|layout|growth|extension)\\.[a-z][a-zA-Z0-9-]*$`,
);

export function assertValidDefinition(definition: BlockDefinition): void {
  if (!BLOCK_TYPE_REGEX.test(definition.type)) {
    throw new DomainError(
      "BLOCK_DEFINITION_INVALID",
      `type ${definition.type} must be <kind>.<name>`,
    );
  }
  if (definition.name.trim().length === 0) {
    throw new DomainError("BLOCK_DEFINITION_INVALID", "name is required");
  }
  for (const [field, spec] of Object.entries(definition.fields)) {
    if (spec.type === "enum" && (spec.enumValues ?? []).length === 0) {
      throw new DomainError(
        "BLOCK_DEFINITION_INVALID",
        `enum field ${field} needs enumValues`,
      );
    }
    if (spec.required !== undefined && typeof spec.required !== "boolean") {
      throw new DomainError("BLOCK_DEFINITION_INVALID", `field ${field} required flag`);
    }
  }
}

/** BLD-001/002: registry of block and section definitions. */
export class BlockRegistry {
  private readonly definitions = new Map<string, BlockDefinition>();

  register(definition: BlockDefinition): void {
    assertValidDefinition(definition);
    if (this.definitions.has(definition.type)) {
      throw new DomainError(
        "BLOCK_TYPE_TAKEN",
        `block type ${definition.type} is already registered`,
      );
    }
    this.definitions.set(definition.type, definition);
  }

  get(type: string): BlockDefinition | undefined {
    return this.definitions.get(type);
  }

  list(kind?: BlockKind): BlockDefinition[] {
    const all = [...this.definitions.values()];
    return kind ? all.filter((d) => d.kind === kind) : all;
  }
}

/** The built-in block set every org gets (BLD-001/002). */
export function builtInRegistry(): BlockRegistry {
  const registry = new BlockRegistry();
  registry.register({
    type: "layout.section",
    name: "Section",
    kind: "layout",
    isSection: true,
    fields: {},
  });
  registry.register({
    type: "layout.container",
    name: "Container",
    kind: "layout",
    fields: {
      maxWidth: { type: "number", label: "Max width (px)" },
    },
  });
  registry.register({
    type: "content.text",
    name: "Text",
    kind: "content",
    fields: { text: { type: "text", required: true, label: "Content" } },
  });
  registry.register({
    type: "content.image",
    name: "Image",
    kind: "content",
    fields: { assetId: { type: "asset", required: true, label: "Image" } },
  });
  registry.register({
    type: "commerce.productGrid",
    name: "Product Grid",
    kind: "commerce",
    fields: {
      collectionId: { type: "collection", required: true, label: "Collection" },
      limit: { type: "number", min: 1, max: 100 },
    },
  });
  registry.register({
    type: "commerce.productDetail",
    name: "Product Detail",
    kind: "commerce",
    fields: { productId: { type: "product", required: true, label: "Product" } },
  });
  registry.register({
    type: "growth.banner",
    name: "Banner",
    kind: "growth",
    fields: {
      headline: { type: "string", required: true },
      tone: { type: "enum", enumValues: ["info", "warning", "sale"] },
    },
  });
  registry.register({
    type: "extension.appSlot",
    name: "App Slot",
    kind: "extension",
    fields: { slotId: { type: "string", required: true } },
  });
  return registry;
}

function propTypeValid(field: PropField, value: unknown): boolean {
  switch (field.type) {
    case "string":
    case "text":
    case "asset":
    case "page":
    case "collection":
    case "product":
      return typeof value === "string" && value.length > 0;
    case "number":
      return typeof value === "number" && Number.isFinite(value)
        ? (field.min === undefined || value >= field.min) &&
            (field.max === undefined || value <= field.max)
        : false;
    case "boolean":
      return typeof value === "boolean";
    case "enum":
      return typeof value === "string" && (field.enumValues ?? []).includes(value);
    case "color":
      return typeof value === "string" && /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value);
  }
}

export interface ValidationDiagnostic {
  nodeId: string;
  code: "UNKNOWN_BLOCK" | "PROP_REQUIRED_MISSING" | "PROP_TYPE_INVALID" | "CHILD_NOT_ALLOWED";
}

/** BLD-003: validates a page AST against the registry, collecting diagnostics. */
export function collectValidationErrors(
  root: PageNode,
  registry: BlockRegistry,
): ValidationDiagnostic[] {
  const errors: ValidationDiagnostic[] = [];

  const walk = (node: PageNode, parent?: BlockDefinition): void => {
    if (!NODE_ID_REGEX.test(node.id)) {
      errors.push({ nodeId: node.id, code: "PROP_TYPE_INVALID" });
    }
    const definition = registry.get(node.type);
    if (!definition) {
      errors.push({ nodeId: node.id, code: "UNKNOWN_BLOCK" });
      for (const child of node.children) walk(child, undefined);
      return;
    }
    if (parent?.allowedChildren && !parent.allowedChildren.includes(node.type)) {
      errors.push({ nodeId: node.id, code: "CHILD_NOT_ALLOWED" });
    }
    for (const [field, spec] of Object.entries(definition.fields)) {
      const value = node.props?.[field];
      if (value === undefined || value === null || value === "") {
        if (spec.required) {
          errors.push({ nodeId: node.id, code: "PROP_REQUIRED_MISSING" });
        }
        continue;
      }
      if (!propTypeValid(spec, value)) {
        errors.push({ nodeId: node.id, code: "PROP_TYPE_INVALID" });
      }
    }
    for (const child of node.children) walk(child, definition);
  };

  walk(root);
  return errors;
}

/** BLD-005 data contract: the inspector field list for a node type. */
export function inspectorFields(
  definition: BlockDefinition,
): Array<{ name: string; type: PropFieldType; required: boolean; label: string }> {
  return Object.entries(definition.fields).map(([name, spec]) => ({
    name,
    type: spec.type,
    required: spec.required === true,
    label: spec.label ?? name,
  }));
}
