# WW1 German mode: sources, real figures and departures

Reference for the German-side WW1 mode (DESIGN.md "WW1 German mode", `src/sim/tables_ww1.js`, `src/ww1/`). It gives the setting,
the doctrine, the words, and for every weapon the real figures with their sources, the game's value beside them, and
why the game differs. Like `docs/WW2.md`, which is its template, it exists so that the departures are deliberate and
known; the game stays an arcade game with period flavour (DESIGN.md, "Simulation fidelity").

Source marks (as in WW2.md): **P** period primary, **I** institutional (museum, archive), **S** secondary history,
**W** Wikipedia and similar general references (German and English Wikipedia are used as secondary sources where
nothing better was reached), **M** memoir. Confidence marks in the Words section: **high**, **medium**, **low**.

The sections are in the order: Words (1), setting (2), doctrine (3), guns (4), the British side as targets (5),
departures (6), sources (7).

---

## 1. Words (for the console's German text)

Practical list for the integration agent. Spelling follows 1918 usage where it differs from today (Kanone is the
period spelling of the Kartuschen era; "Mörser", "Granate", "Schuss"). The game's text uses ß and umlauts. German is
the mode's language of the console; English is the fallback in tooltips. Confidence is the author's estimate of how
surely the term, in that sense, belongs to German artillery of 1917 and 1918. Nothing here is a claim about real events.

### 1.1 Missions

| English | German (1918) | Note | Confidence |
|---|---|---|---|
| counter-battery | Gegenbatteriefeuer, Bekämpfung feindlicher Batterien | the standard term; "Gegenbatterie" for the task | high |
| destruction | Zerstörungsfeuer, Zerstörungsschießen | against trenches, strongpoints, pillboxes, batteries in cover | high |
| fire for effect | Wirkungsschießen, Feuer zur Wirkung | after ranging | high |
| ranging, registration | Einschießen | the Germans register by "Gabel" (bracket) | high |
| barrage (defensive) | Sperrfeuer, Abriegelungsfeuer | Sperrfeuer is the usual word for any curtain of fire | high |
| creeping barrage | Feuerwalze | Bruchmüller's Feuerwalze moved by bounds (Sprünge) at a fixed rate | high |
| harassing fire | Störungsfeuer, Belästigungsfeuer | Störungsfeuer is the attested term | medium |
| wire cutting | Drahtzerstörung, Hindernisbekämpfung, Zerstörung der Hindernisse | | medium |
| surprise bombardment | Feuerüberfall | the Bruchmüller opening shock, unregistered | high |
| preparation, bombardment | Feuervorbereitung, Artillerievorbereitung | | high |
| drumfire | Trommelfeuer | the contemporary word for sustained heavy fire; also used by the British translation | high |
| gas shelling | Gasschießen; Buntschießen (mixed gas and HE) | Blaukreuz, Grünkreuz, Gelbkreuz by shell marking; the game has no gas | medium |
| smoke | Nebelschießen | | medium |
| fire plan | Feuerplan | | high |
| SOS (British call) | not used by Germans; the German equivalent is "Sperrfeuer anfordern" (call for barrage), by light signal or telephone | | low |
| mission in hand | Auftrag, Feuerauftrag | | medium |
| target | Ziel; target number "Ziel Nr." | | high |

### 1.2 Observers and intelligence

| English | German | Note | Confidence |
|---|---|---|---|
| forward observer | Vorgeschobener Beobachter (V.B.), Artilleriebeobachter | from the Beobachtungsstelle (B-Stelle), a post in the line | high |
| observation post | Beobachtungsstelle (B-Stelle, B.-St.) | | high |
| aircraft observer | Artillerieflieger, Fliegerbeobachter | by wireless (Funk) from the Feldflieger-Abteilung (A) | high |
| kite balloon | Fesselballon, Drachenballon (Parseval-Sigsfeld; the Drachen) | the crew are Ballonbeobachter | high |
| sound ranging | Schallmessen, Schallmessverfahren; the unit "Schallmess-Trupp" | | medium |
| flash spotting | Lichtmessen, Lichtmessverfahren; "Lichtmess-Trupp" | "Mündungsfeuer" is the muzzle flash | medium |
| battery position (enemy) | Batteriestellung | | high |
| air photograph | Fliegerbild, Luftbild | | high |
| fall of shot | Schuss, Einschlag, Aufschlag; "Sprengpunkt" for the burst of an air-burst | | high |
| message to the guns | Meldung, Befehl; telephone "Fernsprecher" | | high |
| weather report | Wetterbericht, Wettermeldung (the Pulkowski method needs it daily) | | medium |

### 1.3 Fire order (Feuerkommando) and its parts

