# Prompts

Every prompt typed to Claude Code while building this project, in order, extracted from the Claude Code session transcripts. Times are local (Europe/Madrid). Answers given to Claude's multiple-choice questions are included as quoted selections. Context compactions (automatic summaries, not typed) are marked where they happened. The commits listed under a prompt are the ones made before the next prompt.

- Prompts: 56
- Span: 2026-10-25 19:39 to 2026-10-26 08:39
- Sessions: `6041fc0a-e759-4e1e-9e09-db7c62b340b6`, `e5af49d0-e89e-40cb-9131-ceb41398d62f`
- Claude Code versions: 2.1.310
- Model: `claude-opus-5-5`

## Session `6041fc0a-e759-4e1e-9e09-db7c62b340b6`

### 1. 2026-10-25 19:39:03

<sub>Slash command · branch `HEAD` · Claude Code 2.1.310</sub>

`/init`

```text
Let's build a clone of the Zarch game on Archimedes (from the 1980s) that was later ported to Atari ST and Amiga under the name of Virus. The game was authored by David Braben and featured a hovercraft type vehicle, and 3d tiled terrain, with sophisticated mouse-based controls of tilt, roll and thrust. The thruster was underneath the vehicle, hence the hovercraft style controls. This project should run in browser using modern technologies
```

### 2. 2026-10-25 19:42:54

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
let's do as you suggest. For now: leave aside the virus component, as well as landscape items like trees. We will look into this in a later iteration. Same for ennemies. Left mouse button is the thruster, right mouse button is the cannon (ignored for now)
Tech choice is good, let's go with this. In terms of terrain, make suggestion on how to model the terrain: either procedurally, or from a fixed datafile, whichever is easier especially for testing.
```

### 3. 2026-10-25 19:58:26

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
incredible!
Now a few things:
- when the craft is on the floor, prevent tilting.
- add a plume of particles when the thruster is on
```

### 4. 2026-10-25 21:04:27

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
yes, reset the aim to centre while landed
```

### 5. 2026-10-25 21:05:02

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

### 6. 2026-10-25 21:06:40

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
I fixed my git user for this repo, we should not use my wallapop identity for this. Please amend the commit to use the new user and email
```

### 7. 2026-10-25 21:07:10

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
yes, remove the [master] prefix
```

Commits: `bf4b8a7` Initial Zarch flight prototype

### 8. 2026-10-25 21:07:46

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
yes, remove those hooks from this repo
```

### 9. 2026-10-25 21:10:19

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
create a configuration panel that can be used when the game is paused (when pressing ESC / releasing mouse)
there add settings to configure the physics of the game: gravity, thrust vector, plume settings.
Also, show a miniature of the map, and preconfigure 2 other maps.
Once this is done, we will look into adding trees to the map.
```

### 10. 2026-10-25 21:19:00

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit, then trees!
```

Commits: `6ea9a43` Add pause settings panel and preset maps

### 11. 2026-10-25 21:26:28

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
what happens when I fly over the edge of the map ?
```

### 12. 2026-10-25 21:27:09

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit the trees
```

Commits: `4783bee` Add trees

### 13. 2026-10-25 21:28:27

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
add tree shadows
add more colors: the world is too green. I would like to see some orange / red hues, like in the autumn. Make this configurable in the panel, propose how to do this.
```

> **Answer to Claude's question** (21:32:17):
> - *How should the world's colours be configured in the panel? (Colours are visual only and don't affect gameplay. In every option, pines stay evergreen; autumn mostly shows in round trees and the ground.)* → **Season presets + sliders (Recommended)**

### 14. 2026-10-25 21:36:35

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `b10870f` Add tree shadows and configurable autumn colours

### 15. 2026-10-25 21:37:43

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
next steps:
cannon and right mouse button
explosion: when the craft crashes, it should explode, with pieces carrying the momentum
```

### 16. 2026-10-25 21:45:58

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `6fc8a9b` Add cannon and crash explosions

### 17. 2026-10-25 21:46:25

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
make bullets destroy trees
```

### 18. 2026-10-25 21:49:36

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `3d3f9b5` Let bullets destroy trees

### 19. 2026-10-25 21:49:52

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
add enemies that spread the virus
```

### 20. 2026-10-25 22:01:24

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
where do I refuel ?
```

### 21. 2026-10-25 22:02:01

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
where is the hub ? and I do not see the minimap during gameplay
```

### 22. 2026-10-25 22:02:41

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
do all three
```

### 23. 2026-10-25 22:09:04

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
move the map direction under the HUD. It is too far right now.
```

### 24. 2026-10-25 22:13:25

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `58088d2` Add seeder enemies, the virus, HUD and scanner

