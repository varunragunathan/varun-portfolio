---
title: "AI-First Workflow — Identity Team"
start_date: 2025-01
end_date: present
role: "Initiative Lead / Workflow Owner"
tech: [GitHub Copilot, Claude code, Obsidian AI, Jira, GitHub Actions]
team: "Identity Team (cross-functional), AI agents integration"
outcomes:
  - "AI-first coding approach adopted; AI used for >80% of daily tasks"
  - "Improved code quality and reduced meetings; say-do ratio ≈ 90%"
  - "No production incident in the past year"
  - "CI deployment to production in <2 hours after PR readiness"
  - "Automated Jira updates, docs, testing, tracking, and security validations per task"
link: "eBay/ai-first-identity-workflow.md"
---

## Summary

Developed an AI-first workflow for the Identity Team, powered by Copilot and Claude code, to plan projects, generate precise Jira tickets, execute tasks via AI agents, and produce draft PRs automatically — all overseen by the assigned engineer.

## Flow & Components

- Template prompt: Guides a user through planning questions, produces project docs, and scaffolds Jira tickets with concise descriptions, code references, and sample snippets.
- Ticket creation: Prompts capture implementation steps, unit-test outlines, monitoring checkpoints, and security checks; tickets are human-readable and AI-actionable.
- AI execution: Once accepted, the chosen AI agent executes implementation steps (logic, tests, tracking, security updates) under the watch of the Jira assignee.
- PR generation: Prompt creates a draft PR with full context for the first AI review; Obsidian/AI tools produce an initial automated review and create remediation issues as needed.
- Human handoff: PRs move from AI draft → AI reviews → human reviewers → merged; CI deploys to production (under 2 hours for ready PRs).

## Outcomes & impact

- AI usage rose to >80% of daily tasks across the team.
- Improved code quality and reduced incidents; zero production incidents in the past year.
- Early detection of project red flags and real-time automated stakeholder updates to a central wiki.
- Built-in testing, security validation, and monitoring for every byte-sized task.
- Reduced meeting overhead and standardized workflows across developers and teams.

## Team & Timeline

Ongoing since Jan 2025 — Identity Team with cross-functional participants and integrated AI agents.

## Notes & next steps

- Recommend adding the canonical `prompt-template` file under `varun-master/Projects/` for reproducibility.
- Optionally scaffold automation scripts that transform frontmatter into Jira ticket templates and PR drafts.
