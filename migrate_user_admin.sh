#!/bin/bash

# Target 1: User (MyActivitiesPage)
TARGET_USER="src/pages/user/styles/MyActivitiesPage.css"

sed -i '' 's/#000000/var(--bg-base)/g' "$TARGET_USER"
sed -i '' 's/#000/var(--bg-base)/g' "$TARGET_USER"
sed -i '' 's/#252525/var(--bg-card)/g' "$TARGET_USER"
sed -i '' 's/#fff/var(--text-primary)/g' "$TARGET_USER"
sed -i '' 's/#9ca3af/var(--text-tertiary)/g' "$TARGET_USER"
sed -i '' 's/#999/var(--text-tertiary)/g' "$TARGET_USER"
sed -i '' 's/#6b7280/var(--text-muted)/g' "$TARGET_USER"
sed -i '' 's/#3b82f6/var(--color-blue-500)/g' "$TARGET_USER"
sed -i '' 's/#22c55e/var(--color-green-500)/g' "$TARGET_USER"
sed -i '' 's/#00ddff/var(--color-cyan-400)/g' "$TARGET_USER"
sed -i '' 's/#a855f7/var(--color-purple-500)/g' "$TARGET_USER"
sed -i '' 's/#10b981/var(--color-emerald-500)/g' "$TARGET_USER"
sed -i '' 's/#ffaa00/var(--color-orange-500)/g' "$TARGET_USER"


# Target 2: Admin (All CSS in src/pages/admin)
find src/pages/admin -name "*.css" | while read file; do
    echo "Processing $file"
    
    # Backgrounds
    sed -i '' 's/#111827/var(--bg-base)/g' "$file"
    sed -i '' 's/#1f2937/var(--bg-surface-1)/g' "$file"
    sed -i '' 's/#374151/var(--bg-surface-2)/g' "$file" # Also Borders often
    
    # Text
    sed -i '' 's/#ffffff/var(--text-primary)/g' "$file"
    sed -i '' 's/#fff/var(--text-primary)/g' "$file"
    sed -i '' 's/#e5e7eb/var(--text-secondary)/g' "$file" # Gray 200
    sed -i '' 's/#9ca3af/var(--text-tertiary)/g' "$file" # Gray 400
    sed -i '' 's/#6b7280/var(--text-muted)/g' "$file" # Gray 500
    sed -i '' 's/#666/var(--text-muted)/g' "$file"

    # Borders
    sed -i '' 's/#eee/var(--border-light)/g' "$file"
    
    # Colors
    sed -i '' 's/#3b82f6/var(--color-blue-500)/g' "$file"
    sed -i '' 's/#ef4444/var(--color-red-500)/g' "$file"
    
done

echo "User and Admin Migration Completed"
