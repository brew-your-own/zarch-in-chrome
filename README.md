# Zarch in Chrome

A browser tribute to **Zarch** (David Braben, Acorn Archimedes, 1987), later ported to the Atari ST and Amiga as **Virus**. You fly a hovercraft-style lander over a wrapping, tiled landscape. Seeders spread a red virus across the land and fighters hunt you. Stop the virus before it takes over.

**Play it:** https://brew-your-own.github.io/zarch-in-chrome/

## Controls

| Input | Action |
|---|---|
| Move the mouse | Tilt the craft (it leans towards the pointer; thrust pushes along its tilt) |
| Left button | Thrust |
| Right button | Fire |
| R | Auto-refuel: fly back to the pad and land (once per wave) |
| Esc | Pause and open the settings panel |

Land gently on the grey launch pad to refuel. The pad is also a safe haven: fighters hold fire while you sit on it.

The pause panel has the map picker and lets you tune physics, enemies, lives, colours, sound and music. Settings are saved in your browser.

## Development

Built with Vite, TypeScript and Three.js. Everything, including the sound and music, is generated in code: there are no asset files.

```sh
npm install
npm run dev      # http://localhost:5173
npm test         # Vitest
npm run build    # type-check and build to dist/
```

Every push to `main` is tested, built and deployed to GitHub Pages by `.github/workflows/deploy.yml`.
