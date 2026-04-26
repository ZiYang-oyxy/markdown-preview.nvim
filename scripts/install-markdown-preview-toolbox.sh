#!/usr/bin/env sh
set -eu

VERSION="${MKDP_TOOLBOX_VERSION:-0.0.10}"
REPO="${MKDP_TOOLBOX_REPO:-ZiYang-oyxy/markdown-preview.nvim}"
TAG="${MKDP_TOOLBOX_TAG:-toolbox-v${VERSION}}"
ASSET="${MKDP_TOOLBOX_ASSET:-ziyang-oyxy-markdown-preview-toolbox-${VERSION}.tgz}"
PACKAGE_URL="${MKDP_TOOLBOX_URL:-https://github.com/${REPO}/releases/download/${TAG}/${ASSET}}"

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to install markdown-preview-toolbox" >&2
  exit 1
fi

tmp_dir="$(mktemp -d "${TMPDIR:-/tmp}/mkdp-toolbox-install.XXXXXX")"
cleanup() {
  rm -rf "$tmp_dir"
}
trap cleanup EXIT INT TERM

package_path="${tmp_dir}/${ASSET}"

if command -v curl >/dev/null 2>&1; then
  curl -fsSL "$PACKAGE_URL" -o "$package_path"
elif command -v wget >/dev/null 2>&1; then
  wget -q "$PACKAGE_URL" -O "$package_path"
else
  echo "curl or wget is required to download markdown-preview-toolbox" >&2
  exit 1
fi

npm install -g "$package_path"
mkdp --version
