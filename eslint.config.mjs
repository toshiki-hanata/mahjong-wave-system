import nextVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

const eslintConfig = [
  ...nextVitals,
  ...nextTypescript,
  // The standalone mock server and node:test suite use CommonJS intentionally.
  { files: ["mock/**/*.cjs"], rules: { "@typescript-eslint/no-require-imports": "off" } },
  {
    ignores: [".next/**", "node_modules/**", "prototype/**", "next-env.d.ts"],
  },
];

export default eslintConfig;
