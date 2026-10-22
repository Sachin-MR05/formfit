-- Portable schema (identical on SQLite and PostgreSQL): text ids, BIGINT epoch milliseconds,
-- DOUBLE PRECISION numbers, SMALLINT 0/1 for booleans, TEXT for small JSON lists.

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT,
  created_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  terms_accepted_at BIGINT NOT NULL
);

CREATE TABLE body_profiles (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  femur_torso DOUBLE PRECISION NOT NULL,
  shank_femur DOUBLE PRECISION NOT NULL,
  leg_torso DOUBLE PRECISION NOT NULL,
  up_sign SMALLINT NOT NULL,
  side TEXT NOT NULL,
  samples INTEGER NOT NULL,
  source TEXT NOT NULL,
  hip_image_y0 DOUBLE PRECISION NOT NULL,
  thigh2d DOUBLE PRECISION NOT NULL,
  created_at BIGINT NOT NULL,
  client_updated_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_profiles_user_updated ON body_profiles (user_id, updated_at, id);
CREATE INDEX idx_profiles_user_created ON body_profiles (user_id, created_at);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  started_at BIGINT NOT NULL,
  ended_at BIGINT,
  source TEXT NOT NULL,
  file_name TEXT,
  pose_model TEXT NOT NULL,
  model_version TEXT NOT NULL,
  profile_femur_torso DOUBLE PRECISION NOT NULL,
  profile_shank_femur DOUBLE PRECISION NOT NULL,
  profile_leg_torso DOUBLE PRECISION NOT NULL,
  profile_up_sign SMALLINT NOT NULL,
  client_updated_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL,
  deleted_at BIGINT
);
CREATE INDEX idx_sessions_user_updated ON sessions (user_id, updated_at, id);
CREATE INDEX idx_sessions_user_started ON sessions (user_id, started_at);

CREATE TABLE reps (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rep_index INTEGER NOT NULL,
  created_at BIGINT NOT NULL,
  t_seconds DOUBLE PRECISION NOT NULL,
  knee DOUBLE PRECISION NOT NULL,
  hip DOUBLE PRECISION NOT NULL,
  torso DOUBLE PRECISION NOT NULL,
  shank DOUBLE PRECISION NOT NULL,
  phi DOUBLE PRECISION NOT NULL,
  femur_torso DOUBLE PRECISION NOT NULL,
  shank_femur DOUBLE PRECISION NOT NULL,
  leg_torso DOUBLE PRECISION NOT NULL,
  score INTEGER NOT NULL,
  personalized DOUBLE PRECISION NOT NULL,
  generic DOUBLE PRECISION NOT NULL,
  rule_ok SMALLINT NOT NULL,
  rule_reasons TEXT NOT NULL,
  codes TEXT NOT NULL,
  down_s DOUBLE PRECISION NOT NULL,
  up_s DOUBLE PRECISION NOT NULL,
  model_version TEXT NOT NULL,
  label TEXT,
  client_updated_at BIGINT NOT NULL,
  updated_at BIGINT NOT NULL
);
CREATE INDEX idx_reps_session ON reps (session_id, rep_index);
CREATE INDEX idx_reps_user_updated ON reps (user_id, updated_at, id);
