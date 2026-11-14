-- Which template each export used (CLAUDE.md section 9, F15).
alter table public.exports
  add column template text not null default 'slate'
  check (template in ('slate', 'terminal', 'axis', 'band', 'tint'));
