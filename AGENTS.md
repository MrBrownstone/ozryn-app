<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# Package manager

Use `pnpm` for this repository. Do not use `npm` for scripts, installs, or lockfile updates.

# Project context

Read `CHANGELOG.md`, `docs/roadmap.md`, and the relevant files in `docs/architecture/` before planning implementation or making changes so you have the latest project context, target architecture, and completed work.
Update `CHANGELOG.md` in grouped summaries when work is complete, typically before commits, not after every small change. Only do that step when the user asks for it.


## Skills
A skill is a set of local instructions stored in a `SKILL.md` file.

### Available skills
- context-hub: Fetch current third-party API/SDK docs with `chub` before implementing integrations. Use when tasks involve external APIs, SDKs, webhooks, auth flows, or endpoint contracts. (file: /Users/andres/.codex/skills/context-hub/SKILL.md)
- vercel-composition-patterns: React composition patterns that scale. Use when refactoring components with boolean prop proliferation, building flexible component libraries, or designing reusable APIs. (file: /Users/andres/.agents/skills/vercel-composition-patterns/SKILL.md)
- vercel-react-best-practices: React and Next.js performance optimization guidelines from Vercel Engineering. Use when writing, reviewing, or refactoring React/Next.js code. (file: /Users/andres/.agents/skills/vercel-react-best-practices/SKILL.md)
- vercel-react-native-skills: React Native and Expo best practices for performant mobile apps. Use when working on React Native, Expo, mobile performance, or native platform APIs. (file: /Users/andres/.agents/skills/vercel-react-native-skills/SKILL.md)
- web-design-guidelines: Review UI code for Web Interface Guidelines compliance. Use when reviewing UI, UX, accessibility, or web interface quality. (file: /Users/andres/.agents/skills/web-design-guidelines/SKILL.md)

### Skill usage rule
- If a request needs API integration, use `context-hub` first.
- Run `chub search` to find the right doc ID, then `chub get` before writing integration code.
- Prefer fetched docs over memory for request/response shapes, auth, versions, and edge cases.
- Use `vercel-composition-patterns` for component API design, compound components, provider patterns, render props, and React architecture refactors.
- Use `vercel-react-best-practices` when writing, reviewing, or refactoring React or Next.js code, especially for data fetching, performance, rendering, or bundle-size concerns.
- Use `vercel-react-native-skills` when working on React Native or Expo code, mobile UI flows, animations, navigation, or native-module integration.
- Use `web-design-guidelines` when reviewing UI, accessibility, UX, or visual/interface quality. Fetch the latest guideline source before applying it.
- Use a `security-best-practices` skill if one is available in the session when work touches authentication, authorization, secrets, permissions, PHI handling, encryption, session security, or production hardening.

### Security and secrets rule
- Never commit real credentials, API keys, tokens, passwords, client secrets, certificates, or other secrets to tracked files.
- If local credentials or secrets must exist for development, keep them only in gitignored files such as `.env.local` or other explicitly ignored local config files.
- Do not place secrets in source files, docs, examples, fixtures, screenshots, or tests unless they are clearly fake placeholders.
