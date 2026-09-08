-- Run in the Supabase SQL editor.
--
-- Adds optional rubric-based grading. An assignment's rubric is a JSONB
-- array of criteria: [{ "id": "uuid-ish string", "name": "Thesis", "maxPoints": 10 }, ...].
-- A graded submission's rubric_scores is a JSONB object keyed by criterion
-- id: { "<criterionId>": { "score": 8, "comment": "Clear but narrow" } }.
-- Both are optional — assignments without a rubric grade exactly as before
-- (a single numeric grade), this is purely additive.

alter table public.assignments
  add column if not exists rubric jsonb;

alter table public.submissions
  add column if not exists rubric_scores jsonb;
