type ConflictBannerProps = {
  onRefresh: () => void | Promise<void>;
};

export function ConflictBanner({ onRefresh }: ConflictBannerProps) {
  return (
    <div className="conflict-banner" role="status">
      <p>
        存在合并冲突，请用 IDEA / mergetool 等外部工具解决后点击刷新
      </p>
      <button type="button" onClick={() => void onRefresh()}>
        刷新
      </button>
    </div>
  );
}
