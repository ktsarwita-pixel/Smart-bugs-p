---
name: sense-explore
description: Explore codebase structure using the Sense graph — find symbols, trace callers, understand architecture
---

# Explore codebase with Sense

Use Sense MCP tools to navigate the codebase structurally.

## Steps

1. Run `sense_status` to confirm the index is healthy.
2. Run `sense_search query="<topic>"` to find relevant symbols.
3. For each interesting symbol, run `sense_graph symbol="<name>"` to see callers, callees, and relationships.
4. If a symbol has many connections, run `sense_graph symbol="<name>" direction="callers"` or `sense_graph symbol="<name>" direction="callees"` to focus.
5. Summarize the architecture you found: key symbols, how they connect, entry points.
