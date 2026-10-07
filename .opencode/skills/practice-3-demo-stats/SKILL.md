---
name: practice-3-demo-stats
description: Use when implementing stats() for Practice 3 demo (returns {"count": int}). Apply minimal edits to service.py and test_service.py; auto-tests will run after edits.
---

# practice-3-demo-stats

Use ONLY to implement stats() for Practice 3 demo.

Task
- Implement `stats()` returning `{"count": <int>}`.
- Tests must cover:
  - empty subscribers -> 0
  - multiple subscribe() calls -> correct count
  - duplicate subscribe of same name does not increase count

Constraints
- Files: practices/practice_03/lab/demo/service.py, test_service.py
- Minimal changes, standard library only.

Automation
- After edits, the auto-tests plugin triggers `tools/run_lab_tests.sh` which runs `make install` and `make test`.

References
- AGENTS.md
- practices/practice_03/lab/Makefile
