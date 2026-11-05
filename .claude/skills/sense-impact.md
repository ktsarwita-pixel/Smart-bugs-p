---
name: sense-impact
description: Check blast radius and impact before changing code — what breaks if you modify a symbol
---

# Impact analysis with Sense

Use Sense blast radius to understand what a change will affect before making it.

## Steps

1. Run `sense_blast symbol="<name>"` to see direct and indirect callers.
2. Review the affected files and symbols — pay attention to test coverage.
3. If the blast radius is large, consider whether to change the interface or add a new symbol instead.
4. After making changes, run `sense_blast diff="HEAD~1"` to verify the actual scope matches expectations.
