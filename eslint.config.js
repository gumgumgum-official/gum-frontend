import js from "@eslint/js";
import prettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  prettier,
  {
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        // 브라우저 환경
        window: "readonly",
        document: "readonly",
        console: "readonly",
        alert: "readonly",
        requestAnimationFrame: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        clearTimeout: "readonly",
        // Vite
        import: "readonly",
      },
    },
    rules: {
      // 경고만 표시 (에러 아님)
      "no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
      "no-console": "off", // console.log 허용
      "no-debugger": "warn",
    },
  },
  {
    ignores: [
      "node_modules",
      "dist",
      "*.config.js",
      "public/**",
      "**/libs/**",
      "**/*.wasm",
    ],
  },
];
