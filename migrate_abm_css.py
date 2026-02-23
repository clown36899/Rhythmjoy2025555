import re

source_path = 'src/pages/v2/styles/AdminBillboardModal.css'
target_path = 'src/styles/domains/events.css'

with open(source_path, 'r') as f:
    content = f.read()

# Replace .abm- with .ABM-
content = content.replace('.abm-', '.ABM-')

# Adjust root selectors for :scope
# Regex to match start of line or space before .ABM-sub-overlay, etc.
# But simply replacing string is usually safe if specific enough.
content = content.replace('.ABM-sub-overlay', ':scope.ABM-sub-overlay')
content = content.replace('.ABM-super-overlay', ':scope.ABM-super-overlay')
content = content.replace('.ABM-loading-overlay', ':scope.ABM-loading-overlay')

# Wrap in scope
scoped_content = f"""
/* ==========================================================================
   AdminBillboardModal Scope (ABM-)
   ========================================================================== */
@scope (.AdminBillboardModal) {{
{content}
}}
"""

with open(target_path, 'a') as f:
    f.write(scoped_content)

print("Migration appended to events.css")
