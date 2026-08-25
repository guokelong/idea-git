use crate::error::AppError;

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    pub index_status: char,
    pub worktree_status: char,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoStatus {
    pub branch: String,
    pub upstream: Option<String>,
    pub ahead: u32,
    pub behind: u32,
    pub changes: Vec<FileChange>,
    pub has_conflicts: bool,
    pub dirty: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitRow {
    pub hash: String,
    pub short_hash: String,
    pub subject: String,
    pub author: String,
    pub date: String,
    pub refs: String,
}

/// Parses `git log --format=%H%x09%h%x09%s%x09%an%x09%aI%x09%D` (no graph chars).
pub fn parse_log(stdout: &str) -> Result<Vec<CommitRow>, AppError> {
    let mut rows = Vec::new();
    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        rows.push(parse_log_line(line)?);
    }
    Ok(rows)
}

fn parse_log_line(line: &str) -> Result<CommitRow, AppError> {
    let mut parts = line.splitn(6, '\t');
    let hash = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Message(format!("invalid log line: {line}")))?;
    let short_hash = parts
        .next()
        .filter(|s| !s.is_empty())
        .ok_or_else(|| AppError::Message(format!("invalid log line: {line}")))?;
    let subject = parts
        .next()
        .ok_or_else(|| AppError::Message(format!("invalid log line: {line}")))?;
    let author = parts
        .next()
        .ok_or_else(|| AppError::Message(format!("invalid log line: {line}")))?;
    let date = parts
        .next()
        .ok_or_else(|| AppError::Message(format!("invalid log line: {line}")))?;
    let refs = parts.next().unwrap_or("");
    Ok(CommitRow {
        hash: hash.to_string(),
        short_hash: short_hash.to_string(),
        subject: subject.to_string(),
        author: author.to_string(),
        date: date.to_string(),
        refs: refs.to_string(),
    })
}

/// Parses output of `git status --porcelain=v1 -b`.
pub fn parse_status_porcelain(stdout: &str) -> Result<RepoStatus, AppError> {
    let mut branch = String::new();
    let mut upstream = None;
    let mut ahead = 0u32;
    let mut behind = 0u32;
    let mut changes = Vec::new();
    let mut has_conflicts = false;

    for line in stdout.lines() {
        if line.is_empty() {
            continue;
        }
        if let Some(rest) = line.strip_prefix("## ") {
            let (b, u, a, bh) = parse_branch_line(rest)?;
            branch = b;
            upstream = u;
            ahead = a;
            behind = bh;
            continue;
        }

        let change = parse_file_line(line)?;
        if is_conflict(change.index_status, change.worktree_status) {
            has_conflicts = true;
        }
        changes.push(change);
    }

    let dirty = !changes.is_empty();

    Ok(RepoStatus {
        branch,
        upstream,
        ahead,
        behind,
        changes,
        has_conflicts,
        dirty,
    })
}

fn parse_branch_line(rest: &str) -> Result<(String, Option<String>, u32, u32), AppError> {
    let (branch_part, bracket) = match rest.find('[') {
        Some(idx) => (&rest[..idx], Some(&rest[idx..])),
        None => (rest, None),
    };

    let branch_part = branch_part.trim_end();
    let (branch, upstream) = match branch_part.split_once("...") {
        Some((b, u)) => (b.to_string(), Some(u.to_string())),
        None => (branch_part.to_string(), None),
    };

    let mut ahead = 0u32;
    let mut behind = 0u32;

    if let Some(bracket) = bracket {
        let inner = bracket
            .trim_start_matches('[')
            .trim_end_matches(']')
            .trim();
        for segment in inner.split(',') {
            let segment = segment.trim();
            if let Some(n) = segment.strip_prefix("ahead ") {
                ahead = n
                    .trim()
                    .parse()
                    .map_err(|_| AppError::Message(format!("invalid ahead count: {segment}")))?;
            } else if let Some(n) = segment.strip_prefix("behind ") {
                behind = n
                    .trim()
                    .parse()
                    .map_err(|_| AppError::Message(format!("invalid behind count: {segment}")))?;
            }
        }
    }

    Ok((branch, upstream, ahead, behind))
}

fn parse_file_line(line: &str) -> Result<FileChange, AppError> {
    let chars: Vec<char> = line.chars().collect();
    if chars.len() < 4 || chars[2] != ' ' {
        return Err(AppError::Message(format!("invalid status line: {line}")));
    }

    let index_status = chars[0];
    let worktree_status = chars[1];
    let path_part = line[3..].trim();

    let path = if let Some(idx) = path_part.find(" -> ") {
        path_part[idx + 4..].to_string()
    } else {
        path_part.to_string()
    };

    Ok(FileChange {
        path,
        index_status,
        worktree_status,
    })
}

