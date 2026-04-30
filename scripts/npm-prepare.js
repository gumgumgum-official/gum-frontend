/**
 * Vercel/GitHub Actions 등에서는 git 훅이 필요 없고, husky 실행이 실패해 install 단계까지 깨지는 경우가 있어 여기서 건너뜁니다.
 */
import { execSync } from "node:child_process";

if (process.env.VERCEL || process.env.CI === "true") {
  process.exit(0);
}

execSync("husky", { stdio: "inherit" });
