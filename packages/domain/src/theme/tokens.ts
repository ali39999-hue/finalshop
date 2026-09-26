import { DomainError } from "../errors";

/**
 * Design tokens (THEME-001, roadmap §11): one token source of truth with
 * required semantic colors and an accessibility contrast guard — the theme
 * engine refuses token sets whose text/background pair fails WCAG AA.
 */

export interface DesignTokens {
  colors: Record<string, string>;
  typography: { fontFamily: string; scale: Record<string, number> };
  spacing: Record<string, number>;
  radius: Record<string, number>;
  shadow: Record<string, string>;
  motion: { durationMs: number; easing: string };
}

export const REQUIRED_COLOR_TOKENS = ["background", "text", "primary"] as const;

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function luminance(hex: string): number {
  const full =
    hex.length === 4
      ? `#${hex[1]}${hex[1]}${hex[2]}${hex[2]}${hex[3]}${hex[3]}`
      : hex;
  const channels = [1, 3, 5].map((i) => {
    const raw = parseInt(full.slice(i, i + 2), 16) / 255;
    return raw <= 0.03928 ? raw / 12.92 : ((raw + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * channels[0]! + 0.7152 * channels[1]! + 0.0722 * channels[2]!;
}

/** WCAG 2.x contrast ratio between two colors (1..21). */
export function contrastRatio(a: string, b: string): number {
  if (!HEX.test(a) || !HEX.test(b)) {
    throw new DomainError("TOKEN_INVALID", `colors must be hex: ${a}, ${b}`);
  }
  const la = luminance(a);
  const lb = luminance(b);
  const lighter = Math.max(la, lb);
  const darker = Math.min(la, lb);
  return (lighter + 0.05) / (darker + 0.05);
}

export function assertContrast(a: string, b: string, min = 4.5): void {
  const ratio = contrastRatio(a, b);
  if (ratio < min) {
    throw new DomainError(
      "CONTRAST_FAILS",
      `contrast ${ratio.toFixed(2)} is below ${min} (a11y guard)`,
    );
  }
}

export function validateDesignTokens(tokens: DesignTokens): void {
  for (const name of REQUIRED_COLOR_TOKENS) {
    if (typeof tokens.colors?.[name] !== "string") {
      throw new DomainError(
        "TOKEN_INVALID",
        `missing required color token ${name}`,
      );
    }
    if (!HEX.test(tokens.colors[name]!)) {
      throw new DomainError("TOKEN_INVALID", `color ${name} must be hex`);
    }
  }
  // A11y contrast guard (roadmap §11): body text must read on the background.
  assertContrast(tokens.colors.text!, tokens.colors.background!);

  if (Object.keys(tokens.typography?.scale ?? {}).length === 0) {
    throw new DomainError("TOKEN_INVALID", "typography scale is required");
  }
  if (!tokens.typography.fontFamily) {
    throw new DomainError("TOKEN_INVALID", "fontFamily is required");
  }
  for (const scale of [tokens.typography.scale, tokens.spacing, tokens.radius]) {
    for (const value of Object.values(scale ?? {})) {
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
        throw new DomainError("TOKEN_INVALID", "scale values must be non-negative numbers");
      }
    }
  }
  if (!Number.isInteger(tokens.motion?.durationMs) || tokens.motion.durationMs < 0) {
    throw new DomainError("TOKEN_INVALID", "motion duration must be a non-negative integer");
  }
}
