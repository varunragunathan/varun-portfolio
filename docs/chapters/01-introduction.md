# Chapter 1 — Introduction

## What You'll Learn

This chapter explains what the project is, why it exists, and what makes it unusually interesting for a personal portfolio site. It also describes how this book is organized and gives you a complete feature inventory before you dive into the technical details.

---

## 1.1 What This Project Is

This is a personal portfolio site for Varun Ragunathan, a Staff Software Engineer specializing in identity and authentication. On the surface it presents a career timeline, project archive, and contact information. Underneath, it implements a complete, production-quality authentication system — passwordless, passkey-first, with multiple fallback and recovery paths — deployed at the edge on Cloudflare's global network.

The site is live at `https://varunr.dev`. It costs approximately $0 per month in infrastructure. It handles sign-in, device registration, new-device approval, account recovery, and account deletion. None of these features use passwords.

The reason the authentication system exists on a portfolio site is deliberate. The site is itself a demonstration of Varun's primary area of expertise: identity systems at scale. Rather than describing passkey implementation in a bullet point on a resume, the site *is* a passkey implementation. Visitors who create an account experience the technology directly.

---

## 1.2 Who This Book Is For

This documentation is written for developers who fit one or more of these descriptions:

**You are learning WebAuthn.** The WebAuthn specification is dense. The FIDO Alliance documentation is accurate but not always approachable. This project is a real, running implementation with every step documented, including the parts that can go wrong and why. Chapters 4 and 5 are particularly valuable here.

