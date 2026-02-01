import re

file_path = 'src/pages/v2/components/AdminBillboardModal.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update Import
content = content.replace('"../styles/AdminBillboardModal.css"', '"../../../styles/domains/events.css"')

# 2. Global replace abm- with ABM-
content = content.replace('abm-', 'ABM-')

# 3. Add AdminBillboardModal class to roots
# Note: Since we already replaced abm- with ABM-, we look for ABM- class names.
# Using regex to handle potential extra spaces or nuances, though simple string replace might work if format is consistent.
# The file showed: className="abm-sub-overlay" -> className="ABM-sub-overlay" (after step 2)

content = content.replace('className="ABM-loading-overlay"', 'className="AdminBillboardModal ABM-loading-overlay"')
content = content.replace('className="ABM-sub-overlay"', 'className="AdminBillboardModal ABM-sub-overlay"')
content = content.replace('className="ABM-super-overlay"', 'className="AdminBillboardModal ABM-super-overlay"')
content = content.replace('className="ABM-success-overlay"', 'className="AdminBillboardModal ABM-success-overlay"')

# Check for any dynamic usage that might have been missed or malformed
# e.g. className={`ABM-toggle-switch ${...}`} -> pure string literal not affected, but template literal checks.
# Template literals use backticks.
# Step 2 handles 'abm-' inside strings too.

with open(file_path, 'w') as f:
    f.write(content)

print("AdminBillboardModal.tsx updated.")
