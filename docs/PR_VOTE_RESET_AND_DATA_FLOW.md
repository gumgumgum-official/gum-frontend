# PR: Vote-only reset and data flow clarification

## Summary

- Changed kiosk reset behavior from global client wipe to **vote-only local reset**.
- Kept GLB/template/cache warm state intact to reduce re-load stutter after session completion.
- Added documentation for monitor flow and reset scope so operator behavior is explicit.

## Background

The previous `resetClientForNextKioskVisitor()` implementation cleared:

- `sessionStorage`
- `localStorage`
- cookies
- Cache Storage API
- in-memory GLTF template cache

This ensured no prior-user vote footprint leaked, but it also forced heavy assets to be prepared again (`waitForStage3GltfTemplatesReady()`), causing avoidable stutter in kiosk transitions.

## What changed

### 1) Vote key ownership centralized

- Added `GGUMDDI_MY_VOTE_STORAGE_PREFIX` in `src/lib/voteApi.js`.
- Added `clearGgumddiMyVotesFromLocalStorage()` in `src/lib/voteApi.js`.
  - Deletes only keys with prefix: `gum-ggumddi-my-vote:`.

### 2) Vote section now reuses shared prefix

- Updated `src/components/GgumddiVoteSection.tsx` to use `GGUMDDI_MY_VOTE_STORAGE_PREFIX` from `voteApi`.
- Removed duplicated local constant in the component.

### 3) Kiosk reset narrowed to vote-only

- Reworked `src/utils/common/resetClientForNextKioskVisitor.js`:
  - Removed full clears for storage/cookies/cache/gltf memory.
  - Now calls only `clearGgumddiMyVotesFromLocalStorage()`.

### 4) Start page now clears vote keys on entry (Option B)

- Updated `src/pages/StartPage.jsx`:
  - On mount, `clearGgumddiMyVotesFromLocalStorage()` is executed.
  - Result: refresh/re-entry at `/start` clears prior vote footprint without global cache eviction.

### 5) Documentation updated

- Updated `docs/MONITOR_USER_FLOW.md` with reset scope note for `/start?complete=1`.

## Data flow (current)

### Server flow (monitor session)

1. `POST /api/monitors/:id/start`
2. `GET /api/monitors/:id/current` polling (`MONITOR_POLL_MS`)
3. `POST /api/monitors/:id/complete`

### Client vote persistence

- UI "already voted" state is persisted in localStorage by key:
  - `gum-ggumddi-my-vote:${sessionId}`

### Reset behavior now

- Clearing vote footprint:
  - `/start` mount (new)
  - `/start?complete=1` path via `resetClientForNextKioskVisitor()` (now vote-only)
- Not cleared anymore:
  - global local/session storage
  - cookies
  - Cache Storage API
  - in-memory GLTF template cache

## Expected impact

- Prevents prior user's vote marker from leaking to next user.
- Reduces transition stutter by avoiding forced heavy GLB/template recaching.
- Keeps minigame records/high-scores and other local state untouched unless separately managed.

## Manual test plan

1. Vote once in poster modal.
2. Close modal and reopen immediately: vote state is still visible in current page lifecycle.
3. Navigate/re-enter `/start` (or refresh at start page):
   - vote marker should be cleared (can vote again).
4. Run complete flow (`/start?complete=1`):
   - vote marker should be cleared.
5. Observe kiosk transition smoothness:
   - compare with previous behavior; fewer stalls expected due to preserved GLB/cache state.

## Risk / notes

- Because only vote keys are cleared, other localStorage keys remain by design.
- If strict per-visitor isolation is needed for additional features, add explicit key-level cleanup for those features instead of global clear.

