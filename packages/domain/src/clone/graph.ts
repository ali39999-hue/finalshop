import { DomainError } from "../errors";
import type { CloneEntityKind } from "./profiles";

/**
 * Dependency graph (CLONE-002, roadmap §12.2 steps 3–4): cloneable entities
 * form a graph (a price depends on its price list and its variant; a page on
 * its assets). Copies run in topological order so dependencies always exist
 * before their dependents.
 */

export interface DependencyEdge {
  kind: CloneEntityKind;
  sourceId: string;
}

export interface DependencyNode {
  kind: CloneEntityKind;
  sourceId: string;
  deps: DependencyEdge[];
}

export function topologicalSort(nodes: DependencyNode[]): DependencyNode[] {
  const key = (kind: CloneEntityKind, sourceId: string) => `${kind}:${sourceId}`;
  const byKey = new Map<string, DependencyNode>();
  for (const node of nodes) {
    byKey.set(key(node.kind, node.sourceId), node);
  }
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, DependencyNode[]>();
  for (const node of nodes) {
    const nodeKey = key(node.kind, node.sourceId);
    if (!inDegree.has(nodeKey)) inDegree.set(nodeKey, 0);
    for (const dep of node.deps) {
      const depKey = key(dep.kind, dep.sourceId);
      // Edges only count when the dependency is itself being cloned.
      if (!byKey.has(depKey)) continue;
      inDegree.set(nodeKey, (inDegree.get(nodeKey) ?? 0) + 1);
      const list = dependents.get(depKey) ?? [];
      list.push(node);
      dependents.set(depKey, list);
    }
  }

  // Deterministic queue: insertion order of the original nodes.
  const queue: string[] = nodes
    .map((n) => key(n.kind, n.sourceId))
    .filter((k) => (inDegree.get(k) ?? 0) === 0);
  const sorted: DependencyNode[] = [];
  const visited = new Set<string>();
  while (queue.length > 0) {
    const current = queue.shift()!;
    if (visited.has(current)) continue;
    visited.add(current);
    const node = byKey.get(current);
    if (node) sorted.push(node);
    for (const dependent of dependents.get(current) ?? []) {
      const dependentKey = key(dependent.kind, dependent.sourceId);
      const remaining = (inDegree.get(dependentKey) ?? 1) - 1;
      inDegree.set(dependentKey, remaining);
      if (remaining === 0) queue.push(dependentKey);
    }
  }
  if (sorted.length !== nodes.length) {
    throw new DomainError(
      "CLONE_CYCLE",
      "dependency graph contains a cycle; cloning cannot proceed",
    );
  }
  return sorted;
}