The German battery order of the period is a run of short parts given in a fixed order by the battery commander
(Batterieführer) and repeated by the gun commander (Geschützführer). The order below is the structure to build the
fire order card around. It is reconstructed from the Schiessvorschrift pattern (Ziel, Geschoss, Zünder, Ladung,
Richtung, Aufsatz, Feuerart) and is of medium confidence for exact wording.

| Part | German | Meaning in the game |
|---|---|---|
| attention | "Batterie!" or "Geschütz 1!" | selects the guns (guns selector) |
| target | "Ziel: [Beschreibung]" | the mission (target number, nature) |
| shell | "Granate", "Sprenggranate", "Minengranate", "Schrapnell", "Gasgranate" | shell kind |
| fuze | "Aufschlagzünder", "mit Verzögerung" (m.V.) or "ohne Verzögerung" (o.V.), "Zeitzünder", "Doppelzünder" | fuze |
| charge | "Ladung 1, 2, 3 ..." or "Teilladung", "Vorkartusche" (the heavy guns' bags) | charge |
| direction | "Richtung: [Teilstrich] links/rechts" or "Seitenrichtung" | traverse |
| range, elevation | "Aufsatz [m]" (the sight setting in metres) or "Erhöhung [Grad]" | range or elevation |
| rounds | "[n] Schuss", "Lage" (a round from every gun), "Salve", "Schnellfeuer" | rounds |
| execute | "Feuer!" ("Los!" for the single gun, "Batterie, Feuer!") | fire |
| cease | "Feuer einstellen", "Halt!" | cease fire |
| ready | "Fertig!" | reported by the layer or the gun |
| gun loaded | "Geladen" | |
| gun laid | "Gerichtet" | |

Pulkowski's method uses "Schussweite" (range) and "Gradzahl" corrected for the day's conditions; on the card a "Tages-
Korrektur" (daily correction) line would be at home (medium).

### 1.4 Fall of shot and corrections

| English | German | Confidence |
|---|---|---|
| short | kurz | high |
| over | weit | high |
| left | links | high |
| right | rechts | high |
| add (lengthen) | "weiter" (+) (also "mehr"/"plus") | high |
| drop (shorten) | "kürzer" (-) (also "weniger"/"minus") | high |
| bracket | Gabel (the long and the short shot); "Gabel schießen" | high |
| bisect the bracket | "Gabel halbieren" | high |
| on target | "Treffer", "im Ziel", "gut" (in the Gabel: "Gabel eng") | medium |
| ranging complete | "Eingeschossen" | high |
| line correction | Seitenverbesserung, "Seitenkorrektur" | medium |
| range correction | Entfernungsverbesserung | medium |
| dud | Blindgänger | high |
| premature | Frühzerspringer | medium |

Corrections in the game are in metres (see 1.5).

### 1.5 Units of measure

| Quantity | German practice | Game | Confidence |
|---|---|---|---|
| range, distances | metres (Meter, m); kilometres for the long guns | metres; `metric: true` | high |
| height | metres (Höhen over NN or over the map datum) | metres | high |
| angles in the artillery | the Strich (pl. Striche), a full circle of 6400; the field artillery used the 0-6400 scale to the end of the war. The Fußartillerie (the foot artillery, which served the heavy howitzers and mortars, i.e. most of this roster) used a 0-5760 scale (1/16 of a degree) with a rounded 0-5800 version until 1916, and converted to 6400 around 1916, slowly in reserve and Landwehr units (Lovett Artillery collection, a collector's site, so medium) | direction in Strich (6400), shown with degrees beside it | medium |
| elevation of heavy guns | degrees (Grad) for the siege and naval guns; the Marine and Krupp railway and coast guns (Langer Max, Paris Gun) were laid in degrees | degrees for elevation | medium |
| sight setting | the Aufsatz in metres (field and foot guns) or the Erhöhung in degrees | metres | medium |
| weight | kilograms (kg) | kg | high |
| time | the 24-hour clock ("14 Uhr 30") | 24-hour | high |

A note on the Strich. The German "Strich" as 1/6400 of a circle is attested; the one wrinkle is the Fußartillerie's
older 5760 scale (one unit is 1/16 degree, so 1 Strich 6400 is 0.05625 degrees and one 5760 unit is 0.0625 degrees).
By 1918 the sources found here say the heavy artillery had converted, though stragglers kept the old scale. For the
game, 6400 is right for 1918 (medium) and the game never needs both. Show directions to the layer in Strich and the
angle in degrees beside; show elevation in degrees only.

### 1.6 The map and grid

**What is known (medium).** The German Army's working maps in 1918 were the 1:25,000 sheets (the mainstay of the
German Army; the Prussian Messtischblatt series is also 1:25,000), 1:20,000 plans of the front made from air photographs
and captured British maps, and 1:10,000 and 1:5,000 trench plans (Grabenpläne). A captured German 1:20,000 map of
northern France dated October 1918 carries a British grid superimposed (Bangor University archive record), and German
artillery plans were routinely printed on British sheet lines. **What is not known (low):** how a reference to a
point in the 1918 German system was written. This research did not find a source describing the lettering and
numbering of the German artillery Planquadrat on the Flanders sheets. The brief asks for "the Planquadrat system on the
1:25,000 / 1:10,000 sheets"; the honest answer is that the word Planquadrat (grid square) is right, the exact form of the
reference is not documented here, and the mode should not claim one.

| Item | German | Confidence |
|---|---|---|
| grid square | Planquadrat (generic) | high |
| sheet | Blatt, Kartenblatt | high |
| map, plan | Karte; Plan; Grabenplan (trench plan); Messtischblatt (1:25,000, Prussian) | high |
| scale | Maßstab 1:25 000, 1:10 000 | high |
| tenths of a square | Zehntel (as the British, to tenths of the square) | low |
| height | Höhe über NN | medium |

**Recommendation for the integration agent.** Keep the game's own lettered-square, numbered-cell and quarter grid
(`gridRef`, sheet 28) because it is the map the player sees, and it is what the Germans actually reused (they printed
on British sheet lines). Label it in German with the words above (Planquadrat, Blatt, Feld for the cell). Write a
reference exactly as the British game does (`J.14.c.3.7`); do not invent a distinct German letter code. The
Germans' own plans did number squares, but the form is undocumented here, so no text should state one. State of
knowledge: the National Archives' captured-map listings show British-labelled German battery numbers (for example
"AX36") on Allied sheets, which are British designations and not a German reference scheme.

