---
title: "MFA Enrollment Modal Experience"
start_date: 2025-08
end_date: 2026-02
role: "Project Lead and UI Expert"
tech: [NodeJS, Marko, React, JavaScript, CSS, "eBay open source component"]
team: "2 PMs, 10 Engineers, 4 Designers (cross-team, cross-origin coordination)"
outcomes:
  - "Improved enrollment success rate by 28%"
  - "Reduced SMS costs by ~$1,500,000 (projected)"
  - "10K+ daily enrollments"
link: "eBay/mfa-enrollment-modal.md"
---

## One-line summary

Engineered a plug-and-play modal experience for the MFA enrollment flow.

## Background

The organization wanted a consistent, low-friction MFA enrollment experience across multiple web properties and origins while reducing operational SMS costs and improving enrollment completion rates.

## My role & responsibilities

- Project Lead and UI Expert responsible for design coordination, technical architecture decisions for the modal component, implementation oversight, and cross-team integration.
- Owned component design, API contract, and integration patterns for cross-origin embedding.

## Approach & architecture

- Built a plug-and-play modal component that could be mounted within different host pages using lightweight JS and a Marko/React hybrid wrapper.
- Used a central NodeJS service for enrollment orchestration and telemetry; UI rendered by Marko with React components where interactive needs arose.
- Followed progressive enhancement so hosts with limited JS still showed fallback flows.

## Technical details / notable implementations

- Implemented a shared open-source-compatible eBay component to standardize look & feel.
- Careful handling of cross-origin messaging and secure token exchange for enrollment flows.
- Client-side: Marko templates for fast first paint, React for stateful parts; CSS modules for encapsulated styles.
- Server-side: NodeJS endpoints for enrollment orchestration, rate-limiting, and SMS provider integrations.

## Outcomes & metrics

- Enrollment success rate improved by 28%.
- Projected SMS cost reduction: ~$1.5M.
- Supported 10K+ daily enrollments after rollout.

## Team & context

2 PMs, 10 Engineers, 4 Designers; worked across multiple product teams and platform owners for cross-origin embedding.

## Links / artifacts

- Component repo / demos: (add repo or demo links here)
- Design specs: (add Figma/Zeplin links)
