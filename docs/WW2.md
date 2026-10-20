# WW2 mode: sources, real figures and departures

Reference for the German-side WW2 mode (DESIGN.md "WW2 mode (German side)", `src/sim/tables_ww2.js`, `src/ww2/`).
It gives, for every weapon and enemy in the mode, the real figures with their sources, the game's value beside
them, and why the game differs. The game is an arcade game with period flavour (DESIGN.md "Simulation fidelity"):
this document exists so that the departures are deliberate and known, not so that the game becomes a simulator.

## How to read this document

Source kinds, marked in the tables:

| Mark | Kind | Examples |
|---|---|---|
| **P** | Period primary document (wartime or immediately post-war, official) | US War Department TM-E 30-451 "Handbook on German Military Forces" (March 1945); US "Intelligence Bulletin" and "Tactical and Technical Trends" (1942 to 1945); British "Report on Operation Backfire" (War Office, 1946); Basil Collier, "The Defence of the United Kingdom" (HMSO official history, 1957); the 45th Infantry Division's after-action report on Brest (Schlieper, 1941) as quoted in secondary works |
| **I** | Institutional: museum, memorial or archive page | Imperial War Museums, Smithsonian National Air and Space Museum, National Museum of the US Air Force, Mittelbau-Dora Memorial, UK National Archives catalogue, Royal Canadian Artillery Museum |
| **S** | Secondary military history (books, peer-reviewed papers, specialist sites) | Chamberlain & Gander, Hogg, Zaloga (Osprey), Forczyk (Osprey, "Sevastopol 1942"), Neufeld "The Rocket and the Reich", Evans 2018 (Applied Geography), historyofwar.org, v2rocket.com, oldmachinepress.com |
| **W** | General web reference (Wikipedia and similar), used only where nothing better was reachable; Wikipedia's figures for German artillery mostly come from Chamberlain & Gander and Hogg | en.wikipedia.org, ww2db.com |
| **M** | Participant memoir: treat with care | Dornberger "V-2"; Wachtel's post-war statements |

**Limits of this research (read before quoting).** During this pass the research tools could search the web
and read search-result extracts, but could not open pages directly (the page fetcher and outbound HTTP were
blocked for every host tried, including lonesentry.com, wikipedia.org, archive.org, iwm.org.uk and ibiblio.org).
Every figure below was either seen in a search extract attributed to the cited page, or (marked "std.") is a
standard figure of the cited secondary literature that could not be re-read here. Where sources disagree, both
values are given. Before a number goes on a box, a card or a tutorial as a historical claim, check it against
the cited page or book. The game's numbers do not depend on any of this.

Units: metres, kilograms, m/s, degrees. "Game" values are from `src/sim/tables_ww2.js` as of this writing; game
ranges are the top-charge ranges the lead measured from the game integrator.

---

## 1. 10.5 cm leichte Feldhaubitze 18 (leFH 18, 18M, 18/40)

The standard divisional field howitzer of the Wehrmacht. Designed by Rheinmetall 1929 to 1930, in service from
1935; the leFH 18M (1940 to 1941) added a muzzle brake and a long-range charge; the leFH 18/40 (from 1942, in
numbers after Stalingrad in 1943) put the 18M barrel on the lighter PaK 40 type carriage. Ballistically the 18M
and 18/40 are identical and share firing tables (TM-E 30-451). Fought on every front, 1939 to 1945.

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 105 mm, L/28 (2.94 m) | W (Wikipedia "10.5 cm leFH 18") | 105 mm |
| Weight in action / travelling | leFH 18: 1,985 kg / 3,490 kg (limbered) | W | not modelled |
| Shell | 10.5 cm FH Gr (HE) 14.81 kg | W; S (armedconflicts.com) | 14.8 kg |
| Charges | 6 (Ladung 1 to 6), cased separate loading | W | 6, named Ladung 1 to 6 |
| MV, Ladung 1 | about 200 m/s, about 3,575 m | S (armedconflicts.com profile) | 200 m/s |
| MV, Ladung 6 | 470 m/s, 10,675 m | W; S (historyofwar.org gives 450 m/s and 10,765 m: probably a different source table or a typo) | 470 m/s, 10.7 km |
| leFH 18M / 18/40 with Fernladung | 540 m/s, 12,325 m (13,480 yd) | P (TM-E 30-451: 13,480 yd, 1,772 ft/s); W | not offered |
| Elevation | -5 to +42 (Wikipedia); -6 deg 30 min to +40 deg 30 min (another wiki) | W | +2 to +42 |
| Traverse | 56 total (split trail) | W | +-28 |
| Rate of fire | 6 to 8 rounds/min short bursts; about 4/min sustained (std.) | W; S (weaponsystems.net: 6/min) | about 7/min from the cycle (8.6 s) |
| Detachment | 6 at the gun (Wikipedia); a 1938 motorised battery table gives a commander and seven gunners per gun | W; S (keymilitary.com) | 6 |
| Organisation | battery of 4 howitzers; Abteilung of 3 batteries (12 guns); the divisional artillery regiment had 3 leFH Abteilungen and 1 sFH Abteilung (std., Hogg; TM-E 30-451 chapter II). Late-war Volksgrenadier batteries often had 6 guns | P (TM-E 30-451, std.); S | unit = 4 pieces |

Ammunition types in WW2 service: FH Gr (HE), FH Gr Nb (smoke), Pzgr (AP), Gr 39 Hl (hollow charge), illuminating
and incendiary rounds. **There was no shrapnel round in the leFH 18's WW2 ammunition list** (std.; the
German army had dropped shrapnel for its field howitzers). Airbursts were fired with HE and a time fuze (the Dopp
Z S/60 time and percussion fuze). The game's `ammo.shrapnel: 60` and fuze `shrapnel` should be read, and ideally
labelled, as "HE, time fuze (Zeitzünder)".

Drill (std., consistent with TM-E 30-451 descriptions): limber off, open the split trails, dig the spades in, lay
on the aiming point with the dial sight (Rundblickfernrohr) in Strich (6,400 to the circle), set the charge by
removing bags from the brass case, load shell, then case, close the horizontal sliding breech, fire by lanyard.

