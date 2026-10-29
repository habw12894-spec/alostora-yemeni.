CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE IF NOT EXISTS users (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name VARCHAR(80) NOT NULL,
 email VARCHAR(254) UNIQUE,
 phone VARCHAR(32) UNIQUE,
 password_hash TEXT NOT NULL,
 email_verified_at TIMESTAMPTZ,
 phone_verified_at TIMESTAMPTZ,
 avatar_url TEXT,
 bio VARCHAR(300) NOT NULL DEFAULT '',
 role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','admin')),
 is_active BOOLEAN NOT NULL DEFAULT TRUE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 CHECK (email IS NOT NULL OR phone IS NOT NULL)
);
CREATE TABLE IF NOT EXISTS verification_codes (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 channel VARCHAR(10) NOT NULL CHECK(channel IN ('email','phone')),
 code_hash TEXT NOT NULL,
 expires_at TIMESTAMPTZ NOT NULL,
 attempts INTEGER NOT NULL DEFAULT 0,
 consumed_at TIMESTAMPTZ,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS verification_user_channel_idx ON verification_codes(user_id, channel, created_at DESC);
CREATE TABLE IF NOT EXISTS videos (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 caption VARCHAR(500) NOT NULL DEFAULT '',
 video_url TEXT NOT NULL,
 mime_type VARCHAR(100) NOT NULL,
 size_bytes BIGINT NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK(status IN ('published','hidden','removed','review')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS videos_feed_idx ON videos(status, created_at DESC);
CREATE TABLE IF NOT EXISTS likes (
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(user_id, video_id)
);
CREATE TABLE IF NOT EXISTS comments (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 video_id UUID NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
 body VARCHAR(1000) NOT NULL,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS comments_video_idx ON comments(video_id, created_at ASC);
CREATE TABLE IF NOT EXISTS follows (
 follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 followed_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
 PRIMARY KEY(follower_id, followed_id),
 CHECK(follower_id <> followed_id)
);
CREATE TABLE IF NOT EXISTS reports (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 video_id UUID REFERENCES videos(id) ON DELETE CASCADE,
 reason VARCHAR(300) NOT NULL,
 status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved','rejected')),
 created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
