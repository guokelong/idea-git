#!/usr/bin/env bash
# 使用本地 .env.github 中的 token 推送当前分支到 GitHub（默认推 main）
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env.github"
BRANCH="${1:-main}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "缺少 $ENV_FILE"
  echo "请先执行: cp .env.github.example .env.github  并填入 GITHUB_TOKEN"
  exit 1
fi

# shellcheck disable=SC1090
set -a
source "$ENV_FILE"
set +a

if [[ -z "${GITHUB_TOKEN:-}" ]]; then
  echo "GITHUB_TOKEN 为空，请编辑 .env.github 填入 token"
  exit 1
fi

USER="${GITHUB_USER:-guokelong}"
REPO="${GITHUB_REPO:-idea-git}"
REMOTE_URL="https://x-access-token:${GITHUB_TOKEN}@github.com/${USER}/${REPO}.git"

echo "推送分支 ${BRANCH} -> github.com/${USER}/${REPO}.git ..."
git -C "$ROOT" push "$REMOTE_URL" "HEAD:refs/heads/${BRANCH}"
echo "完成。"
