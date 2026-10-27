# History and sources

Back to the [README](../README.md).

**History gives the guns, the places, the words and the procedures; the ranges, loading times, damage and balance are game rules.** Drumfire is an arcade game with period flavour, not a gunnery simulator.

**The long versions.** History and game numbers are kept apart in two write-ups. Each gives every weapon's real specifications with their sources, every departure of the game's tables from them, and the balancing assumptions:

- [WW1.md](WW1.md): the German side in 1918.
- [WW2.md](WW2.md): the German weapons of the Second World War.

The game itself shows no history notes.

## What is real and what is game

- **The 18-inch railway howitzer is a what-if gun.** The real British 18-inch railway howitzer was ordered in 1918, proofed in 1920 or 1921, and never fired in the war. The 18-inch naval guns of the monitors General Wolfe and Lord Clive did fire on the Belgian coast in 1918. So in 1917 the Group has it in place of the 12-inch railway howitzers that really served at Ypres.
- **The WW2 weapons never served together,** so each has its own operation. The Gustav in the Flanders battle is alternate history: the real one fired only at Sevastopol.
- **The WW1 German guns and the Gamma** together on one map are the sandbox's licence.
- **The V-weapons** were used chiefly against cities and were built with concentration-camp forced labour. Their missions target the port of Antwerp, score only the launch drill and whether the round reached the target area, and never count casualties.
- **The Paris Gun's real target was Paris,** and the game never names it: the gun fires at military targets off the map.
- **The campaign missions** are fictional exercises arranged by each battery's role, not a historical chronology.

## Gun detachments

**The hangar parades each gun's minimal crew,** the men who served it in action (`src/research.js` `DETACHMENT`). The thousands behind the biggest guns (track layers, flak, guards, the ammunition columns) are not counted. The "Relief crews" upgrade adds men to take turns at the heavy work; the game does not model fatigue, and the sim's own crew pool (`GUNS[kind].crew`, from which casualties are drawn) stays a game number, scaled to these men on the guns card.

| Gun | Men | Source |
| --- | --- | --- |
| 6-inch 26 cwt howitzer | 10 | [Wikipedia](https://en.wikipedia.org/wiki/BL_6-inch_26_cwt_howitzer), [RCA Museum](https://en.rcamuseum.com/?p=165) |
| 60-pounder | 10 | [Wikipedia](https://en.wikipedia.org/wiki/BL_60-pounder_gun) |
| 9.2-inch howitzer | 14 (estimate) | no per-gun figure found; a section was 2 officers and 41 other ranks with its drivers ([Great War Forum](https://www.greatwarforum.org/blogs/entry/2777-92-inch-howitzer-mother/)) |
| 15-inch howitzer | 16 (estimate) | no per-gun figure found ([Wikipedia](https://en.wikipedia.org/wiki/BL_15-inch_howitzer)) |
| 18-inch railway howitzer | 30 | the crew of the 14-inch railway gun, whose mounting it used ([Wikipedia](https://en.wikipedia.org/wiki/BL_14-inch_railway_gun)) |
| 10.5 cm leFH 18 | 6 | [Wikipedia](https://en.wikipedia.org/wiki/10.5_cm_leFH_18) |
| 15 cm sFH 18 | 7 | [Wikipedia](https://en.wikipedia.org/wiki/15_cm_sFH_18) |
| 17 cm K 18 | 10 | [Wikipedia](https://en.wikipedia.org/wiki/17_cm_Kanone_18) |
| 21 cm Mörser 18 | 10 | same carriage as the K 18; sources give 6 to 10 ([Military Factory](https://www.militaryfactory.com/armor/detail.php?armor_id=761)) |
| 15 cm Nebelwerfer 41 | 5 | [Wikipedia](https://en.wikipedia.org/wiki/15_cm_Nebelwerfer_41) |
| Karl-Gerät | 21 | [Wikipedia](https://en.wikipedia.org/wiki/Karl-Ger%C3%A4t): commander, driver, assistant driver and 18 gunners |
| Schwerer Gustav | 250 | about 250 to assemble and serve it, about 2,500 more for track and site ([Wikipedia](https://en.wikipedia.org/wiki/Schwerer_Gustav)) |
| 42 cm Paris Gun | 80 | Imperial Navy sailors ([Wikipedia](https://en.wikipedia.org/wiki/Paris_Gun)) |
| 42 cm M-Gerät "Big Bertha" | 120 (estimate) | half of the 240 men its two-gun battery went to war with ([Wikipedia](https://en.wikipedia.org/wiki/Big_Bertha_(howitzer))) |
| 42 cm Gamma-Mörser | 250 (estimate) | about 250 to serve, set up and strip it ([Topwar](https://en.topwar.ru/108559-sverhtyazheloe-osadnoe-orudie-42-cm-gamma-morser-germaniya.html)) |
| 38 cm SK L/45 "Langer Max" | 40 (estimate) | no figure found; twelve men rammed a shell ([Wikipedia](https://en.wikipedia.org/wiki/38_cm_SK_L/45_%22Max%22)) |
| 10 cm K 17, 15 cm sFH 13, 21 cm Mörser 16 | 8, 8, 10 (estimates) | no figures found; set beside their WW2 successors |
