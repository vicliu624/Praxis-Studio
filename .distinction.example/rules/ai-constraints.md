# AI Constraints

- Agent must operate in Explain Mode by default.
- Plan Mode may propose graph, memory, or code changes but must not apply them.
- Apply Mode requires explicit user confirmation.
- Code patching should be delegated to an external coding agent adapter.
- All changes must produce a trace event.
