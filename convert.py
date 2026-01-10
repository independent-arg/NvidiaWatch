import pandas as pd
import json
import re
import argparse
import sys
import os

def parse_args():
    parser = argparse.ArgumentParser(description="Convert NVIDIA Driver ODS to JSON")
    parser.add_argument("input_file", help="Path to input .ods file")
    parser.add_argument("output_file", help="Path to output .json file")
    return parser.parse_args()

def extract_fixed_version(status_text):
    if not isinstance(status_text, str):
        return None
    
    # Check for "External"
    if "external" in status_text.lower():
        return "External"
    
    # Extract version number like 536.99
    match = re.search(r"(\d{3}\.\d{2})", status_text)
    if match:
        return match.group(1)
    
    return None

def main():
    args = parse_args()
    
    if not os.path.exists(args.input_file):
        print(f"Error: Input file '{args.input_file}' not found.")
        sys.exit(1)

    try:
        # Read ODS file. Assuming first row is header.
        df = pd.read_excel(args.input_file, engine="odf")
        
        # Normalize column names to lower case
        df.columns = [str(col).strip().lower() for col in df.columns]
        
        # Helper to find column
        def find_col(keywords):
            for col in df.columns:
                if any(k in col for k in keywords):
                    return col
            return None

        ver_col = find_col(["version", "driver"])
        issue_col = find_col(["issue", "bug", "description"])
        status_col = find_col(["status", "state"])

        if not (ver_col and issue_col and status_col):
            if len(df.columns) >= 3:
                print("Warning: Could not identify columns by name. Using indices 0, 1, 2.")
                ver_col = df.columns[0]
                issue_col = df.columns[1]
                status_col = df.columns[2]
            else:
                print("Error: Could not identify Version, Issue, and Status columns.")
                sys.exit(1)

        print(f"Using columns: Version='{ver_col}', Issue='{issue_col}', Status='{status_col}'")

        # Clean/Format Version column
        def clean_version(v):
            if pd.isna(v): return v
            try:
                f = float(v)
                return "{:.2f}".format(f)
            except ValueError:
                return str(v)
        
        df[ver_col] = df[ver_col].apply(clean_version)

        # Drop NaNs in version
        df = df.dropna(subset=[ver_col])
        
        grouped_data = []
        
        for version, group in df.groupby(ver_col, sort=False):
            bugs = []
            for _, row in group.iterrows():
                desc = row[issue_col]
                raw_status = row[status_col]
                
                if pd.isna(desc): desc = ""
                if pd.isna(raw_status): raw_status = "Pending"
                
                desc = str(desc).strip()
                raw_status = str(raw_status).strip()
                
                # Logic for status
                status_lower = raw_status.lower()
                is_fixed = "fixed" in status_lower
                
                status_key = "fixed" if is_fixed else "pending"
                fixed_version = extract_fixed_version(raw_status) if is_fixed else None
                
                bug_entry = {
                    "description": desc,
                    "status": status_key,
                    "fixed_in_version": fixed_version,
                    "original_status_text": raw_status
                }
                bugs.append(bug_entry)
            
            grouped_data.append({
                "version": version,
                "bugs": bugs
            })
            
        # Write to JSON
        with open(args.output_file, 'w') as f:
            json.dump(grouped_data, f, indent=2)
            
        print(f"Successfully converted '{args.input_file}' to '{args.output_file}'")
        
    except Exception as e:
        print(f"Error during conversion: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
