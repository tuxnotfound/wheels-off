-- One row per run signed onto the leaderboards: a finished arcade run that made a top 10 when it
-- was signed. Each board is the top 10 rows by one column (worker/leaderboard.ts).
CREATE TABLE runs (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0, -- trickster
  streak REAL NOT NULL DEFAULT 0, -- speedster: seconds unbroken at full speed
  seeded INTEGER NOT NULL DEFAULT 0, -- 1 for the default table
  hidden INTEGER NOT NULL DEFAULT 0, -- 1 takes the run off the boards (moderation)
  ip_hash TEXT, -- the sender's address, salted and hashed, for the rate limit
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX runs_by_score ON runs (score DESC, id) WHERE hidden = 0;
CREATE INDEX runs_by_streak ON runs (streak DESC, id) WHERE hidden = 0;
CREATE INDEX runs_by_address ON runs (ip_hash, created_at);
