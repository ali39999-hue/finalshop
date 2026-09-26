import { z } from "zod";
import {
  AUDIT_SUBJECTS,
  BlockRegistry,
  DomainError,
  type BlockDefinition,
  type DesignTokens,
  type PageNode,
  type TenantContext,
  buildAuditEvent,
  builtInRegistry,
  collectValidationErrors,
  inspectorFields,
  validateDesignTokens,
} from "@finalshop/domain";
import { requirePermission, requireSameTenant, requireUserId } from "@finalshop/auth";
import type { Repositories } from "../ports";

const DefinitionInput = z.object({
  name: z.string().min(1).max(200),
  kind: z.enum(["commerce", "content", "layout", "growth", "extension"]),
  type: z.string().min(3).max(100),
  fields: z
    .record(
      z.string(),
      z.object({
        type: z.enum([
          "string",
          "text",
          "number",
          "boolean",
          "enum",
          "asset",
          "page",
          "collection",
          "product",
          "color",
        ]),
        required: z.boolean().optional(),
        enumValues: z.array(z.string().max(100)).max(50).optional(),
        min: z.number().optional(),
        max: z.number().optional(),
        label: z.string().max(100).optional(),
      }),
    )
    .default({}),
  allowedChildren: z.array(z.string().max(100)).max(100).optional(),
  isSection: z.boolean().optional(),
});

const RegisterBlockInput = DefinitionInput.extend({
  orgId: z.string().min(1),
});

const PageNodeInput: z.ZodType<PageNode> = z.lazy(() =>
  z.object({
    id: z.string().min(1).max(64),
    type: z.string().min(1).max(64),
    props: z.record(z.string(), z.unknown()).default({}),
    children: z.array(PageNodeInput).default([]),
  }),
) as z.ZodType<PageNode>;

/** Registry = built-ins + the org's custom definitions. */
async function registryForOrg(repos: Repositories, orgId: string): Promise<BlockRegistry> {
  const registry = builtInRegistry();
  for (const record of await repos.blockDefinitions.listByOrg(orgId)) {
    if (!registry.get(record.definition.type)) {
      registry.register(record.definition);
    }
  }
  return registry;
}

/** BLD-001/002: registers an org-specific block or section definition. */
export async function registerBlockDefinition(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof RegisterBlockInput>,
) {
  const parsed = RegisterBlockInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "builder.manage");
  const actor = requireUserId(ctx);
  const definition: BlockDefinition = {
    type: parsed.type,
    name: parsed.name,
    kind: parsed.kind,
    fields: parsed.fields,
    ...(parsed.allowedChildren !== undefined && {
      allowedChildren: parsed.allowedChildren,
    }),
    ...(parsed.isSection !== undefined && { isSection: parsed.isSection }),
  };
  const registry = await registryForOrg(repos, parsed.orgId);
  registry.register(definition); // throws BLOCK_TYPE_TAKEN / BLOCK_DEFINITION_INVALID

  const record = await repos.blockDefinitions.create({
    orgId: parsed.orgId,
    definition,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "builder.block_registered",
      subjectType: AUDIT_SUBJECTS.BLOCK,
      subjectId: record.id,
      after: { type: definition.type, isSection: definition.isSection === true },
    }),
  );
  return record;
}

/** BLD-003: validates a page AST against built-ins + the org's registry. */
export async function validatePageAgainstRegistry(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; schema: unknown },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), schema: PageNodeInput })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "builder.read");
  const registry = await registryForOrg(repos, parsed.orgId);
  return { diagnostics: collectValidationErrors(parsed.schema, registry) };
}

/** BLD-005: inspector field descriptors for one block type. */
export async function getInspectorFields(
  repos: Repositories,
  ctx: TenantContext,
  input: { orgId: string; blockType: string },
) {
  const parsed = z
    .object({ orgId: z.string().min(1), blockType: z.string().min(3).max(100) })
    .parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "builder.read");
  const registry = await registryForOrg(repos, parsed.orgId);
  const definition = registry.get(parsed.blockType);
  if (!definition) {
    throw new DomainError("BLOCK_NOT_FOUND", `block ${parsed.blockType} not found`);
  }
  return inspectorFields(definition);
}

const ThemeInput = z.object({
  orgId: z.string().min(1),
  name: z.string().min(1).max(200),
  tokens: z.unknown(),
});

/** THEME-001: creates a theme; the domain enforces the a11y contrast guard. */
export async function createTheme(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof ThemeInput>,
) {
  const parsed = ThemeInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "theme.manage");
  const actor = requireUserId(ctx);
  const tokens = parsed.tokens as DesignTokens;
  validateDesignTokens(tokens);
  const theme = await repos.themes.create({
    orgId: parsed.orgId,
    name: parsed.name,
    tokens,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "theme.created",
      subjectType: AUDIT_SUBJECTS.THEME,
      subjectId: theme.id,
      after: { name: theme.name },
    }),
  );
  return theme;
}

const TemplateInput = z.object({
  orgId: z.string().min(1),
  themeId: z.string().min(1).optional(),
  name: z.string().min(1).max(200),
  kind: z.enum(["page", "section", "pattern"]),
  root: PageNodeInput,
});

/** THEME-002: registers a template; every referenced block must be registered. */
export async function registerTemplate(
  repos: Repositories,
  ctx: TenantContext,
  input: z.input<typeof TemplateInput>,
) {
  const parsed = TemplateInput.parse(input);
  requireSameTenant(ctx, parsed.orgId);
  requirePermission(ctx, "theme.manage");
  const actor = requireUserId(ctx);
  const registry = await registryForOrg(repos, parsed.orgId);
  const errors = collectValidationErrors(parsed.root, registry);
  if (errors.length > 0) {
    throw new DomainError(
      "TEMPLATE_INVALID",
      `template references invalid blocks: ${errors
        .map((e) => `${e.nodeId}:${e.code}`)
        .join(", ")}`,
    );
  }
  const template = await repos.themeTemplates.create({
    orgId: parsed.orgId,
    themeId: parsed.themeId ?? null,
    name: parsed.name,
    kind: parsed.kind,
    root: parsed.root,
  });
  await repos.audit.record(
    buildAuditEvent({
      orgId: parsed.orgId,
      actorId: actor,
      action: "theme.template_registered",
      subjectType: AUDIT_SUBJECTS.THEME,
      subjectId: template.id,
      after: { name: parsed.name, kind: parsed.kind },
    }),
  );
  return template;
}
