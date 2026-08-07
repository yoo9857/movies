// Where a job file is, when the operator names it the way the docs do.
//
// `npm run db:write-reviews -- --drafts=deploy-jobs/x.json` runs the script
// through the workspace, so its cwd is `packages/db` and a repo-root path like
// the one in deploy-jobs/README.md misses by two directories. The operator is
// standing in the repo root and reading a path that starts there; making the
// script look there too is cheaper than teaching everyone to count `../`.
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The monorepo root: this file is `<root>/packages/db/prisma/job-file.ts`. */
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

/**
 * Absolute path to a job file named on the command line. Tried as given first,
 * so an existing relative invocation keeps working, then from the repo root.
 * Neither found, the original string is returned — the caller's ENOENT names
 * what the operator typed rather than something this function invented.
 */
export function jobFile(given: string): string {
  if (path.isAbsolute(given)) return given;
  const asTyped = path.resolve(process.cwd(), given);
  if (existsSync(asTyped)) return asTyped;
  const fromRoot = path.resolve(REPO_ROOT, given);
  return existsSync(fromRoot) ? fromRoot : given;
}
