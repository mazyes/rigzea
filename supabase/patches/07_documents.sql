-- =============================================================================
-- RIGZEA patch 07 — Contract templates
-- Personal number on contacts, so sale contracts and acts fill in automatically.
-- Saved documents reuse public.contracts (data.doc_type tells the template).
-- Idempotent: safe to run more than once in the Supabase SQL editor.
-- =============================================================================

alter table public.owners add column if not exists personal_id text;
