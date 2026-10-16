-- The play tracker (worker/play.ts): one row per page visit that rides, updated as it goes, so
-- the weekly reads can count players, returning players, long sessions and where visits come
-- from (README, Plays). A player is a salted address hash, the one the rate limits already use:
-- nothing is stored in the player's browser for it. The session id is random and lives in the
-- page's memory only.
CREATE TABLE plays (
  session TEXT PRIMARY KEY, -- random, one page visit
  ip_hash TEXT, -- the sender's address, salted and hashed (null with no salt set)
  source TEXT NOT NULL, -- the link's ?ref, else the referring site, else direct
  week TEXT NOT NULL, -- 2026-W43, as weekOf in shared/leaderboard.ts names it
  day TEXT NOT NULL, -- 2026-10-19, UTC
  runs INTEGER NOT NULL DEFAULT 0, -- arcade runs ended and time trials finished
  seconds REAL NOT NULL DEFAULT 0, -- time riding, any mode, pauses left out
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX plays_by_address ON plays (ip_hash, created_at);
CREATE INDEX plays_by_week ON plays (week);
