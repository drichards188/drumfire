# Research, upgrades and the campaign

Two eras have a career: **1917 British** and **WW2 German**. The WW1 German era stays a sandbox with every battery from the start.

You play the open battle (Ypres, or the WW2 ridge battle) with the batteries you have researched. Every battle pays, won or lost. The pay goes into two purses:

- **Research points (RP)**, per era: they research new batteries in the era's tree.
- **Battery points**, per battery: each battery earns its own from its own fire, and spends them on its own upgrades.

## The trees

| Era | Tier I | Tier II (450 RP) | Tier III (1,100 RP) | Tier IV (2,000 RP) |
| --- | --- | --- | --- | --- |
| 1917 | 6-inch howitzers | 60-pounders, 9.2-inch howitzers | 15-inch howitzer (after the 9.2-inch) | 18-inch railway gun (after the 60-pounders) |
| WW2 | 10.5 cm leFH 18 | 15 cm sFH 18, Nebelwerfer 41 | 21 cm Mörser 18, 17 cm K 18 (both after the sFH 18) | Karl-Gerät (after the Mörser), Gustav (after the K 18) |

The V-1 and V-2 are not in a tree: they fire only in their own operations, which are open to everyone.

## Upgrades

**Every battery starts with one gun.** Its other guns come one at a time, into its empty gun pits. Each battery also has seven parts with three levels each:

- **Shells**: +12%, +25%, +40% damage. In the hangar the shells beside each gun show it: a fresh coat and a green band, then a white band and a taller fuze, then a pointed ballistic cap.
- **Barrel**: 15%, 28%, 40% tighter fall of shot, and less barrel wear.
- **Breech and loading gear**: 10%, 19%, 28% faster loading.
- **Sights and survey**: the first round lands 15%, 30%, 45% closer, and the guns lay faster.
- **Camouflage**: 12%, 24%, 36% less flash and noise for the enemy to locate.
- **Ammunition supply**: +20%, +40%, +60% shells in hand and faster resupply.
- **Relief crews**: +25%, +50%, +75% men at each gun, to take turns at the heavy work so the crew stays fresh (fatigue itself is not modelled). In the game the extra men are reserves, so a gun slows only when casualties take it below its drill's number, and the fresher hands load 3%, 6%, 10% faster. They stand in the hangar's ranks.

You buy them in any order with the battery's own points. Costs rise with the level and the battery's tier: a tier I part costs 80, 170 and 300, and the second gun 120.

## What a battle pays

- **Each battery** earns a quarter point for every point of damage it does, the target's score when it destroys one, and a share of every mission it fired on, split by rounds.
- **RP** are the batteries' total, plus 4 for every minute in action and 400 for a battle won.
- **Difficulty** scales it all: Easy 0.8, Normal 1, Hard 1.35.
- **Leaving early** still pays what was earned, without the win bonus.

Rough numbers on Normal: a lost first battle with one 6-inch gun pays about 200 RP; a full 1917 lineup about 1,500; a fully upgraded one about 2,200. The whole 1917 tree costs 4,000 RP; a battery at its best costs about 4,000 to 5,300 battery points.

**The enemy follows your strength.** A small lineup meets less counter-battery fire and smaller assaults; a full one meets the old battle. Upgrades never make the enemy stronger than that, so a better lineup still does better.

## Missions for the heavy and the long guns

The open battles now have targets made for the guns that are usually idle:

- **Deep targets** stand beyond every gun's reach but the long guns'. 1917: two depots and a corps HQ 13 to 16 km out, for the 18-inch railway gun. WW2: a supply depot, an airstrip and a corps HQ 11 to 15 km west, for the K 18 and the Gustav.
- **Heavy targets** are groups of concrete shelters only heavy shells break: the 9.2-inch, 15-inch and railway gun in 1917; the Mörser 18, the Karl and the Gustav in WW2. Light guns cannot take them.

One of each comes at a time, by day, from the bombardment on, with a 25-minute window and 90 points. They only appear when a battery in the field can serve them, and sooner when such a battery has been idle for 90 seconds.

## The campaign: one-off challenges

