-- AVNEX Supabase compatibility check/migration. Review before running.
-- Assumes the existing tables created for AVNEX: profiles, videos, likes, comments, follows.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text, avatar_url text, bio text, created_at timestamptz default now()
);

alter table public.profiles add column if not exists username text;
alter table public.profiles add column if not exists display_name text;
alter table public.profiles add column if not exists avatar_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists created_at timestamptz default now();

create table if not exists public.videos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  caption text, video_url text not null, thumbnail_url text, created_at timestamptz default now()
);
alter table public.videos add column if not exists caption text;
alter table public.videos add column if not exists video_url text;
alter table public.videos add column if not exists thumbnail_url text;
alter table public.videos add column if not exists created_at timestamptz default now();

create table if not exists public.likes (
 user_id uuid references public.profiles(id) on delete cascade,
 video_id uuid references public.videos(id) on delete cascade,
 created_at timestamptz default now(), primary key(user_id,video_id)
);
create table if not exists public.comments (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references public.profiles(id) on delete cascade,
 video_id uuid not null references public.videos(id) on delete cascade,
 content text not null, created_at timestamptz default now()
);
create table if not exists public.follows (
 follower_id uuid references public.profiles(id) on delete cascade,
 following_id uuid references public.profiles(id) on delete cascade,
 created_at timestamptz default now(), primary key(follower_id,following_id),
 check(follower_id <> following_id)
);

create index if not exists avnex_videos_created_idx on public.videos(created_at desc);
create index if not exists avnex_comments_video_idx on public.comments(video_id);

alter table public.profiles enable row level security;
alter table public.videos enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;

-- Policies for storage are created by the earlier storage setup SQL.
-- Existing table policies are intentionally not dropped here.
