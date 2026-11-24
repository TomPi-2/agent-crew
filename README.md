# Agent Crew

*[Leer en español](README.es.md)*

A Claude Code mod that lets you **see your subagents at work** and gives every project **a crew of subagents designed for it**, kept up to date as the project changes. It works in the Claude Code extension for VS Code and in the Claude desktop app.

<img src=".claude-plugin/icon.png" alt="The crew: H for Haiku, S for Sonnet, O for Opus and F for Fable" width="160">

## What it does

**A panel with your subagents.** Each running subagent shows up as a small animated character: the initial of its model with a face. H is Haiku (a quick hop), S is Sonnet (a gentle sway), O is Opus (slow breathing) and F is Fable (floating). Each one has its own colour, and next to it you see its name, its model and what it is doing right now, such as *Reading server.py* or *Searching "parse_config"*. When it finishes, it smiles and moves to *Finished* with its time and number of steps. **View** opens its transcript.

**A button to open and close it.** A thin bar above the prompt shows *Agent Crew* and how many subagents are running. Click it to open or close the panel; you don't need to type a command.

**Subagents made for your project.** The first time you open a project, Agent Crew asks whether it may analyse it. If you say yes, a read-only architect subagent studies the project and designs 2 to 6 specialists, each with the cheapest model that does the job well. They are written to `.claude/agents/`, where you can read, edit and share them. While you work, Claude delegates matching tasks to them, which saves usage.

**Kept up to date.** When the project has changed a lot (about 20 commits, or two weeks with new work), Agent Crew reviews the crew in the background and tells you what it created, updated or removed. It only ever touches the files it wrote. If you edit one, it keeps your version. Files it no longer needs go to the recycle bin; nothing is deleted permanently.

**English and Spanish.** It follows your system language, or you can choose one in its settings.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install agent-crew --marketplace TomPi-2/agent-crew
```

Answer `y` to add the marketplace, then pick a scope (the user scope makes it available in every project). From a shell:

```
claude plugin install agent-crew --marketplace TomPi-2/agent-crew
```

In the desktop app, where `/plugin` does not run: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `TomPi-2/agent-crew`, then **Add plugin**.

## Use

- **Panel:** the *Agent Crew* button above the prompt, or `/crew`.
- **Review a project's crew now:** *Review now* in the panel, or `/crew-review`. In a project you haven't set up yet, it asks first.
- **Settings** (in the plugin's config):
  - `language`: `auto`, `en` or `es`.
  - `analysisModel`: the model the architect runs on (`sonnet` by default).
  - `autoReview`: keep the crew up to date on its own (on by default).

## What it asks and what it touches

- It asks before analysing a project. You can answer *Yes*, *Not now* or *Never for this project*. You can always set it up later from the panel.
- The architect can only read the project (Read, Grep, Glob). Agent Crew writes the files itself, and only in `.claude/agents/`.
- Its files carry the marker `<!-- agent-crew:generated -->`. Files without it (your own agents) are never changed or removed.
- It adds one short note to Claude's system prompt listing the project's crew and asking it to delegate bounded tasks to them, while keeping design, core changes, security and reviews for itself.
- It runs `git` to find the project root and how much it has changed. On Windows it also runs PowerShell, to read the system language and to send files to the recycle bin.

## License

[MIT](LICENSE)
