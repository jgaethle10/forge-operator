# Fabric Journal evidence: safe updater cutover

**Status:** instructions only. This document does not authorize an unattended production update or claim a host has executed these steps.

## Why a normal merge is unsafe

The older resident `evercraft-fabric-update.service` runs the old `scripts/update-fabric-owned-edge.sh` from the on-device Forge checkout. That old script may `git restore` and `git clean -fdx` `public/journal` **before** fetching a newer, safe GitHub revision. Therefore merging the safety fix into `main` while the timer still runs may cause the very loss we are trying to prevent.

## Mandatory on-device gates, in order

1. **Operator-authorized safety pause, before merging the PR**. On the actual owned Fabric node (not in GitHub Actions):

   ```bash
   sudo systemctl disable --now evercraft-fabric-update.timer
   systemctl is-active evercraft-fabric-update.service || true
   systemctl is-enabled evercraft-fabric-update.timer || true
   ```

   The timer must be disabled and inactive. If `evercraft-fabric-update.service` remains active, **HOLD**: inspect the ongoing update; do not merge, kill it mid-checkout, force-reset, or resume the timer.

2. **Preserve an offline, root-only local snapshot of the Journal before any manual checkout action**. Resolve the live checkout from the actual service (do not assume a `~/evercraft-release-candidate` directory is its source):

   ```bash
   REPO_ROOT="$(systemctl show -p WorkingDirectory --value evercraft-fabric.service)"
   test -d "$REPO_ROOT/.git" || { echo "HOLD: live Forge checkout not resolved"; exit 1; }
   test -d "$REPO_ROOT/public/journal" || { echo "HOLD: Journal source missing; investigate"; exit 1; }
   SNAP_DIR="/var/lib/evercraft/fabric-update/journal-snapshots"
   STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
   sudo install -d -m 0700 "$SNAP_DIR"
   sudo tar -C "$REPO_ROOT" -czpf "$SNAP_DIR/journal-$STAMP.tar.gz" public/journal
   sudo sha256sum "$SNAP_DIR/journal-$STAMP.tar.gz" | sudo tee "$SNAP_DIR/journal-$STAMP.tar.gz.sha256" >/dev/null
   sudo chmod 0600 "$SNAP_DIR/journal-$STAMP.tar.gz" "$SNAP_DIR/journal-$STAMP.tar.gz.sha256"
   ```

   This snapshot stays on the owned node and is not uploaded to GitHub or any chat. Capture a separate operator receipt for the timestamp, checksum, live checkout SHA, and timer/service status without exposing private Journal content.

3. **Inspect *both* visible and ignored Journal drift** before manual promotion:

   ```bash
   git -C "$REPO_ROOT" status --porcelain --untracked-files=all
   git -C "$REPO_ROOT" ls-files --others --ignored --exclude-standard -- public/journal
   ```

   If Journal is dirty or ignored output exists, **HOLD and reconcile by preserving all unique files and verifying authoritative publication records**. No `git clean`, `git restore`, `git reset --hard`, deletion, or forced checkout is authorized as a workaround.

4. **Merge the safety repair only after the host timer is paused and snapshot/dirty-state receipts exist**. Verify new source includes the reviewed safe Journal guards and rollback before re-enabling the timer. If checked-out files are dirty, an authorized operator must resolve them without deleting Journal evidence. Do not confuse GitHub CI with a resident update.

5. **Release Fabric discovery separately**. Only after the updated safe script is resident and its evidence hold is proven, review and merge the infrastructure-only CHUM route PR. Verify resident `source_release_ref` against the exact release, then externally verify main sitemap, segmented index, and CHUM URLs return HTTP 200 with absolute HTTPS `loc` entries. Research Atlas editorial `noindex` controls remain in place until independent content review.

6. **Resume the timer intentionally**, after safe source convergence and proof of public routes:

   ```bash
   sudo systemctl enable --now evercraft-fabric-update.timer
   systemctl is-active evercraft-fabric-update.timer
   ```

   Preserve original snapshots and release receipts. A healthy endpoint alone never establishes that all expected publication paths are live.

## Failure and recovery boundary

The repaired updater **holds** before fetching if tracked/untracked/ignored Journal evidence is detected. Rollback uses `git reset --merge` rather than `reset --hard`; if rollback would overwrite local work, the operator receives a hold and must reconcile, not a destructive retry. One-time Journal rescue follows the same no-deletion policy.

If the node cannot be reached, **do not merge as a shortcut**. Keep safety and discovery PRs open, with explicit failed deployment gates and receipts. No OpenAI plugin review submission, client email, financial settlement, or public research publication is implied by these steps.
