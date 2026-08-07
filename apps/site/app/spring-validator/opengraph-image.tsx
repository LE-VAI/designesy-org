import { renderOgCard } from '../lib/og-card';

export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
export const alt = 'Designesy Spring Validator — Spring physics accessibility';

export default function OpenGraphImage() {
  return renderOgCard({
    eyebrow: 'Validator',
    title: 'Spring physics accessibility',
    lede: 'Simulate spring motion, compute overshoot, get a reduced-motion accessibility recommendation.',
    path: 'designesy.org/spring-validator',
  });
}