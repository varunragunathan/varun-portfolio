# Projects folder

Keep project writeups in this folder. Each project should be a standalone markdown file with YAML frontmatter containing the metadata fields below.

Required frontmatter fields:
- `title`
- `start_date` / `end_date`
- `role`
- `tech` (list)
- `team`
- `outcomes` (list)
- `link` (filename)

Recommended workflow:
1. Copy `_TEMPLATE_PROJECT.md` and rename to a descriptive filename (e.g., `mfa-enrollment-modal.md`).
2. Fill frontmatter and sections (`Background`, `My role`, `Approach`, `Technical details`, `Outcomes`).
3. Add a row to `Project.md` to list the project summary and link to the detailed file.

Optional automation:
- We can add a small script later to aggregate project frontmatter into `resume/master-resume.md` automatically. If you want that, I can scaffold the script next.
