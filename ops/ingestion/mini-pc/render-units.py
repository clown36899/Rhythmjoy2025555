#!/usr/bin/env python3
"""Translate the existing six launchd schedules; never enable units here."""
import pathlib
import plistlib
import sys

repo = pathlib.Path(__file__).resolve().parents[3]
output = pathlib.Path(sys.argv[1])
output.mkdir(parents=True, exist_ok=True)
profiles = {"": "swing-1", "-priority2": "swing-2", "-priority3": "benefit-3",
            "-priority4": "benefit-4", "-salsa-public": "salsa-public", "-salsa-regional": "salsa-regional"}
for suffix, name in profiles.items():
    with (repo / f"scripts/com.rhythmjoy.codex-ingestion{suffix}.plist").open("rb") as f:
        data = plistlib.load(f)
    settings = {k: v for k, v in data.get("EnvironmentVariables", {}).items()
                if k.startswith("INGESTION_")}
    settings["INGESTION_ENGINE"] = "native"
    (output / f"{name}.env").write_text("".join(f'{k}={v}\n' for k, v in settings.items()))
    times = data["StartCalendarInterval"]
    if isinstance(times, dict):
        times = [times]
    calendar = "".join(f'OnCalendar=*-*-* {t["Hour"]:02}:{t["Minute"]:02}:00 Asia/Seoul\n' for t in times)
    (output / f"rhythmjoy-ingestion-{name}.timer").write_text(
        f"[Unit]\nDescription=Rhythmjoy ingestion {name}\n\n[Timer]\n{calendar}"
        f"Unit=rhythmjoy-ingestion@{name}.service\nPersistent=true\nAccuracySec=1s\n\n"
        "[Install]\nWantedBy=timers.target\n")
(output / "rhythmjoy-ingestion@.service").write_text("""[Unit]
Description=Rhythmjoy ingestion (%i)
After=network-online.target
Wants=network-online.target
ConditionPathExists=%h/.config/rhythmjoy-ingestion/enabled

[Service]
Type=oneshot
EnvironmentFile=%h/.config/rhythmjoy-ingestion/runtime.env
EnvironmentFile=%h/.config/rhythmjoy-ingestion/%i.env
WorkingDirectory=%h/.local/share/rhythmjoy-ingestion/runtime
ExecStart=/bin/bash %h/.local/share/rhythmjoy-ingestion/runtime/scripts/run-ingestion.sh
Nice=10
CPUWeight=20
CPUQuota=100%
MemoryHigh=2G
MemoryMax=3G
UMask=0077
TimeoutStartSec=100min
TimeoutStopSec=30s
KillMode=control-group
SuccessExitStatus=75
StandardOutput=journal
StandardError=journal
""")
print(f"Rendered {len(profiles)} schedules; none enabled")
