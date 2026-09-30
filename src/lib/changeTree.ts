import type { FileChange } from "../types";

export type ChangeTreeNode = {
  name: string;
  fullPath: string;
  kind: "dir" | "file";
  change?: FileChange;
  children?: ChangeTreeNode[];
};

type MutableDir = {
  name: string;
  fullPath: string;
  kind: "dir";
  children: Map<string, MutableDir | ChangeTreeNode>;
};

function sortChildren(nodes: ChangeTreeNode[]): ChangeTreeNode[] {
  return [...nodes].sort((a, b) => {
    if (a.kind !== b.kind) {
      return a.kind === "dir" ? -1 : 1;
    }
    return a.name.localeCompare(b.name);
  });
}

function freezeDir(dir: MutableDir): ChangeTreeNode {
  const children: ChangeTreeNode[] = [];
  for (const child of dir.children.values()) {
    if (child.kind === "dir" && "children" in child && child.children instanceof Map) {
      children.push(freezeDir(child as MutableDir));
    } else {
      children.push(child as ChangeTreeNode);
    }
  }
  return {
    name: dir.name,
    fullPath: dir.fullPath,
    kind: "dir",
    children: sortChildren(children),
  };
}

/** Build a folder tree from flat FileChange paths (split on `/`). */
export function buildChangeTree(changes: FileChange[]): ChangeTreeNode[] {
  const root: MutableDir = {
    name: "",
    fullPath: "",
    kind: "dir",
    children: new Map(),
  };

  for (const change of changes) {
    const parts = change.path.split("/").filter((part) => part.length > 0);
    if (parts.length === 0) {
      continue;
    }
    let current = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const fullPath = parts.slice(0, i + 1).join("/");
      if (isFile) {
        current.children.set(part, {
          name: part,
          fullPath,
          kind: "file",
          change,
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

/** Collect all file paths under a tree node (inclusive if file). */
export function collectFilePaths(node: ChangeTreeNode): string[] {
  if (node.kind === "file") {
    return node.change ? [node.change.path] : [node.fullPath];
  }
  const paths: string[] = [];
  for (const child of node.children ?? []) {
    paths.push(...collectFilePaths(child));
  }
  return paths;
}

/** Ignore pattern: files use relative path; dirs use `dir/`. */
export function ignorePatternForNode(node: ChangeTreeNode): string {
  if (node.kind === "dir") {
    return `${node.fullPath}/`;
  }
  return node.fullPath;
}
