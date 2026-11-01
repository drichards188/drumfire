import { checkGpu } from '../ui/gpu.js';

// The demo page's entry: the graphics check first (src/ui/gpu.js), and the demo only once it answers.
checkGpu().then(() => import('./index.js')).catch((e) => console.error(e));
