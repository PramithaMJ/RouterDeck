#!/usr/bin/env bash
# RouterDeck installer for macOS and Linux.
#   curl -fsSL https://router.pramitha.lk/install.sh | bash
# Downloads the latest release from GitHub
# (github.com/PramithaMJ/RouterDeck/releases), checks it against the
# published SHA-256 checksum, installs it and opens it.
set -euo pipefail

BASE="https://github.com/PramithaMJ/RouterDeck/releases/latest/download"
os="$(uname -s)"
arch="$(uname -m)"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

say() { printf '\033[1m%s\033[0m\n' "$*"; }

verify() { # file, published name
  if curl -fsSL "$BASE/SHA256SUMS.txt" -o "$tmp/SHA256SUMS.txt" 2>/dev/null; then
    want="$(grep " $2\$" "$tmp/SHA256SUMS.txt" | awk '{print $1}')"
    if [ -n "$want" ]; then
      got="$( (command -v shasum >/dev/null && shasum -a 256 "$1" || sha256sum "$1") | awk '{print $1}')"
      [ "$want" = "$got" ] || { echo "Checksum mismatch for $2. Not installing."; exit 1; }
      echo "Checksum OK."
    fi
  fi
}

if [ "$os" = "Darwin" ]; then
  [ "$arch" = "arm64" ] && a="arm64" || a="x64"
  name="RouterDeck-macOS-$a.zip"
  say "Downloading RouterDeck for macOS ($a)…"
  curl -fL --progress-bar "$BASE/$name" -o "$tmp/$name"
  verify "$tmp/$name" "$name"
  ditto -x -k "$tmp/$name" "$tmp/app"
  dest="${ROUTERDECK_DEST:-/Applications}"
  [ -w "$dest" ] || dest="$HOME/Applications"
  mkdir -p "$dest"
  [ "${ROUTERDECK_NO_OPEN:-}" = "1" ] || pkill -x RouterDeck 2>/dev/null || true
  rm -rf "$dest/RouterDeck.app"
  ditto "$tmp/app/RouterDeck.app" "$dest/RouterDeck.app"
  xattr -dr com.apple.quarantine "$dest/RouterDeck.app" 2>/dev/null || true
  say "Installed to $dest/RouterDeck.app"
  [ "${ROUTERDECK_NO_OPEN:-}" = "1" ] || open "$dest/RouterDeck.app"
elif [ "$os" = "Linux" ]; then
  [ "$arch" = "x86_64" ] || { echo "RouterDeck for Linux is 64-bit Intel/AMD only for now."; exit 1; }
  if command -v apt-get >/dev/null 2>&1 && [ "${ROUTERDECK_APPIMAGE:-}" != "1" ]; then
    name="RouterDeck-Linux-x64.deb"
    say "Downloading RouterDeck (.deb)…"
    curl -fL --progress-bar "$BASE/$name" -o "$tmp/$name"
    verify "$tmp/$name" "$name"
    say "Installing (asks for your password)…"
    sudo apt-get install -y "$tmp/$name"
    say "Installed. Open RouterDeck from your apps menu."
  else
    name="RouterDeck-Linux-x64.AppImage"
    say "Downloading RouterDeck (AppImage)…"
    mkdir -p "$HOME/Applications" "$HOME/.local/share/applications"
    curl -fL --progress-bar "$BASE/$name" -o "$tmp/$name"
    verify "$tmp/$name" "$name"
    install -m 755 "$tmp/$name" "$HOME/Applications/RouterDeck.AppImage"
    cat > "$HOME/.local/share/applications/routerdeck.desktop" <<EOF
[Desktop Entry]
Name=RouterDeck
Comment=Manage your home router
Exec=$HOME/Applications/RouterDeck.AppImage
Terminal=false
Type=Application
Categories=Network;
EOF
    say "Installed to ~/Applications/RouterDeck.AppImage"
    nohup "$HOME/Applications/RouterDeck.AppImage" >/dev/null 2>&1 &
  fi
else
  echo "Unsupported system: $os. On Windows, run in PowerShell:  irm https://router.pramitha.lk/install.ps1 | iex"
  exit 1
fi
