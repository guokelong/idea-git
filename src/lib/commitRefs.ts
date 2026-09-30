export type CommitRefKind = "local" | "remote" | "tag" | "head";

export type CommitRefLabel = {
  text: string;
  kind: CommitRefKind;
};

function isRemoteRef(name: string, remotePrefixes: string[]): boolean {
  return remotePrefixes.some(
    (prefix) => name === prefix || name.startsWith(`${prefix}/`),
  );
}

/** Parses git log `%D` decoration into styled labels (local vs origin/remote). */
export function parseCommitRefs(
  refs: string,
  remotePrefixes: string[] = ["origin"],
): CommitRefLabel[] {
  const trimmed = refs.trim();
  if (!trimmed) return [];

  const prefixes = remotePrefixes.length > 0 ? remotePrefixes : ["origin"];
  const labels: CommitRefLabel[] = [];

  for (const raw of trimmed.split(",")) {
    const part = raw.trim();
    if (!part) continue;

    if (part.startsWith("HEAD -> ")) {
      const name = part.slice("HEAD -> ".length).trim();
      labels.push({ text: "HEAD", kind: "head" });
      if (name) {
        labels.push({
          text: name,
          kind: isRemoteRef(name, prefixes) ? "remote" : "local",
        });
      }
      continue;
    }

    if (part === "HEAD") {
      labels.push({ text: "HEAD", kind: "head" });
      continue;
    }

    if (part.startsWith("tag: ")) {
      const name = part.slice("tag: ".length).trim();
      if (name) labels.push({ text: name, kind: "tag" });
      continue;
    }

    labels.push({
      text: part,
      kind: isRemoteRef(part, prefixes) ? "remote" : "local",
    });
  }

  return labels;
}

/** Remote prefixes from names like `origin/main` → `origin`. Always includes `origin`. */
export function remotePrefixesFromNames(remoteBranchNames: string[]): string[] {
  const prefixes = new Set<string>(["origin"]);
  for (const name of remoteBranchNames) {
    const slash = name.indexOf("/");
    if (slash > 0) prefixes.add(name.slice(0, slash));
  }
  return [...prefixes];
}
