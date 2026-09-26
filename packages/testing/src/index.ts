/**
 * Shared cross-package test fixtures and utilities.
 *
 * The in-memory doubles for the application ports live in
 * `@finalshop/application/testing` (they depend on the ports they fake);
 * fixtures that span multiple packages — E2E data seeds, Playwright helpers,
 * MSW handlers — will land here from W2 onward.
 */
export {};
