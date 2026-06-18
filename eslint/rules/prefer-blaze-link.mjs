/**
 * Запрещает нативный JSX `<a>`, вместо него — `Link` из `src/components/blaze/Link.tsx` (баррель `~/components`).
 */

/** @type {import('eslint').Rule.RuleModule} */
const preferBlazeLink = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Используйте Link из компонентов blaze вместо нативного тега <a>.",
    },
    messages: {
      useBlazeLink:
        "Вместо нативного <a> импортируйте Link из `~/components` (обёртка над Link роутера, см. `src/components/blaze/Link.tsx`).",
    },
    schema: [],
  },

  create(context) {
    return {
      /** @param {import('estree').JSXOpeningElement} node */
      JSXOpeningElement(node) {
        if (node.name.type !== "JSXIdentifier" || node.name.name !== "a") {
          return;
        }
        context.report({ node, messageId: "useBlazeLink" });
      },
    };
  },
};

export default {
  rules: {
    "prefer-blaze-link": preferBlazeLink,
  },
};