Sources: [TM-E 30-451, ch. VII sec. IV (LoneSentry transcription)](https://lonesentry.com/manuals/tme30/ch7sec4sub5.html);
[LoneSentry: 10.5 cm l.F.H. 18 (M) (US ordnance identification text)](https://www.lonesentry.com/ordnance/2009/12/30/10-5-cm-l-f-h-18-m-light-field-howitzer/);
[Wikipedia leFH 18](https://en.wikipedia.org/wiki/10.5_cm_leFH_18), [leFH 18M](https://en.wikipedia.org/wiki/10.5_cm_leFH_18M),
[leFH 18/40](https://en.wikipedia.org/wiki/10.5_cm_leFH_18/40);
[historyofwar.org leFH 18](https://www.historyofwar.org/articles/weapons_105_leFH_18.html);
[armedconflicts.com leFH 18](https://www.armedconflicts.com/10-5-cm-leFH-18-10-5-cm-light-field-howitzer-t678);
museum examples: [Royal Canadian Artillery Museum, leFH 18/40](https://en.rcamuseum.com/?p=574) (I),
[Westwall-Museum Bad Bergzabern via museum-digital](https://rlp.museum-digital.de/pdf/object/29017.pdf?lang=en) (I).

**Game verdict:** close to the real gun. Only the shrapnel label is wrong in period terms.

---

## 2. 15 cm schwere Feldhaubitze 18 (sFH 18)

Rheinmetall's design on a Krupp carriage, in service from 1934; the divisional heavy howitzer (the sFH Abteilung of
the artillery regiment) and corps artillery. All fronts, 1939 to 1945.

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 149.1 mm, L/29.5 | W | 149 mm |
| Weight in action / travelling | 5,512 kg / 6,304 kg (barrel usually towed on its own wagon behind a half-track) | W | not modelled |
| Shell | 15 cm Gr 19 HE 43.5 kg (43.52) | W | 43.5 kg |
| Charges | 8 bagged charges in a brass case (149 x 260R); charges 7 and 8 caused severe wear and their use was restricted; the 18M (1942) had a muzzle brake and a liner for a "special 7"/8 charge | W; S (Flames of War article) | 5 offered: Ladung 1, 3, 5, 7, 8 |
| MV top | 495 m/s (ww2db and others) or 520 m/s (Wikipedia, fandom) | W; S | 520 m/s |
| Max range | 13,250 m (sources), 18,200 m with the rocket-assisted R Gr 19 FES; sFH 18M with the special charge about 15,100 m | W | 13.3 km |
| Elevation | -3 to +45 (or 0 to +45) | W; S | +2 to +45 |
| Traverse | 64 total (or 60) | W; S | +-32 |
| Rate of fire | about 4 rounds/min short bursts | W; S | about 5/min from the cycle (12.2 s) |
| Detachment | 7 (Wikipedia); 5 minimum, up to 12 with ammunition numbers | W | 8 |
| Organisation | battery of 4; Abteilung of 3 batteries (std.) | P (TM-E 30-451, std.) | unit = 4 pieces |

Sources: [Wikipedia sFH 18](https://en.wikipedia.org/wiki/15_cm_sFH_18); [ww2db sFH 18](https://ww2db.com/weapon.php?q=77);
[weaponsystems.net sFH 18](https://weaponsystems.net/system/1702-15-cm%20sFH-18); [TM-E 30-451 (LoneSentry)](https://lonesentry.com/manuals/tme30/ch7sec4sub4.html).

**Game verdict:** inside the spread of the sources. The top charge velocity 520 m/s is the high source value; if a
labelled "Ladung 8" should match the commonest figure, 495 m/s is the more cited one (the range would then fall a
little below 13 km on the game integrator).

---

## 3. 17 cm Kanone 18 in Mörserlafette (K 18)

Krupp's long-range gun on the carriage shared with the 21 cm Mrs 18. Introduced 1941; Heeresartillerie (army and
corps level, GHQ units), the main German counter-battery gun. Fought in Russia, North Africa, Italy and in the West
in 1944 (Normandy, the Low Countries).

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 172.5 mm, L/50 (8.53 m) | W | 172.5 mm |
| Weight in action / travelling | 17,520 kg / 23,375 kg | W | not modelled |
| Loads | one load for short moves; two (barrel on its own trailer, carriage) for long ones; winches and ramps drew the barrel back onto the carriage; dismounting the barrel "still required several hours" | W; S (historyofwar.org) | not modelled |
| Shell | 17 cm Gr 38 HE: 62.8 kg (Wikipedia) or 68 kg (historyofwar.org, others) | W; S | 62.8 kg |
| Charges | 3 (small, medium, large) | std. (Hogg) | 3 |
| MV top | 925 m/s | W; S | 925 m/s |
| Max range | 29,600 m | W; S | 29.6 km |
| Elevation | 0 to +50 | W | +2 to +50 |
| Traverse | 16 on the carriage; 360 on the firing platform (one man could turn the whole gun round on it) | W | +-60 with a slow rate (the platform turn) |
| Recoil | dual recoil (Doppelrücklauf): barrel recoils in the cradle, the top carriage recoils on rails on the lower carriage, so the gun hardly moves and needs no re-laying | W; S | modelled in the rig |
| Rate of fire | about 1 round/min (some sources 2) | W; S | about 2/min from the cycle (28.5 s) |
| Detachment | 10 | W; S | 10 |
| Organisation | GHQ schwere Artillerie-Abteilungen (mot.), mostly of three batteries; some mixed K 18 and Mrs 18 (std., Hogg; TM-E 30-451 lists them as GHQ artillery) | P (std.); S | unit of its own |

Sources: [Wikipedia K 18](https://en.wikipedia.org/wiki/17_cm_Kanone_18);
[historyofwar.org K 18](https://www.historyofwar.org/articles/weapons_17cm_kanone_18.html);
[US "Tactical and Technical Trends": German long-range 172 mm gun (LoneSentry)](https://3g.lonesentry.com/articles/ttt07/german-172-mm-artillery.html) (P);
[HMDB: K 18 marker (a surviving gun)](https://www.hmdb.org/m.asp?m=193260).

**Game verdict:** matches. The firing platform's 360 degree traverse is represented by the slow +-60 swing, which
is fair.

---

## 4. 21 cm Mörser 18 (Mrs 18)

Krupp heavy howitzer on the same Mörserlafette, introduced 1939; production stopped in favour of the K 18 in 1942
and resumed in 1943 (std.). Against fieldworks and concrete. GHQ artillery: Poland, France, Russia (it was at
Sevastopol in numbers), Italy, the West.

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 210.9 mm, L/30 (Wikipedia) or L/31 6.5 m (Axis History Forum) | W; S | 210.9 mm |
| Weight in action | 16,700 kg | W | not modelled |
| Shells | 21 cm Gr 18 HE 113 kg; 21 cm Gr 18 Be (concrete-piercing) 121.4 kg | W | 113 kg (HE only) |
| MV top | 550 to 565 m/s | W | 565 m/s |
| Max range | 16,700 m (16,725) | W; S | 16.7 km |
| Elevation | -6 (or 0) to +70 | W | +8 to +70 |
| Traverse | 16 on the carriage; 360 on the platform | W | +-60, slow |
| Rate of fire | about 1 round/min for short periods (std.) | std. | about 2/min from the cycle (31.5 s) |
| Detachment | about 10 to 12 (std.) | std. | 10 |

Sources: [Wikipedia Mrs 18](https://en.wikipedia.org/wiki/21_cm_M%C3%B6rser_18);
[historyofwar.org Mrs 18](https://www.historyofwar.org/articles/weapons_21cm_morser_18.html);
[Axis History Forum thread](https://forum.axishistory.com/viewtopic.php?t=165349) (S, enthusiasts).

**Game verdict:** matches. A `Be` (Betongranate) shell for the forts at Sevastopol would be the period-correct way
to give the Mrs 18 its anti-concrete role, rather than a stronger HE.

---

## 5. 15 cm Nebelwerfer 41 and the 15 cm Wurfgranate 41

A six-tube rocket launcher on a two-wheeled carriage derived from the 3.7 cm PaK 36's. Issued to the Nebeltruppe
(originally the chemical and smoke troops, hence the name) from 1940 to 1941; Russia from 1941, then every front.
The rocket is unusual: **the motor is in front and the warhead behind it**; the exhaust leaves through canted
venturis about two thirds of the way back from the nose, which spin the rocket.

| Spec | Real | Source | Game |
|---|---|---|---|
| Launcher weight | 540 kg empty (another source), 770 kg loaded (Wikipedia) | W; S | not modelled |
| Rocket | 15 cm Wgr 41 Spr: 31.8 to 34.15 kg (39 kg in some listings, by motor charge), about 2 to 2.5 kg TNT | W; S (armedconflicts.com, dday-overlord.com) | 34 kg |
| Max velocity / burn | about 340 m/s; burn under 2 s (std.) | W | 340 m/s, burn 1.8 s |
| Max range | 6,900 m (some sources 7,060 m) | W; S | 6.9 km |
| Elevation / traverse | about -5 to +45; about 24 to 30 total (std.) | W, std. | +5 to +45, +-15 |
| Ripple | six rockets fired electrically one after another, never together (the launcher would overturn); the order often given is 1, 4, 6, 2, 3, 5; a ripple took about 10 s | S (Flames of War article for the order; dday-overlord.com for 6 in 10 s) | 6 rockets, 1.6 s apart (about 8 s) |
| Reload | about 90 s for a trained crew (secondary; not confirmed in a primary source here); a 1943 US Intelligence Bulletin gives a sustained rate of one salvo per piece about every 8 minutes; another source 3 salvos in 5 minutes | P (Intelligence Bulletin); S | 46 s cycle (open, 30 s for the six rockets, prime, lay, cover) |
| Firing from cover | the crew loaded from the rear, laid, then took cover in a slit trench or 10 to 15 m away and fired electrically | P (Intelligence Bulletin, March 1945 and 1943) | crew firer 12 m to the side |
| Signature | the launch raised a large cloud of dust and smoke and the trails showed in the sky: the position was given away at once and batteries moved soon after firing | P (Intelligence Bulletin); S | `sig` 0.11 (the highest of the conventional guns), `fx.rocketLaunch` |
| Sound | the "moaning Minnie" howl (British name), "Screaming Mimi" (US) | S | `audio.rocket` |
| Crew | 5 | W; S | 5 |
| Organisation | battery of 6 launchers; Werfer-Abteilung of 3 batteries (18 launchers); Werfer-Regiment of 3 Abteilungen; Werfer-Brigaden of 2 regiments from 1943 (std., TM-E 30-451 chapter on chemical troops; the search extracts confirmed the 6-launcher battery and the 3-battery battalion only for the 21 and 30 cm Werfer) | P (std.); S | unit of its own |

Sources: [US Intelligence Bulletin, March 1945: German six-barrel rocket weapon (LoneSentry)](https://www.lonesentry.com/articles/nebelwerfer/index.html) (P);
[US Intelligence Bulletin: Germany's rocket and recoilless weapons (LoneSentry)](https://www.lonesentry.com/articles/rocket/index.html) (P);
[Wikipedia NbW 41](https://en.wikipedia.org/wiki/15_cm_Nebelwerfer_41);
[dday-overlord.com NbW 41](https://www.dday-overlord.com/en/material/artillery/nebelwerfer-41);
[armedconflicts.com Wgr 41](https://www.armedconflicts.com/15-cm-Wgr-41-Spr-t251799);
[Flames of War: 15 cm NW 41](https://www.flamesofwar.com/Default.aspx?tabid=144&art_id=648) (S, firing order);
[Weald Foundation collection: Raketen-Werfer 41](https://www.wealdfoundation.org/collection/raketen-werfer-41-nebelwerfer-15-cm/) (I).

**Game verdict:** close. The reload is about twice as fast as the secondary 90 s figure (compression, see B).
Dispersion is rightly much larger than a gun's.

---

## 6. 80 cm Kanone (Eisenbahn) "Schwerer Gustav" (and "Dora")

Krupp, ordered 1937 to break the Maginot Line; first gun (Gustav) proof-fired at Rügenwalde (Hillersleben and
Rügenwalde ranges) in 1941, second (Dora) 1942, a third never completed. Gustav fought once: Sevastopol, June 1942.
Dora was sent towards Stalingrad in August 1942 and withdrawn without firing (std.).

### Dimensions and ballistics

| Spec | Real | Source | Game |
|---|---|---|---|
| Calibre, barrel | 800 mm, barrel 32.48 m (L/40.6) | W; S (oldmachinepress.com) | 800 mm |
| Weight | about 1,350 t | W (Wikidata); S | not modelled |
| Size | about 47.3 m long, 7.1 m wide, 11.6 m high | W | rig |
| Running gear | 80 wheels on 40 axles in eight five-axle bogies, riding two parallel standard-gauge tracks (four rails) | W; S | rig |
| HE shell | 4,800 kg, MV 820 m/s, max range about 47 to 48 km | W; S (ww2db, Military Factory) | 4,800 kg, 820 m/s, 47 km |
| Concrete-piercing shell (Betongranate) | 7,100 kg, MV 720 m/s, max range about 38 km; quoted as able to go through about 7 m of reinforced concrete or 30 m of earth (std.) | W (the 7,100 kg figure is the commonly quoted one; one search summary wrongly doubted it) | not modelled as a separate shell: the game's 720 m/s is a "Volle Ladung" of the HE shell |
| Propellant | two bagged charges and a cased main charge; total figures in secondary sources range from about 1,200 to about 2,000 kg (they disagree) | S | 3 charges |
| Elevation | max 48 (most sources); 65 in some | W; S | +10 to +48 |
| Traverse | none: laid for line by moving the gun along a curved firing track | W; S | +-10 slow slew (the move along the curve) |
| Rate of fire | one round per 30 to 45 minutes, about 14 a day at most | W; S | cycle about 247 s (about 4 min) |
| Barrel life | sources disagree: about 100 rounds; or the first barrel fired about 250 rounds in trials plus 48 at Sevastopol before it was worn | S | `wearPerRound` 0.0035 |

### Emplacement (Sevastopol, 1942)

- A spur from the Simferopol to Sevastopol railway ended in **four curved tracks**: the inner pair carried the gun,
  the outer pair the **two gantry cranes** (about 110 t each) that assembled it (W; S oldmachinepress).
- Site preparation, cutting and track: figures range from 1,500 men digging the cutting under an army engineer unit
  to 2,000 to 4,500 men over 3 to 6 weeks; one account gives 4,000 men and five weeks to firing readiness (S, they
  disagree).
- Assembly by the cranes: **about 250 men, 54 hours (about three days)**; one source says three weeks for the
  whole (W; S).
- Unit: **schwere Artillerie-Abteilung (E) 672**, formed January 1942, about **1,420 men under Oberst Robert
  Böhm** (S, Matrix Games forum summary and Wikipedia-derived pages). Gun detachment proper: about 500 (std.).
- Protection: **two flak Abteilungen** (W), plus Romanian and German infantry guards, smoke and camouflage;
  total personnel at the site is given anywhere from about 2,000 to over 4,000 (S).
- Position: near **Bakhchisaray**, north-east of Sevastopol; accounts give the distance as about 16 km north of the
  target, about 25 km, or 30 km from the city near Taizy (Taitsy) station (S, they disagree; Duvankoi, now
  Verkhnesadove, is also named in some accounts). The gun arrived on the Perekop isthmus in early March 1942 and
  stayed there to early April before moving forward (S).

### Fire at Sevastopol (5 to 17 June 1942)

Totals: **48 rounds** in most accounts (47 in one). Per day, as given by the commonly repeated German account
(W, S; derived from German records, not checked against them here):

| Date | Target | Rounds |
|---|---|---|
| 5 June | Coastal batteries (about 25 km) | 8 |
| 5 June | "Fort Stalin" | 6 |
| 6 June | "Fort Molotov" | 7 |
| 6 June | "White Cliff" (Weisse Klippe) ammunition magazine dug into the cliff at the north side of Severnaya Bay (Sukharnaya Balka area); described as 30 m below the water line under 10 m of concrete | 9 (the magazine is said to have been destroyed by the ninth) |
| 11 June | "Fort Siberia" | 5 |
| 17 June | "Maxim Gorky" (Coastal Battery No. 30) | 5 |
| other days | further rounds at the northern forts (accounts differ) | about 8 |

**Effect is disputed.** The German claim (spotter aircraft reported targets destroyed) is not supported by later
assessment: Forczyk (Osprey "Sevastopol 1942") and others judge Gustav's material effect small, with several
rounds far off target (one account: an average miss of about 300 m; the nearest burst to a Maxim Gorky turret about
0.5 km). The White Cliff magazine's destruction is often repeated and seldom sourced. Maxim Gorky I's turrets were
put out of action by direct hits from **Karl-Gerät 60 cm and 30.5 cm** mortars, not by Gustav, in the accounts that
discuss it (S). The Germans named the northern works themselves ("Stalin", "Molotov", "Siberia", "Lenin", "GPU",
"Volga", "Ural"); several were Soviet anti-aircraft or field battery positions, not forts in the 19th-century sense.

Sources: [Wikipedia Schwerer Gustav](https://en.wikipedia.org/wiki/Schwerer_Gustav);
[oldmachinepress.com: Krupp 80 cm Kanone](https://oldmachinepress.com/2017/05/20/krupp-80-cm-schwerer-gustav-dora-railway-gun/) (S);
[South African Military History Society Journal: "Heavy Gustav, the story of a gun"](http://samilitaryhistory.org/vol124lw.html) (S);
[ww2db 80 cm Gustav](https://ww2db.com/weapon.php?q=89); [avalanchepress: German siege guns](https://www.avalanchepress.com/dora.php) (S);
[TracesOfWar: Fort Stalin](https://www.tracesofwar.com/sights/12982/Sector-Sevastopol---Fort-Stalin.htm);
[Wikipedia: Maxim Gorky fortresses](https://en.wikipedia.org/wiki/Maxim_Gorky_Fortresses);
[Wikipedia: Siege of Sevastopol (1941 to 1942)](https://en.wikipedia.org/wiki/Siege_of_Sevastopol_(1941%E2%80%931942));
[Wikimedia Commons: 80 cm Kanone (E) photographs](https://commons.wikimedia.org/wiki/Category:80-cm-Kanone_(E));
[Axis History Forum: Dora at Sevastopol](https://forum.axishistory.com/viewtopic.php?t=100753) (S, enthusiasts, quotes German documents).
Book: Robert Forczyk, "Sevastopol 1942: Von Manstein's Triumph", Osprey Campaign 189 (2008) (S).

**Game verdict:** HE ballistics correct. Departures: the concrete-piercing shell is folded into a charge (see A),
the cycle is about ten times faster than real, and the detachment drawn is 24 figures for a real Abteilung of
about 1,400. The two flak Abteilungen are four batteries (two light 2 cm Flakvierling, two 8.8 cm) that are towed
in and dug in one by one during the preparation; in the game the light guns do the killing of the low attackers
and the heavy guns mostly spoil their bombing, and smoke is left to the camouflage task.

---

## 7. 42 cm M-Gerät "Dicke Bertha" (a First World War gun)

Krupp's 42 cm kurze Marinekanone 14 L/12 in Räderlafette (M-Gerät), a road-mobile wheeled siege howitzer of 1914. It
broke the Belgian forts at **Liège** (Fort Loncin, August 1914) and fought at Namur, Maubeuge, Antwerp and later
Verdun (std.). About a dozen were made; none is known to have served in the Second World War, and none survives.

| Spec | Real | Source | Game |
|---|---|---|---|
| Weight in action | 42,600 kg | W | not modelled |
| Heavy shell | 810 kg (820 in one source) | W; S | 810 kg |
| MV | 400 m/s (Wikipedia), 426 m/s (historyofwar.org); no source found for 333 m/s | W; S | 300 to 390 m/s on 4 Vorkartuschen |
| Max range | 9,300 m (heavy shell); about 12,250 to 12,500 m with the 400 kg light shell (std.) | W; S | 12.0 km with the 810 kg shell (deliberately stretched, see `src/bertha/ballistics.js`) |
| Elevation / traverse | about +40 to +75, about 20 total (std.) | std. | +20 to +65, +-11.5 |
| Rate of fire | about 8 rounds an hour (std.) | std. | cycle 55 s |
| Crew | about 200 with the battery; emplacement about 6 hours (Military Factory); some sources give 240 | S | 12 drawn |

**Why it is alternate history in this mode.** The M-Gerät was a 1914 to 1918 weapon; it was not in Wehrmacht
service. Its presence in "Flanders 1944" is a deliberate guest appearance and must be labelled as such (DESIGN.md
does). A **real related fact** worth using in a caption: the WWI **42 cm Gamma-Mörser** (a static Bettungsgeschütz,
fired from a concrete bed, moved in ten railway loads), one of which survived, did fight in WW2: against the
Maginot Line in 1940 and at **Sevastopol in 1942**, with heavy artillery battery 459 (or 458; sources differ),
firing a 1,003 kg concrete-piercing shell to about 14.2 km; one forum account gives 192 rounds fired there, the last
on 13 June 1942 (S, enthusiasts). Germany also used captured Skoda 42 cm howitzers (42 cm H (t)) on the Eastern Front.

Sources: [Wikipedia Big Bertha](https://en.wikipedia.org/wiki/Big_Bertha_(howitzer));
[historyofwar.org M-Gerät](https://www.historyofwar.org/articles/weapons_42cm_big_bertha.html);
[Britannica: Big Bertha](https://www.britannica.com/technology/Big-Bertha-weapon) (S);
[HistoryNet: the original Big Bertha](https://historynet.com/42cm-m-gerat-howitzer-the-original-big-bertha/);
[Wikipedia 42 cm Gamma howitzer](https://en.wikipedia.org/wiki/42_cm_Gamma_howitzer);
[historyofwar.org Gamma-Gerät](https://www.historyofwar.org/articles/weapons_42cm_gamma_gerat.html).

---

## 8. 60 cm Mörser Karl-Gerät 040 / 041

Rheinmetall self-propelled siege mortar on tracks (Gerät 040, 60 cm; Gerät 041 a 54 cm L/11.5 barrel fitted to some
from 1944). Seven built: one test vehicle and six service vehicles named **Adam, Eva, Thor, Odin, Loki, Ziu**
(Adam and Eva were later renamed Baldur and Wotan; some lists name the seventh Fenrir; sources disagree).
Unit: **schwere Artillerie-Abteilung (mot.) 833**, formed April 1941, two batteries of two vehicles (later
628 and others).

| Spec | Real | Source | Game |
|---|---|---|---|
| Weight | about 124 t (040) (std.) | W | not modelled |
| Barrel | 60 cm, L/8.44 (std.) | W | 600 mm |
| Heavy shell (schwere Betongranate) | 2,170 kg (289 kg filling), 220 m/s, 4,320 m | W; S | 2,170 kg; Ladung 2 220 m/s; 4.2 km |
| Light shell (leichte Betongranate) | 1,250 kg, 283 m/s, 6,640 m (040). The 54 cm Gerät 041 fired a 1,250 kg shell to about 10 km: one search summary mixed the two up | W | Ladung 3 283 m/s (the light shell as a charge), 6.5 km |
| Elevation | +55 to +70 only | W | +55 to +70, falling branch |
| Traverse | 4 each way on the hull; more by steering the whole vehicle | W | +-4 |
| Emplacement | drive in, then **lower the hull onto the ground** (the running gear was raised so the hull took the recoil on the ground); "within ten minutes the mortar will be ready for firing" (a period photo caption) | S (one35th.com) | `rig.setLower`, gated by `special: 'karl'` |
| Loading | shells and charges brought by a **Munitionsschlepper on a Panzer IV chassis**, carrying **4 rounds**, with a crane that lifted each round onto the loading tray; the barrel was brought to a low loading angle to load and raised again | S (one35th.com, ww2db) | crane and hoist pivots on the Schlepper; `depress` 30 s |
| Rate of fire | about 6 rounds an hour (one every 10 min) | S | cycle 120 s |
| Crew | about 16 to 21 at the vehicle (std.; sources vary) plus the Schlepper crews | W | 18 |
| Rail and road transport | carried by rail slung between two special cars, and on road in pieces on Culemeyer trailers; a full assembly was meant to take no more than six hours | S | not modelled |

### Brest-Litovsk, 22 June 1941

- The 1st battery had Adam and Eva, the 2nd battery Thor and Odin (S). Which went where is **disputed**: the
  account quoting German documents (Forum der Wehrmacht) puts **Thor and Odin south of Terespol** opening fire on
  the fortress on 22 June; other accounts put that battery near Lemberg and Adam and Eva at Brest.
- Results were poor: Thor fired three or four rounds and Odin four before both jammed with shells whose driving
  bands were faulty (forum account), or Odin never fired because of an electrical firing fault (panzernet.net).
  A total of about 31 rounds at Brest is often repeated (std.).
- The fortress was attacked by the **45th Infantry Division** (Generalmajor Fritz Schlieper, about 17,000 men),
  supported by a battery of assault guns and artillery including the Karls and Nebelwerfer. The **Eastern Fort**
  (Ostfort, a horseshoe-shaped earth and brick work) held out to **29 June** and surrendered after Luftwaffe bombing
  (Ju 88s; one account says 23 bombs; the oft-quoted single 1,800 kg bomb is not confirmed here). Last resistance in
  the casemates lasted into July. Targets in the citadel included the ring barracks, the **Kholm** and **Terespol**
  gates (std.; the gate details were not confirmed in this pass).

### Sevastopol, June 1942

Thor and Odin (with the Abteilung) fired from 2 June; **all available ammunition, 72 heavy and 50 light shells, was
used by 13 June** (S, one35th.com). Karl hits are credited with disabling a turret of the Maxim Gorky I battery (S).
Later use: Warsaw 1944 (against the uprising) and, by one vehicle, at Remagen in March 1945 (std.).

Sources: [Wikipedia Karl-Gerät](https://en.wikipedia.org/wiki/Karl-Ger%C3%A4t);
[one35th.com: Karl history](http://one35th.com/morser/karl_hist.htm) (S, period photo captions);
[panzernet.net Karl](http://www.panzernet.net/panzernet/en/specialni/karl.php) (S);
[Forum der Wehrmacht: Karl (Gerät 040/041)](https://forum-der-wehrmacht.de/index.php?pageNo=2&thread%2F27868-gesch%C3%BCtz-loki-m%C3%B6rser-karl-ger%C3%A4t-040-041%2F=) (S, enthusiasts quoting documents);
[Tank Encyclopedia Karl 040](https://tanks-encyclopedia.com/ww2/germany/karl-gerat-040-60-cm/) (S);
[ww2db Karl](https://ww2db.com/vehicle_spec.php?q=308);
[Wikipedia: Defense of Brest Fortress](https://en.wikipedia.org/wiki/Defense_of_Brest_Fortress);
[Wikipedia: 45th Infantry Division](https://en.wikipedia.org/wiki/45th_Infantry_Division_(Wehrmacht)).
One Karl (with the 54 cm Gerät 041 barrel) survives in the Kubinka collection (Patriot Park) near Moscow (std.).

**Game verdict:** ballistics close to the real pair of shells. The light shell is offered as "Ladung 3" of the heavy
shell (mass 2,170 kg in the table): in reality it is a different, lighter shell; the game's burst for it is
therefore too strong by about 40 percent of mass (acceptable in an arcade table, but labelled "leichte Gr." it should
be lighter in effect too).

---

## 9. V-1 (Fieseler Fi 103, cover name FZG 76)

Luftwaffe flying bomb with an Argus As 014 pulse jet. Launched from ramps by **Flak-Regiment 155 (W)** under
**Oberst Max Wachtel**, formed August 1943 from a training and test unit (Lehr- und Erprobungskommando).

### The missile

| Spec | Real | Source | Game |
|---|---|---|---|
| Length / span / mass | about 8.3 m / 5.7 m / 2,150 kg at launch (IWM lists its example at 783 kg empty) | I (IWM MUN 3854); W | rig and `buildMissile('v1')` |
| Warhead | 850 kg (848 kg Amatol or Trialen) | W; S | burst `v1` |
| Speed, height | about 640 km/h, 600 to 900 m | W | flight scripted |
| Range | about 250 km (later long-range versions about 370 km) | W | abstracted |
| Range setting | a small **air log propeller in the nose** drove a counter: every 30 turns counted down one unit; at zero the elevators were locked down and the bomb dived (the engine often cut out as it nosed over, the "silence before the bang"). Height set on a barometric control (300 to 2,500 m possible) | I (Smithsonian NASM); S (Warbirds Resource Group) | air log step in the drill |
| Heading | a magnetic master compass, set and swung before launch in the **Richthaus** (a non-magnetic, metal-free building aligned with the ramp; the airframe was knocked with mallets to settle its magnetism to the ramp line) | W ("V-1 flying bomb facilities"); S | `rig.anchors.richthaus` |

### The catapult (Walter WR 2.3 Schlitzrohrschleuder)

| Spec | Real | Source | Game |
|---|---|---|---|
| Ramp | slotted tube catapult in modular sections, about 49 m (8 sections of 6 m plus a muzzle brake) on the standard site; 36 to 48 m quoted for other versions | W; S | ramp along -Z |
| Angle | about 6 degrees (std.) | std. | 6 degrees |
| Power | a **steam generator (Dampferzeuger)** trolley at the foot: T-Stoff (concentrated hydrogen peroxide) decomposed by Z-Stoff (sodium or calcium permanganate solution) gave steam that drove a **piston** up the slotted tube; a lug on the piston pushed the missile and the piston flew off the end and was recovered | W (T-Stoff, Z-Stoff, V-1); S | `setGenerator`, `fx.v1Launch` |
| Launch speed | about 320 to 400 km/h after about 1 s (sources differ; 320 km/h in several; the pulse jet needed about 240 km/h to sustain itself) | W; S | `rig.launch(t)` about 1 s |

### Launch drill (sequence, std., consistent with the IWM and NASM descriptions)

1. The missile arrives in parts; wings fitted; it is swung in the Richthaus and its compass set.
2. Fuel (about 600 l of low-grade petrol) and the compressed air bottles charged; height and **air log range
   setting** made; fuzes fitted.
3. On its launch cradle it is placed on the ramp; the steam generator trolley is coupled at the foot and charged
   with T-Stoff and Z-Stoff.
4. The crew withdraws to the shelter; the pulse jet is started with compressed air and a spark, runs for a few
   seconds at full power, then the steam generator is fired and the missile leaves the ramp.
5. A ramp could fire about once every 20 to 30 minutes at best (std.); early sites managed far less.

### Campaigns

| Fact | Figure | Source |
|---|---|---|
| First launch against London | night 12/13 June 1944: about 10 launched, 4 reached England; the first to hit London fell at Grove Road, Bow (6 killed) on 13 June | I (English Heritage blue plaque); std. |
| First mass launch | night 15/16 June 1944: over 200 launched (244 in some accounts), 144 crossed the coast, 73 on London | W; S |
| Launchers available at first | 55 to 72 ramps | W |
| Total against Britain (June 1944 to March 1945) | about 9,500 to 10,500 (ramp and He 111 air launched); 10,386 in Evans 2018 | W; S (peer-reviewed) |
| Non-abortive (flew properly) | 7,573 (73 %) | S (Evans 2018, from Hill 1948, Air Ministry) |
| Destroyed in flight | 3,986 (38 % of launched): fighters, guns, balloons (about 230 to 300 by balloons) | S (Evans 2018); P (Collier 1957, totals by arm) |
| Reached London | about 2,420 | S (Evans 2018) |
| Ramp launch failure | about 25 % (air launches about 40 %) | W; S |
| Killed in Britain | 6,184 killed, 17,981 seriously injured | W; P (Collier) |
| Late summer 1944 | after the guns moved to the coast (July 1944) and proximity fuzes arrived, the share destroyed rose sharply (e.g. late August, most of a night's bombs destroyed) | S; P (Collier) |
| Antwerp and Belgium (Oct 1944 to March 1945) | 2,448 aimed at Antwerp and other Belgian targets (Wikipedia); "more than 4,000" at greater Antwerp in other accounts | W; S |
| Antwerp X (US, British and Polish AA command) | interception 52 % December, 64 % January, 72 % February (one account); "over 90 %" by the end (another) | S (Skylighters, US AA veterans' history); W |
| Killed in Antwerp by V-weapons | more than 3,400 to 3,700 civilians (V-1 and V-2 together); 14,758 missile casualties on the Continent, mostly Antwerp | S |

Sources: [IWM: Fieseler Fi-103 V1 (MUN 3854)](https://www.iwm.org.uk/collections/item/object/30020791) (I);
[IWM: "Vergeltung, das Flak-Regiment 155 (W)"](https://www.iwm.org.uk/collections/item/object/1500026723) (I);
[Smithsonian NASM: Missile, Cruise, V-1](https://www.si.edu/object/missile-cruise-v-1-fi-103-fzg-76:nasm_A19600341000) (I);
[English Heritage: the first flying bomb on London](https://www.english-heritage.org.uk/visit/blue-plaques/flying-bomb/) (I);
[Historic England: the Baby Blitz and V-weapons](https://historicengland.org.uk/whats-new/features/blitz-stories/london-the-baby-blitz-and-v-weapons-1941-1945/) (I);
[Evans 2018, "The V1 (Flying Bomb) attack on London (1944 to 1945)", Applied Geography](https://www.sciencedirect.com/science/article/abs/pii/S014362281730872X) (S, [PDF](https://jhanley.biostat.mcgill.ca/bios601/Intensity-Rate/Evans2018AccuracyGeography.pdf));
[Collier, "The Defence of the United Kingdom" (HyperWar)](https://www.ibiblio.org/hyperwar/UN/UK/UK-Defence-UK/index.html) (P, [archive.org](https://archive.org/details/defence-united-kingdom-ww2));
[ww2.dk: Flak-Regiment 155 (W)](https://www.ww2.dk/ground/flak/flargt155.html) (S);
[Wikipedia V-1](https://en.wikipedia.org/wiki/V-1_flying_bomb), [V-1 facilities](https://en.wikipedia.org/wiki/V-1_flying_bomb_facilities), [Antwerp X](https://en.wikipedia.org/wiki/Antwerp_X);
[Skylighters: the story of Antwerp X](https://skylighters.org/welcome/the-world-at-war/the-story-of-antwerp-x) (S);
[Bunkermuseum Antwerpen: V1](https://bunkermuseumantwerpen.be/en/v1/) (I).

---

## 10. V-2 (Aggregat 4, A4)

Army ballistic missile developed at Peenemünde under Walter Dornberger and Wernher von Braun; built mainly in the
Mittelwerk tunnels at the Kohnstein under the Mittelbau-Dora concentration camp. Operational from 8 September 1944
(Paris and London) to 27 March 1945.

### The missile

| Spec | Real | Source | Game |
|---|---|---|---|
| Length / diameter / fin span | 14.0 m / 1.65 m / 3.56 m (std.) | W | `buildMissile('v2')` |
| Launch mass | about 12.5 to 13 t | W | not modelled |
| Warhead | about 1 t (Amatol); no proximity fuze, so no airburst | I (NASM); S (RAF ASPR) | burst `v2` |
| Fuel (B-Stoff) | about 3.8 t of 75 % ethanol and water | W (std.) | `setFuel({ alcohol })` |
| Oxidiser (A-Stoff) | about 4.9 t of liquid oxygen, boiling off continuously | W (std.) | `setFuel({ lox })`, frost |
| Turbopump drive | **T-Stoff** (concentrated hydrogen peroxide) decomposed by **Z-Stoff** (sodium permanganate, kept warm) in a steam generator | W | in the fuelling step |
| Thrust, burn | about 25 t at lift-off; burn about 60 to 65 s (45 s minimum) to Brennschluss | S (v2platform.nl) | flight scripted |
| Range | about 320 km | I (NASM) | abstracted |
| Speed | about 1,600 m/s at cut-off; it arrived before the sound of its flight | std. | no flight sound (`audio.shell` none for `v2`) |

### Range control (Brennschluss)

The range was set by the moment of engine cut-off. Two systems served: a **radio cut-off** (the Wolman Doppler
system, or a Leitstrahl guide beam for line, used by about 10 % of rockets) and an **integrating accelerometer**
(I-Gerät) that cut the engine when the preset velocity was reached, adopted for fear of jamming. The radio system was
more accurate (W; S, astronautix and designation-systems.net).

### Ground equipment and drill

- **Meillerwagen**: the trailer that brought the rocket horizontally and erected it with hydraulic rams driven by a
  small petrol engine; its arm carried work platforms; it was withdrawn before fuelling was complete (I, NMUSAF; S).
- **Brennstand / Abschusstisch**: the firing table with a blast deflector cone, turned to bring the rocket's
  reference fin onto the line of fire; levelled and laid with a theodolite (std.).
- **Feuerleitpanzer**: an armoured firing control vehicle (on a half-track) from which the shot was fired (std.).
- Sequence (S, v2rocket.com procedure, consistent with the Backfire report's description; std.):
  1. Back the Meillerwagen to the table, screw down its supports, erect the rocket, clamp it to the table.
  2. Align the table (the rocket turned on it) and set the gyros; connect the cables; checks from the platforms.
  3. Fuel alcohol (about 10 minutes); T-Stoff and Z-Stoff; **liquid oxygen last, no more than about an hour
     before firing** (valves froze and the LOX boiled away).
  4. Withdraw the Meillerwagen and tankers; crew to cover.
  5. **Vorstufe** (preliminary stage): the igniter lit, alcohol and oxygen flowed under gravity and burned at
     reduced thrust (about 8 t, std.) for a few seconds while the crew checked the flame; then the **Hauptstufe**
     (main stage): the turbopump came up and the rocket lifted off at full thrust, rose vertically for about 4 s,
     then pitched over towards the target.
- Timing: about 90 minutes or more from erecting to firing (one source), "within 110 minutes" (another); 4 to 6 hours
  from occupying a site including transport and unloading (NMUSAF).

### Units and launch areas

- **Artillerie-Abteilung (mot.) 485** (two batteries) and **836** (three batteries), the training and test battery
  **444**, and **SS-Werfer-Abteilung 500** (from early 1945), under Division zur Vergeltung and finally under
  SS-Gruppenführer Hans Kammler (std., Neufeld; the search extracts confirmed batteries 2./485, 2./836 and 444 in
  launch logs but not the full order of battle).
- Launch areas: The Hague (the **Haagse Bos**, Wassenaar, Loosduinen; 82 rockets from the Haagse Bos at London in
  November 1944), Rijsterbos (battery 444 against Antwerp, October 1944), the eastern Netherlands (Hellendoorn and
  other sites are named in secondary lists, not confirmed here), and the Eifel and Westerwald against Antwerp,
  Liège and later the Remagen bridge.

### Campaign figures

| Fact | Figure | Source |
|---|---|---|
| Operational launches | about 3,172 (8 Sept 1944 to 27 March 1945) | S |
| Landed on Antwerp / London | about 1,610 / about 1,358 | S |
| Against Britain | 1,402 attacks; to 7 April 1945, 1,190 launched at Britain plus 169 failures, 501 on Greater London (RAF figures) | S (RAF Air and Space Power Review) |
| Killed in Britain | 2,754 civilians, 6,523 injured | W; S |
| Failures | December 1944 to February 1945: about 12 % rejected before firing, about 10 % failed in sight of the launch crew, roughly a further 12 % fell in the sea or open country (British post-war studies) | S (astronautix, citing them) |
| Early air bursts | in 1944 many broke up on re-entry (up to 80 % failure at the start of production, cured by about November 1944) | S |
| Interception | none possible | all |

Sources: [Smithsonian NASM: V-2 (A-4)](https://www.si.edu/object/missile-surface-surface-v-2-4:nasm_A19600342000) (I, text revised by Neufeld);
[National Museum of the USAF: V-2 with Meillerwagen](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196226/v-2-with-meillerwagen/) (I);
"Report on Operation Backfire", War Office 1946, five volumes: [Smithsonian Libraries, vol. 2](https://library.si.edu/digital-library/book/reportonoperati2grea) (P),
[UK National Archives catalogue (WO 231)](https://beta.nationalarchives.gov.uk/catalogue/id/C2130787/) (P, not online);
[v2rocket.com: German mobile firing procedure](http://www.v2rocket.com/start/deployment/procedure.html) (S),
[mobile operations](https://www.v2rocket.com/start/deployment/mobileoperations.html), [timeline](http://www.v2rocket.com/start/deployment/timeline.html);
[v2platform.nl: technical data](http://www.v2platform.nl/book/technical.html), [Loosduinen, The Hague and Wassenaar](http://www.v2platform.nl/book/loosduinen.html), [London and Antwerp](http://www.v2platform.nl/book/london_antwerp.html) (S);
[RAF ASPR vol. 22 no. 2 (Hunt)](https://www.raf.mod.uk/what-we-do/centre-for-air-and-space-power-studies/aspr/aspr-vol22-iss2-8-pdf/) (S, official journal);
[astronautix V-2](http://www.astronautix.com/v/v-2.html) (S);
[Science Museum blog: V-2](https://blog.sciencemuseum.org.uk/v-2-the-rocket-that-launched-the-space-age/) (I);
[Wikipedia V-2](https://en.wikipedia.org/wiki/V-2_rocket), [Meillerwagen](https://en.wikipedia.org/wiki/Meillerwagen), [Operation Backfire](https://en.wikipedia.org/wiki/Operation_Backfire_(World_War_II)).
Museums with A4 material: Peenemünde Historical Technical Museum, La Coupole (Helfaut) and the Blockhaus
d'Éperlecques in France, IWM London and Duxford, the Mittelbau-Dora Memorial.
Book: Michael J. Neufeld, "The Rocket and the Reich" (1995) (S). Dornberger's "V-2" (1952) is a participant memoir (M).

---

## 11. The enemy

### British and Canadian artillery, 1944 (Flanders operation)

| Weapon | Real | Source | Game |
|---|---|---|---|
| QF 25-pounder (field regiments, 3 batteries of 8 guns, 24 per regiment) | 87.6 mm; HE 11.5 kg; MV 198 to 532 m/s on charges 1 to 3 and super; 3,566 / 7,132 / 10,790 m on charges 1 to 3, **12,253 m with super** | W; I (Royal Canadian Artillery Museum quick reference); S (Tank Archives) | enemy shell `q25` |
| BL 5.5-inch medium gun (medium regiments, 16 guns) | 140 mm; 100 lb (45 kg) shell at 511 m/s about 14,800 m (16,200 yd); 82 lb (37 kg) shell at 590 m/s about 16,500 m (std.; the ranges were not confirmed in this pass) | W | enemy shell `m55` |
| Air OP | Auster (Mk IV, V) flown by Royal Artillery officers in RAF AOP squadrons (651 to 662); they spotted and corrected fire at short range behind the British lines | W | target `aop` (an Auster strip) |
| Counter-battery | a Counter Battery Officer (CBO) and staff at each corps HQ; a Survey Regiment RA with sound ranging and flash spotting troops; shelling reports (Shelreps) from the units; targets engaged by medium and heavy regiments, often whole divisional or corps concentrations ("Uncle" and "Victor" targets) | S (britishartillery.co.uk; Juno Beach Centre) | `observer: 'sound'` on targets; enemy CB fire |
| Typhoon "cab rank" | 2nd TAF Typhoons (83 and 84 Groups) circling over the front, called down by Visual Control Posts with the forward troops, targets marked with coloured smoke; RP-3 rockets with 60 lb heads | W; S | enemy shell `rp3`, `buildAircraft('typhoon')` |
| RP-3 accuracy | poor: post-Normandy analysis gave about 4 % hits on tanks; at Mortain (7 August 1944) pilots claimed 89 tanks destroyed, operational research teams found few wrecks the rockets could be credited with | S (Operational Research Section 2 reports as quoted) | `rp3` lethal radius 14 m |

Sources: [Wikipedia 25-pounder](https://en.wikipedia.org/wiki/Ordnance_QF_25-pounder);
[Royal Canadian Artillery Association: 25-pounder quick reference (PDF)](https://rca-arc.org/wp-content/uploads/2022/11/25-Pounder-Quick-Reference.pdf) (I);
[canadiansoldiers.com 25-pounder](https://www.canadiansoldiers.com/weapons/ordnance/25pounder.htm) (S);
[Tank Archives: 25 pounds of death](https://www.tankarchives.com/2018/09/25-pounds-of-death.html) (S);
[Wikipedia 5.5-inch](https://en.wikipedia.org/wiki/BL_5.5-inch_medium_gun);
[britishartillery.co.uk: artillery intelligence and counter-battery](https://britishartillery.co.uk/p_artyint-cb.htm) (S);
[Juno Beach Centre: RCA organisation](https://www.junobeach.org/canada-in-wwii/articles/artillery/royal-canadian-artillery-organization/) (I);
[Wikipedia Air observation post](https://en.wikipedia.org/wiki/Air_observation_post), [Hawker Typhoon](https://en.wikipedia.org/wiki/Hawker_Typhoon), [RP-3](https://en.wikipedia.org/wiki/RP-3).

### Sevastopol, 1942 (Soviet)

The Sevastopol Defence Region (Coastal Army under Petrov, the Black Sea Fleet under Oktyabrsky) held a belt of
field works, pillboxes and the northern works the Germans named after Soviet leaders, backed by naval **coastal
batteries**: **No. 30 (Maxim Gorky I)**, two armoured turrets of two 305 mm guns each, north of the city, which fired
on the German assault until it fell on 17 June 1942, and **No. 35 (Maxim Gorky II)** south-west of the city. Ammunition
was stored in cliff galleries on the north shore of Severnaya Bay (Sukharnaya Balka). Field artillery: 76 mm, 122 mm
and 152 mm guns and howitzers. The game's `turret` (two twin 305 mm turrets), `fort`, `magazine` and `sbattery`
(122 mm) kinds fit this. Sources: [Wikipedia: Maxim Gorky fortresses](https://en.wikipedia.org/wiki/Maxim_Gorky_Fortresses);
[allworldwars.com: history of Maxim Gorky I](https://www.allworldwars.com/The%20History%20of%20Maxim%20Gorky-I%20Naval%20Battery.html) (S, translated Soviet account);
[National WWII Museum: the Crimea at war](https://www.nationalww2museum.org/war/articles/peninsula-crimea-war) (I); Forczyk, Osprey Campaign 189 (S).

### Brest-Litovsk, 1941 (Soviet)

The 19th-century fortress: a central island (the Citadel) ringed by a two-storey brick **ring barracks** with
gate towers (Kholm, Terespol, Brest gates), the Kobrin, Volhynia and Terespol fortifications around it, and outer
works including the horseshoe-shaped **Eastern Fort**. Garrison on 22 June 1941: elements of the 6th and 42nd Rifle
Divisions, NKVD border guards and others, roughly 7,000 to 9,000 (std.). Sources: [Wikipedia: Defense of Brest
Fortress](https://en.wikipedia.org/wiki/Defense_of_Brest_Fortress); [42nd Rifle Division](https://en.wikipedia.org/wiki/42nd_Rifle_Division_(Soviet_Union)).
The Brest Hero-Fortress memorial complex is the institutional source to consult for the layout.

---

## A. Historical departures in the game

### A1. Gun rows (`GUNS_WW2`)

| Kind | Field | Game | Real | Why the game differs / suggested action |
|---|---|---|---|---|
| lefh18 | top MV / range | 470 m/s, 10.7 km | 470 m/s, 10,675 m | matches |
| lefh18 | elevation | +2 to +42 | -5 to +42 | game floor for playability; fine |
| lefh18 | cycle | 8.6 s (about 7/min) | 6 to 8/min burst, about 4 sustained | matches burst rate; sustained rate ignored (no barrel heating) |
| lefh18 | ammo | HE 220, shrapnel 60 | no WW2 shrapnel round | **rename "shrapnel" to HE with time fuze (Zeitzünder / Dopp Z)**; the airburst mechanics can stay |
| lefh18 | Fernladung | not offered | 18M / 18/40: 540 m/s, 12,325 m | optional seventh charge if the 18/40 is meant (the 1944 gun) |
| sfh18 | top MV / range | 520 m/s, 13.3 km | 495 (or 520) m/s, 13,250 m | within the sources; 495 m/s is the more cited |
| sfh18 | charges | 5 of 8 | 8 | simplification, fine |
| sfh18 | crew | 8 | 7 | fine |
| k18 | shell mass | 62.8 kg | 62.8 or 68 kg | sources split; fine |
| k18 | MV / range | 925 m/s, 29.6 km | 925 m/s, 29,600 m | matches |
| k18 | traverse | +-60 slow | 16 on carriage, 360 on platform | representation of the platform turn; fine |
| k18 | cycle | 28.5 s (about 2/min) | 1 to 2/min | upper end; fine |
| mrs18 | MV / range | 565 m/s, 16.7 km | 550 to 565 m/s, 16,700 m | matches |
| mrs18 | elevation | +8 to +70 | 0 (or -6) to +70 | floor for playability |
| mrs18 | shells | HE only | HE 113 kg and Be 121.4 kg | optional Be shell for Sevastopol |
| nbw41 | range | 6.9 km | 6,900 m | matches |
| nbw41 | reload | 46 s cycle | about 90 s (secondary); one salvo per 8 min sustained (1943 US bulletin) | compressed about 2x; sustained rate ignored |
| nbw41 | traverse | +-15 | about 24 to 30 total | close |
| gustav | MV / range | 820 m/s, 47 km | 820 m/s HE, 47 to 48 km | matches |
| gustav | charges | Teilladung 560, Volle Ladung 720, Verstärkte Ladung 820 | HE 820 m/s; concrete-piercing 7,100 kg shell 720 m/s, 38 km | **the 720 m/s figure belongs to the 7,100 kg Betongranate, not to a reduced charge of the HE shell**. Either add a `Be` shell (7,100 kg, 720 m/s, 38 km, the `deep` row) or relabel the charges without the period names. The "Verstärkte Ladung" name has no source here |
| gustav | traverse | +-10 slew at 0.08 deg/s | none; moved along the firing curve | representation; fine (the real curve gave a few degrees of line; +-10 is generous) |
| gustav | cycle | about 247 s | 30 to 45 min | compressed about 8 to 10x (time scale) |
| gustav | ammo | 8 | 48 fired in the whole of June 1942; about 14 a day at most | scarcity kept; 8 per battle is consistent with the real daily count over a short game |
| gustav | crew drawn | 24 | 250 to assemble, about 500 at the gun, about 1,420 in the Abteilung, 2,000 to 4,000 on the site | figures drawn are a token detachment |
| gustav | wear | 0.0035 per round | barrel life about 100 to 300 rounds (disputed) | fine |
| bertha | heavy shell range | 12.0 km | 9,300 m | stretched on purpose (ballistics.js) so the target line is reachable; label it |
| bertha | MV | to 390 m/s | 400 to 426 m/s (Wikipedia, historyofwar) | the game's drag constants make 390 reach further than the real 400 did; fine |
| bertha | elevation | +20 to +65 | about +40 to +75 | game floor lower; fine |
| bertha | presence | in Flanders 1944 | WWI weapon only | alternate-history guest (label) |
| karl | heavy / light | 220 m/s 4.2 km / 283 m/s 6.5 km | 220 m/s 4,320 m / 283 m/s 6,640 m | matches within 3 % |
| karl | light shell | a charge of the 2,170 kg shell | a separate 1,250 kg shell | the light shell's burst should be smaller (or add a `karl_l` shell row) |
| karl | traverse | +-4 | 4 each way | matches |
| karl | cycle | 120 s | about 10 min | compressed 5x |
| karl | ammo | 8 | 4 per Munitionsschlepper; 122 for the whole Abteilung at Sevastopol in 12 days | fine (two Schlepper loads) |
| all | `wearPerRound`, dispersion, calibration | game values | not modelled from data | arcade |

### A2. Operation-level departures

- **Flanders, autumn 1944 is fictional.** Ypres itself was liberated in early September 1944 with little fighting;
  the real autumn 1944 battle in Flanders was the Canadian First Army's Battle of the Scheldt (October to November
  1944), further north. The game stages a German defence on the 1917 Ypres map with the British game's five phases
  turned round.
- **The weapons never served together.** The K 18, Mrs 18, sFH 18, leFH 18 and Nebelwerfer did serve in the West in
  1944; Gustav never fought in the West (Sevastopol only, 1942); Big Bertha is a WWI gun. Both are labelled
  alternate-history guests.
- **Sevastopol** compresses a month (Gustav's 48 rounds over 5 to 17 June) into a short battle; the railway
  preparation (weeks) and assembly (three days) become a controller-gated preparation phase.
- **Brest-Litovsk** gives the player Thor, whose real combat that day was a few rounds before a jam. In the game
  Karl works; jams could be a scripted event if wanted.
- **V-1 and V-2 missions** end at the launch and the flight; the strategic outcome (where it fell, what it did) is
  abstracted into a score with no casualty count.
- **Time scale.** The game clock runs a time lapse (DESIGN.md: about 40 minutes of game time for a day and a night);
  loading cycles are compressed independently (below).

## B. Balancing assumptions

- **Damage model.** Effects come from the game's `SHELLS_WW2` table by calibre and target hardness (`soft`, `hard`,
  `deep`), as in the British game. They are not penetration or blast calculations. `deep` (the cliff magazine, fort
  casemates) is harmed only by the heaviest delay-fuzed shells; that reflects the real purpose of the Gustav and Karl
  concrete-piercing shells but not their real (small, disputed) results.
- **Compressed loading cycles.** Field guns load at about their real burst rate; the heavy guns are compressed: K 18
  and Mrs 18 about 1x to 2x, Nebelwerfer about 2x, Bertha about 8x, Karl 5x, Gustav 8 to 10x. Without this a Gustav
  battle would be one shot an hour.
- **Scarcity of super-heavy rounds.** Gustav 8 and Karl 8 rounds per battle. Real: Gustav fired 48 in 13 days (and
  could manage about 14 a day); a Karl Schlepper carried 4. Keeping them scarce keeps the real character (a few
  enormous, slow, inaccurate shots) and the drama.
- **V-1 interception odds (proposal for `src/ww2/`).** Real London campaign: about 25 % of ramp launches failed near
  the ramp; of the rest about half were shot down over the whole campaign, rising to most of them by late August
  1944; Antwerp X destroyed about 50 to 70 % over the winter, more at the end. A game figure of **launch failure
  about 0.2 to 0.25** and **interception about 0.4 to 0.6** (by month or difficulty) stays inside the record.
- **V-2 failure odds (proposal).** Real: about 12 % scrubbed before firing (in the game a failed check that holds the
  countdown), about 10 % failing near the site, about 12 % going astray; early-production air bursts much higher in
  autumn 1944. A game figure of **about 0.1 launch failure and 0.1 to 0.15 in flight** is honest. No interception.
- **Accuracy.** Both V-weapons were area weapons: the V-1's air log and compass, the V-2's cut-off timing, put rockets
  kilometres from the aim. The game's target is a port (Antwerp), not a point.

## C. What the game adopted after this review

The tables above compare the first draft of `src/sim/tables_ww2.js` with the record. These changes were made after it
(the code is the reference; this list says why):

- **Gustav charges** are now plain `Ladung 1` to `Ladung 3` (560, 720, 820 m/s); the period names are gone. There is no
  separate 7,100 kg Betongranate: the delay fuze (`AZ m.V.`) stands for it against concrete and the cliff magazine
  (the `deep` row). Departure kept for simplicity.
- **leFH 18 airburst**: the third fuze is labelled `ZEITZ.` (HE with a time fuze, an airburst), not shrapnel. It uses
  the game's airburst rule (`FUZE.shrapnel`), which is the same model.
- **Traverse**: the leFH 18 and sFH 18 slew +-60 degrees and the Nebelwerfer +-50 (real totals about 56, 64 and 24 to 30
  degrees). As in the British game, the game folds shifting the trails into one slew so every battery can reach the
  Sperrfeuer lanes; the K 18 and Mrs 18 keep +-60 for their firing platforms. Gustav uses +-10 along its curve at
  Sevastopol; the fictional Flanders position uses a longer +-18 degree curve so its gun can be laid on every fixed
  target. Karl uses +-4, with the rest by turning the vehicle.
- **Karl ammunition**: 12 heavy shells, 4 on the Munitionsschlepper and 8 at the dump; a trip takes 150 s of game time.
  The light 1,250 kg shell is still a charge of the heavy one (smaller burst not modelled).
- **V-1 odds** (`special.js` `V1_ODDS`): ramp crash 0.08 plus early failure 0.12 (about 0.2 at launch), interception
  0.45, target area within 8 km, scatter 5.5 km; the steam generator's pressure fault 0.12 (carrying on adds 0.45 to the
  crash odds), a fuel leak 0.06. **V-2 odds** (`V2_ODDS`): blast on the table 0.03, failure in flight 0.12, target area
  within 6 km, scatter 3.5 km, a gyro fault in the checks 0.15, a ragged pre-stage 0.06. The liquid oxygen boils off at
  0.09 % a second once in; below 92 % the rocket falls short. Faults, raids and losses are off on the tutorial range.
- **Flights are compressed**: a V-1's report arrives after a quarter of its real flight time, a V-2's after 150 s.
- **Sandbox cadences** (the open Flanders battle's set-up Karl, `def.ready`; the V-1 and V-2 figures apply to a set-up
  site, though the sandbox no longer has them): the Karl keeps its gun
  cycle (120 s of steps, about 180 s with the slew down to 0 degrees to load and back up; real about 10 minutes) and
  its 150 s carrier trips; a line outside its 4 degrees is about 36 s of hull raising and lowering plus the turn at
  1.6 degrees a second, worked while the crew loads (as the other guns traverse while they load), so a turn of up to
  about 120 degrees costs nothing over the cycle. A V-1 ramp reloads in 102 s and fires in 4 s (real best one every 20 to 30 minutes, about
  15x): the preparation section's work (wings, compass, air log, fuel, fuzes) is done off the ramp. An A4 table
  reloads in 290 s (the drill's own step times) and fires in 9 s (real 90 to 110 minutes from erecting, about 20x).
  Faults and raids on the site still cost their time.
- **The sieges** end when every work is broken, the heavy gun's shells are spent, or the day (2,400 s) is over; a work
  counts as broken when it is destroyed or half its parts are. Victory needs 60 % of the works.
- **The Flanders battle's balance** (all-auto crews, seeds 1 to 8): Easy 8, Normal 3, Hard 2 won. The Allied attacks
  are smaller than the British game's German assaults (0.5 to 0.6 of its size factor), our front-line machine guns take
  a toll of the attackers (0.05 men a second a group, more when pinned), a group must reach our trench with 45 % of
  its men to break in, and the counter-attack needs 15 points less of its men on the objective than the British Zero
  hour (it is shorter and has no wire). All game values, tuned so the player's own fire decides.

### Gun model reference review

The visual pass compared the gun rigs with period identification material and surviving examples. The
[U.S. War Department German equipment handbook, figures 35–43](https://www.ibiblio.org/hyperwar/Germany/HB/HB-7.html)
guided the leFH 18, sFH 18, K 18 and Mrs 18 carriage and recoil details. The updated rigs have recessed bores,
open brakes where fitted, exposed recoil hardware, wheel and bearing details, and the K 18/Mrs 18 road wheels
raised on the firing platform. A [surviving sFH 18](https://commons.wikimedia.org/wiki/File:15_cm_sFH_18%2C_Sinsheim.jpg)
and [surviving Mrs 18](https://commons.wikimedia.org/wiki/File:21cmM%C3%B6rser18FortSillFront2005.jpg)
were used for visible fittings.

The [wartime Nebelwerfer identification account](https://ww2.lonesentry.com/articles/nebelwerfer/index.html)
and [Smithsonian 15 cm rocket](https://airandspace.si.edu/collection-objects/rocket-surface-surface-nebelwerfer-15cm-wgr-41-spr/nasm_A19890604000)
guided the six-tube cluster, bore size, firing leads and projectile ends. The
[Polish Army Museum Karl-Gerät account](https://muzeumwp.pl/mwpedia/mozdzierz-samobiezny-karl-gerat-040/)
guided Karl's short barrel and open cradle. Gustav's 80 wheels are now arranged as 40 axles in eight bogies on
two tracks, matching its running-gear specification above; its emplacement and gun rig use the same rail spacing.
The [Imperial War Museums Krupp film record](https://film.iwmcollections.org.uk/record/19281) is a moving-image
reference for the siege gun. [Period Big Bertha photographs](https://commons.wikimedia.org/wiki/Category:Big_Bertha)
guided fittings on the WWI guest weapon.

These are game-scale visual reconstructions. Unmeasured fittings, heavy-carriage platforms and some support
proportions remain approximations. The Flanders Gustav and Big Bertha placements are alternate history, as noted
above.

A second reference pass rebuilt every German weapon from photographs of the surviving examples and period
handbooks; the sheets are `refs/<group>/README.md` (dimensions with sources, feature checklists, photo licences).
The leFH 18 is the 1944 leFH 18 (M) with the muzzle brake on the wooden-wheeled split-trail carriage (US Catalog of
Enemy Ordnance, IWM B 7600); the sFH 18 follows TM-E 30-451 figures 37 and 38 (no shield); the K 18 and Mrs 18 share
one cradle and breech place with their sourced barrel lengths; the Nebelwerfer 41's six tubes touch in a flat-topped
hexagon and its rocket has the narrower 121 mm warhead behind the venturi band; the Gustav is fitted to 47.3 m over
all, 7.1 m wide and 11.6 m high; Big Bertha has the production guns' solid wheels with Radgürtel and the arched shield;
the Karl fires over its stern (de.wikipedia: the driving direction was opposite to the firing direction; the Polish
Army Museum: it reversed into position), with the engine, driver and sprocket at the breech end; the V-1 ramp follows
the IWM Duxford original and the V-2 site the Backfire procedure and the Dayton, Cosford and Canberra Meillerwagen.
Unmeasured details (wheel sizes, trail sections, the Karl's later chassis spacing, the V-1 steam trolley, the
Meillerwagen's rams) are scaled from photographs.

### Firing positions and concealment

The field howitzers, K 18, Mrs 18 and Bertha stand inside low earth and timber revetments with open muzzle lanes,
rear ammunition bays, covered crew trenches and patchy nets over the rear stores. Each battery has a connected,
terrain-following zigzag communication trench behind its pieces, a covered command bunker with field telephone
and aerial, a crew shelter, a revetted reserve ammunition bay, a screened observation post, flank foxholes and a
disguised supply route with a parked truck. The Nebelwerfer positions have shallow cover and brush screening,
with open tops and clear launcher exhaust space. Karl's three selectable positions have screened hardstandings and
their own rear works; the vehicle can drive between them. Gustav retains its staged railway works, flak and large
camouflage net, now with separate perimeter posts and a command and ammunition area outside the rail corridor.
The V-weapon launch sites retain their own cover.

The placement follows contemporary descriptions of German artillery camouflage and crew/ammunition shelter in
the [U.S. Army Intelligence Bulletin on German artillery tactics](https://www.ibiblio.org/hyperwar/NHC/NewPDFs/USArmy/USArmy%20MID%20Intelligence%20Bulletins/USArmy%20MID%20Intelligence%20Bulletin%20Vol.%201%20No.%2009%201943-05-00.pdf)
and the [Handbook on German Military Forces, chapter 4](https://www.ibiblio.org/hyperwar/Germany/HB/HB-4.html)
and [chapter 5](https://www.ibiblio.org/hyperwar/Germany/HB/HB-5.html).
The site shapes and exact layouts are stylised to suit the game terrain and gun crew animations. These works are
scenery; battle damage and protection remain governed by the existing simulation rules.

### Moral context

The V-weapons were terror weapons aimed chiefly at cities. The V-1 killed 6,184 people in Britain; V-2s killed
2,754 civilians in Britain; V-weapons killed more than 3,400 to 3,700 civilians in and around Antwerp (one
December 1944 V-2 hit on the Rex cinema there is commonly cited as the worst single incident; not checked in this
pass). The V-2 was built by concentration camp prisoners: about **60,000** people were held at Mittelbau-Dora and its
sub-camps between August 1943 and April 1945, and about **20,000** of them died (Mittelbau-Dora Memorial; USHMM).
Neufeld (Smithsonian, 2020) estimates at least 10,000 deaths attributable to V-2 production at the Mittelwerk alone,
about twice the number killed by the missile's use, with possibly up to another 10,000 elsewhere in the programme.
V-1s were also assembled at the Mittelwerk.

The game frames these missions soberly: the target named is the **port of Antwerp** (the Allied supply port, the
actual main target of the V-weapons from October 1944), there is **no civilian casualty scoring**, no celebration of
hits on cities, and the briefing text should say plainly who built the weapons and who they killed. The mission is
presented as what the German batteries did, not as a goal for the player to admire.

Sources: [Mittelbau-Dora Memorial: "Lebendig begraben"](https://www.dora.de/en/geschichte/chronologie/konzentrationslager/lebendig-begraben) (I);
[Mittelbau-Dora Memorial: aerial photograph exhibition PDF](https://www.dora.de/dam/jcr:6bb90420-daf9-406c-9f08-1ec3a8509e62/WW-EN-2017.pdf) (I);
[USHMM Holocaust Encyclopedia: Mittelbau main camp](https://encyclopedia.ushmm.org/content/en/article/mittelbau-main-camp-in-depth) (I);
[Smithsonian (Neufeld): Wonder weapons and slave labor](https://airandspace.si.edu/stories/editorial/wonder-weapons-and-slave-labor) (I);
[University of Alabama in Huntsville: Dora and the V-2](https://dora.uah.edu/history.html) (I, academic);
[Memorial Museums: Denkmal-Landschaft Peenemünde](https://www.memorialmuseums.org/eng/denkmaeler/view/1400/Denkmal-Landschaft-Peenemünde) (I);
[Wikipedia: Mittelbau-Dora](https://en.wikipedia.org/wiki/Mittelbau-Dora_concentration_camp).

---

## D. Planned improvements (not built yet)

Ideas for making the V-1 and V-2 operations more of a game (D1, D2), and fixes noted for later (D3), chosen in
October 2026. Nothing here is in the code yet. The rules of the mode still apply: no claims about real events or
places in the game's text, and every order the site cannot carry out is explained to the player.

### D1. Short skill moments at the key steps

A few of the big key's Enter presses become a 3 to 10 second moment where timing or reading an instrument decides
the outcome, so part of the dice becomes the player's skill. Each moment is one key (Enter or Space), only in
MANUAL (the auto crew always does it right).

- **V-1 catapult** (`V1_STEPS` `fire`): the pulse jet starts and its buzz rises to the full note over a few seconds;
  fire the catapult on the note. Too early: not enough thrust, the bomb falls off the ramp (this takes over part of
  `V1_ODDS.rampCrash`). Too late: the crew shuts the engine down and starts it again, as the A4's Vorstufe does after
  25 s.
- **A4 Vorstufe to Hauptstufe** (`prestage`, `fire`, `st.vorT`): watch the Vorstufe flame and give the Hauptstufe
  when it burns steady. A ragged flame (today the `preFail` fault popup) is for the player to read and abort with X;
  giving the Hauptstufe on it carries the risk it carries now. Left too long, the crew shuts it down (the existing
  25 s rule).
- **Optional, later:** swing the compass in the Richthaus with the arrows (the needle lags and settles), and turn the
  A4 table under the theodolite crosshair until fin I sits on the line.

**They must be clear to the player.** Each moment:

- **Announced:** the big key changes to the moment's own words before it starts ("WAIT FOR THE NOTE, THEN FIRE",
  "FLAME STEADY? HAUPTSTUFE"), with a one-line cue on the status line.
- **Shown:** an instrument with a marked window (the jet's gauge with a green band, a steady-flame lamp); the big key
  lights when the window is open.
- **Heard:** the buzz climbs in pitch to the note; a steady roar against a sputter.
- **Taught:** a step in the w-v1 and w-v2 lessons, with a demo that hits the window so autoplay still finishes.
- **Explained after a miss:** the radio and the status line say what happened and why ("Fired before the jet reached
  full thrust: it fell off the ramp"), as the invalid-order rule requires.
- **Forgiving:** a wide window on Easy, a hint the first time, never a failure without a cue first.

Code hooks: the gauges already have the jet (`g.jet`) and the flame (`g.flame`) in `LaunchCtl.pose()`; the big key's
words come from `primary()` in `ui/consoles/launch.js`; the instruments are `launchGauges.js` `SPEC`.

### D2. Shoot and scoot for the A4

The V-2 operation becomes hide and seek with the fighter-bombers instead of one fixed site.

- **Several firing points** in the woods on a small map (`op.positions`, as the Karl operation has; `ww2Pads()`
  already levels them).
- **A launch gives its position away:** the vapour trail burns that clearing, and later raids go for burned ones
  (builds on `st.exposed` and `enemyAI.raid()`).
- **The recce warning:** a reconnaissance aircraft over the area means a strike in about 3 minutes. Pack up, or race
  the launch.
- **Where to set up next:** a clearing near the road is quick to reach and set up but exposed; one deep in the woods
  is slow but hidden. The liquid oxygen tanker's arrival is part of the choice.
- **The convoy drives:** Meillerwagen, tankers and the armoured firing vehicle pull out and move (reuse the Karl's
  `travel` and `driving` stages in `KarlCtl`).
- **The payoff:** the fighter-bombers strafe the empty clearing the battery has just left.
- **Clear to the player:** the map marks each position's state (hidden, seen, burned) and its travel and set-up
  time, and the console names the decision when it comes ("Recce overhead: strike in 3:00. Pack up or launch?").

### D3. The Karl's crew on the move

Since the Karl stopped loading and laying on the move (DESIGN.md changelog, `unit.stowed`), one oddity is left on
the drive between Stellungen: the men standing on the ground at their loading stations, beside the Karl and its
Munitionsschlepper, slide along with the vehicle in their standing pose, because the crew has no riding or walking
pose (`render/crews.js`, `render/crews_heavy.js` place them relative to the rig's root). Seen in
`shots/karl_drive2.png`, the Karl operation, a drive from Stellung A to B.

- **Choose first:** put them aboard for the move (on the Karl's rear platform and the carrier's deck), have them
  walk alongside (the drive is about 10 km/h, a jog), or a mix (most aboard, a few on foot guiding the driver).
  Check the sources for how the crew moved between positions before choosing.
- **When:** whenever the hull is not down and the vehicle is driving (`special.stage` 'driving'); back to their
  stations when it stops in a position. Raising, turning and lowering may keep the stations (the vehicle barely
  moves).
- **Smooth:** they climb down or fall in when the drive starts and take their stations again on arrival, not a jump
  between poses. The crew picture must stay a pure function of the sim state so time compression and `fastForward`
  stay exact.
