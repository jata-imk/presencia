// Config base del monorepo. Cada app agrega sus overrides
// (decoradores NestJS en apps/api, react-hooks + jsx-a11y en apps/web)
// cuando exista su código en F0/F1.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";
import storybook from "eslint-plugin-storybook";
import path from "node:path";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/build/**",
      "**/node_modules/**",
      "**/.turbo/**",
      "**/storybook-static/**",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
  },
  {
    files: ["**/*.{js,mjs,cjs}"],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    // vitest mocks (vi.fn()) son props sueltas, no métodos de instancia —
    // pasarlas a expect(...).toHaveBeenCalledWith es el patrón normal de
    // mockear un repository/service, no un uso real de "unbound method".
    files: ["**/*.spec.ts"],
    rules: {
      "@typescript-eslint/unbound-method": "off",
    },
  },
  // Historias de Storybook (F10.8.3): solo aplica a *.stories.tsx.
  ...storybook.configs["flat/recommended"],
  {
    // El preset busca `.storybook/main.*` en la raíz y resuelve package.json
    // desde el cwd (la raíz con lint-staged, apps/web con turbo): sin esto la
    // regla nunca revisa nuestro main.ts, o lo revisa contra el package.json
    // equivocado.
    files: ["apps/web/.storybook/main.ts"],
    plugins: { storybook },
    rules: {
      "storybook/no-uninstalled-addons": [
        "error",
        { packageJsonLocation: path.join(import.meta.dirname, "apps/web/package.json") },
      ],
    },
  },
  prettier,
);
