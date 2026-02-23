#!/bin/bash
TARGET="src/pages/user/styles/RegisteredEvents.css"

sed -i '' 's/#1a1a1a/var(--bg-card)/g' "$TARGET"
sed -i '' 's/#333/var(--border-default)/g' "$TARGET"
sed -i '' 's/#eee/var(--text-primary)/g' "$TARGET"
sed -i '' 's/#888/var(--text-tertiary)/g' "$TARGET"
