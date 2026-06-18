/**
 * Правила: кириллица через typo() / typoRaw(), импорт — только из «~/lib».
 */
import path from "node:path";

/** @param {import('estree').Node | null | undefined} node */
function unwrapExpression(node) {
  let n = node;
  while (
    n &&
    (n.type === "ParenthesizedExpression" ||
      n.type === "TSAsExpression" ||
      n.type === "TSSatisfiesExpression" ||
      n.type === "TypeCastExpression")
  ) {
    n = n.expression;
  }
  return n ?? null;
}

/** @param {import('eslint').AST.SourceCode} sourceCode */
function getParentNode(sourceCode, node) {
  const ancestors = sourceCode.getAncestors(node);
  return ancestors.length > 0 ? ancestors[ancestors.length - 1] : null;
}

/**
 * @param {import('estree').Node} outer
 * @param {import('estree').Node} inner
 * @param {import('eslint').AST.SourceCode} sourceCode
 */
function containsNode(outer, inner, sourceCode) {
  let cur = inner;
  while (cur) {
    if (cur === outer) {
      return true;
    }
    cur = getParentNode(sourceCode, cur);
  }
  return false;
}

const CYRILLIC = /[\u0400-\u04FF]/;

/** @param {string | undefined | null} s */
function hasCyrillic(s) {
  return typeof s === "string" && CYRILLIC.test(s);
}

/**
 * @param {import('estree').Node} node
 * @param {import('eslint').AST.SourceCode} sourceCode
 * @param {string} functionName
 */
function isUnderTypoCall(node, sourceCode, functionName) {
  let cur = node;
  while (cur) {
    const parent = getParentNode(sourceCode, cur);
    if (!parent) {
      break;
    }
    if (
      parent.type === "CallExpression" &&
      parent.callee.type === "Identifier" &&
      parent.callee.name === functionName
    ) {
      const arg0 = unwrapExpression(parent.arguments[0]);
      if (arg0 && containsNode(arg0, node, sourceCode)) {
        return true;
      }
    }
    cur = parent;
  }
  return false;
}

/** @param {import('estree').Node} node
 *  @param {import('eslint').AST.SourceCode} sourceCode
 *  @param {string} functionName
 */
function isUnderTypoWrapper(node, sourceCode, functionName) {
  if (isUnderTypoCall(node, sourceCode, functionName)) {
    return true;
  }
  if (functionName === "typo" && isUnderTypoCall(node, sourceCode, "typoRaw")) {
    return true;
  }
  return false;
}

/** @param {import('estree').Node} callee */
function isConsoleCallee(callee) {
  if (callee.type === "ChainExpression" && callee.expression) {
    return isConsoleCallee(callee.expression);
  }
  if (callee.type !== "MemberExpression") {
    return false;
  }
  if (callee.object.type !== "Identifier" || callee.object.name !== "console") {
    return false;
  }
  if (!callee.computed && callee.property.type === "Identifier") {
    return true;
  }
  if (
    callee.computed &&
    callee.property.type === "Literal" &&
    typeof callee.property.value === "string"
  ) {
    return true;
  }
  return false;
}

/**
 * Строковый литерал — путь модуля в import/export (кириллица в именах файлов допустима).
 *
 * @param {import('estree').Node} node
 * @param {import('eslint').AST.SourceCode} sourceCode
 */
function isModuleSourceLiteral(node, sourceCode) {
  const parent = getParentNode(sourceCode, node);
  if (!parent) {
    return false;
  }
  if (parent.type === "ImportDeclaration" && parent.source === node) {
    return true;
  }
  if (parent.type === "ImportExpression" && parent.source === node) {
    return true;
  }
  if (
    (parent.type === "ExportNamedDeclaration" || parent.type === "ExportAllDeclaration") &&
    parent.source === node
  ) {
    return true;
  }
  return false;
}

/**
 * Узел внутри аргумента вызова console.* (логи/отладка — без typo).
 *
 * @param {import('estree').Node} node
 * @param {import('eslint').AST.SourceCode} sourceCode
 */
function isInsideConsoleCallArguments(node, sourceCode) {
  let cur = getParentNode(sourceCode, node);
  while (cur) {
    if (cur.type === "CallExpression" && isConsoleCallee(cur.callee)) {
      for (const arg of cur.arguments) {
        if (containsNode(arg, node, sourceCode)) {
          return true;
        }
      }
    }
    cur = getParentNode(sourceCode, cur);
  }
  return false;
}

