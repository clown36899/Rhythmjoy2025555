#!/bin/bash
# Target: Board Domain
TARGET="src/pages/board/board.css"

# Text
sed -i '' 's/#ffffff/var(--text-primary)/g' "$TARGET"
sed -i '' 's/#fff/var(--text-primary)/g' "$TARGET"
sed -i '' 's/#9ca3af/var(--text-tertiary)/g' "$TARGET"
sed -i '' 's/#a8a8a8/var(--text-tertiary)/g' "$TARGET"
sed -i '' 's/#999/var(--text-muted)/g' "$TARGET"
sed -i '' 's/#666/var(--text-muted)/g' "$TARGET"
sed -i '' 's/#4b5563/var(--text-secondary)/g' "$TARGET"

# Backgrounds
sed -i '' 's/#1a1a1a/var(--bg-card)/g' "$TARGET"
sed -i '' 's/#1f1f1f/var(--bg-surface-1)/g' "$TARGET"
sed -i '' 's/#252525/var(--bg-surface-2)/g' "$TARGET"
sed -i '' 's/#2a2a2a/var(--bg-surface-2)/g' "$TARGET"
sed -i '' 's/#333/var(--bg-surface-3)/g' "$TARGET"

# Colors
sed -i '' 's/#3b82f6/var(--color-blue-500)/g' "$TARGET"
sed -i '' 's/#ef4444/var(--color-red-500)/g' "$TARGET"
sed -i '' 's/#dc2626/var(--color-red-600)/g' "$TARGET"
sed -i '' 's/#f87171/var(--color-red-400)/g' "$TARGET"
