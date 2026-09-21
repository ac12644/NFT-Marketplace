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

solc-select use 0.8.37 >/dev/null 2>&1 || true

cd "$STAGE"
STATUS=0
for target in Marketplace MarketplaceCollection CollectionFactory MarketplaceProxy; do
  echo "── $target.sol"
  slither "src/$target.sol" \
    --solc-args "--base-path . --include-path node_modules --evm-version cancun --optimize --optimize-runs 200" \
    --config-file slither.config.json || STATUS=$?
done

exit $STATUS