/**
 * @param {import('estree').TemplateElement[]} quasis
 */
function templateQuasisHaveCyrillic(quasis) {
  if (!Array.isArray(quasis)) {
    return false;
  }
  return quasis.some((q) => hasCyrillic(q.value.cooked ?? q.value.raw));
}

/**
 * @param {import('estree').Node} tag
 * @param {string[]} ignoredTags
 */
function isIgnoredTaggedTemplateTag(tag, ignoredTags) {
  if (ignoredTags.length === 0) {
    return false;
  }
  if (tag.type === "Identifier") {
    return ignoredTags.includes(tag.name);
  }
  if (tag.type === "MemberExpression" && !tag.computed && tag.property.type === "Identifier") {
    const prop = tag.property.name;
    if (ignoredTags.includes(prop)) {
      return true;
    }
    if (tag.object.type === "Identifier") {
      return ignoredTags.includes(tag.object.name);
    }
  }
  return false;
}

/** @param {string} s */
function escapeForTemplateLiteral(s) {
  return s.replace(/\\/g, "\\\\").replace(/`/g, "\\`").replace(/\$\{/g, "\\${");
}

/**
 * Убирает переносы и отступы из многострочного JSXText — в typo попадает одна строка без артефактов вёрстки.
 */
function normalizeWhitespaceForTypoJsxText(s) {
  return s.replace(/\s+/gu, " ").trim();
}

/** @param {import('estree').Program} program */
function findLibImport(program) {
  for (const stmt of program.body) {
    if (stmt.type === "ImportDeclaration" && stmt.source.value === "~/lib") {
      return stmt;
    }
  }
  return null;
}

/** @param {import('estree').ImportDeclaration} importDecl
 *  @param {string} name
 */
function libNamedImportHasName(importDecl, name) {
  return importDecl.specifiers.some(
    (s) =>
      s.type === "ImportSpecifier" &&
      s.imported.type === "Identifier" &&
      s.imported.name === name &&
      s.local.type === "Identifier" &&
      s.local.name === name,
  );
}

/** @param {import('estree').Program} program */
function getLastImportDeclaration(program) {
  /** @type {import('estree').ImportDeclaration | null} */
  let last = null;
  for (const stmt of program.body) {
    if (stmt.type === "ImportDeclaration") {
      last = stmt;
    }
  }
  return last;
}

/**
 * @param {import('estree').Program} program
 * @param {string} functionName
 */
function hasTypoNamedImportFromLib(program, functionName) {
  if (functionName !== "typo") {
    return false;
  }
  const lib = findLibImport(program);
  return Boolean(lib && libNamedImportHasName(lib, "typo"));
}

/**
 * @param {import('eslint').Rule.RuleFixer} fixer
 * @param {import('eslint').AST.SourceCode} sourceCode
 * @param {import('estree').Program} program
 * @param {string} functionName
 */
function createAddTypoImportFix(fixer, sourceCode, program, functionName) {
  if (functionName !== "typo" && functionName !== "typoRaw") {
    return null;
  }
  const existing = findLibImport(program);
  if (existing && libNamedImportHasName(existing, functionName)) {
    return null;
  }
  if (existing) {
    const specifiers = existing.specifiers.filter((s) => s.type === "ImportSpecifier");
    if (specifiers.length === 0) {
      return fixer.insertTextAfter(existing, `\nimport { ${functionName} } from "~/lib";`);
    }
    return fixer.insertTextBefore(specifiers[0], `${functionName}, `);
  }
  const lastImport = getLastImportDeclaration(program);
  if (lastImport) {
    return fixer.insertTextAfter(lastImport, `\nimport { ${functionName} } from "~/lib";`);
  }
  const firstToken = sourceCode.getFirstToken(program);
  if (firstToken) {
    return fixer.insertTextBefore(firstToken, `import { ${functionName} } from "~/lib";\n\n`);
  }
  return null;
}

/**
 * @param {import('eslint').Rule.RuleFixer} fixer
 * @param {{ kind: string, node: import('estree').Node }} v
 * @param {import('eslint').AST.SourceCode} sourceCode
 * @param {string} functionName
 */
function makeCyrillicViolationFix(fixer, v, sourceCode, functionName) {
  if (v.kind === "literal" && v.node.type === "Literal" && typeof v.node.value === "string") {
    const inner = escapeForTemplateLiteral(v.node.value);
    const call = `${functionName}(\`${inner}\`)`;
    const wrapped = v.isJsxAttributeStringValue ? `{${call}}` : call;
    return fixer.replaceText(v.node, wrapped);
  }
  if (v.kind === "template") {
    const text = sourceCode.getText(v.node);
    return fixer.replaceText(v.node, `${functionName}(${text})`);
  }
  if (v.kind === "jsxText") {
    const normalized = normalizeWhitespaceForTypoJsxText(v.node.value);
    // Двойные кавычки + JSON.stringify: без шаблонных литералов, иначе Prettier часто
    // переносит строку сразу после ` и в текст попадают «хвосты» разметки.
    const arg = JSON.stringify(normalized);
    return fixer.replaceText(v.node, `{${functionName}(${arg})}`);
  }
  return null;
}

/**
 * @param {import('eslint').Scope.Scope} startScope
 * @param {string} name
 */
function findVariableInScopeChain(startScope, name) {
  let scope = startScope;
  while (scope) {
    const v = scope.variables.find((x) => x.name === name);
    if (v) {
      return v;
    }
    scope = scope.upper;
  }
  return null;
}

/** @param {import('eslint').Scope.Definition} def
 *  @param {string} [importedName]
 */
function definitionIsLibTypoImport(def, importedName) {
  if (def.type !== "ImportBinding") {
    return false;
  }
  const spec = def.node;
  if (spec.type !== "ImportSpecifier" || spec.imported.type !== "Identifier" || spec.imported.name !== importedName) {
    return false;
  }
  const decl = spec.parent;
  return decl.type === "ImportDeclaration" && decl.source.value === "~/lib";
}

/** @type {import('eslint').Rule.RuleModule} */
export const requireTypoForCyrillicRule = {
  meta: {
    type: "suggestion",
    docs: {
      description:
        "Строки с кириллицей и русский JSX-текст — через typo() или typoRaw() из «~/lib»; исключения: пути import/export, аргументы console.*.",
    },
    fixable: "code",
    messages: {
      wrapLiteral:
        "Оберните строку с кириллицей в typo(`…`)/typo(\"…\") или typoRaw(…) (импорт из «~/lib»).",
      wrapTemplate:
        "Оберните шаблон с кириллицей в вызов typo(`…`) или typoRaw(…) (импорт из «~/lib»).",
      wrapJsxText:
        "Замените JSX-текст на выражение: {typo(`…`)} или {typoRaw(…)} (импорт из «~/lib»).",
      wrapTagged:
        "Кириллица в теговом шаблоне: вынесите пользовательский текст в typo(`…`) или добавьте тег в опцию ignoredTags.",
    },
    schema: [
      {
        type: "object",
        properties: {
          functionName: { type: "string" },
          ignoredTags: {
            type: "array",
            items: { type: "string" },
          },
        },
        additionalProperties: false,
      },
    ],
  },

  create(context) {
    const opts = context.options[0] ?? {};
    const functionName = typeof opts.functionName === "string" ? opts.functionName : "typo";
    const ignoredTags = Array.isArray(opts.ignoredTags) ? opts.ignoredTags : [];

    const sourceCode = context.sourceCode;

    /**
     * @type {{
     *   kind: string,
     *   node: import('estree').Node,
     *   messageId: string,
     *   fixable: boolean,
     *   isJsxAttributeStringValue?: boolean,
     * }[]}
     */
    const violations = [];

    return {
      Literal(node) {
        if (node.value === null || typeof node.value !== "string") {
          return;
        }
        if (!hasCyrillic(node.value)) {
          return;
        }
        if (isUnderTypoWrapper(node, sourceCode, functionName)) {
          return;
        }
        if (isInsideConsoleCallArguments(node, sourceCode)) {
          return;
        }
        if (isModuleSourceLiteral(node, sourceCode)) {
          return;
        }
        const parent = getParentNode(sourceCode, node);
        const isJsxAttributeStringValue =
          parent?.type === "JSXAttribute" && parent.value === node;
        violations.push({
          kind: "literal",
          node,
          messageId: "wrapLiteral",
          fixable: true,
          isJsxAttributeStringValue,
        });
      },

      TemplateLiteral(node) {
        if (!node.quasis || !templateQuasisHaveCyrillic(node.quasis)) {
          return;
        }
        const parent = node.parent;
        if (parent?.type === "TaggedTemplateExpression") {
          if (isIgnoredTaggedTemplateTag(parent.tag, ignoredTags)) {
            return;
          }
          violations.push({ kind: "tagged", node, messageId: "wrapTagged", fixable: false });
          return;
        }
        if (isUnderTypoWrapper(node, sourceCode, functionName)) {
          return;
        }
        if (isInsideConsoleCallArguments(node, sourceCode)) {
          return;
        }
        violations.push({ kind: "template", node, messageId: "wrapTemplate", fixable: true });
      },

      JSXText(node) {
        const raw = node.value.replace(/^\s+|\s+$/gu, "");
        if (!raw || !hasCyrillic(node.value)) {
          return;
        }
        violations.push({ kind: "jsxText", node, messageId: "wrapJsxText", fixable: true });
      },

      "Program:exit"() {
        if (violations.length === 0) {
          return;
        }
        violations.sort((a, b) => a.node.range[0] - b.node.range[0]);
        const program = sourceCode.ast;
        const needsImport = !hasTypoNamedImportFromLib(program, functionName);

        violations.forEach((v, i) => {
          context.report({
            node: v.node,
            messageId: v.messageId,
            fix:
              v.fixable
                ? (fixer) => {
                  /** @type {import('eslint').Rule.Fix[]} */
                  const out = [];
                  if (i === 0 && needsImport) {
                    const imp = createAddTypoImportFix(fixer, sourceCode, program, functionName);
                    if (imp) {
                      out.push(imp);
                    }
                  }
                  const body = makeCyrillicViolationFix(fixer, v, sourceCode, functionName);
                  if (body) {
                    out.push(body);
                  }
                  return out;
                }
                : undefined,
          });
        });
      },
    };
  },
};

/** @type {import('eslint').Rule.RuleModule} */
export const typoImportFromLibRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Вызовы typo() и typoRaw() допустимы только с импортом этих имён из пакета «lib».",
    },
    fixable: "code",
    messages: {
      wrongSource:
        'Импортируйте typo/typoRaw только из «~/lib» (например: import { typo } from "~/lib").',
      missingImport: 'Добавьте импорт: import { typo } from "~/lib" (или typoRaw).',
    },
    schema: [],
  },

  create(context) {
    const sourceCode = context.sourceCode;
    const cwd = context.cwd ?? process.cwd();
    const filename = context.filename ?? "";

    function isLibPackageInternalFile() {
      const rel = path.relative(cwd, filename).replace(/\\/g, "/");
      return rel.startsWith("lib/");
    }

    return {
      ImportDeclaration(node) {
        if (isLibPackageInternalFile()) {
          return;
        }
        if (node.source.value === "~/lib") {
          return;
        }
        for (const spec of node.specifiers) {
          if (spec.type === "ImportSpecifier" && spec.imported.type === "Identifier") {
            const n = spec.imported.name;
            if (n === "typo" || n === "typoRaw") {
              context.report({
                node: spec,
                messageId: "wrongSource",
              });
            }
          }
        }
      },

      CallExpression(node) {
        if (isLibPackageInternalFile()) {
          return;
        }
        if (node.callee.type !== "Identifier") {
          return;
        }
        const calleeName = node.callee.name;
        if (calleeName !== "typo" && calleeName !== "typoRaw") {
          return;
        }
        const scope = sourceCode.getScope(node.callee);
        const variable = findVariableInScopeChain(scope, calleeName);
        if (!variable || variable.defs.length === 0) {
          context.report({
            node: node.callee,
            messageId: "missingImport",
            fix(fixer) {
              return createAddTypoImportFix(fixer, sourceCode, sourceCode.ast, calleeName);
            },
          });
          return;
        }
        const def = variable.defs[0];
        if (!definitionIsLibTypoImport(def, calleeName)) {
          context.report({
            node: node.callee,
            messageId: "wrongSource",
          });
        }
      },
    };
  },
};

export default {
  rules: {
    "require-typo-for-cyrillic": requireTypoForCyrillicRule,
    "typo-import-from-lib": typoImportFromLibRule,
  },
};
