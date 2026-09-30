import type { BranchRow } from "../types";

export type BranchTreeNode = {
  name: string;
  fullPath: string;
  kind: "dir" | "branch";
  branch?: BranchRow;
  children?: BranchTreeNode[];
};

type MutableDir = {
  name: string;
  fullPath: string;
  kind: "dir";
  children: Map<string, MutableDir | BranchTreeNode>;
};

function sortChildren(nodes: BranchTreeNode[]): BranchTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function freezeDir(dir: MutableDir): BranchTreeNode {
  const children: BranchTreeNode[] = [];
  for (const child of dir.children.values()) {
    if (
      child.kind === "dir" &&
      "children" in child &&
      child.children instanceof Map
    ) {
      children.push(freezeDir(child as MutableDir));
    } else {
      children.push(child as BranchTreeNode);
    }
  }
  return {
    name: dir.name,
    fullPath: dir.fullPath,
    kind: "dir",
    children: sortChildren(children),
  };
}

/** Build a folder tree from branch names split on `/`. */
export function buildBranchTree(branches: BranchRow[]): BranchTreeNode[] {
  const root: MutableDir = {
    name: "",
    fullPath: "",
    kind: "dir",
    children: new Map(),
  };

  for (const branch of branches) {
    const parts = branch.name.split("/").filter((p) => p.length > 0);
    if (parts.length === 0) continue;
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLeaf = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      if (isLeaf) {
        current.children.set(part, {
          name: part,
          fullPath: branch.name,
          kind: "branch",
          branch,
        });
      } else {
        let next = current.children.get(part);
        if (!next || next.kind !== "dir" || !(next as MutableDir).children) {
          next = {
            name: part,
            fullPath,
            kind: "dir",
            children: new Map(),
          } satisfies MutableDir;
          current.children.set(part, next);
        }
        current = next as MutableDir;
      }
    }
  }

  return freezeDir(root).children ?? [];
}

export function splitLocalAndRemote(rows: BranchRow[]): {
  local: BranchRow[];
  remote: BranchRow[];
} {
  const local: BranchRow[] = [];
  const remote: BranchRow[] = [];
  for (const row of rows) {
    if (row.isRemote) remote.push(row);
    else local.push(row);
  }
  return { local, remote };
}

/** `origin/feature/x` → `feature/x` */
export function localNameFromRemote(remoteRef: string): string {
  const idx = remoteRef.indexOf("/");
  if (idx < 0 || idx === remoteRef.length - 1) return remoteRef;
  return remoteRef.slice(idx + 1);
}

export function allBranchDirPaths(
  nodes: BranchTreeNode[],
  prefix: string,
): string[] {
  const paths: string[] = [];
  for (const node of nodes) {
    if (node.kind === "dir") {
      paths.push(`${prefix}${node.fullPath}`);
      paths.push(...allBranchDirPaths(node.children ?? [], prefix));
    }
  }
  return paths;
}
