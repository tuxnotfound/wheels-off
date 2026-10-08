-- The default table: TUX on top of both boards, then made-up locals, there to be beaten. The
-- game falls back to the same table (SEED in src/game/leaderboard.ts); change the two together.
-- A seeded run sits on one board only, apart from TUX's.
INSERT INTO runs (name, score, streak, seeded) VALUES
  ('TUX', 200, 92, 1),
  ('HANA', 150, 0, 1),
  ('KENJI', 110, 0, 1),
  ('YUKI', 80, 0, 1),
  ('SORA', 60, 0, 1),
  ('RIN', 45, 0, 1),
  ('TAKUMI', 30, 0, 1),
  ('MOMO', 20, 0, 1),
  ('JIRO', 12, 0, 1),
  ('AOI', 6, 0, 1),
  ('REN', 0, 70, 1),
  ('MIKA', 0, 55, 1),
  ('DAI', 0, 42, 1),
  ('NAO', 0, 32, 1),
  ('KOTA', 0, 24, 1),
  ('EMI', 0, 18, 1),
  ('SHO', 0, 12, 1),
  ('YUNA', 0, 8, 1),
  ('HARU', 0, 5, 1);
