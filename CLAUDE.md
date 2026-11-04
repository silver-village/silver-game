# Silver: notes for Claude

## Two Claudes work on this project, one at a time

This folder (`/Users/Shared/Claude-Shared/Silver`) is shared by two Claude Code sessions that run under
two macOS accounts on the same Mac:

- `m.b.a`: the first Claude, which built most of the app.
- `ClaudeAccount`: the second Claude, which joined later (rulebook review, bug fixes).

The user never runs both at the same time, but either one may have worked here since your last session.
So at the start of every session:

1. Run `git fetch` and `git log --oneline -10` to see what the other Claude did.
2. Run `git status`. Uncommitted or untracked files may be the other Claude's unfinished work.
   Don't edit, commit or delete them unless the user says so; ask first.
3. Commit only the files you changed, never `git add -A`. Before pushing, fetch again and merge or rebase
   if `origin/main` moved.

Each push to `main` runs the tests and publishes the game (`.github/workflows/pages.yml`), so the
tests must pass first (`cd app && npm test`).

## Practical details

- The folder belongs to `m.b.a`, so for `ClaudeAccount` git reports "dubious ownership". Run git as
  `git -c safe.directory='*' …` instead of changing the global git config.
- Both Claudes work directly in this shared folder (no other copy). The dev server is the `app` entry
  in `.claude/launch.json` (port 5199); both accounts use it.
- The user speaks Persian; answer in Persian.

## Where things are

- `app/`: the game (Vite + TypeScript). The rules engine is in `app/src/engine/` with tests next to it.
- `docs/rules-amulet.md`: the rules as implemented, plus "تصمیم‌های ما" for cases the rulebook leaves open.
  Update it whenever a rule decision changes.
- `rules/`: scans of the Persian rulebook and card guide (not in git). They are the final word on rules.
