import { useEffect, useMemo, useRef, useState } from "react";
import { diffLines } from "diff";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

type SideBySideDiffProps = {
  before: string;
  after: string;
  binary?: boolean;
  fileLabel?: string;
};

export type DiffAnchor = {
  lineId: string;
};

function preferDark(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  );
}

/** First line of each contiguous added/removed hunk. */
export function computeDiffAnchors(before: string, after: string): DiffAnchor[] {
  const parts = diffLines(before, after);
  let left = 0;
  let right = 0;
  const anchors: DiffAnchor[] = [];

  for (const part of parts) {
    const n = part.count ?? 0;
    if (part.added) {
      if (n > 0) anchors.push({ lineId: `R-${right + 1}` });
      right += n;
    } else if (part.removed) {
      if (n > 0) anchors.push({ lineId: `L-${left + 1}` });
      left += n;
    } else {
      left += n;
      right += n;
    }
  }
  return anchors;
}

export function SideBySideDiff({
  before,
  after,
  binary,
  fileLabel,
}: SideBySideDiffProps) {
  const dark = useMemo(() => preferDark(), []);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [anchorIndex, setAnchorIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const anchors = useMemo(
    () => computeDiffAnchors(before, after),
    [before, after],
  );

  useEffect(() => {
    setAnchorIndex(0);
  }, [before, after]);

  useEffect(() => {
    if (!expanded) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.stopPropagation();
        event.preventDefault();
        setExpanded(false);
      }
    }
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [expanded]);

  useEffect(() => {
    if (anchors.length === 0) return;
    const id = anchors[Math.min(anchorIndex, anchors.length - 1)]?.lineId;
    if (!id) return;
    const root = bodyRef.current;
    if (!root) return;

    const timer = window.setTimeout(() => {
      const target = root.querySelector(
        `[data-diff-line-id="${id}"]`,
      ) as HTMLElement | null;
      target?.scrollIntoView({ block: "center", behavior: "smooth" });
    }, 80);
    return () => window.clearTimeout(timer);
  }, [anchorIndex, anchors, before, after]);

  if (binary) {
    return (
      <div className="commit-diff-empty">二进制文件，无法预览 Diff</div>
    );
  }

  if (!before && !after) {
    return (
      <div className="commit-diff-empty">选择文件查看 Diff</div>
    );
  }

  const current = anchors.length === 0 ? 0 : anchorIndex + 1;
  const highlight =
    anchors.length > 0
      ? [anchors[Math.min(anchorIndex, anchors.length - 1)].lineId]
      : [];

  function goPrev() {
    if (anchors.length === 0) return;
    setAnchorIndex((i) => (i - 1 + anchors.length) % anchors.length);
  }

  function goNext() {
    if (anchors.length === 0) return;
    setAnchorIndex((i) => (i + 1) % anchors.length);
  }

  return (
    <div
      className={
        expanded ? "side-by-side-diff side-by-side-diff-expanded" : "side-by-side-diff"
      }
    >
      <div className="side-by-side-diff-toolbar">
        <span className="side-by-side-diff-title">
          {fileLabel ?? "Diff"}
        </span>
        <div className="side-by-side-diff-nav">
          <button
            type="button"
            className="side-by-side-diff-nav-btn"
            disabled={anchors.length === 0}
            onClick={goPrev}
            title="上一个不同点"
            aria-label="上一个不同点"
          >
            ▲
          </button>
          <button
            type="button"
            className="side-by-side-diff-nav-btn"
            disabled={anchors.length === 0}
            onClick={goNext}
            title="下一个不同点"
            aria-label="下一个不同点"
          >
            ▼
          </button>
          <span className="side-by-side-diff-nav-count">
            {anchors.length === 0 ? "0/0" : `${current}/${anchors.length}`}
          </span>
          <button
            type="button"
            className="side-by-side-diff-nav-btn"
            onClick={() => setExpanded((v) => !v)}
            title={expanded ? "退出全屏 (Esc)" : "全屏查看 Diff"}
            aria-label={expanded ? "退出全屏" : "全屏"}
          >
            {expanded ? "⤓" : "⤢"}
          </button>
        </div>
      </div>
      <div className="side-by-side-diff-body" ref={bodyRef}>
        <ReactDiffViewer
          oldValue={before}
          newValue={after}
          splitView
          compareMethod={DiffMethod.LINES}
          useDarkTheme={dark}
          leftTitle="HEAD"
          rightTitle="Your version"
          showDiffOnly={false}
          highlightLines={highlight}
          renderGutter={(data) => {
            if (!data.lineNumber) {
              return <td className={data.styles.emptyGutter} />;
            }
            const lineId = `${data.prefix}-${data.lineNumber}`;
            return (
              <td
                data-diff-line-id={lineId}
                className={data.styles.emptyGutter}
                style={{ width: 0, padding: 0, border: "none" }}
              />
            );
          }}
          styles={{
            variables: {
              dark: {
                diffViewerBackground: "#1e1e1e",
                addedBackground: "#2ea04326",
                addedColor: "#e6edf3",
                removedBackground: "#f8514926",
                removedColor: "#e6edf3",
                wordAddedBackground: "#2ea04366",
                wordRemovedBackground: "#f8514966",
                addedGutterBackground: "#2ea04340",
                removedGutterBackground: "#f8514940",
                gutterBackground: "#161b22",
                gutterBackgroundDark: "#0d1117",
                highlightBackground: "#6e76814d",
                highlightGutterBackground: "#6e768166",
                codeFoldGutterBackground: "#21262d",
                codeFoldBackground: "#161b22",
                emptyLineBackground: "#161b2280",
                gutterColor: "#7d8590",
                addedGutterColor: "#3fb950",
                removedGutterColor: "#f85149",
                codeFoldContentColor: "#7d8590",
                diffViewerTitleBackground: "#161b22",
                diffViewerTitleColor: "#e6edf3",
                diffViewerTitleBorderColor: "#30363d",
              },
              light: {
                diffViewerBackground: "#ffffff",
                addedBackground: "#e6ffec",
                addedColor: "#24292f",
                removedBackground: "#ffebe9",
                removedColor: "#24292f",
                wordAddedBackground: "#abf2bc",
                wordRemovedBackground: "#ffcecb",
                addedGutterBackground: "#ccffd8",
                removedGutterBackground: "#ffd7d5",
                gutterBackground: "#f6f8fa",
                gutterBackgroundDark: "#f0f2f4",
                highlightBackground: "#fff8c5",
                highlightGutterBackground: "#fff8c5",
                codeFoldGutterBackground: "#dbedff",
                codeFoldBackground: "#f1f8ff",
                emptyLineBackground: "#f6f8fa80",
                gutterColor: "#8c959f",
                addedGutterColor: "#1a7f37",
                removedGutterColor: "#cf222e",
                codeFoldContentColor: "#656d76",
                diffViewerTitleBackground: "#f6f8fa",
                diffViewerTitleColor: "#24292f",
                diffViewerTitleBorderColor: "#d0d7de",
              },
            },
            contentText: {
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              fontSize: "12px",
              lineHeight: "18px",
            },
          }}
        />
      </div>
    </div>
  );
}
