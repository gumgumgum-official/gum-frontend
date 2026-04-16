/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** dev + `npm run dev:mock` — gum_server REST를 MSW로 모킹 */
  readonly VITE_ENABLE_MSW?: string;
  /** 기본 mock 시나리오: idle | reserved | busy | flow (?mock= 으로 덮어씀) */
  readonly VITE_MSW_SCENARIO?: string;
}

declare module "*.module.css" {
  const classes: { readonly [key: string]: string };
  export default classes;
}
