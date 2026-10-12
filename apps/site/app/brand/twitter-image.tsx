import { BRAND_CARD_ALT, renderBrandCard } from './og-pair';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = BRAND_CARD_ALT;

export default function TwitterImage() {
  return renderBrandCard();
}
