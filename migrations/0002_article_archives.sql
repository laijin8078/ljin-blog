ALTER TABLE private_posts ADD COLUMN archive_html TEXT;

CREATE TABLE archived_posts (
    slug TEXT PRIMARY KEY COLLATE NOCASE,
    private_id TEXT NOT NULL
);

CREATE TABLE archived_assets (
    path TEXT PRIMARY KEY COLLATE NOCASE,
    slug TEXT NOT NULL REFERENCES archived_posts (slug)
);

CREATE TABLE private_post_images (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL REFERENCES private_posts (id) ON DELETE CASCADE,
    content_type TEXT NOT NULL,
    data BLOB NOT NULL
);

CREATE INDEX private_post_images_by_post ON private_post_images (post_id);
