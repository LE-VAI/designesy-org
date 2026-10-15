import nextVitals from 'eslint-config-next/core-web-vitals';

export default [
  ...nextVitals,
  {
    // eslint-config-next 16 bundles eslint-plugin-react-hooks 7, whose
    // recommended set adds React Compiler rules as errors. The site does not
    // run the React Compiler, and the 15.x lint contract was rules-of-hooks and
    // exhaustive-deps only. These three fire on 31 existing sites (client-only
    // preference sync that sets state in an effect on purpose, to avoid a
    // hydration mismatch). Kept as warnings so the debt stays visible without
    // rewriting live UI inside a framework upgrade.
    rules: {
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/preserve-manual-memoization': 'warn',
      'react-hooks/refs': 'warn',
    },
  },
];
