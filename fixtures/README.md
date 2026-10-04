# Fixtures

- `safe/`: migrations that must produce zero findings from every rule.
- `risky/`: migrations that must trigger exactly the rule IDs listed on the first line.

Each file starts with `-- expect: MG001[, MG002...]` (risky) or `-- expect: none` (safe). The fixture runner asserts this. Start every fixture with `SET lock_timeout = '5s';` so MG012 stays out of the way unless it is the rule under test.
