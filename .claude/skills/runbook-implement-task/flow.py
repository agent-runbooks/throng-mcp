#!/usr/bin/env python3
"""Steps and the flow of runbook-implement-task. Run with --help for the commands."""

import subprocess

from agent_runbooks import Runbook, StepFailed, end, parallel

rb = Runbook()

rb.inputs(
    brief=str,
    repo=str,
    profile=str,
    checks=str,
    statusCommand='git status --porcelain -- .',
    task='',
    scope='',
    maxFixRounds=2,
    top='claude/fable:high',
    strong='claude/opus:high',
    second='codex/gpt-6.1-sol:high',
)

# Every executor is a thronglet. The agent strings are inputs, so a project's profile can replace them at start; the
# launch message carries the agent input of the step's executor, from the step's `inputs` or from the call.
top, strong, second = (
    rb.executor(name, f'a thronglet: run_thronglet with the agent the `{name}` line of the message gives, '
                      f'cwd the `repo` line')
    for name in ('top', 'strong', 'second')
)


def _text(data):
    return data.decode('utf-8', errors='replace')


def _fenced(text):
    """A code block that the backticks inside `text` cannot close."""
    fence = '```'
    while fence in text:
        fence += '`'
    return f'{fence}\n{text.rstrip()}\n{fence}\n'


def run_preflight(ctx):
    """Lists the uncommitted files with `statusCommand`; leaves the tree as it is."""
    command = ctx.inputs.statusCommand
    p = subprocess.run(command, shell=True, cwd=ctx.repo, capture_output=True)
    out, err = _text(p.stdout), _text(p.stderr)
    changed = [line for line in out.splitlines() if line.strip() and '.agent-runbooks/' not in line]
    with open(ctx.writes['preflight.md'], 'w', encoding='utf-8') as f:
        f.write(f'## Status\n\n`{command}` in `{ctx.repo}`: exit code {p.returncode}\n')
        if p.returncode == 0:
            f.write('\n## Uncommitted files\n\n' + (_fenced('\n'.join(changed)) if changed else 'None.\n'))
        if err.strip():
            f.write('\n## Stderr\n\n' + _fenced(err))
    if p.returncode != 0:
        first = err.strip().splitlines()[0] if err.strip() else 'no stderr'
        raise StepFailed(f'`{command}` exited {p.returncode}: {first}')
    return {'status': 'done', 'clean': not changed}


