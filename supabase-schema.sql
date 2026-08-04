-- Virtual Hamroh V3.1
-- Run this once in Supabase SQL Editor.
create table if not exists chat_messages (
  id text primary key,
  user_id text not null,
  role text not null check (role in ('user','assistant')),
  text text not null,
  emotion text,
  timestamp timestamptz not null default now()
);
create index if not exists chat_messages_user_idx on chat_messages(user_id, timestamp desc);

create table if not exists reminders (
  id text primary key,
  user_id text not null,
  text text not null,
  time_string text not null default '',
  date_time timestamptz not null,
  triggered boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists reminders_user_idx on reminders(user_id, created_at desc);

create table if not exists moods (
  id text primary key,
  user_id text not null,
  mood text not null,
  note text not null,
  date date not null,
  timestamp timestamptz not null default now()
);
create index if not exists moods_user_idx on moods(user_id, timestamp desc);

create table if not exists memories (
  id text primary key,
  user_id text not null,
  content text not null,
  category text not null default 'general',
  importance int not null default 5 check (importance between 1 and 10),
  created_at timestamptz not null default now()
);
create index if not exists memories_user_idx on memories(user_id, created_at desc);
