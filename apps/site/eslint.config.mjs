import { FlatCompat } from '@eslint/eslintrc';
import nextVitals from 'eslint-config-next/core-web-vitals.js';

const compat = new FlatCompat();
const nextVitalsConfig = Array.isArray(nextVitals) ? nextVitals : compat.config(nextVitals);

export default [...nextVitalsConfig];
