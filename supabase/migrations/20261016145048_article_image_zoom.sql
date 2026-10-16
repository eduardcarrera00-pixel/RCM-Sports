-- AE SPORTS: persist article image Zoom / Sin zoom without changing existing framing.
BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS image_zoom boolean NOT NULL DEFAULT true;

COMMIT;
