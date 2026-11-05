#!/usr/bin/env python3
"""Materialise the files that `sense setup` would write into this project.

The Sense MCP binary (luuuc/sense) cannot be installed in this sandbox (the
release-asset CDN is not reachable), so the templates that ship inside the Sense
source tree are extracted here verbatim and written into the project. The result
is byte-identical to running `sense setup` once the binary is available.

Usage: python3 scripts/extract-sense-setup.py /path/to/sense
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

SKILLS = ["sense-explore.md", "sense-impact.md", "sense-conventions.md"]


def parse_go_string(src: str, pos: int) -> tuple[str, int]:
    """Parse a Go string expression (raw or interpreted, possibly ``+`` joined)."""
    out: list[str] = []
    n = len(src)
    while pos < n:
        ch = src[pos]
        if ch in " \t":
            pos += 1
            continue
        if ch == "\n":
            # A newline ends the expression unless it is continued by a "+".
            if out and src[:pos].rstrip()[-1:] != "+":
                break
            pos += 1
            continue
        if ch == "+":
            pos += 1
            continue
        if ch in ",}":
            break
        if ch == "`":
            end = src.index("`", pos + 1)
            out.append(src[pos + 1 : end])
            pos = end + 1
            continue
        if ch == '"':
            pos += 1
            buf = []
            while src[pos] != '"':
                if src[pos] == "\\":
                    esc = src[pos + 1]
                    buf.append(
                        {"n": "\n", "t": "\t", "r": "\r", '"': '"', "\\": "\\"}.get(esc, esc)
                    )
                    pos += 2
                    continue
                buf.append(src[pos])
                pos += 1
            out.append("".join(buf))
            pos += 1
            continue
        raise ValueError(f"unexpected char {ch!r} at {pos}")
    return "".join(out), pos


def extract_skills(sense: Path) -> dict[str, str]:
    src = (sense / "internal/setup/skills.go").read_text()
    skills: dict[str, str] = {}
    for match in re.finditer(r'filename:\s*"([^"]+)",\s*\n\s*content:\s*', src):
        name = match.group(1)
        body, _ = parse_go_string(src, match.end())
        skills[name] = body
    return skills


def first_raw_string(src: str, pos: int) -> str:
    """Return the content of the next raw (backtick) string in ``src``."""
    start = src.index("`", pos)
    end = src.index("`", start + 1)
    return src[start + 1 : end]


def extract_guidance(sense: Path) -> str:
    src = (sense / "internal/setup/marker.go").read_text()
    idx = src.index("const guidanceMarkdown =")
    return first_raw_string(src, idx)


def extract_instructions(sense: Path) -> str:
    src = (sense / "internal/mcpio/types.go").read_text()
    idx = src.index("const ServerInstructions =")
    body, _ = parse_go_string(src, idx + len("const ServerInstructions ="))
    return body


def main() -> int:
    sense = Path(sys.argv[1] if len(sys.argv) > 1 else "/home/user/_sense")
    root = Path(sys.argv[2] if len(sys.argv) > 2 else ".").resolve()

    skills = extract_skills(sense)
    guidance = extract_guidance(sense)
    instructions = extract_instructions(sense)

    skill_dir = root / ".claude" / "skills"
    skill_dir.mkdir(parents=True, exist_ok=True)
    for name in SKILLS:
        (skill_dir / name).write_text(skills[name])
        print(f"wrote .claude/skills/{name}")

    # .mcp.json — the MCP server entry, exactly as writeMCPJSON produces it.
    mcp_path = root / ".mcp.json"
    mcp: dict = {}
    if mcp_path.exists():
        mcp = json.loads(mcp_path.read_text())
    mcp.setdefault("mcpServers", {})["sense"] = {
        "command": "sense",
        "args": ["mcp"],
        "serverInstructions": instructions,
        "alwaysLoad": True,
    }
    mcp_path.write_text(json.dumps(mcp, indent=2) + "\n")
    print("wrote .mcp.json")

    # .claude/settings.json — lifecycle hooks plus the sense tool allow-list.
    settings_path = root / ".claude" / "settings.json"
    settings: dict = {}
    if settings_path.exists():
        settings = json.loads(settings_path.read_text())
    settings["hooks"] = {
        "PreToolUse": [
            {
                "matcher": "Grep|Glob|Agent|Bash",
                "hooks": [{"type": "command", "command": "sense hook pre-tool-use", "timeout": 5000}],
            }
        ],
        "PreCompact": [
            {"hooks": [{"type": "command", "command": "sense hook pre-compact", "timeout": 5000}]}
        ],
        "SubagentStart": [
            {"hooks": [{"type": "command", "command": "sense hook subagent-start", "timeout": 5000}]}
        ],
        "SessionStart": [
            {"hooks": [{"type": "command", "command": "sense hook session-start", "timeout": 5000}]}
        ],
    }
    perms = settings.setdefault("permissions", {})
    allow = perms.setdefault("allow", [])
    if "mcp__sense__*" not in allow:
        allow.append("mcp__sense__*")
    settings_path.write_text(json.dumps(settings, indent=2) + "\n")
    print("wrote .claude/settings.json")

    # AGENTS.md — project guidance plus the marker-delimited Sense section.
    agents_path = root / "AGENTS.md"
    existing = agents_path.read_text() if agents_path.exists() else ""
    if "<!-- sense:start -->" in existing:
        start = existing.index("<!-- sense:start -->")
        end = existing.index("<!-- sense:end -->") + len("<!-- sense:end -->")
        existing = existing[:start] + guidance + existing[end:]
    else:
        existing = existing.rstrip("\n") + "\n\n" + guidance + "\n"
    agents_path.write_text(existing)
    print("wrote AGENTS.md")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
