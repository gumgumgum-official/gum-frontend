/** 콘솔 등에서 설정하는 Stage 디버그/프로파일 플래그 (truthy면 활성) */
export {};

declare global {
  interface Window {
    STAGE2_PROFILE?: number | string | boolean;
    STAGE3_PROFILE?: number | string | boolean;
  }
}
