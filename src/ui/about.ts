import { BUILD, versionLabel, type BuildInfo } from '../buildInfo';

/** A source the story cites, numbered in the order it is first cited. */
interface Source {
  title: string;
  by: string;
  url: string;
}

const SOURCES = {
  making: { title: 'The Making of Zarch', by: 'Sockmonsters, with David Braben interviewed', url: 'https://sockmonsters.com/TheMakingOfZarch.html' },
  lander: { title: 'Lander source code, fully documented', by: 'Mark Moxon, lander.bbcelite.com', url: 'https://lander.bbcelite.com/' },
  wikipedia: { title: 'Zarch', by: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Zarch' },
  bytecellar: { title: "'Virus' vs. 'Zarch': a look at two Braben classics", by: 'Blake Patterson, Byte Cellar, 2010', url: 'https://bytecellar.com/?p=189' },
} satisfies Record<string, Source>;

type SourceId = keyof typeof SOURCES;

/** The story, one paragraph per entry: plain text with the sources it rests on. */
const STORY: { text: string; cites: SourceId[] }[] = [
  {
    text: 'In early 1987 Acorn was about to launch the Archimedes, a home computer built around its new ARM processor. It asked David Braben, co-author of Elite, for a game to show the machine off, and gave him about three months.',
    cites: ['making'],
  },
  {
    text: 'First came Lander, a demo given away with the machine and the first game ever released for an ARM processor. Its hovering ship, its tilt-and-thrust mouse controls and its rolling landscape became the core of Zarch, which Braben built in the month or so that was left.',
    cites: ['making', 'lander'],
  },
  {
    text: 'Zarch came out in 1987. ACE magazine gave it 979, its highest score until then, and asked whether solid 3D like this was the future of games.',
    cites: ['wikipedia'],
  },
  {
    text: 'In 1988 Firebird brought it to the Atari ST, the Amiga and the PC as Virus, with 16 colours and a lower frame rate than the Archimedes could manage. Braben said he had never liked the name Zarch anyway: it "sounds like a soap powder". A ZX Spectrum version followed, and in 1998 his studio Frontier made a sequel, V2000.',
    cites: ['bytecellar', 'making', 'wikipedia'],
  },
];

/** This version, in the author's words. */
const THIS_VERSION = [
  'I remember playing Virus on my Atari ST in the late 1980s: the mouse that tilted the ship, the thrust that was never quite enough, and the red stain spreading across the land. This little project is a mix of fun and nostalgia.',
  "It is a reinterpretation, not a copy. It tries to be respectful of the original: the ship is Braben's own Lander hull, flown the same way over the same kind of checkerboard land. But it was vibe-coded, written with an AI assistant from my descriptions and memories, so it is not identical to Zarch or Virus, and doesn't mean to be. Villages, bombers, pests and the demo pilot are new.",
];

/** Facts about the first session of work, from PROMPTS.md in the repository. */
const FIRST_SESSION = {
  date: '25 October 2026',
  hours: '4½ hours',
  prompts: 55,
  commits: 19,
};

const TECH = [
  'TypeScript, strict, with no framework',
  'Three.js for the WebGL 3D, with flat-shaded terrain lit on the CPU',
  'Web Audio for all the sound and music, made on the fly: there are no sound files',
  'Vite to build, Vitest for the tests',
  'Claude Code (Claude Opus 5.5) to write it, from the prompts in PROMPTS.md',
  'GitHub Pages to publish it, on every push',
];

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(url: string, text: string): HTMLAnchorElement {
  const a = el('a', undefined, text);
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener';
  return a;
}

/** `n` with its thousands grouped, e.g. 9,271. */
function count(n: number): string {
  return n.toLocaleString('en-GB');
}

/** The settings drawer's About tab: the story of Zarch, this version, and how it is made. */
export function aboutPage(build: BuildInfo = BUILD): HTMLElement[] {
  const order: SourceId[] = [];
  const cite = (id: SourceId) => {
    if (!order.includes(id)) order.push(id);
    return order.indexOf(id) + 1;
  };

  const story = el('div', 'about');
  story.append(el('h3', undefined, 'The story of Zarch'));
  for (const { text, cites } of STORY) {
    const p = el('p', undefined, text + ' ');
    for (const id of cites) {
      const n = cite(id);
      const sup = el('sup');
      sup.append(link(SOURCES[id].url, `[${n}]`));
      p.append(sup);
    }
    story.append(p);
  }

  story.append(el('h3', undefined, 'This version'));
  for (const text of THIS_VERSION) story.append(el('p', undefined, text));

  story.append(el('h3', undefined, 'How it is made'));
  story.append(
    el(
      'p',
      undefined,
      `The first session, on ${FIRST_SESSION.date}, took about ${FIRST_SESSION.hours}: ${FIRST_SESSION.prompts} prompts and ${FIRST_SESSION.commits} commits, from an empty folder to a game with the virus, seeders, fighters, lives, sound, smart bombs and missiles, already published online.`,
    ),
    el(
      'p',
      undefined,
      `It is now ${count(build.lines.code)} lines of TypeScript, plus ${count(build.lines.tests)} lines of tests, in ${build.lines.files} files.`,
    ),
  );
  const tech = el('ul');
  for (const item of TECH) tech.append(el('li', undefined, item));
  story.append(tech);

  const version = el('p', 'about-version');
  version.append(`Version ${versionLabel(build)}, built ${build.date}. `);
  if (build.rev && !build.dirty) {
    version.append(link(`https://github.com/brew-your-own/zarch-in-chrome/commit/${build.rev}`, 'See the code'));
  } else {
    version.append(link('https://github.com/brew-your-own/zarch-in-chrome', 'See the code'));
  }
  story.append(version);

  story.append(el('h3', undefined, 'Sources'));
  const list = el('ol', 'about-sources');
  for (const id of order) {
    const li = el('li');
    li.append(link(SOURCES[id].url, SOURCES[id].title), `, ${SOURCES[id].by}`);
    list.append(li);
  }
  story.append(list);
  return [story];
}
