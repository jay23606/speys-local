# OwnLearn

"Learn from your own code." No dependencies, no build step, Node 24+ (lessons run on `node:sqlite`). Code and comments are in English; interface text and questions are `{ en, tr }`.

A "module" here is a lesson topic like SQL, not an applet. Each one lives in `src/modules/<id>/`. The general layer (concepts, lessons, neutral practice data) ships in the repo; the course from a person's own repo is generated on their machine (`skills/ownlearn-course/SKILL.md`) and stays in `~/.ownlearn/`. Lesson rules: `docs/course.md`.
