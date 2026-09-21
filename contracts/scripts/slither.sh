#!/usr/bin/env bash
# Runs Slither against the contracts.
#
# Two obstacles make this less direct than `slither .`:
#   1. crytic-compile does not understand Hardhat 3's build-info format, so the
#      hardhat platform cannot be used.
#   2. pnpm symlinks every package into a content-addressed store, and solc
#      will not resolve through those symlinks.
#
# So we stage a plain, boring project — sources plus a real node_modules — in a
# temp directory and let solc resolve imports the ordinary way, no remappings.
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$STAGE/node_modules/@openzeppelin"
cp -RL "$ROOT/node_modules/@openzeppelin/contracts" \
  "$STAGE/node_modules/@openzeppelin/contracts"
cp -RL "$ROOT/node_modules/@openzeppelin/contracts-upgradeable" \
  "$STAGE/node_modules/@openzeppelin/contracts-upgradeable"
cp -R "$ROOT/src" "$STAGE/src"
cp "$ROOT/slither.config.json" "$STAGE/slither.config.json"

# Slither drives solc itself, so the pinned compiler has to be on PATH. The
# version is read from the Hardhat config rather than repeated here, so the
# two cannot drift apart.
SOLC="$(sed -n "s/.*version: '\([0-9.]*\)'.*/\1/p" hardhat.config.ts | head -1)"
if [ -z "$SOLC" ]; then
  echo "could not read the solc version from hardhat.config.ts" >&2
  exit 1
fi

if ! command -v solc-select >/dev/null 2>&1; then
  echo "solc-select is required — install it with: pipx install solc-select" >&2
  exit 1
fi

solc-select install "$SOLC" >/dev/null
solc-select use "$SOLC" >/dev/null

# Fail loudly rather than letting Slither report a compilation error later.
solc --version 2>/dev/null | grep -q "$SOLC" || {
  echo "solc $SOLC is not active after solc-select use" >&2
  exit 1
}

cd "$STAGE"
STATUS=0
for target in Marketplace MarketplaceCollection CollectionFactory MarketplaceProxy; do
  echo "── $target.sol"
  slither "src/$target.sol" \
    --compile-force-framework solc \
    --solc-args "--base-path . --include-path node_modules --evm-version cancun --optimize --optimize-runs 200" \
    --config-file slither.config.json || STATUS=$?
done

exit $STATUS
