import type { BlockDefinition, BlockKind, DesignTokens, TemplateKind } from "@finalshop/domain";

export type { BlockDefinition, BlockKind, DesignTokens, TemplateKind };

/**
 * Builder & theme ports (W8). Built-in blocks live in the domain registry;
 * org-specific definitions, themes, and templates persist here.
 */

export interface BlockDefinitionRecord {
  id: string;
  orgId: string;
  definition: BlockDefinition;
  createdAt: Date;
}

export interface ThemeRecord {
  id: string;
  orgId: string;
  name: string;
  tokens: DesignTokens;
  isActive: boolean;
  createdAt: Date;
}

export interface ThemeTemplateRecord {
  id: string;
  orgId: string;
  themeId: string | null;
  name: string;
  kind: TemplateKind;
  root: import("@finalshop/domain").PageNode;
  createdAt: Date;
}

export interface BlockDefinitionRepository {
  create(input: {
    orgId: string;
    definition: BlockDefinition;
  }): Promise<BlockDefinitionRecord>;
  listByOrg(orgId: string): Promise<BlockDefinitionRecord[]>;
}

export interface ThemeRepository {
  create(input: {
    orgId: string;
    name: string;
    tokens: DesignTokens;
  }): Promise<ThemeRecord>;
  findById(id: string): Promise<ThemeRecord | null>;
  listByOrg(orgId: string): Promise<ThemeRecord[]>;
  setActive(input: { id: string; orgId: string; isActive: boolean }): Promise<ThemeRecord>;
  /** Fork sync (W9): moves the child theme onto the parent's tokens. */
  setTokens(input: {
    id: string;
    orgId: string;
    tokens: DesignTokens;
  }): Promise<ThemeRecord>;
}

export interface ThemeTemplateRepository {
  create(input: {
    orgId: string;
    themeId: string | null;
    name: string;
    kind: TemplateKind;
    root: import("@finalshop/domain").PageNode;
  }): Promise<ThemeTemplateRecord>;
  listByTheme(orgId: string, themeId: string): Promise<ThemeTemplateRecord[]>;
}
