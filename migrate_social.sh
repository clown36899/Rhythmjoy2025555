#!/bin/bash

# Target Files (CSS in src/pages/social)
# Using find to get all css files in src/pages/social
find src/pages/social -name "*.css" | while read file; do
    echo "Processing $file"
    
    # Text
    sed -i '' 's/#ffffff/var(--text-primary)/g' "$file"
    sed -i '' 's/#fff/var(--text-primary)/g' "$file"
    sed -i '' 's/#ccc/var(--text-secondary)/g' "$file"
    sed -i '' 's/#ddd/var(--text-secondary)/g' "$file"
    sed -i '' 's/#d1d5db/var(--text-secondary)/g' "$file"
    sed -i '' 's/#888/var(--text-muted)/g' "$file"
    sed -i '' 's/#aaa/var(--text-tertiary)/g' "$file"
    sed -i '' 's/#9ca3af/var(--text-tertiary)/g' "$file"
    sed -i '' 's/#666/var(--text-muted)/g' "$file"
    sed -i '' 's/#525252/var(--text-secondary)/g' "$file"

    # Backgrounds
    sed -i '' 's/#000000/var(--bg-base)/g' "$file"
    sed -i '' 's/#000/var(--bg-base)/g' "$file"
    sed -i '' 's/#121212/var(--bg-base)/g' "$file"
    sed -i '' 's/#1e1e1e/var(--bg-card)/g' "$file"
    sed -i '' 's/#1f1f1f/var(--bg-card)/g' "$file"
    sed -i '' 's/#222/var(--bg-surface-1)/g' "$file"
    sed -i '' 's/#262626/var(--bg-surface-1)/g' "$file"
    sed -i '' 's/#2a2a2a/var(--bg-surface-2)/g' "$file"
    sed -i '' 's/#333/var(--bg-surface-3)/g' "$file"
    sed -i '' 's/#444/var(--bg-surface-3)/g' "$file"
    sed -i '' 's/#1f2937/var(--bg-surface-1)/g' "$file"
    sed -i '' 's/#374151/var(--bg-surface-2)/g' "$file"
    sed -i '' 's/#111827/var(--bg-base)/g' "$file"
    
    # Borders
    sed -i '' 's/#555/var(--border-primary)/g' "$file"

    # Colors
    sed -i '' 's/#ef4444/var(--color-red-500)/g' "$file"
    sed -i '' 's/#ff4b2b/var(--color-red-500)/g' "$file"
    sed -i '' 's/#10b981/var(--color-emerald-500)/g' "$file"
    sed -i '' 's/#059669/var(--color-emerald-600)/g' "$file"
    sed -i '' 's/#fbbf24/var(--color-amber-400)/g' "$file"
    sed -i '' 's/#ffd700/var(--color-yellow-400)/g' "$file"
    sed -i '' 's/#00d4ff/var(--color-cyan-400)/g' "$file"
    sed -i '' 's/#3b82f6/var(--color-blue-500)/g' "$file"
    sed -i '' 's/#2563eb/var(--color-blue-600)/g' "$file"
    sed -i '' 's/#1d4ed8/var(--color-blue-700)/g' "$file"
    
    # Misc (WeeklySocial genres)
    sed -i '' 's/#f97316/var(--color-orange-500)/g' "$file"
    sed -i '' 's/#f59e0b/var(--color-amber-500)/g' "$file"
    sed -i '' 's/#eab308/var(--color-yellow-500)/g' "$file"
    sed -i '' 's/#84cc16/var(--color-lime-500)/g' "$file"
    sed -i '' 's/#22c55e/var(--color-green-500)/g' "$file"
    sed -i '' 's/#14b8a6/var(--color-teal-500)/g' "$file"
    sed -i '' 's/#06b6d4/var(--color-cyan-500)/g' "$file"
    sed -i '' 's/#0ea5e9/var(--color-sky-500)/g' "$file"
    sed -i '' 's/#6366f1/var(--color-indigo-500)/g' "$file"
    sed -i '' 's/#8b5cf6/var(--color-violet-500)/g' "$file"
    sed -i '' 's/#a855f7/var(--color-purple-500)/g' "$file"
    sed -i '' 's/#d946ef/var(--color-fuchsia-500)/g' "$file"
    sed -i '' 's/#ec4899/var(--color-pink-500)/g' "$file"
    sed -i '' 's/#16a34a/var(--color-green-600)/g' "$file"
    sed -i '' 's/#15803d/var(--color-green-700)/g' "$file"

done
