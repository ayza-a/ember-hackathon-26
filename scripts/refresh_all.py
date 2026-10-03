"""Re-run every data import (stops -> GTFS -> places). In production this would run nightly via a scheduler.
OWNER: workstream 4 (Discovery).

Usage: python scripts/refresh_all.py [--refresh]   (--refresh re-downloads the GTFS zip)
"""
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent

for script in ("import_ember_stops.py", "import_gtfs.py", "import_osm.py"):
    print(f"== {script}")
    subprocess.run([sys.executable, str(HERE / script), *sys.argv[1:]], check=True)