**You are learning Cloudflare Workers and the edge runtime.** The project demonstrates how to build a stateful, real-time application on a platform typically associated with stateless functions. It uses [D1](../glossary/README.md#d1-sqlite), [KV](../glossary/README.md#kv-store), and [Durable Objects](../glossary/README.md#durable-object) in a single Worker, with the right storage primitive chosen for each kind of data. Chapters 2, 3, and 13 cover this.

**You are studying authentication architecture.** The project models a "passwordless first" authentication philosophy with carefully designed fallbacks. The recovery system, session model, step-up authentication, and number matching together form a coherent security model. Chapters 4 through 10 are the reference for this.

**You are a frontend engineer curious about auth.** The React frontend implements conditional mediation (the passkey-in-browser-autofill feature), state machines for multi-step flows, WebSocket clients for real-time approval, and an animated logo whose math is documented. Chapter 11 covers all of this.

---

## 1.3 Why It's Interesting

Most portfolio sites are brochures. This one has a server.

More specifically, the design decisions that make this project worth studying include:

**Passwordless-first, not passwordless-optional.** There is no password field anywhere in the codebase. Authentication is by passkey, with recovery codes and (in sign-in context) backup recovery-code sign-in as fallbacks. This is not a common choice for hobby projects.

**Number matching as new-device approval.** When a user authenticates from a browser or device the system has not seen before, it does not issue a session. Instead it presents a two-digit number on the new device and pushes an approval request to all trusted devices already signed in. The user must confirm the numbers match. This pattern (borrowed from enterprise device management) runs over WebSocket using Cloudflare Durable Objects — one DO instance per user, managing a pub/sub channel in real time.

**Session security without plaintext tokens in the database.** The session cookie contains a raw random token. The database stores only a SHA-256 hash of that token. Revocation works by looking up the hash. A database breach does not yield usable session tokens.

**Honest engineering tradeoffs.** The PBKDF2 iteration count is 100 — intentionally low because the Workers CPU budget cannot accommodate 600,000 iterations, and random recovery codes don't need the same protection as user-chosen passwords. This is documented in the source code and in this book. The chapter on security analysis names every known limitation.

**Edge deployment with no traditional backend.** The Worker binary is the entire backend. It runs in Cloudflare's network, co-located with users worldwide, with no server to maintain, patch, or scale.

---

## 1.4 How to Read This Book

The chapters build on each other but are designed to be readable independently. Each chapter begins with a "What you'll learn" section and ends with "Key takeaways." Technical terms are linked to the [master glossary](../glossary/README.md) on first use.

All code snippets are real. They are copied from the actual source files, with the file path cited immediately above or below the block. If you are reading this alongside the codebase, you can find and read every excerpt in context.

The recommended reading order for someone new to the project:

1. Chapter 2 (Architecture) — understand the full picture before the details
2. Chapter 3 (Database Schema) — understand the data model
3. Chapter 4 (Authentication Overview) — understand the auth philosophy
4. Chapters 5–10 (Auth subsystems) — go as deep as your interest demands
5. Chapter 11 (Frontend) — the React layer
6. Chapter 12 (Security Analysis) — what to trust and what to watch
7. Chapter 13 (Deployment) — how to run it yourself

---

## 1.5 Feature Inventory

The following is a complete list of implemented features:

**Authentication**
- Passkey registration with OTP-verified email gate
- Passkey authentication (standard and conditional mediation / browser autofill)
- TOTP (Time-Based One-Time Password) as a backup sign-in method; secret encrypted at rest with AES-256-GCM
- WhatsApp OTP backup sign-in via Twilio (registered phone number, 6-digit code, 10-minute TTL)
- Recovery-code backup sign-in (uses one code, does not wipe passkeys)
- Full account recovery flow (recovery code + OTP + re-register passkey, wipes existing credentials)

**Session Management**
- Two-phase session model: pending (5 min) then active (24h or 30d)
- Trust-device prompt with optional device naming
- Session listing, individual revocation, bulk revocation
- `last_active_at` touch on every `/me` call
- Session cookie: HttpOnly, Secure, SameSite=Strict

**New-Device Approval**
- Number matching over WebSocket
- Durable Object per-user broker
- KV fallback for DO cold starts
- Approval and denial flow with real-time result delivery

**Step-Up Authentication**
- Passkey re-authentication before account deletion, TOTP disable, and admin user promotion
- Short-lived stepUpToken (2-minute KV TTL)
- Email address confirmation as second factor of deletion

**Account Management**
- Nickname editing (inline, from nav avatar menu)
- Passkey listing, naming, deletion (with last-passkey guard)
- Session listing with current-session highlight and IP reveal
- Recovery code status (8 codes, used/unused per position)
- Recovery code regeneration
- TOTP setup (QR code + manual entry) and disable (requires step-up)
- WhatsApp phone registration and removal
- Security event log (last 20 events)
- Account deletion with step-up and email confirmation

**User Tiers and Access Control**
- Four roles: `user` (default), `pro`, `student`, `admin`
- Tier upgrade request flow: user submits request → admin approves/rejects
- Role-based chat rate limits: user (5/10min, 20/day), pro/student (30/hr, 200/day), admin (unlimited)
- Dynamic model management: AI models added/toggled from admin dashboard without code changes
- Per-role chat personas (system prompts) configurable from admin dashboard

**Admin Dashboard**
- Metrics tab: platform-wide health snapshot (users, auth adoption, chat usage, upgrade requests, recent security events)
- Upgrade Requests tab: review and approve/reject tier requests
- Users tab: list all users, promote to admin (requires step-up)
- Models tab: add AI models, toggle enabled/disabled
- Personas tab: edit system prompts per role
- Endpoints tab: request volume trend chart + per-endpoint breakdown with sparklines

**Observability**
- Endpoint request logging: every API call and SPA page navigation logged to D1 asynchronously
- Path normalization: UUID/ID segments replaced with `:id` for meaningful aggregation
- 24h hourly and 7d daily trend charts with error-rate overlay
- Per-endpoint error rates, last-seen timestamps, and 7-day sparklines

**Frontend**
- React 18 SPA with React Router v6
- Lazy-loaded pages with Suspense
- Dark / light / auto theme with localStorage persistence and OS preference detection
- Animated logo with rAF-driven symbol cycling and damped-sine settle
- Deterministic Identicon avatar from email (GitHub-style, WCAG AA contrast)
- ParticleField background animation with mouse repulsion
- PWA: Web App Manifest, Workbox service worker, offline caching
- Mobile-responsive across all pages: collapsible chat sidebar, iOS zoom prevention, safe-area-inset padding

**Portfolio Content (authenticated users only)**
- Hero with animated typewriter effect
- Animated stats counter (IntersectionObserver triggered)
- Project cards (featured + grid layout)
- Skills, philosophy, career timeline, education sections
- CTA with email / LinkedIn / GitHub links

---

## Key Takeaways

- This is a real, running application with production-quality authentication, not a tutorial or toy.
- Passkeys are the only credential type. Passwords do not exist anywhere in the codebase.
- The entire backend runs as a Cloudflare Worker — no servers, no containers, no databases to manage beyond Cloudflare's managed primitives.
- The documentation in this book matches the code exactly. When something is a deliberate tradeoff (like 100 PBKDF2 iterations), it is named and explained.