The 12 campaign missions stay, open in any order. Each loans its battery for a set task. **The first win pays an RP bonus** (half that battery's research cost, at least 500); it no longer grants the battery. Batteries come only from research.

## What each upgrade looks like

Every part shows in the hangar, level by level. Hover it in the modifications panel and the camera goes there; before the first level is bought, to the place where it will stand. A battery short of guns has the next gun's place pegged out and taped at the end of its line, and Guns' hover goes there.

| Part | I | II | III |
| --- | --- | --- | --- |
| Barrel | sponge staves, a bucket and an oil tin | the star gauge on its trestles beside its case | a canvas cover on the muzzle |
| Breech | the rammer and the shell tongs | the artificer's chest, oil cans and a tool roll | the breech opened and oiled, a round on the loading tray |
| Sights | red-and-white aiming posts | the director on its tripod | the plotting table under an awning |
| Camouflage | disruptive paint on the gun | hessian screens along the gun's right and back | the net drawn back off the gun, hung from a rail behind it |
| Ammunition supply | a pyramid of the gun's own shells behind its display, the powder heaped higher | two pyramids, more powder | three pyramids, more powder |
| Relief crews | reliefs in their working dress, a squad of their own | | |

The camouflage paint is on the battle's guns too, and the radio names a relief taking a fallen man's place. The muzzle cover and the open breech are for the parade only: a gun in action has neither.

## The hangar and the preview

The hangar shows the batteries you have unlocked: the one you pick stands on parade with all the guns it has earned, each gun's crew in ranks in front of it. The crews are the guns' real minimal crews (10 for a 6-inch howitzer, 250 for the Gustav; [HISTORY.md](HISTORY.md#gun-detachments) has the figures and sources), plus any relief crews. On the Research screen, **Preview the full battery** opens any battery at full strength, every gun with its crew, without researching it.

## Dev mode

The **Dev mode** switch in the top right corner of the menu bar is on by default for now. In battle it puts every battery in the field, researched and at its best. Your own career still earns underneath, and the hangar and the Research screen always show it; switch dev mode off to play it. The choice is saved.

**Unlimited points**, the switch under it, makes research and modifications free for testing: the tree order still holds, nothing is spent, and the points earned keep adding up. It is off by default and saved.

**Reset**, beside the switches, starts a new career (two clicks: the second within 4 seconds): no research, upgrades, points or battles, and the campaign missions unwon, so their RP bonus can be won again. The switches stay as they are.

## Saves and tests

- **Save:** `drumfire.campaign.v3` in browser storage: RP per era, the batteries researched, each battery's points and levels, the missions won, the battles fought, the dev switch. A v2 save is carried over: its won missions stay won and the batteries they earned stay researched.
- **Code:** the trees, parts, costs and pay are in `src/research.js`, the career in `src/progression.js`, the screens in `src/ui/menu.js` (the hangar's panels, `researchView`) with the 3D hangar in `src/ui/hangar.js`, the heavy and long guns' missions in `src/sim/specialists.js`. DESIGN.md has the contract.
- **Tests:** `node tools/progressiontest.mjs` checks research, upgrades, pay, saves and the campaign missions. `node tools/researchtest.mjs [seeds] --lineup start|early|mid|full|max|all` plays headless battles with a career's lineups and reports wins, RP and battery points.

## Still to do

- **Missions from the lineup.** The open battles still run a fixed day (`buildScript()` in the directors); only the heavy and long guns' missions follow the lineup. A day generated from the lineup would give every battery work that suits it. The hard part is that sites are baked into the ground at page load (`terrainHeight.js`, `trenchlines.js`, `world/data.js` read `SITES`), so a generator needs a pool of candidate positions per map.
- **Upgrade visuals in battle, after that.** In order: an end-card line naming what the upgrades did; the Shells marks on shells in flight and in the crews' hands; aiming posts and bigger ready-use stacks in the gun pits; relief crews walking in to replace a fallen man. The paint and the relief radio line already carry over.
- **Balance.** The pay and costs come from the all-auto headless crews; they need human playtesting. In WW2, the counter-attack's own short rounds grow with the number of guns still firing, so some upgrades turn early defeats into failed counter-attacks (DESIGN.md changelog).
