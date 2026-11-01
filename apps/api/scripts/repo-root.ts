import { existsSync } from "node:fs";
import path from "node:path";

/**
 * La raíz del repo, subiendo desde `start` hasta el `pnpm-workspace.yaml`.
 * Los scripts corren desde apps/api y escriben sus reportes en docs/.
 */
export function findRepoRoot(start: string): string {
  let dir = start;
  while (!existsSync(path.join(dir, "pnpm-workspace.yaml"))) {
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error("No encontré la raíz del repo (pnpm-workspace.yaml)");
    dir = parent;
  }
  return dir;
}
