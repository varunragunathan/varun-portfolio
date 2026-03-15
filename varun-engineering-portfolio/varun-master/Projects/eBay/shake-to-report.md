---
title: "Shake-to-Report Mobile Bug Reporting"
start_date: 2014-06
end_date: 2015-06
role: "Mobile Project Lead"
tech: [Android, iOS, native mobile UX]
team: "Small cross-platform team (2 engineers)"
outcomes:
  - "Improved mobile bug reporting quality and reduced repro time"
link: "eBay/shake-to-report.md"
---

## Summary

Lightweight in-app bug reporting triggered by shaking the device, capturing screenshots and contextual metadata to speed debugging.

## Problem

Bug reports lacked screenshots and context; reproduction was slow and manual reporting impeded debugging.

## Goal

Quickly report issues with attached screenshots and contextual metadata to accelerate triage and fixes.

## Responsibilities

- Led cross-platform development for Android and iOS, coordinating two engineers and implementing UI and reporting logic.

## Technical implementation

### Gesture Trigger
- Shake gesture opens the bug reporting UI and captures a screenshot.

### Report Capture
- Reports include screenshot, user description, device metadata, app version, and UI state.

### Submission Pipeline
- Reports auto-submitted to internal bug tracking systems and routed to responsible engineering teams.

## Impact

- Improved report quality, reduced reproduction time, and increased engineering productivity.