def run_checks(ctx):
    """Runs the `checks` command; `passed` is its exit code being 0."""
    command = ctx.inputs.checks
    p = subprocess.run(command, shell=True, cwd=ctx.repo, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    with open(ctx.writes['checks.md'], 'w', encoding='utf-8') as f:
        f.write(f'## Checks\n\n`{command}` in `{ctx.repo}`: exit code {p.returncode}\n')
        if p.returncode != 0:
            output = _text(p.stdout)
            f.write('\n' + (_fenced(output) if output.strip() else 'No output.\n'))
    return {'status': 'done', 'passed': p.returncode == 0}


preflight = rb.code(
    'preflight',
    run=run_preflight,
    reads=['working tree'],
    writes=['preflight.md'],
    reply={'clean': bool},
)

checks = rb.code(
    'checks',
    run=run_checks,
    reads=['working tree'],
    writes=['checks.md'],
    reply={'passed': bool},
)

implement = rb.step(
    'implement',
    executor=strong,
    prompt='prompts/01-implement.md',
    inputs=['checks', 'scope', 'strong'],
    reads=['profile.md', 'brief.md', 'preflight.md', 'working tree'],
    writes=['implement.md'],
)

fix_checks = rb.step(
    'fix-checks',
    executor=strong,
    prompt='prompts/03-fix-checks.md',
    inputs=['checks', 'scope', 'strong'],
    reads=['profile.md', 'brief.md', 'implement.md', 'checks.md', 'working tree'],
    writes=['fix-checks.md'],
    reply={'fixed': bool},
)

# No agent input here: each call passes the one of the executor it runs on.
review = rb.step(
    'review',
    executor=strong,
    prompt='prompts/04-review.md',
    inputs=['checks', 'scope'],
    reads=['profile.md', 'brief.md', 'preflight.md', 'implement.md', 'fix-checks.md', 'working tree'],
    writes=['review.md'],
    reply={'findings': int},
)

triage = rb.step(
    'triage',
    executor=top,
    prompt='prompts/05-triage.md',
    inputs=['scope', 'top'],
    reads=['profile.md', 'brief.md', 'working tree'],
    writes=['triage.md'],
    reply={'to_fix': int},
)

fix = rb.step(
    'fix',
    executor=strong,
    prompt='prompts/06-fix.md',
    inputs=['checks', 'scope', 'strong'],
    reads=['profile.md', 'brief.md', 'triage.md', 'verify.md', 'rounds.md', 'working tree'],
    writes=['fix.md'],
)

verify = rb.step(
    'verify',
    executor=strong,
    prompt='prompts/07-verify.md',
    inputs=['checks', 'scope', 'strong'],
    reads=['profile.md', 'triage.md', 'fix.md', 'verify.md', 'working tree'],
    writes=['verify.md'],
    reply={'unresolved': int, 'passed': bool},
)

polish = rb.step(
    'polish',
    executor=strong,
    prompt='prompts/08-polish.md',
    inputs=['checks', 'scope', 'strong'],
    reads=['profile.md', 'brief.md', 'preflight.md', 'working tree'],
    writes=['polish.md'],
    reply={'passed': bool},
)

ask_dirty = rb.human(
    'ask-dirty',
    choices=['continue', 'stop'],
    question='The repository already has uncommitted changes, see `<run>/preflight.md`. '
    'Continue, and they become part of what is implemented on and reviewed, or stop?',
)

ask_rounds = rb.human(
    'ask-rounds',
    writes='rounds.md',
    choices=['more rounds', 'stop'],
    reply={'rounds': {'type': 'integer', 'default': 1, 'description': 'how many more fix rounds the human grants'}},
    question='Fix rounds are spent. `<run>/verify.md` lists what is unresolved or which checks still fail. '
    'More rounds, and how many, or stop here? Anything you write here goes to the coder for the next round.',
)


def review_b(ctx):
    """Review B on another vendor's model, or on `top` when that one fails or cannot run here."""
    try:
        return (yield review(executor=second, id_prefix='b', second=ctx.inputs.second))
    except StepFailed:
        return (yield review(executor=top, id_prefix='b', top=ctx.inputs.top))


@rb.flow
def main(ctx):
    p = yield preflight()
    if not p.clean:
        a = yield ask_dirty()
        if a.choice == 'stop':
            return end('failed', 'read <run>/preflight.md')

    yield implement()
    c = yield checks()
    if not c.passed:
        f = yield fix_checks()
        if not f.fixed:
            return end('failed', 'read <run>/fix-checks.md')
        c = yield checks()
        if not c.passed:
            return end('failed', 'read <run>/checks.md')

    reviews = yield parallel(
        'reviews',
        a=review(executor=strong, id_prefix='a', strong=ctx.inputs.strong),
        b=review_b,
    )
    if reviews.a.findings or reviews.b.findings:
        t = yield triage(reviews=reviews)
        if t.to_fix > 0:
            budget, used = ctx.inputs.maxFixRounds, 0
            while True:
                yield fix()
                v = yield verify()
                used += 1
                if v.unresolved == 0 and v.passed:
                    break
                if used >= budget:
                    a = yield ask_rounds()
                    if a.choice == 'stop':
                        return end('needs_attention', 'read <run>/verify.md')
                    budget += a.rounds

    r = yield polish()
    return end('ready' if r.passed else 'needs_attention', 'read <run>/polish.md')


if __name__ == '__main__':
    raise SystemExit(rb.main())
