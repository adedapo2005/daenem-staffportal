PRAGMA foreign_keys = ON;

ALTER TABLE social_media_assets ADD COLUMN public_token_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_social_media_public_token ON social_media_assets(public_token_hash) WHERE public_token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_social_media_brand_created ON social_media_assets(brand_id, created_at DESC);
