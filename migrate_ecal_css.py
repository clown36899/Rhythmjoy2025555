import re

source_path = 'src/pages/calendar/styles/FullEventCalendar.css'
target_path = 'src/styles/domains/events.css'

with open(source_path, 'r') as f:
    content = f.read()

# Transformations
# 1. Prefix replacement
content = content.replace('.cal-', '.ECAL-')
content = content.replace('.calendar-', '.ECAL-')

# 2. Scope replacement
content = content.replace('.event-calendar', ':scope')

# 3. Handle FullCalendar specific if any ( FullEventCalendar.css line 1036 .full-calendar-container )
# Replaced by step 1 (.full-ECAL-container ?) No, .full-calendar- becomes .full-ECAL-.
# But typescript might expect .ECAL-full-container ?
# The TSX update will replace 'full-calendar-' with 'full-ECAL-'. Consistency matches.

# Wrap in scope
scoped_content = f"""
/* ==========================================================================
   EventCalendar Scope (ECAL-)
   ========================================================================== */
@scope (.EventCalendar) {{
{content}
}}
"""

with open(target_path, 'a') as f:
    f.write(scoped_content)

print("ECAL migration appended to events.css")
