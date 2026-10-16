-- Challenge links (worker/challenge.ts): a time trial run a player shared, with its ghost, so a
-- friend who opens /?c=<id> races it on the same week's course. Any finished run can be shared,
-- on the board or not; the row is made when the share is clicked. A challenge only rides in the
-- week it was set, since the course changes with the town.
CREATE TABLE challenges (
  id TEXT PRIMARY KEY, -- random, 8 letters and digits: what the link carries
  name TEXT, -- the sharer's name, when they have one (null otherwise)
  week TEXT NOT NULL, -- 2026-W43, as weekOf in shared/leaderboard.ts names it
  time REAL NOT NULL, -- seconds from GO to the finish line
  ghost TEXT NOT NULL, -- JSON, as in trials
  ip_hash TEXT, -- the sender's address, salted and hashed, for the rate limit
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX challenges_by_address ON challenges (ip_hash, created_at);