---

## 2. The setting: Flanders, spring 1918

**History.** After the March 1918 offensive (Operation Michael, Somme, 21 March) the German high command turned north.
Operation Georgette, the Battle of the Lys (also called the Fourth Battle of Ypres), ran from 7 to 29 April 1918:
the German Sixth Army (von Quast) in the south and the Fourth Army (Sixt von Armin) in the north attacked the
British First Army (Horne, weak, with two Portuguese divisions) and Second Army (Plumer). The bombardment opened on the
evening of 7 April against the line from Armentières to Festubert and ran until dawn on 9 April; the infantry went in
on 9 April, took Estaires and Armentières (10 April), Messines (10 to 11 April), Merville and Bailleul, and the
British gave up the Passchendaele ridge for the Ypres and Yser Canal line (about 12 to 16 April); the Germans took the
Kemmelberg in the Second Battle of Kemmel (25 to 26 April) and called off the offensive on 29 April. They broke in up
to about 15 km but did not take Hazebrouck or the Ypres salient (W, en.wikipedia.org "Battle of the Lys (1918)").
Casualties disagree by source (British 76,300 to 160,000; German 82,000 to 109,300) and are not used by the game.
Georg Bruchmüller planned the artillery; by one account "defying instructions" he dropped preliminary registration and
fired from the map, with registration by observation in the first phase only (W, Bruchmüller). The Paris Gun, on
the other hand, was firing from the Aisne at Paris (March to August 1918, section 4.7); the Gamma batteries and some
M-Gerät guns were in action in the spring and July offensives (W).

**How the game stages it.** A fictional engagement on the game's own Ypres map with the sides turned round: the German
batteries stand on the ridge in the east (positive x) and fire west at the British gun line, which stands in the
British game's own gun pits (UNITS placements). Nothing claims a real date, a real unit or a real result. It is
not Georgette: the real attack in April 1918 was south of Ypres and on Messines. The map is the British game's
1917 salient, and the game keeps its 1917 look (mud, craters, the trenches and ruins), with German 1917 field-grey
dress on the crews. The mode is a sandbox: one open battle with the whole roster but the Paris Gun, and the Paris
Gun's own mission (the gun alone in its emplacement, as the WW2 mode's V-1 and V-2 have theirs), no campaign locks.

**Alternate history, plainly.** The roster is a possible, not a documented, grouping:

| Unit | Real in Flanders 1918? | In the game |
|---|---|---|
| 21 cm Mörser 16, 15 cm sFH 13, 10 cm K 17 | yes, standard Western Front heavy artillery | as real |
| 38 cm "Langer Max" on E. u. B. | yes: the Flanders coast batteries (Pommern at Koekelare, Deutschland) fired from fixed positions, and the E. u. B. rail mounting came at the end of 1917 | as real; the Koekelare gun fired on Dunkirk, here it fires on the British gun line |
| 42 cm M-Gerät "Dicke Bertha" | in service 1914 to 1918, used in the spring offensives (W); no record found of one in Georgette | **alternate**: a road-mobile siege howitzer put in a field battle |
| 42 cm Gamma-Mörser | batteries in the 1914 Antwerp and Ypres area, on the Somme and at Reims 1918 (W), not in Flanders in April 1918 | **alternate**: a fixed gun on its bed, set up and ready |
| Paris-Geschütz | no: it shelled Paris from Crépy (Aisne), 120 km, March to August 1918 | **alternate**: not in the open battle; its own mission, four military targets off the map; see 4.7 |

