import { useEffect, useRef, useState } from "react";

type NewBranchFromDialogProps = {
  remoteRef: string;
  suggestedName: string;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (name: string) => void;
};

export function NewBranchFromDialog({
  remoteRef,
  suggestedName,
  busy,
  error,
  onCancel,
  onConfirm,
}: NewBranchFromDialogProps) {
  const [name, setName] = useState(suggestedName);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setName(suggestedName);
    const timer = window.setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [remoteRef, suggestedName]);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel]);

  const trimmed = name.trim();
  const canSubmit = trimmed.length > 0 && !busy;

  return (
    <div className="modal-backdrop" role="presentation">
      <div
        className="modal-dialog new-branch-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-branch-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <h2 id="new-branch-title">新建本地分支</h2>
          <p className="modal-subtitle">基于 {remoteRef}</p>
        </header>
        <div className="modal-body">
          <label className="modal-field">
            <span className="modal-field-label">分支名</span>
            <input
              ref={inputRef}
              className="branches-new-name modal-field-input"
              value={name}
              disabled={busy}
              placeholder="新分支名"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && canSubmit) {
                  event.preventDefault();
                  onConfirm(trimmed);
                }
              }}
            />
          </label>
          {error ? <p className="modal-field-error">{error}</p> : null}
        </div>
        <footer className="modal-actions">
          <button type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            className="primary"
            disabled={!canSubmit}
            onClick={() => onConfirm(trimmed)}
          >
            {busy ? "创建中…" : "创建并切换"}
          </button>
        </footer>
      </div>
    </div>
  );
}
