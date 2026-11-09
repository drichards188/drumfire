// Builds the max-quality battery's puff atlas (fx/heroatlas.js) off the main thread: FX.enableHero posts { size } and
// gets { data, W, H } back (the pixels transferred, not copied).
import { makeHeroAtlasData } from './heroatlas.js';

self.onmessage = (e) => {
  const { data, W, H } = makeHeroAtlasData(e.data?.size ?? 256);
  self.postMessage({ data, W, H }, [data.buffer]);
};