The Paris Gun is history that the game must not trivialize. In 1918 it killed civilians in Paris: 250 killed and 620
wounded in all, 91 killed and 68 wounded when a shell hit the church of Saint-Gervais on 29 March 1918 (W). The game
gives it only military targets (a railway junction, a tank depot, a reserve camp and an aerodrome, about 120 km west,
off the map, none named after a place), names no city, and keeps this history here and out of its text. Its rounds
there are described by what they hold up (trains, reserves, tanks, aircraft), not by casualties.

---

## 3. Doctrine

**Bruchmüller's fire plans.** Oberst Georg Bruchmüller (1863 to 1948), a retired artillery officer recalled in 1914,
centralised the artillery fire plan in a staff of detailed timetables (Feuerpläne) over many batteries: Tarnopol
(July 1917, 134 batteries), Riga (September 1917), then Michael (3.5 million shells in five hours) and the later
offensives (Lys, Third Aisne, Second Marne) (W; Britannica, Liddell Hart called him "the greatest artillery expert
of the war"). His bombardment ran in short, hurricane stages, not days: a first, sudden stage on headquarters,
telephone links, command posts, enemy batteries and infantry positions with extensive gas ("Buntschießen" mixed
the shell colours: Blaukreuz to make masks unbearable, Grünkreuz and Gelbkreuz to kill); a second with more guns
on enemy batteries (about 100 shells from 6-inch howitzers to knock out a gun pit); a third of fire for effect
with the heavy guns hitting the long-range targets, then the **Feuerwalze**, the creeping barrage, which the infantry
followed by bounds (W). Fire was deep and fast shifting under central control.

**The Pulkowski method (predicted fire).** Hauptmann Erich Pulkowski, with mathematicians' tables behind it, gave the German artillery a way to hit without registration: each gun's position
was surveyed on the map, its muzzle velocity and bore wear measured on the range (calibration), and the day's
corrections taken from a meteorological report (air temperature, wind speed and direction, air density); the
battery then fired from the map at the first round. Surprise was the point: no ranging rounds that warned the
enemy (W, Bruchmüller; the details of the Pulkowski tables are secondary at best, medium confidence).
Sources disagree on how fully this was used in the Lys battle: Zabecki (as quoted on a forum) has Bruchmüller's army
using no abbreviated registration; Mosier is cited for no prior registration at all; Wikipedia has guns
registered by observation in the first phase (low confidence on which is right).

**How far the game models them.** The game keeps the procedure and the words, not the physics (DESIGN.md, "Simulation fidelity"):

| Doctrine | In the game |
|---|---|
| Calibration of each gun | the per-gun calibration error (`GUNS.calib`) exists, in the British game too; it is shown as a gun's "Kalibrierung" if the integration agent wishes |
| Daily weather report | the day's wind, shown on the card as the "Wetterbericht"; the player applies it by correcting |
| Firing without registration | possible; the player may open fire on the map and pay for the dispersion and the unknown error |
| Registration by Gabel | the bracket ("long, short, halve") is the observer's routine with "weiter"/"kürzer" corrections |
| Feuerwalze | the creeping barrage the player lifts (and with the sides turned, the German infantry follow); a game phase, not a timetable of a hundred batteries |
| Gas | not modelled (DESIGN.md, "Simulation fidelity": dirt and smoke move like dirt and smoke; no gas in the game) |
| Centralised fire plan | not modelled: the player is the one commander |

---

## 4. The guns

The game rows are those of `src/sim/tables_ww1.js` as read during this writing (they are first-pass and the sim agent
owns them; check the file for the live values). Figures are real; "Game" is the first-pass row. Rounding follows the
sources. Where Wikipedia is the only source it is marked W; the quality of Wikipedia's German artillery figures
is uneven and several infoboxes contradict their own text, as noted.

### 4.1 21 cm Mörser 16 (M 16)

Krupp designed it in 1915 as a mortar for the foot artillery; produced 1916 to 1918, 736 built (W). It fired from a
box-trail carriage with a shield and hydro-pneumatic recoil; originally it broke into two loads for transport. It
served from 1916 to 1950 (Germany to about 1940 in the first line, Sweden bought a dozen in 1918, Finland used four
in the Continuation War) (W).

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre | 211 mm | W | 211 mm |
| Barrel | 2.67 m (L/14.5 stated; 14.5 x 211 mm is 3.06 m, so one figure is wrong) | W | not modelled |
| Weight | 6,680 kg | W | 113 kg shell; `mass` field is the shell |
| Shell | HE 21 cm Gr 18, 113 kg; concrete-piercing Gr 18 Be, 121.4 kg (a later, WW2-era round) | W | HE 113 kg |
| MV, range | 393 m/s, 11,100 m | W | 393 m/s at charge 6 |
| Elevation | -6 to +70 deg | W | +10 to +70 |
| Traverse | 4 deg | W | +-29 deg (58 total, deliberately wide for play) |
| Rate | 1 to 2 rounds per minute | W | cycle 25 s |
| Crew | not found | | 10 |

Game differences: the traverse is stretched so the player can lay on more than one target; the cycle is a game
timing. The concrete-piercing round is not 1918.

### 4.2 15 cm schwere Feldhaubitze 13 (sFH 13)

The standard German heavy field howitzer of the war, designed 1913 (Krupp and Rheinmetall) and in service 1913 to 1945,
with 3,409 to about 3,500 built (W; the infobox and the history text differ). A battery (four guns) is the unit of the
Fußartillerie and the divisional heavy howitzer battalion (std.).

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre | 149.1 mm | W | 149.1 mm |
| Barrel | 2.096 m (stated L/17; 14 x 149 mm is 2.09 m, so L/14) | W | not modelled |
| Weight in action | 2,250 kg | W | |
| Shell | HE 42 kg (also gas, shrapnel and smoke) | W; std. | HE 42 kg |
| MV, range | 377 m/s, 8,600 m (W infobox gives 8,900 m "effective", std. 8,600) | W | 377 m/s |
| Elevation | -4 to +45 deg | W | +2 to +45 |
| Traverse | 5 deg (the carriage), 8 deg in some sources | W | +-30 deg |
| Charges | 7 | W | 4 offered (1, 3, 5, 7) |
| Rate | 3 rounds per minute (burst) | W | cycle 12.5 s |
| Crew | 8 (std.) | std. | 8 |

### 4.3 10 cm Kanone 17 (K 17)

A 1917 German field gun for the heavy artillery, 105 mm, built in a short run (192, 1917 to 1918) and used
into the next war mostly on the coast (W). Its shell was 18.5 kg; the Germans had been out-ranged by the British
60-pounder and the K 17 answered it.

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 105 mm, L/45 (4.725 m); the page also prints 2.036 m, which cannot be L/45 | W | |
| Weight | 3,300 kg | W | |
| Shell | 18.5 kg | W | 18.5 kg |
| MV, range | 650 m/s, 16,500 m | W | 450 and 650 m/s |
| Elevation, traverse | -2 to +45, 6 deg | W | +2 to +45, +-30 |
| Crew | not found | | 7 |

Game: the shrapnel option is an arcade extra (the K 17 had a shrapnel round; std.).

### 4.4 42 cm M-Gerät ("Dicke Bertha")

See also WW2.md section 7 and `src/bertha/`. Krupp's 42 cm kurze Marinekanone 14 (M-Gerät), 12 built; the
road-mobile siege howitzer of 1914 which broke the Liège, Namur, Maubeuge and Antwerp forts and then failed against
the modern Verdun forts in 1916; it fired in the spring and July offensives with little effect and the
survivors were surrendered in November 1918 (W). In the game it is alternate history to place it in an April 1918
field battle: it is the siege weapon of 1914.

| Spec | Real | Source | Game |
|---|---|---|---|
| Weight in action | 42.6 t; dismantled in five wagons of 16 to 20 t plus a carriage wagon | W | |
| Barrel | 5.04 m, L/12 | W | |
| Shells | 810 kg (heavy), 400 kg (light) (std.); Wikipedia gives "400 to 1,160 kg" for this and the Gamma | W; S | 810 kg |
| MV | 400 m/s (infobox), about 815 m/s (text, doubtful); 426 m/s (historyofwar.org) | W; S | `bertha` row, WW2 sheet |
| Range | 9,300 m (heavy shell), about 12,300 to 12,500 m (light) | W; S | 12 km (stretched) |
| Elevation, traverse | +40 to +75 (std.), Wikipedia says 65; 20 deg | W; std. | |
| Rate | about 8 rounds an hour | W | cycle 55 s |
| Crew | about 200 with the battery | S | 12 drawn |

Premature explosions in the shell from early 1916 made crews fire by lanyard from a distance (W).

### 4.5 38 cm SK L/45 "Langer Max" on its E. u. B. mounting

A naval gun built for the Sachsen-class battleships (never completed), taken for land service from 1915, "Max" or
"Langer Max" to the troops, and "Big Bertha" to the Allies who applied it to anything large. The first guns fired in
fixed positions (Verdun, February 1916), and the concrete emplacements took a month or more to build. Krupp's **E. u.
B.** mounting (Eisenbahn und Bettungsgerüst, rail and bedding) came at the end of 1917: the gun could fire from rails
at low elevation or be jacked onto a rotating steel bed (the "Bettung mit Eisenunterbau", from May 1918 in about three
weeks) for full elevation and 360 degrees (W). The Flanders coast batteries (Pommern at Koekelare, Deutschland) kept
Ostend and Dunkirk under fire; Pommern was captured by the Belgians on 16 October 1918 and is the Lange Max Museum
today (W; the gun's Paris Gun barrel and carriage descend from the type, see 4.7).

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 380 mm, 16.13 m (L/45) | W | 380 mm |
| Weight | 267.9 t (rail carriage) | W | |
| Shells | HE 750 kg (67 kg filling), capped 743 kg (38.7 km), shrapnel 750 kg, light capped 400 kg to 47.5 km | W | 750 kg class |
| MV | 800 m/s (heavy), 800 to 890 (capped), 1,040 m/s (light) | W | 600, 700, 800 m/s |
| Range | 34.2 km (750 kg HE); 22.2 km on rails at 18.5 deg; 47.5 km emplaced (light) | W | |
| Elevation | 0 to 18.5 deg on rails; to 55 deg emplaced | W | +5 to +45 |
| Traverse | 2 deg fine on rails (the carriage moved by the track); 360 emplaced | W | +-24 deg |
| Loading | at zero elevation, re-laid every shot | W | `loadEl` 0 |
| Crew | "an estimated twelve to ram the shell" | W | 14 |
| Built | "8" (the mirror's variant list) and "more than 28" in the infobox; sources disagree | W | one gun |

Game: the traverse and the elevation range are those of the bedded mounting; the game gun does not roll along a track.
The muzzle velocities are lowered to bring the game range onto the map (about 32 km at most).

### 4.6 42 cm Gamma-Mörser

Krupp's 42 cm Gamma-Gerät, the successor to the M-Gerät, an immobile siege mortar that was fired from a
concrete or steel bed and moved in seven (WWI) or ten (WWII) rail loads of 20 to 25 t; emplacement took about 24
hours with a 25 t gantry crane (W). Ten built plus 18 spare barrels (W). Batteries (KMK) 1, 2 and 4 in 1914: Manonviller,
Maubeuge, Antwerp, then Nieuport, Ypres and Dixmuide from Flanders (Battery 2); Osowiec, Kaunas, Serbia in 1915; Verdun
in 1916 (fired at Douaumont, Vaux, Souville, Moulainville, with thirteen 42 cm guns of both types), the Somme, and Reims in
July 1918; one remained at the end of the war (W). A WW1 Gamma survived and fired in 1940 and at Sevastopol in 1942
(WW2.md section 7).

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 420 mm, 6.7 m (stated both L/12 and L/16; 15.9 x 420 would be 6.7 m so L/16) | W | |
| Weight | 150 t | W | `mass` field is the shell, 1,160 kg |
| Shell | 400 to 1,160 kg (the page repeats the M-Gerät text); WW2 concrete-piercing 1,003 kg | W; S | 1,160 kg |
| MV | 452 m/s at full charge | W | 452 m/s at charge 4 |
| Range | 14,000 to 14,200 m | W | |
| Elevation | +43 to +75 deg | W | +40 to +63 |
| Traverse | 46 deg | W | +-11.5 deg |
| Rate | one shell per 7 minutes (8 an hour); fastest 19 an hour | W | cycle 82 s |
| Crew | not found | | 14 |

Game: the elevation limit is lower and the traverse smaller so the model's pivots do not clip; the gun is "set up
and ready" because emplacement was a day's work. Alternate history in Flanders 1918, as above.

### 4.7 The Paris-Geschütz (Paris Gun, Wilhelmgeschütz, Kaiser-Wilhelm-Geschütz)

**History.** Krupp built it from a 38 cm SK L/45 barrel with a 21 cm liner (Rohr) and a 6 m smooth-bore
extension; the total barrel length is given as 34 to 37 m (the infobox gives 21 m, the liner only) (W). It was
mounted on a rotating platform on a concrete bed near Crépy, Aisne (Mont de Joie), manned by about 80 naval
personnel under naval command, and fired at Paris from 23 March 1918 to August 1918. It killed 250 and wounded 620 in
all (W). The shell climbed to about 40 km and the flight lasted about 182 s; the Coriolis effect was large
enough to be calculated (W). Rounds fired: between 320 and 367 (W); barrel life about 65 rounds before each rebore to
a slightly larger calibre, so the shells were numbered in sets of increasing diameter.

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre | 211 mm (later 238 mm after reboring); 210, 216 and 240 mm appear in the sources | W | 211 mm |
| Barrel | 21 m (infobox), 34 to 37 m total with extension | W | |
| Weight | 256 t | W | |
| Shell | 106 kg, 7 kg TNT, two fuzes | W | 106 kg |
| MV | 1,640 m/s | W | 1,640 m/s |
| Range | 130 km (infobox), 120 km Paris; the press reported 100 km | W | off map, about 120 km |
| Max altitude | about 40 to 42.3 km | W | |
| Elevation | 50 to 55 deg | W | +50 to +55 |
| Rate | at most about 20 shells a day | W | cycle 123 s |
| Crew | 80 naval personnel | W | 16 |
| Barrel life | about 65 rounds | W | 65 rounds a barrel (`src/ww1/special.js` `BARREL_LIFE`); the change takes 7 minutes of game time |
| Built | seven barrels | W | one |

**What the game does differently and why.** The targets in the game are military ones (a railway junction, a tank
depot, a reserve camp and an aerodrome, about 120 km west, off the map) and no text names Paris. The Armee's orders
for rounds on them through the day are the game's own: the real gun had one target and fired on a timetable. The game's shell flies to 40 km up, goes off the map, and reports
after the flight time. The historical record (it was a terror weapon, aimed at a city, 250 killed) stays in this
file. The wear is the heart of the game's procedure (`src/ww1/special.js`): the shells are numbered in the barrel's
set and each is slightly fatter, the charge must be raised as the bore wears or the round falls short, the line
takes a correction for the Earth's turning and the day's wind aloft, and after about 65 rounds the barrel is
changed (the battle opens on the third barrel with about 50 rounds through it). The sim does not keep the bore wear
in `wearPerRound`, which is 0 for this gun; the controller holds it. In the game's grouping the gun stands with the
Flanders guns although in reality it sat far to the south.

---

## 5. The British side of 1918 (targets)

The figures are standard ones from the secondary literature (std.) and Wikipedia (W); they were not re-read for this
pass beyond the notes. The game does not model them as shooters beyond the counter-battery shell rows, so the
numbers are for the look and the words. The British guns reuse the British game's own rigs.

| Target | Notes | Source |
|---|---|---|
| 18-pounder QF field gun (Mk I to IV) | 83.8 mm, 8.4 kg shrapnel/HE shell, range about 6.5 to 9 km, 4 to 5 detachments in a battery of 6 (the four-gun battery of 1917 and the game's four); the standard field gun of the BEF, 1914 to 1918 | std., W |
| 4.5-inch QF howitzer | 114 mm, 15.9 kg shell, range about 6.6 km; accompanied the 18-pounders in 1918 as the brigade's howitzer battery | std., W |
| BL 6-inch 26 cwt howitzer | 152 mm, 45 kg shell, range about 8.7 km (the British game's own row) | std. |
| BL 60-pounder | 127 mm, 27 kg shell, range about 9.4 to 14 km depending on the Mark | std. |
| BL 9.2-inch howitzer | 234 mm, 131 kg shell, range about 9 to 12.7 km | std. |
| BL 15-inch howitzer | 381 mm, 635 kg shell, range about 9.9 km | std. |
| Mark IV tank | 28 t (male) to 27 t, crew 8, 6-pounder guns and Lewis or Hotchkiss guns, 6 to 12 mm armour, about 6 km/h; 1,200 odd built; the British fielded them in 1918 mostly in small groups, laagered behind the line before an attack | std., W |
| Caquot kite balloon | French Type R of 1916, spare, steady in wind to 90 km/h, the British used it from 1917; the observer hung in a basket at about 1,000 to 1,500 ft on a winch cable from a lorry or tractor | std. |
| RE8 | R.E. 8, two-seat artillery observation aeroplane, 1916 to 1918, about 4,000 built, wireless set for ranging ("the Harry Tate") | std. |
| Sopwith Camel | single-seat fighter; in March and April 1918 many squadrons also flew low-level ground attack with 25-lb Cooper bombs and machine guns | std., W |

Where the sources disagree: gun ranges depend on the Mark and the charge, so each is a band, not a number.

---

## 6. Historical departures in the game

| Item | Departure | Why |
|---|---|---|
| The setting | an invented engagement on a 1917 map | the map is the British game's; the sides are turned round |
| Date | no date shown | no claims about real events |
| The Paris Gun | its own mission, not the open battle: the gun put together on its prepared bed in minutes (compressed like every procedure in the game) and worked round by round (the bore gauged, the charge raised, the firing data, the load), four military targets off the map with the Armee's orders through the day, not Paris; British Camels hunt it by day (the game's threat to the gun, not researched here) | the history is here, not in the game; a city and its civilians are never the target; the gun's work is its procedure and the orders, and rounds on the aerodrome keep some of the raiders on the ground |
| Gamma, M-Gerät | in a field battle in Flanders 1918 | the sandbox puts the whole roster on one map |
| Traverse | widened on several guns (M 16, sFH 13, K 17) | playability: one gun reaches several targets |
| Bertha and Gamma beds | the arc on the bed is the real one (about 11.5 and 23 degrees either way); relaying the bed onto a new line is instant for now (it took 100 game seconds and is to take them again; in reality hours for the M-Gerät and a day or more for the Gamma, which was dismantled and reassembled with its gantry) and the whole emplacement swings round with it | the choice is real (lose the gun for a while to reach a target), the time is compressed like every procedure in the game; the wait is off for play-testing |
| British kite balloon | no balloon site in the battle (the model exists) | left out at the designer's request |
| Gas | none | DESIGN.md, "Simulation fidelity" |
| Fire plan | the player commands all the guns | one commander |
| Crew sizes | round numbers (7 to 16) | crew animation |
| Charges | named Ladung 1 to 7 etc. as the game's own grouping | the real sFH had 7, the K 17 had fewer, the others differ |
| The division's field guns | when the red flares go up, unseen 7.7 cm field guns fire a thin Sperrfeuer of their own (shell kind `fk16`, no unit) | the field artillery fired most of a real Sperrfeuer; the player commands only the heavy group |

---

## 7. Sources

Marks as in the head of this file. "Fetched" means the page was read in this session.

**Wikipedia as secondary sources (W; German Wikipedia was not reached directly):**
[Battle of the Lys (1918)](https://en.wikipedia.org/wiki/Battle_of_the_Lys_(1918)) (fetched);
[Georg Bruchmüller](https://en.wikipedia.org/wiki/Georg_Bruchm%C3%BCller) (fetched);
[21 cm Mörser 16](https://en.wikipedia.org/wiki/21_cm_M%C3%B6rser_16) (fetched);
[15 cm sFH 13](https://en.wikipedia.org/wiki/15_cm_sFH_13) (fetched);
[10 cm K 17](https://en.wikipedia.org/wiki/10_cm_K_17) (fetched);
[38 cm SK L/45 gun](https://en.wikipedia.org/wiki/38_cm_SK_L/45_gun) (fetched);
[42 cm Gamma howitzer](https://en.wikipedia.org/wiki/42_cm_Gamma_howitzer) (fetched);
[Big Bertha (howitzer)](https://en.wikipedia.org/wiki/Big_Bertha_(howitzer)) (fetched);
[Paris Gun](https://en.wikipedia.org/wiki/Paris_Gun) (fetched).

**Other secondary and institutional:**
[Lovett Artillery Collection: German field and foot artillery conversion scale](https://lovettartillery.com/German_Artillery%20Conv_Scale.html) (S, a private collector's site; the 5760 versus 6400 scales);
[Great War Forum, "Michael offensive" thread](https://www.greatwarforum.org/topic/6434-michael-ofensive/) (the Zabecki and Mosier citations on registration, a forum, low);
[Britannica, Georg Bruchmüller](https://www.britannica.com/print/article/1327349) (S);
[warhistory.org, Georg Bruchmüller](https://warhistory.org/article/georg-bruchmuller-1863-1948) (S);
[IWM: Schiessvorschrift für die Fußartillerie, 19 November 1908](https://www.iwm.org.uk/collections/item/object/1500008002) (I; the foot artillery's firing regulation, text not read);
[german1914.com, Langer Max](https://german1914.com/?p=3145) (S);
[Great War Forum, Big Bertha question](https://www.greatwarforum.org/topic/83245-big-bertha-question/page/2/) (the E. u. B. expansion, forum);
[Bangor University archive record of a captured German 1:20,000 map with a British grid](https://calmview.bangor.ac.uk/CalmView/rdf/catalog/BMSSXXI/39616-39660/1/39624) (I);
[AWM, reading map references](https://www.awm.gov.au/research/guide/maps-references) (I; the British grid);
[WW2.md section 7](WW2.md) for the Bertha and Gamma (existing).

**Where the sources disagree.** Calibre and barrel of the Paris Gun (21 m or 37 m); the shells fired at Paris (320
to 367); Langer Max numbers built (8 or more than 28); the M-Gerät muzzle velocity (400 or 815 m/s); the Gamma's
barrel length (L/12 or L/16) and its shell weight (Wikipedia copies the M-Gerät text); the K 17, M 16 and sFH 13 barrel
lengths (the calibre-length and the metre figures in the infoboxes do not agree); casualties of the Lys offensive.

**Not found** (the reason for the low-confidence marks): a primary text of the 1918 German Feuerkommando wording; the
German 1918 artillery grid reference format; the Gamma and the M 16 crew sizes.
