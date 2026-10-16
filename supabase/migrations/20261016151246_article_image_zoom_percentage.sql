-- AE SPORTS: manual percentage zoom for article cover images.
BEGIN;

ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS image_zoom_pct integer NOT NULL DEFAULT 100;

ALTER TABLE public.articles
  DROP CONSTRAINT IF EXISTS ae_articles_image_zoom_pct_range;

ALTER TABLE public.articles
  ADD CONSTRAINT ae_articles_image_zoom_pct_range
  CHECK (image_zoom_pct BETWEEN 1 AND 300);

COMMIT;
