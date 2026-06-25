# Clean-room Borrowing Spec

## 1. Purpose

Praxis Studio may study Claude Code Best, Codex, Claude Code, OpenCode, and similar tools, but Praxis must not become a fork, wrapper, compatibility layer, or product shell for any of them.

The v0.1 rule is:

```text
CCB can be one construction crew.
CCB is not Praxis Studio's foundation.
```

Praxis owns:

```text
Development Graph
Project Memory as docs plus Git timeline
Agent Runtime
Tool Registry
Context Builder
Trace
Progress
Plans
Coding Task generation
```

External agents own:

```text
concrete source edits
test execution
patch generation
manual result reporting
```

## 2. Mechanisms Worth Studying

Praxis may absorb these mechanisms as product and architecture ideas:

```text
Agentic Loop
Tool Registry
Context Builder
Permission / Plan Mode
Project Memory docs / Rules
Trace System
MCP / ACP external protocol ideas
Sub-Agent Role Pipeline
```

The borrowed object is the mechanism, not the product center.

## 3. Code That May Be Evaluated

Code may be evaluated only when it is not tied to Claude Code compatibility, reverse engineered behavior, account flows, remote control, or brand-specific behavior.

Potentially reusable ideas:

```text
generic tool abstraction
schema organization
provider adapter organization
trace event organization
CLI command pattern
permission / risk level structure
MCP / ACP adapter boundary shape
```

Before copying any code, the team must check:

```text
license
origin
coupling to product behavior
whether rewriting is cheaper and safer
whether it can remain outside the main build
```

## 4. Code That Must Not Be Moved Into Core

Do not copy into Praxis core:

```text
official Claude Code compatibility logic
reverse-engineered core agent loop implementation
login / account / credential code
remote-control behavior
brand-specific protocol behavior
Anthropic Claude Code behavioral emulation
```

The long-term risk is not just technical. It affects trust, legal clarity, publishing, competitions, and enterprise adoption.

## 5. Clean-room Process

Praxis uses clean-room borrowing:

```text
1. Read and understand the design.
2. Extract the abstract mechanism.
3. Write Praxis-owned interfaces around Development Graph and docs-backed Project Memory.
4. Reimplement the mechanism in Praxis packages.
5. Keep questionable experiments outside the main build.
6. Treat external agents as adapters, not as the runtime foundation.
```

If an experiment is needed, use:

```text
third_party_experiments/ccb-runtime-study/
```

Rules for that directory:

```text
not part of the main build
not a publish dependency
not imported by packages/*
not required for v0.1 acceptance
```

## 6. v0.1 Adapter Boundary

v0.1 may ship:

```text
ManualAdapter
ClaudeCodeBestAdapter skeleton
CodexAdapter skeleton
ClaudeCodeAdapter skeleton
OpenCodeAdapter skeleton
```

These adapters produce task packages or manual commands. They do not automatically execute external agents in v0.1.

Example:

```ts
export class ClaudeCodeBestAdapter implements CodingAgentAdapter {
  name = "claude-code-best";

  async prepare(task: CodingAgentTask): Promise<CodingAgentPreparedTask> {
    return {
      kind: "manual_command",
      command: "ccb",
      promptFile: `.distinction/tasks/${task.id}.md`,
      instructions: "Open ccb in project root and paste the generated task."
    };
  }
}
```

## 7. Regression Check

Whenever code or docs mention CCB, check:

```text
Is Praxis still centered on Development Graph?
Does docs plus Git history remain the project memory authority?
Is .distinction still limited to transition/runtime state?
Is the external agent still a worker?
Is the task boundary explicit?
Is v0.1 still avoiding automatic source modification?
```

If any answer is no, the design has drifted.
