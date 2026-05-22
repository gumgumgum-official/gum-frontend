/**
 * 방명록 전체 화면·GuestbookEmbed UI 이미지 URL (idle 웜업·모달 오픈 시 선로드)
 */
import { STAGE3_OBJECTS_CONFIG } from "../../config/stages/stage3/stage3ObjectsConfig.js";
import { resolvePublicAssetUrl } from "./gltfTemplateCache.js";

const GUESTBOOK_EMBED_PATHS = [
  "/assets/guestbook/title.png",
  "/assets/guestbook/profile_card_icons.webp",
  "/assets/guestbook/clover.webp",
  "/assets/guestbook/profile_photo_bg.webp",
  "/assets/guestbook/profile_character.webp",
  "/assets/guestbook/guestbook_ribbon.webp",
  "/assets/guestbook/today_card_top.png",
  "/assets/guestbook/today_card_cherry.png",
  "/assets/guestbook/profile/random1.svg",
  "/assets/guestbook/profile/random2.svg",
  "/assets/guestbook/profile/random3.svg",
  "/assets/guestbook/profile/random4.svg",
];

/**
 * @returns {string[]}
 */
export function getGuestbookImageUrls() {
  const bg = STAGE3_OBJECTS_CONFIG.notice?.guestbookFullscreenBg;
  const urls = bg ? [bg, ...GUESTBOOK_EMBED_PATHS] : GUESTBOOK_EMBED_PATHS;
  return [...new Set(urls.map((p) => resolvePublicAssetUrl(p)))];
}
