import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Readiness — Is your design system AI-ready?';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Readiness',
    title: 'Is your design system AI-ready?',
    lede: 'Is your design system the default context AI tools build from? 10 automated checks.',
    path: 'designesy.org/readiness',
  });
}