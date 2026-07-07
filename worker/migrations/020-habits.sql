-- Habit tracker: user-defined habits + daily completions
CREATE TABLE IF NOT EXISTS habits (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT    NOT NULL,
  name       TEXT    NOT NULL,
  emoji      TEXT    NOT NULL DEFAULT '✅',
  sort_order INTEGER NOT NULL DEFAULT 0,
  active     INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS habit_completions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  habit_id   INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  user_id    TEXT    NOT NULL,
  date       TEXT    NOT NULL, -- YYYY-MM-DD
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  UNIQUE(habit_id, date)
);

CREATE INDEX IF NOT EXISTS idx_habits_user     ON habits(user_id, active);
CREATE INDEX IF NOT EXISTS idx_hc_user_date    ON habit_completions(user_id, date);
CREATE INDEX IF NOT EXISTS idx_hc_habit_date   ON habit_completions(habit_id, date);
