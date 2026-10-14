-- The time trial's board: one row per run signed at the finish, with its ghost (the run's
-- replay, shared/trial.ts). A week's board is its 10 fastest rows, and the fastest one's ghost
-- rides along with every player that week (worker/trial.ts). The course changes with the week's
-- town, so there is no all-time board.
CREATE TABLE trials (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  week TEXT NOT NULL, -- 2026-W42, as weekOf in shared/leaderboard.ts names it
  time REAL NOT NULL, -- seconds from GO to the finish line
  ghost TEXT NOT NULL, -- JSON: { x, z, y, r }: world centimeters, GHOST_HZ samples a second, respawns
  hidden INTEGER NOT NULL DEFAULT 0, -- 1 takes the run off the board (moderation)
  ip_hash TEXT, -- the sender's address, salted and hashed, for the rate limit
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX trials_week_by_time ON trials (week, time, id) WHERE hidden = 0;
CREATE INDEX trials_by_address ON trials (ip_hash, created_at);
