"""
Unit tests for scripts/validate_data.py. Most cases build a throwaway temp
JSON file with one thing wrong and assert validate_data() rejects it, to
pin down exactly which malformed shapes the validator is supposed to catch.
"""
import unittest
import json
import tempfile
import os
import sys
from pathlib import Path

# Add scripts directory to module path
sys.path.insert(0, str(Path(__file__).parent.parent / "scripts"))
from validate_data import validate_data

class TestValidateData(unittest.TestCase):
    def setUp(self):
        self.temp_files = []

    def tearDown(self):
        for filepath in self.temp_files:
            if os.path.exists(filepath):
                os.remove(filepath)

    def _create_temp_json(self, content):
        fd, path = tempfile.mkstemp(suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            if isinstance(content, str):
                f.write(content)
            else:
                json.dump(content, f)
        self.temp_files.append(path)
        return path

    def test_valid_data_file(self):
        valid_json = [
            {
                "version": "581.80",
                "bugs": [
                    {
                        "description": "F1 25: Performance optimizations when using DLSS Frame Generation [5422722]",
                        "fixed_in": "Fixed (581.80)"
                    },
                    {
                        "description": "Vulkan apps crash when launched on Core 2 Duo / Core 2 Quad CPUs [5509161]",
                        "fixed_in": None
                    }
                ]
            }
        ]
        path = self._create_temp_json(valid_json)
        self.assertTrue(validate_data(path))

    # Unlike the other tests, which use synthetic temp files, this runs the
    # validator against the real drivers.json - a regression guard so a
    # future manual edit to the live data file fails CI immediately instead
    # of shipping a broken driver card to the site.
    def test_actual_drivers_json(self):
        drivers_data_path = Path(__file__).parent.parent / "src" / "_data" / "drivers.json"
        self.assertTrue(validate_data(drivers_data_path))

    def test_invalid_json_syntax(self):
        path = self._create_temp_json("[{ invalid json")
        self.assertFalse(validate_data(path))

    def test_non_list_root(self):
        path = self._create_temp_json({"version": "581.80", "bugs": []})
        self.assertFalse(validate_data(path))

    def test_missing_version(self):
        data = [{"bugs": []}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_invalid_version_format(self):
        data = [{"version": "581.8", "bugs": []}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

        data_letters = [{"version": "581.80a", "bugs": []}]
        path_letters = self._create_temp_json(data_letters)
        self.assertFalse(validate_data(path_letters))

    def test_duplicate_version(self):
        data = [
            {"version": "581.80", "bugs": []},
            {"version": "581.80", "bugs": []}
        ]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_missing_bugs(self):
        data = [{"version": "581.80"}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

    def test_invalid_bug_structure(self):
        # Bug missing description
        data1 = [{"version": "581.80", "bugs": [{"fixed_in": None}]}]
        path1 = self._create_temp_json(data1)
        self.assertFalse(validate_data(path1))

        # Empty description
        data2 = [{"version": "581.80", "bugs": [{"description": "   ", "fixed_in": None}]}]
        path2 = self._create_temp_json(data2)
        self.assertFalse(validate_data(path2))

        # Invalid fixed_in type (e.g., number instead of string/null)
        data3 = [{"version": "581.80", "bugs": [{"description": "Test bug", "fixed_in": 123}]}]
        path3 = self._create_temp_json(data3)
        self.assertFalse(validate_data(path3))

    def test_unexpected_keys(self):
        data = [{"version": "581.80", "bugs": [], "extra_key": "val"}]
        path = self._create_temp_json(data)
        self.assertFalse(validate_data(path))

if __name__ == "__main__":
    unittest.main()