fn is_conflict(index: char, worktree: char) -> bool {
    index == 'U'
        || worktree == 'U'
        || (index == 'A' && worktree == 'A')
        || (index == 'D' && worktree == 'D')
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_branch_ahead_behind_and_conflict() {
        let raw = "\
## main...origin/main [ahead 2, behind 1]
M  src/a.rs
UU conflict.txt
?? scratch.tmp
";
        let s = parse_status_porcelain(raw).unwrap();
        assert_eq!(s.branch, "main");
        assert_eq!(s.upstream, Some("origin/main".into()));
        assert_eq!(s.ahead, 2);
        assert_eq!(s.behind, 1);
        assert!(s.has_conflicts);
        assert!(s.dirty);
        assert_eq!(s.changes.len(), 3);
    }

    #[test]
    fn parses_clean_repo_with_upstream() {
        let raw = "## feature...origin/feature\n";
        let s = parse_status_porcelain(raw).unwrap();
        assert_eq!(s.branch, "feature");
        assert_eq!(s.upstream, Some("origin/feature".into()));
        assert_eq!(s.ahead, 0);
        assert_eq!(s.behind, 0);
        assert!(!s.has_conflicts);
        assert!(!s.dirty);
        assert!(s.changes.is_empty());
    }

    #[test]
    fn parses_branch_without_upstream() {
        let raw = "## main\nM  file.txt\n";
        let s = parse_status_porcelain(raw).unwrap();
        assert_eq!(s.branch, "main");
        assert_eq!(s.upstream, None);
        assert!(s.dirty);
    }

    #[test]
    fn parses_rename_takes_target_path() {
        let raw = "## main\nR  old/name.rs -> new/name.rs\n";
        let s = parse_status_porcelain(raw).unwrap();
        assert_eq!(s.changes.len(), 1);
        assert_eq!(s.changes[0].path, "new/name.rs");
        assert_eq!(s.changes[0].index_status, 'R');
    }

    #[test]
    fn detects_aa_and_dd_conflicts() {
        let raw = "## main\nAA both_added.txt\nDD both_deleted.txt\n";
        let s = parse_status_porcelain(raw).unwrap();
        assert!(s.has_conflicts);
        assert_eq!(s.changes.len(), 2);
    }

    #[test]
    fn parses_ahead_only_and_behind_only() {
        let ahead_only = "## dev...origin/dev [ahead 3]\n";
        let s = parse_status_porcelain(ahead_only).unwrap();
        assert_eq!(s.ahead, 3);
        assert_eq!(s.behind, 0);

        let behind_only = "## dev...origin/dev [behind 5]\n";
        let s = parse_status_porcelain(behind_only).unwrap();
        assert_eq!(s.ahead, 0);
        assert_eq!(s.behind, 5);
    }

    #[test]
    fn parses_log_lines() {
        let raw = "abc\tdef123\tmsg\tAnn\t2026-01-01T00:00:00+08:00\tHEAD -> main\n";
        let rows = parse_log(raw).unwrap();
        assert_eq!(rows[0].hash, "abc");
        assert_eq!(rows[0].short_hash, "def123");
        assert_eq!(rows[0].subject, "msg");
        assert_eq!(rows[0].author, "Ann");
        assert_eq!(rows[0].date, "2026-01-01T00:00:00+08:00");
        assert_eq!(rows[0].refs, "HEAD -> main");
    }

    #[test]
    fn parses_log_line_without_refs() {
        let raw = "abc\tdef123\tmsg\tAnn\t2026-01-01T00:00:00+08:00\n";
        let rows = parse_log(raw).unwrap();
        assert_eq!(rows[0].refs, "");
    }

    #[test]
    fn parses_multiple_log_lines_skips_blank() {
        let raw = "\
aaa\t111\tone\tA\t2026-01-01T00:00:00+08:00\tHEAD -> main
bbb\t222\ttwo\tB\t2026-01-02T00:00:00+08:00\torigin/main
";
        let rows = parse_log(raw).unwrap();
        assert_eq!(rows.len(), 2);
        assert_eq!(rows[0].short_hash, "111");
        assert_eq!(rows[1].short_hash, "222");
        assert_eq!(rows[1].refs, "origin/main");
    }
}
