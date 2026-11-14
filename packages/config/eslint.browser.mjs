import globals from 'globals';
import base from './eslint.config.mjs';

/** The shared rules plus browser globals, for packages that run in a page. */
export default [...base, { languageOptions: { globals: { ...globals.browser } } }];
