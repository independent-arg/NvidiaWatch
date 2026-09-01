#!/usr/bin/env python3
"""
Validate drivers.json against the schema the site (Eleventy templates) and
the chart generator (generate_chart.py) both assume. Run by CI on every
push/PR (see .github/workflows/validate-and-deploy.yml) so a malformed
hand-edit to the data fails the build instead of silently breaking the live
site.

This intentionally rejects unexpected keys, not just missing required ones -
drivers.json is edited by hand, so a typo'd key (e.g. "fixed" instead of
"fixed_in") should be caught here rather than becoming a silently-ignored
field that quietly does nothing on the site.

Usage:
    python scripts/validate_data.py [path/to/drivers.json]
"""
import json
import re
import sys
import argparse
from pathlib import Path

# NVIDIA driver versions always have exactly two decimal digits (e.g.
# "581.80", not "581.8"). Enforcing that here keeps formatVersion() in
# script.js from ever needing to reformat a value at display time.
VERSION_REGEX = re.compile(r"^\d+\.\d{2}$")

def validate_data(filepath):
    """
    Check that `filepath` is a JSON array of driver entries, where each entry
    has exactly {"version": "X.YY", "bugs": [...]}, and each bug has exactly
    {"description": str, "fixed_in": str or null}. Prints every problem found
    (rather than stopping at the first one) so a contributor can fix a whole
    PR's worth of issues in one pass instead of one CI run per typo. Returns
    True only if the whole file is valid.
    """
    path = Path(filepath)
    if not path.exists():
        print(f"Error: File '{filepath}' does not exist.")
        return False

    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
    except json.JSONDecodeError as e:
        print(f"Error: Invalid JSON syntax in '{filepath}': {e}")
        return False
    except Exception as e:
        print(f"Error reading '{filepath}': {e}")
        return False

    if not isinstance(data, list):
        print(f"Error: Root element in '{filepath}' must be a JSON array [].")
        return False

    seen_versions = set()
    has_errors = False

    for idx, entry in enumerate(data):
        location = f"Entry {idx}"
        if isinstance(entry, dict) and "version" in entry:
            location += f" (Version: {entry['version']})"

        if not isinstance(entry, dict):
            print(f"Error at {location}: Entry must be an object/dict.")
            has_errors = True
            continue

        allowed_entry_keys = {"version", "bugs"}
        extra_keys = set(entry.keys()) - allowed_entry_keys
        if extra_keys:
            print(f"Error at {location}: Contains unexpected key(s): {', '.join(sorted(extra_keys))}")
            has_errors = True

        version = entry.get("version")
        if version is None:
            print(f"Error at {location}: Missing required field 'version'.")
            has_errors = True
        elif not isinstance(version, str):
            print(f"Error at {location}: 'version' must be a string.")
            has_errors = True
        else:
            if not VERSION_REGEX.match(version):
                print(f"Error at {location}: 'version' '{version}' is invalid. Must be digits with exactly 2 decimal places (e.g. '581.80').")
                has_errors = True

            # Two entries for the same driver version would silently merge or
            # shadow each other on the site (script.js keys cards by version),
            # so catch it here instead of debugging a "missing" driver later.
            if version in seen_versions:
                print(f"Error at {location}: Duplicate version '{version}' detected.")
                has_errors = True
            else:
                seen_versions.add(version)

        bugs = entry.get("bugs")
        if bugs is None:
            print(f"Error at {location}: Missing required field 'bugs'.")
            has_errors = True
        elif not isinstance(bugs, list):
            print(f"Error at {location}: 'bugs' field must be an array.")
            has_errors = True
        else:
            for b_idx, bug in enumerate(bugs):
                bug_location = f"{location}, Bug index {b_idx}"
                if not isinstance(bug, dict):
                    print(f"Error at {bug_location}: Bug item must be an object.")
                    has_errors = True
                    continue

                allowed_bug_keys = {"description", "fixed_in"}
                extra_bug_keys = set(bug.keys()) - allowed_bug_keys
                if extra_bug_keys:
                    print(f"Error at {bug_location}: Contains unexpected key(s): {', '.join(sorted(extra_bug_keys))}")
                    has_errors = True

                if "description" not in bug:
                    print(f"Error at {bug_location}: Missing required field 'description'.")
                    has_errors = True
                elif not isinstance(bug["description"], str) or not bug["description"].strip():
                    print(f"Error at {bug_location}: 'description' must be a non-empty string.")
                    has_errors = True

                # fixed_in is required but nullable: null means "still pending",
                # a string (typically "Fixed (X.YY)") means resolved. The site
                # (script.js) and the chart (generate_chart.py) both treat
                # `fixed_in !== null` as the sole "is this fixed?" check.
                if "fixed_in" not in bug:
                    print(f"Error at {bug_location}: Missing required field 'fixed_in'.")
                    has_errors = True
                else:
                    fixed_in = bug["fixed_in"]
                    if fixed_in is not None and not isinstance(fixed_in, str):
                        print(f"Error at {bug_location}: 'fixed_in' must be a string or null.")
                        has_errors = True

    if has_errors:
        return False

    print(f"Validation successful! '{filepath}' is valid. Checked {len(data)} driver versions.")
    return True

def main():
    parser = argparse.ArgumentParser(description="Validate drivers.json structure and formatting.")
    parser.add_argument("file", nargs="?", default="src/_data/drivers.json", help="Path to drivers.json file to validate (default: src/_data/drivers.json)")
    args = parser.parse_args()

    success = validate_data(args.file)
    sys.exit(0 if success else 1)

if __name__ == "__main__":
    main()
