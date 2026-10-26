# Battery campaign and sandbox

Campaign completion replaces the former XP gates. Each era starts with one battery: British 6-inch howitzers or German leFH 18. A mission loans its featured battery, deploys every earlier battery in that era, and requires all their assignments to succeed. Missions can be played in any order: every one is open from the start, and its roster is fixed by the mission, not by what has been earned. Winning permanently adds the featured battery to the sandbox roster. Losing, quitting, replaying sandbox, or accumulating score grants no batteries.

The candidate starts under manual control with its target assigned. Earlier batteries start on AI and can be taken over. Each has a separate target matched to its role. Missions have a finite operation window and counter-fire, with more simultaneous assignments as the force grows. The original sandbox mission schedule is not used in campaign.

| Mission | Earned battery | Specialist assignment | Earlier batteries |
| --- | --- | --- | --- |
| Beyond the howitzers | 60-pounders | Counter-battery at 10.2 km, beyond the 6-inch battery's reach | 6-inch guns handle forward pits |
| Crack the pillboxes | 9.2-inch howitzers | Delay-fuzed concrete demolition | Both field batteries handle their gun lines |
| The buried command post | 15-inch howitzer | Heavy delay-fuzed siege fire during long reloads | Field guns and 9.2-inch guns cover gun pits and pillboxes |
| The distant command centre | 18-inch railway gun | Heavy demolition at 14.5 km | All four earlier batteries finish closer assignments |
| Break the supply position | sFH 18 | Heavy concentration on a supply dump | leFH suppresses forward guns |
| A storm over the assembly area | Nebelwerfer 41 | Six-rocket ripple and area damage on exposed guns | Both howitzer batteries cover guns and supplies |
| Reach their heavy guns | K 18 | Counter-battery at 18 km | Howitzers and rockets clear nearer positions |
| Over the parapet | Mörser 18 | Plunging delay-fuzed fire against fortified works | All four earlier batteries cover their respective targets |
| Into firing position | Karl-Gerät | Drive, lower hull, crane-load and bombard the citadel | All five earlier batteries clear the approaches |
| Under the rock | Gustav | Use the assembled railway gun to penetrate a deep magazine | All six earlier batteries have covering targets |
| Prepare the launch corridor | V-1 | Correct compass, air log and catapult launch | All seven earlier batteries complete local objectives |
| The mobile launch operation | V-2 | Erection, alignment, fuelling and launch without oxygen shortfall | V-1 launch plus all seven artillery assignments |

Target objectives require credited damage from the designated battery using the specified fuze, plus the required number of projectiles. Damaging a different target or firing the wrong fuze does not qualify. The missile objectives assess launch drill accuracy, not casualties or random interception outcomes. Campaign scenarios are fictional role exercises, not a historical chronology.

Gustav starts assembled in every campaign mission, including its unlock mission. Railway preparation and assembly are exclusive to the dedicated Sevastopol operation.

## Sandbox

The open battles (Ypres and German Flanders) are where earned batteries count: only they are instantiated in combat, and unearned batteries have no guns, AI fire, ammunition or crew contribution. German Flanders also includes the Karl; the V-1 and V-2 fire only in their own operations. The specialist operations (Gustav siege, Karl-Gerät, V-1, V-2) are open from the start with their whole roster, earned or not, as are the tutorials. The menu demonstration and tutorials may show the full equipment roster.

The main-menu **Dev mode** switch puts the full roster in the open battles for testing; it is on by default for now, and switching it off is remembered. It does not mark campaign missions completed. Keyboard **0** selects battery ten. **Main menu** exits a battle; only completed campaign missions are saved.

## Persistence and validation

Local saves use `drumfire.campaign.v2` with completed mission IDs and a dev flag. Old XP totals grant nothing; an earlier explicit dev unlock is preserved. Saving failure is shown in the menu. With browser storage blocked, progress cannot survive page navigation or reload.

Mission roles, roster order, target ranges and thresholds are in `src/campaign-data.js`. Scenario construction and objective evaluation are in `src/campaign.js`.

Run `node tools/progressiontest.mjs` for any-order play, save migration, roster exclusion, all mission target ranges, deadlines, correct-fuze damage, launch qualification and all twelve victory paths. These tests validate mechanics; difficulty and mission pacing still need human playtesting.

## Planned: missions from the lineup

Not built yet (noted 2026-10-26). The open battles run a fixed day: each director's `buildScript()` (`src/sim/director.js`, `src/ww2/director.js`, `src/ww1/director.js`) sends the same sites at the same times, whatever batteries are fielded. The aim is a day generated from the lineup, so every battery brought has work that suits it.

- **Why it is tractable.** Only the timeline is scripted: crews, console, observers and scoring read `sim.missions` and do not care who made them. The lineup already arrives as `newGame({ allowedKinds })`, `crews.canServe` already checks reach and arc, and the campaign missions (`src/campaign.js`) already place targets per roster and gate them with `requiredKind`.
- **Hard part 1: sites are baked into the ground at page load.** `terrainHeight.js`, `trenchlines.js`, `world/data.js` and `world/ruins.js` read `SITES` for pads, concrete and clear ground, so a generator cannot invent a position mid-battle. It needs a larger pool of candidate slots per map, built into the terrain once, with a subset switched on per battle.
- **Hard part 2: the long guns have nothing worth shooting.** Flanders targets are 4 to 17 km off; the K 18 reaches 29.6 km and the Gustav 47 km (the Karl was on a mission 9 % of the battle). Deep targets need ground and a map that reach that far; the British sheet is about 33 by 22 km, so beyond it needs an off-map overlay like the Paris Gun's.
- **Hard part 3: balance starts over.** The 72-seed tables are tuned to the fixed day. Add a test of each battery's busy share across random lineups (none under about 40 %) beside the win rates.
- **Unaffected.** The tutorials (the scripted range) and the campaign missions (their own director).

Steps:

1. **A generator over today's sites** (`src/sim/missiongen.js`, deterministic on `sim.rng`): keep the five phases; choose which targets, when and how many from the lineup (about one more open mission than batteries); never issue a mission nobody can serve; give a battery idle for about two minutes a target in its niche. Director code and a test only, no terrain changes; variety stays limited (14 British sites). Start on one mode: WW2 Flanders shows the idle long guns most, 1917 is the main game.
2. **Pools of candidate slots per map** in depth bands (front 0 to 3 km past the line, close 3 to 8, deep 8 to 18, far 18 to 45).
3. **Deep targets for the long guns**, with the off-map overlay.

It only matters once lineups differ: dev mode, on by default, fields every battery. It is also the mission half of the deferred research-and-upgrades progression idea, but can be built without that economy.
