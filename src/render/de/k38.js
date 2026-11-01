// The 21 cm K 38's drill for render/crews.js (see render/crews_ww1.js for what this module may export). The K 18's
// heavy drill on a bigger gun: the barrel comes down to zero for loading, the block man (who also fires) runs the
// sliding block open and the tray is hooked on, the carrying pair bring the 120 kg shell between them from the stack up
// the left walkway and lay it on the tray, the two rammers drive it home with the long staff from the deck over the
// trail, the charge man brings the cased charge, the block is shut and the tray lifted off. The layer works the sight
// and the elevating handwheel on the left footplate, the traverser the right handwheel; the Geschützführer stands off
// the left; two more ammunition numbers wait at the stack and the trail man stands by the float with his handspike
// (the line beyond the carriage's own traverse is taken by swinging the whole carriage round on its platform).
export const ROLES = {
  officer: 'cmd', layer: 'lay', elevator: 'wheel', lanyard: 'lan', loader1: 'pair0', loader2: 'pair1',
  rammer1: 'ram', rammer2: 'ram', ammo1: 'idle', ammo2: 'bag', ammo3: 'idle', spike: 'idle',
};
export const STAFF = 3.0; // the rammer staff (m): the deck stands 3 m behind the breech face
export const TIMED = true; // the carriers walk on the cycle clock, as the K 18's
export const BLOCK_MAN = 'lanyard'; // he works the block from beside the breech, as on the K 18
export const WORLD = new Set(['ammo3']); // the third ammunition number stays at the stack as the gun turns
