#!/bin/bash

# Target 1: Events Domain
TARGET1="src/styles/domains/events.css"
sed -i '' 's/#ffffff/var(--text-primary)/g' "$TARGET1"
sed -i '' 's/#fff/var(--text-primary)/g' "$TARGET1"
sed -i '' 's/#d1d5db/var(--text-secondary)/g' "$TARGET1"
sed -i '' 's/#9ca3af/var(--text-tertiary)/g' "$TARGET1"
sed -i '' 's/#6b7280/var(--text-muted)/g' "$TARGET1"
sed -i '' 's/#000000/var(--bg-base)/g' "$TARGET1"
sed -i '' 's/#1f2937/var(--bg-surface-1)/g' "$TARGET1"
sed -i '' 's/#374151/var(--bg-surface-2)/g' "$TARGET1"
sed -i '' 's/#4b5563/var(--bg-surface-3)/g' "$TARGET1"

# Target 2: MonthlyWebzine (Billboard)
TARGET2="src/pages/v2/components/MonthlyBillboard/MonthlyWebzine.css"

# Zinc Colors (Text/Bg)
sed -i '' 's/#f4f4f5/var(--text-primary)/g' "$TARGET2"
sed -i '' 's/#d4d4d8/var(--text-secondary)/g' "$TARGET2"
sed -i '' 's/#a1a1aa/var(--text-tertiary)/g' "$TARGET2"
sed -i '' 's/#71717a/var(--text-muted)/g' "$TARGET2"
sed -i '' 's/#52525b/var(--text-disabled)/g' "$TARGET2"
sed -i '' 's/#18181b/var(--bg-card)/g' "$TARGET2"

# Brand Colors
sed -i '' 's/#fbbf24/var(--color-amber-400)/g' "$TARGET2"
sed -i '' 's/#3b82f6/var(--color-blue-500)/g' "$TARGET2"
sed -i '' 's/#f43f5e/var(--color-rose-500)/g' "$TARGET2"
sed -i '' 's/#60a5fa/var(--color-blue-400)/g' "$TARGET2"
sed -i '' 's/#93c5fd/var(--color-blue-300)/g' "$TARGET2"
sed -i '' 's/#fb7185/var(--color-rose-400)/g' "$TARGET2"
sed -i '' 's/#fca5a5/var(--color-rose-300)/g' "$TARGET2"

# Base Colors
sed -i '' 's/#ffffff/var(--text-primary)/g' "$TARGET2"
sed -i '' 's/#fff/var(--text-primary)/g' "$TARGET2"
sed -i '' 's/#000000/var(--bg-base)/g' "$TARGET2"
sed -i '' 's/#000/var(--bg-base)/g' "$TARGET2"

echo "Migration of $TARGET1 and $TARGET2 complete."
