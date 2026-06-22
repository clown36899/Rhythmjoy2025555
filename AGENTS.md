# Codex Project Instructions

## Deployment Workflow

When the user asks to deploy this project, treat the request as including the full publish workflow:

1. Inspect the working tree and identify the deployment target.
2. Build and deploy using the repository's configured deployment command.
3. Verify the deployed site or service with the available health/version checks.
4. Commit all relevant tracked and untracked project changes with a clear message.
5. Push the commit to the active upstream branch.
6. Report the deployment result, commit hash, push target, and verification outcome.

Do not require the user to separately say "commit" or "push" after asking for a deployment. If there is a risky ambiguity, such as unrelated secrets, destructive changes, or an unclear branch target, pause and ask before committing or pushing.
