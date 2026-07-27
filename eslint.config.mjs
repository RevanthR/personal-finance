import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Prisma's generated client: not code we write, and its inlined schema
    // string legitimately contains an em dash in the model comments below.
    "src/generated/**",
  ]),
  {
    rules: {
      // The user has asked repeatedly, across sessions, that no user-facing
      // (or backend-message) text ever use an em dash. Comments are exempt,
      // this only catches string/template literals and JSX text: UI copy,
      // toast messages, push notification bodies, API error strings.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Literal[value=/\\u2014/]",
          message: "No em dash (U+2014) in string literals, use a comma, period, or parentheses instead.",
        },
        {
          selector: "TemplateElement[value.raw=/\\u2014/]",
          message: "No em dash (U+2014) in template literals, use a comma, period, or parentheses instead.",
        },
        {
          selector: "JSXText[value=/\\u2014/]",
          message: "No em dash (U+2014) in JSX text, use a comma, period, or parentheses instead.",
        },
      ],
    },
  },
  {
    // Neither of these is user-facing text: dev-only migration scripts
    // (console output read by whoever runs them manually, never by an
    // end user) and the Gemini extraction prompt (instructions to the
    // model, never rendered to anyone), out of scope for the rule above.
    files: ["scripts/**", "src/lib/gmail/extract.ts"],
    rules: {
      "no-restricted-syntax": "off",
    },
  },
]);

export default eslintConfig;
