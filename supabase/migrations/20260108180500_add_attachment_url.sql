-- Add attachment_url field to separate from youtube_url
-- youtube_url: YouTube video/playlist URL
-- attachment_url: General reference link (Wikipedia, articles, etc.)

-- Add to learning_resources
ALTER TABLE learning_resources 
ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Add to history_nodes
ALTER TABLE history_nodes 
ADD COLUMN IF NOT EXISTS attachment_url TEXT;

-- Add index for searching
CREATE INDEX IF NOT EXISTS idx_learning_resources_attachment_url 
ON learning_resources(attachment_url) WHERE attachment_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_history_nodes_attachment_url 
ON history_nodes(attachment_url) WHERE attachment_url IS NOT NULL;
