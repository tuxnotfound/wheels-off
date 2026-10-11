-- The weekly boards: each run is signed into the week it was played in, named the ISO way
-- (2026-W42) by weekOf in shared/leaderboard.ts. A week's boards are the top 10 rows of that
-- week, so they start empty every Monday, and a past week's runs stay here to be read back
-- (README, Leaderboards). The default table belongs to no week.
ALTER TABLE runs ADD COLUMN week TEXT;

-- The runs signed before this go into the week they were signed in: the week of the Thursday of
-- their Monday-to-Sunday week, as weekOf counts it.
UPDATE runs
SET week = printf(
  '%s-W%02d',
  strftime('%Y', date(created_at, '-3 days', 'weekday 4')),
  (strftime('%j', date(created_at, '-3 days', 'weekday 4')) - 1) / 7 + 1
)
WHERE seeded = 0;

CREATE INDEX runs_week_by_score ON runs (week, score DESC, id) WHERE hidden = 0;
CREATE INDEX runs_week_by_streak ON runs (week, streak DESC, id) WHERE hidden = 0;
