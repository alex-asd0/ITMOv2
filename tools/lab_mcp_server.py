#!/usr/bin/env python3
"""
Simple MCP stdio server for Practice 4.

Provides one tool: run_lab_tests
- input: { path: str, targets?: list[str] }
- default targets: ["install", "test"]
- output: { ok: bool, runs: [ {target, returncode, stdout, stderr} ] }

Also demonstrates error handling on invalid input.
"""

import json
import os
import subprocess
import sys


def run_make_targets(path: str, targets):
    res = {"path": path, "targets": targets, "runs": [], "ok": True}
    if not os.path.isdir(path):
        return {"ok": False, "error": f"path not found: {path}"}
    for t in targets:
        cmd = ["make", "-C", path, t]
        p = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        res["runs"].append({
            "target": t,
            "returncode": p.returncode,
            "stdout": p.stdout,
            "stderr": p.stderr,
        })
        if p.returncode != 0:
            res["ok"] = False
    return res


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
        except Exception as e:
            print(json.dumps({"error": f"invalid json: {e}"}))
            sys.stdout.flush()
            continue

        method = req.get("method")
        if method == "run_lab_tests":
            path = req.get("path") or "practices/practice_03/lab"
            targets = req.get("targets") or ["install", "test"]
            # Validate inputs
            if not isinstance(path, str):
                print(json.dumps({"error": "path must be string"}))
                sys.stdout.flush()
                continue
            if not isinstance(targets, list) or not all(isinstance(x, str) for x in targets):
                print(json.dumps({"error": "targets must be list of strings"}))
                sys.stdout.flush()
                continue
            res = run_make_targets(path, targets)
            print(json.dumps({"result": res}))
            sys.stdout.flush()
        else:
            print(json.dumps({"error": "unknown method"}))
            sys.stdout.flush()


if __name__ == "__main__":
    main()
