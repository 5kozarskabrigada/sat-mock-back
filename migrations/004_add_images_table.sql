-- Migration: Add images table for storing exam question images
-- Replaces Supabase Storage with PostgreSQL bytea storage
-- Date: 2026-05-12

-- Create images table
CREATE TABLE IF NOT EXISTS images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    filename VARCHAR(255) NOT NULL,
    content_type VARCHAR(100) NOT NULL,
    file_size INTEGER NOT NULL,
    data BYTEA NOT NULL,
    uploaded_by UUID REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_images_uploaded_by ON images(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_images_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_images_updated_at
    BEFORE UPDATE ON images
    FOR EACH ROW
    EXECUTE FUNCTION update_images_updated_at();

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON images TO PUBLIC;

COMMENT ON TABLE images IS 'Stores uploaded images (question images, etc.) as binary data';
COMMENT ON COLUMN images.data IS 'Binary image data (BYTEA)';
COMMENT ON COLUMN images.content_type IS 'MIME type (e.g., image/jpeg, image/png)';
