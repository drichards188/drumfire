# Battery campaign and sandbox

Campaign completion replaces the former XP gates. Each era starts with one battery: British 6-inch howitzers or German leFH 18. A mission loans its featured battery, deploys every earlier battery in that era, and requires all their assignments to succeed. Winning permanently adds the featured battery to the sandbox roster and opens the next mission. Losing, quitting, replaying sandbox, or accumulating score grants no unlocks.

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
| The inner redoubt | Big Bertha | Siege demolition at 6 km | All five earlier batteries maintain covering fire |
| Into firing position | Karl-Gerät | Drive, lower hull, crane-load and bombard the citadel | All six earlier batteries clear the approaches |
| Under the rock | Gustav | Use the assembled railway gun to penetrate a deep magazine | All seven earlier batteries have covering targets |
| Prepare the launch corridor | V-1 | Correct compass, air log and catapult launch | All eight earlier batteries complete local objectives |
| The mobile launch operation | V-2 | Erection, alignment, fuelling and launch without oxygen shortfall | V-1 launch plus all eight artillery assignments |

Target objectives require credited damage from the designated battery using the specified fuze, plus the required number of projectiles. Damaging a different target or firing the wrong fuze does not qualify. The missile objectives assess launch drill accuracy, not casualties or random interception outcomes. Campaign scenarios are fictional role exercises, not a historical chronology.

Gustav starts assembled in every campaign mission, including its unlock mission. Railway preparation and assembly are exclusive to the dedicated Sevastopol operation.

## Sandbox

The existing open battles remain available. Only earned batteries are instantiated in combat: locked batteries have no guns, AI fire, ammunition or crew contribution. The menu demonstration and tutorials may show the full equipment roster. German Flanders now includes Karl, V-1 and V-2 as well as the existing seven batteries; the separate specialist operations remain available once their signature battery is earned. A strategic launch battery cannot end the combined battle on its own.

The main-menu **Dev: unlock all batteries** button makes the full roster and all campaign missions available for testing. It does not mark campaign missions completed. Keyboard **0** selects battery ten. **Main menu** exits a battle; only completed campaign missions are saved.

## Persistence and validation

Local saves use `drumfire.campaign.v2` with completed mission IDs and a dev flag. Old XP totals grant nothing; an earlier explicit dev unlock is preserved. Saving failure is shown in the menu. With browser storage blocked, progress cannot survive page navigation or reload.

Mission roles, roster order, target ranges and thresholds are in `src/campaign-data.js`. Scenario construction and objective evaluation are in `src/campaign.js`.

Run `node tools/progressiontest.mjs` for prerequisites, save migration, roster exclusion, all mission target ranges, deadlines, correct-fuze damage, launch qualification and all thirteen victory paths. These tests validate mechanics; difficulty and mission pacing still need human playtesting.
