# Contributing to TableBase

Thank you for improving TableBase. Keep contributions focused, reviewable, and easy to release.

## Pull requests

- One pull request must address one task or issue.
- A pull request must contain exactly one commit. Squash fixups and intermediate commits before opening it.
- Do not include unrelated refactoring, formatting changes, generated files, or drive-by fixes.
- Keep the pull request description concise. Explain the change, link the related issue, and list the validation you ran.
- Avoid unnecessary comments and discussion in the pull request. Keep comments focused on the implementation.
- Run `npm test` and `npm run build` before submitting.

Pull requests targeting `main` or `release/**` must pass the repository CI checks. CI also verifies the one-commit rule and commit-message format.

## Commit messages

Use the repository commit convention. Task and release references are optional:

```text
TASK-12345: RELEASE-0.1.2

added:
  - New feature or test
changed:
  - Changed behavior or configuration
fixed:
  - Bug fix
```

The accepted header forms are:

- `TASK-12345: RELEASE-0.1.2`
- `TASK-12345`
- `RELEASE-0.1.2`
- A concise descriptive subject when no task or release is specified, for example `Update linting rules and CI configs`.

Use only the sections that apply: `added`, `changed`, `moved`, `removed`, and `fixed`.

Keep the categorized body structure for every commit, omitting sections that have no items. Do not add automated-authorship trailers or unrelated text.