### 25. 2026-10-25 22:13:53

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
add a game over when the virus takes over
```

### 26. 2026-10-25 22:19:13

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `ee754c1` Add game over when the virus takes over

### 27. 2026-10-25 22:20:09

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
let's look at adding sound now. I would like to add sounds for:
- thruster
- cannon
- explosions
```

*2026-10-25 22:23:13 — context compacted; the session continued from a summary.*

### 28. 2026-10-25 22:23:33

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
how do I start the game from the command line?
```

### 29. 2026-10-25 22:25:35

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `26c6f3d` Add procedural sound for thruster, cannon and explosions

### 30. 2026-10-25 22:26:39

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
can we add a stars canopy / sky ?
```

### 31. 2026-10-25 22:37:57

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `4d467b8` Add a starry night sky with a horizon haze

### 32. 2026-10-25 22:39:04

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
I would like an auto refuel feature. Can be used once per wave. It auto-pilots the craft back to the refueling station and lands it safely.
```

### 33. 2026-10-25 22:45:36

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
brilliant! commit this
```

Commits: `2f8ea59` Add auto-refuel: an autopilot that flies home to the pad

### 34. 2026-10-25 22:46:12

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
add a sound when the autopilot engages
add an option in the panel to disable the auto-pilot feature
```

### 35. 2026-10-25 22:51:08

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `8c27c9c` Add an autopilot chime and a panel switch for auto-refuel

### 36. 2026-10-25 22:52:40

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
add a proximity alert when an ennemy craft is close, like a fire alert. Set a panel setting for the minimum distance at which it starts. Low volume first, increasing until within a circle around the hovercraft.
```

### 37. 2026-10-25 22:57:40

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
the sound is bad. Let's make it lower pitched, and an alternance of a sound, then double-pitched (octave up), alternating every 0.5s
```

### 38. 2026-10-25 23:00:07

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `3e0d986` Add a proximity alarm for approaching seeders

### 39. 2026-10-25 23:00:25

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
what else can we do now ?
```

### 40. 2026-10-25 23:02:15

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
let's do fighters.
lives (3, changeable in the panel)
and then music: i am curious about this one!
```

### 41. 2026-10-25 23:31:56

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `6d8e681` Add fighters, lives and a procedural soundtrack

### 42. 2026-10-25 23:32:29

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
the fighters are very very hard. They shoot too well, there is no way to take evasive action
```

### 43. 2026-10-25 23:35:56

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
I renamed the current branch main
```

### 44. 2026-10-25 23:38:30

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `4c403be` Make fighters dodgeable

### 45. 2026-10-25 23:39:00

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
let's work on publishing this. The remote on github is ready.
```

Commits: `d1aa32e` Publish to GitHub Pages

> **Answer to Claude's question** (23:41:09):
> - *Everything is ready locally. Shall I commit, push main to github.com/brew-your-own/zarch-in-chrome as the brew-your-own account, and switch the repo's Pages source to GitHub Actions so the game goes live?* → **Yes, do all three (Recommended)**

### 46. 2026-10-25 23:45:36

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
€
```

### 47. 2026-10-25 23:49:38

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
what else did we have on the list of things to do ?
```

### 48. 2026-10-25 23:50:41

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
fix the github action warning
```

### 49. 2026-10-25 23:51:18

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit and push it
```

Commits: `55a818e` Bump deploy workflow actions to their Node 24 releases

### 50. 2026-10-25 23:53:20

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
let's do:
- Camera polish: a slight lean into turns, a small shake on explosions, and zooming out with altitude.
- Water: gentle waves on the sea, and splashes when bullets or wrecks hit it.
```

### 51. 2026-10-25 23:59:06

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `3133cdb` Add camera lean, shake and altitude zoom; animate the sea

### 52. 2026-10-25 23:59:59

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
I pushed it. done
```

### 53. 2026-10-26 00:00:45

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
what else is on the list?
```

### 54. 2026-10-26 00:02:23

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
ok difficulty curve
then smart bombs (1 per wave, starting at wave 3)
then homing missiles (1 per wave, cumulative)
all tuneable in the settings panel
```

*2026-10-26 00:07:22 — context compacted; the session continued from a summary.*

### 55. 2026-10-26 00:12:15

<sub>Prompt · branch `HEAD` · Claude Code 2.1.310 · auto mode</sub>

```text
commit this
```

Commits: `b9dd5e4` Add a difficulty curve, smart bombs and homing missiles

## Session `e5af49d0-e89e-40cb-9131-ceb41398d62f`

### 56. 2026-10-26 08:39:08

<sub>Prompt · branch `main` · Claude Code 2.1.310 · auto mode</sub>

```text
collect all the prompts I typed in to guide you through this project, and put them into PROMPTS.md
Include all the metadata (date, etc)
```
