// Config base del monorepo. Cada app agrega sus overrides
// (decoradores NestJS en apps/api, react-hooks + jsx-a11y en apps/web)
// cuando exista su código en F0/F1.
import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["**/dist/**", "**/build/**", "**/node_modules/**", "**/.turbo/**"],
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
  prettier,
);
