/** Facts about this build, worked out by `vite.config.ts` when it bundles (or serves) the game. */
export interface BuildInfo {
  /** The git tag on the built commit, when the build is exactly on one. */
  tag: string | null;
  /** The built commit's short revision, or null outside a git checkout. */
  rev: string | null;
  /** Whether the working tree had uncommitted changes. */
  dirty: boolean;
  /** The build date, as YYYY-MM-DD. */
  date: string;
  /** Lines of TypeScript under `src/`: game code, tests, and the number of files. */
  lines: { code: number; tests: number; files: number };
}

declare const __BUILD__: BuildInfo;

export const BUILD: BuildInfo = __BUILD__;

/** The version to show: the tag, else the short revision, marked when built with local changes. */
export function versionLabel(build: BuildInfo = BUILD): string {
  const name = build.tag ?? build.rev ?? 'unknown';
  return build.dirty ? `${name} + local changes` : name;
}
