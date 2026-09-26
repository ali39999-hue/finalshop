import type {
  BlockDefinitionRecord,
  BlockDefinitionRepository,
  ThemeRecord,
  ThemeRepository,
  ThemeTemplateRecord,
  ThemeTemplateRepository,
} from "@finalshop/application";
import { DomainError, type BlockKind } from "@finalshop/domain";
import {
  Prisma,
  type Theme as ThemeRow,
  type ThemeTemplate as ThemeTemplateRow,
  type BlockDefinition as BlockDefinitionRow,
  type PrismaClient,
} from "@prisma/client";
import { rethrowMapped } from "./prisma-repositories";

const toBlockRecord = (row: BlockDefinitionRow): BlockDefinitionRecord => ({
  id: row.id,
  orgId: row.orgId,
  createdAt: row.createdAt,
  definition: {
    type: row.type,
    name: row.name,
    kind: row.kind as BlockKind,
    fields: row.fields as unknown as BlockDefinitionRecord["definition"]["fields"],
    allowedChildren: (row.allowedChildren as string[] | null) ?? undefined,
    isSection: row.isSection,
  },
});

const toTheme = (row: ThemeRow): ThemeRecord => ({
  id: row.id,
  orgId: row.orgId,
  name: row.name,
  tokens: row.tokens as unknown as ThemeRecord["tokens"],
  isActive: row.isActive,
  createdAt: row.createdAt,
});

const toTemplate = (row: ThemeTemplateRow): ThemeTemplateRecord => ({
  id: row.id,
  orgId: row.orgId,
  themeId: row.themeId,
  name: row.name,
  kind: row.kind as ThemeTemplateRecord["kind"],
  root: row.root as unknown as ThemeTemplateRecord["root"],
  createdAt: row.createdAt,
});

/** Prisma implementations of the builder/theme ports (W8). */
export function createBuilderThemeRepositories(db: PrismaClient): {
  blockDefinitions: BlockDefinitionRepository;
  themes: ThemeRepository;
  themeTemplates: ThemeTemplateRepository;
} {
  const blockDefinitions: BlockDefinitionRepository = {
    create: async (input) => {
      try {
        const row = await db.blockDefinition.create({
          data: {
            orgId: input.orgId,
            type: input.definition.type,
            name: input.definition.name,
            kind: input.definition.kind,
            fields: json(input.definition.fields),
            ...(input.definition.allowedChildren !== undefined && {
              allowedChildren: json(input.definition.allowedChildren),
            }),
            isSection: input.definition.isSection === true,
          },
        });
        return toBlockRecord(row);
      } catch (err) {
        throw rethrowMapped(err, "BlockDefinition_orgId_type_key", "BLOCK_TYPE_TAKEN", input.definition.type);
      }
    },
    listByOrg: async (orgId) => {
      const rows = await db.blockDefinition.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toBlockRecord);
    },
  };

  const themes: ThemeRepository = {
    create: async (input) => {
      const row = await db.theme.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          tokens: json(input.tokens),
        },
      });
      return toTheme(row);
    },
    findById: async (id) => {
      const row = await db.theme.findUnique({ where: { id } });
      return row ? toTheme(row) : null;
    },
    listByOrg: async (orgId) => {
      const rows = await db.theme.findMany({
        where: { orgId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toTheme);
    },
    setActive: async (input) => {
      const existing = await db.theme.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("THEME_NOT_FOUND", input.id);
      const row = await db.theme.update({
        where: { id: input.id },
        data: { isActive: input.isActive },
      });
      return toTheme(row);
    },
    setTokens: async (input) => {
      const existing = await db.theme.findFirst({
        where: { id: input.id, orgId: input.orgId },
      });
      if (!existing) throw new DomainError("THEME_NOT_FOUND", input.id);
      const row = await db.theme.update({
        where: { id: input.id },
        data: { tokens: json(input.tokens) },
      });
      return toTheme(row);
    },
  };

  const themeTemplates: ThemeTemplateRepository = {
    create: async (input) => {
      const row = await db.themeTemplate.create({
        data: {
          orgId: input.orgId,
          name: input.name,
          kind: input.kind,
          root: json(input.root),
          ...(input.themeId !== null && { themeId: input.themeId }),
        },
      });
      return toTemplate(row);
    },
    listByTheme: async (orgId, themeId) => {
      const rows = await db.themeTemplate.findMany({
        where: { orgId, themeId },
        orderBy: { createdAt: "asc" },
      });
      return rows.map(toTemplate);
    },
  };

  return { blockDefinitions, themes, themeTemplates };
}

const json = (value: unknown): Prisma.InputJsonValue =>
  value as unknown as Prisma.InputJsonValue;
