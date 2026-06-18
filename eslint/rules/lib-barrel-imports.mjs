/**
 * Forbid deep imports into any `.../_lib/...` path unless:
 * - the importing file lives next to `_lib` (same parent directory), or
 * - the importing file is already under a `_lib` folder (internal cross-imports allowed).
 *
 * Deep = path after `_lib/` is not only `index.ts` / `index.tsx` (the public barrel file).
 */
import path from "node:path";

const DEEP_LIB = /[/\\]_lib[/\\](.+)$/;

/**
 * @param {string} spec
 * @param {string} importerPath
 * @param {string} cwd
 * @returns {string | null}
 */
function resolveToAbsolute(spec, importerPath, cwd) {
  if (!spec.startsWith(".") && !spec.startsWith("~")) {
    return null;
  }
  if (spec.startsWith(".")) {
    return path.normalize(path.resolve(path.dirname(importerPath), spec));
  }
  if (spec.startsWith("~/")) {
    return path.normalize(path.join(cwd, "src", spec.slice(2)));
  }
  return null;
}

/**
 * @param {string} normalizedAbs
 * @returns {{ parentOfLib: string, tail: string } | null}
 */
function parseLibTail(normalizedAbs) {
  const asPosix = normalizedAbs.replace(/\\/g, "/");
  const idx = asPosix.lastIndexOf("/_lib/");
  if (idx === -1) {
    return null;
  }
  const tail = asPosix.slice(idx + "/_lib/".length);
  if (!tail) {
    return null;
  }
  const parentOfLib = path.normalize(normalizedAbs.slice(0, idx));
  return { parentOfLib, tail };
}

/**
 * @param {string} tail path after `_lib/`
 */
function isPublicLibEntryOnly(tail) {
  return tail === "index.ts" || tail === "index.tsx";
}

/**
 * @param {string} importerAbs
 */
function importerIsInsideLibFolder(importerAbs) {
  const asPosix = importerAbs.replace(/\\/g, "/");
  return asPosix.includes("/_lib/");
}

/**
 * @param {string} importerAbs
 * @param {string} parentOfLib
 */
function importerIsSiblingOfLibFolder(importerAbs, parentOfLib) {
  return path.dirname(importerAbs) === parentOfLib;
}

/** @type {import('eslint').Rule.RuleModule} */
export const libBarrelImportsRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Disallow deep imports into `_lib` from outside that feature folder (use `_lib`/index or stay next to `_lib`).",
    },
    messages: {
      deepLib:
        'Import the public API from the `_lib` folder (index/barrel) instead of "{{resolved}}". Allowed: same directory as `_lib`, or files already under `_lib`.',
    },
    schema: [],
  },

  create(context) {
    const cwd = context.cwd ?? process.cwd();

    /**
     * @param {string | undefined | null} source
     * @param {import('estree').Node} reportNode
     */
    function check(source, reportNode) {
      if (typeof source !== "string" || !source) {
        return;
      }
      const importerAbs = path.normalize(
        context.getFilename?.() ?? context.filename,
      );
      const resolved = resolveToAbsolute(source, importerAbs, cwd);
      if (!resolved) {
        return;
      }
      const normalized = path.normalize(resolved);
      const parsed = parseLibTail(normalized);
      if (!parsed) {
        return;
      }
      const { parentOfLib, tail } = parsed;
      if (isPublicLibEntryOnly(tail)) {
        return;
      }

      if (
        importerIsSiblingOfLibFolder(importerAbs, parentOfLib) ||
        importerIsInsideLibFolder(importerAbs)
      ) {
        return;
      }

      context.report({
        node: reportNode,
        messageId: "deepLib",
        data: {
          resolved: normalized,
        },
      });
    }

    return {
      ImportDeclaration(node) {
        check(node.source?.value, node.source ?? node);
      },
      ExportNamedDeclaration(node) {
        if (node.source) {
          check(node.source.value, node.source);
        }
      },
      ExportAllDeclaration(node) {
        if (node.source) {
          check(node.source.value, node.source);
        }
      },
    };
  },
};

export default {
  rules: {
    "lib-barrel-imports": libBarrelImportsRule,
  },
};
