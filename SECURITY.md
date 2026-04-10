# Security

## Threat Model

OpenCode is an AI-powered coding assistant that runs locally. It does **not** sandbox the agent — the permission system is a UX feature, not a security boundary.

If you need isolation, run inside a Docker container or VM.

### Out of Scope
- Server access when opted-in (expected behavior)
- Sandbox escapes (permission system is not a sandbox)
- LLM provider data handling (governed by provider policies)
- MCP server behavior (external trust boundary)
- Malicious config files (user-controlled)

## Reporting Issues

For this fork, open an issue at [brianshih04/opencode/issues](https://github.com/brianshih04/opencode/issues).

For upstream security issues, see [anomalyco/opencode security](https://github.com/anomalyco/opencode/security).
