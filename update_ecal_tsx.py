import re

file_path = 'src/pages/v2/components/EventCalendar.tsx'

with open(file_path, 'r') as f:
    content = f.read()

# 1. Update Import
content = content.replace('"../../../styles/components/EventCalendar.css"', '"../../../styles/domains/events.css"')

# 2. Global replacements
content = content.replace('cal-', 'ECAL-')
content = content.replace('calendar-', 'ECAL-')

# 3. Add Root Class
# The root element had className="calendar-main-container" which became "ECAL-main-container"
# We need to prepend EventCalendar.
content = content.replace('className="ECAL-main-container"', 'className="EventCalendar ECAL-main-container"')

with open(file_path, 'w') as f:
    f.write(content)

print("EventCalendar.tsx updated.")
