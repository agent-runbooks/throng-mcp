# Common

Repository: `<repo>`, with the task's branch checked out. The task brief is `<run>/brief.md`. Its rules are the ones your harness loaded with the repository and the Rules section of the profile. Follow them, except for anything that would start a procedure the executor constraints below rule out.

`<run>/profile.md` is the project's profile. Where it has a section, that section replaces what the matching paragraph below says it replaces. Where it is silent, or empty, the default holds.

"The changes" are everything uncommitted in `<repo>` outside `.agent-runbooks/`, where the run directory may live: `git status` and `git diff HEAD`, plus untracked files read in full. Files the checks write, such as caches and build output, are not part of the changes: leave them and do not report them. The VCS section of the profile replaces the commands, for a repository under something other than git.

`scope` in the launch message, when it is not empty, is a directory under `<repo>` that the task's changes stay in. Empty means the whole repository.

"The checks" are the shell command the launch message gives as `checks`, run from `<repo>` exactly as given. They pass when it exits 0. A check that cannot run, because a binary or a dependency is missing, has failed, not been skipped. The Checks section of the profile, if there is one, says more about them. The checks change no tracked files; if one did, say so in the Checks section.

A report that mentions the checks has a "Checks" section: the command, its exit code, and the full output when the exit code is not 0.

## Executor constraints

You run one step of a larger procedure. The project's procedures for task cycles, review and commit are not yours to start. Change repository files only as your step instructs, and leave the changes uncommitted unless it instructs a commit. A file name in your step's prompt is a name, not a path: the launch message gives a `write <name>: <path>` line for each file you write, and a `read <name>: <path>` line for each file you read, or says it is absent. Write other files only at the paths your launch message gives. Commits, pushes, comments, tickets and other external writes happen only when your step instructs them. Nobody will answer a question. If you cannot proceed, stop and reply `blocked`.

Your final message is one JSON object that fits the schema in the file your launch message gives as `reply schema`, and nothing else. `status` is `done` when the deliverable exists as described, `failed` when you tried and it does not, `blocked` when you cannot proceed. The schema lists every property as required: with `done`, `reason` is null and the other fields are set; with `failed` or `blocked`, `reason` is one line and the other fields are null. Explanations and evidence go into your step's output file.
