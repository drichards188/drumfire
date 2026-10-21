# How to play

Back to the [README](../README.md).

This page covers the menu, the campaigns, every era's units and operations, the special weapons' drills, the Big Bertha demo, every key and the tutorials.

## The menu

- **Choose.** The page opens on the main menu. Pick an era (1917 British, WW1 German or WW2 German), a tab (Battles, Campaign, Tutorials, Your batteries), one entry in its list and a difficulty (Easy, Normal or Hard).
- **Play.** Press "Play mission", or Enter, or double-click the entry; Up and Down walk the list. The battlefield loads only then, behind a loading screen with the mission's orders. The "Main menu" button in the game goes back.
- **Memory and sound.** The menu remembers its choices in the browser. Sound starts on the first click or key press.
- **The screen.** In the game, the left half of the screen is a third-person view of the unit you have selected; the right half is its fire control console.
- **AI crews.** Units you are not operating fight on their own with an AI crew, in whatever mode you left them.

## Campaigns and earned batteries

- **Start small.** In the 1917 and WW2 eras you start with one battery (the 6-inch howitzers, or the 10.5 cm leFH 18) and earn the rest in that era's campaign.
- **Any order.** Every mission is open from the start: play them in whatever order you like.
- **Each mission** loans you its battery on manual, with every earlier battery of its era beside it on auto (earned or not). Each has its own target matched to its role, under counter-battery fire.
- **To win**, finish every assignment with the right fuze and enough rounds before the time runs out (longer on Easy, shorter on Hard). A V-1 or V-2 launch counts when the bearing is within 1 degree and the range within 1 %, with no oxygen shortfall.
- **To lose:** lose the loaned battery, or let its target be destroyed before its shoot is complete.
- **The reward.** Win and the battery is yours: it joins the open battle (the V-1 and V-2 fire only in their own operations).
- **What earning does.** A battery not yet earned stays out of the open battles (Ypres and WW2 Flanders). The WW2 Gustav, Karl-Gerät, V-1 and V-2 operations and every lesson are open from the start.
- **Saving.** Progress is saved in the browser; the "Your batteries" tab lists the roster.
- **WW1 German** has no campaign: every battery is yours from the start.
- **Dev mode.** A switch at the foot of the menu opens every battery and mission for testing, without marking anything won.

| Era | Mission | Earns |
|---|---|---|
| 1917 | 01 Beyond the howitzers | 60-pounders |
| 1917 | 02 Crack the pillboxes | 9.2-inch howitzers |
| 1917 | 03 The buried command post | 15-inch howitzer |
| 1917 | 04 The distant command centre | 18-inch railway gun |
| WW2 | 01 Break the supply position | 15 cm sFH 18 |
| WW2 | 02 A storm over the assembly area | Nebelwerfer 41 |
| WW2 | 03 Reach their heavy guns | 17 cm K 18 |
| WW2 | 04 Over the parapet | 21 cm Mörser 18 |
| WW2 | 05 Into firing position | Karl-Gerät |
| WW2 | 06 Under the rock (WIP) | Schwerer Gustav (it starts assembled in every campaign mission) |
| WW2 | 07 Prepare the launch corridor | V-1 catapult |
| WW2 | 08 The mobile launch operation | V-2 firing table |

## 1917 British: the Heavy Artillery Group

The 1917 battle is "Ypres salient" in the menu's Battles tab. The Group has five units (in the battle, the ones you have earned):

| Key | Unit | Call sign | Battery | Guns |
|---|---|---|---|---|
| 1 | 15-inch howitzer | Granny | No. 3 RMA Howitzer | 1 |
| 2 | 9.2-inch howitzer | Mother | 91st Siege Battery | 2 |
| 3 | 6-inch 26 cwt howitzers | Ginger | 118th Siege Battery | 4 |
| 4 | 60-pounders | Long Tom | 1/1st Lowland Heavy Battery | 2 |
| 5 | 18-inch railway howitzer | Wolfe | No. 13 Railway Siege Battery | 1 |

- **The heavies are slow and powerful.** The 15-inch loads in about 50 s, the 18-inch railway gun in about 90 s, the 60-pounder in about 10 s.
- **Each kind has its own loading crew and machinery:** the 15-inch shell crane, the railway gun's shell hoist and tray, the pair carrying a 9.2-inch round from the stack.
- **Shrapnel.** The 60-pounders can also fire shrapnel (airbursts over wire and open ground).
- **The 18-inch railway gun** (2,500 lb shells, about 20 km) reaches the deep targets (railhead, headquarters, far batteries) and fires the biggest burst of the 1917 battle. It is a what-if gun (see [History and sources](HISTORY.md)).

### How a fire mission works

1. **A mission arrives.** The message pad and the mission list show it: a hostile battery (counter-battery), a pillbox or other point target to destroy, wire to cut, harassing fire on a road or the railhead, or an SOS. Missions carry a priority and a deadline. The observer is one of these:
   - a forward observation officer (FOO) by telephone;
   - an aeroplane by wireless (by day);
   - sound rangers, who give a map reference with some error (hostile batteries at night);
   - rail spotters on the railhead;
   - or nobody: a map shoot.
2. **Lay the guns.** Take the mission (Tab, Enter) or click the board. The console computes the line (degrees and minutes of arc), the range (yards), the charge and the elevation from the range table, which comes from the same integrator the simulation flies shells with. The order card says when a target is out of range, inside the minimum range or outside the gun's arc of fire. Each piece traverses and elevates to the order; the loading crew works through the loading steps.
3. **Ranging.** The first round of a fresh lay lands 50 to 400 m off (on Normal; less on Easy, more on Hard). Fire one round and wait for the report.
   - **A FOO** telephones the fall of shot in yards (add or drop, left or right of the line of fire).
   - **Aircraft** send the RFC clock code: a circle letter for the distance (Y 10, Z 25, A 50, B 100, C 200, D 300, E 400, F 500 yards) and an hour for the direction, with 12 o'clock true north from the target.
   - **Correct** with the arrows or `.` and fire again; good corrections get within about 30 m in two or three rounds.
   - **Errors:** wind (the day's meteor telegram), gun wear and each gun's calibration error all shift the fall of shot.
4. **Fire for effect.** Once on, raise the rounds (R) and fire. All pieces of the unit shoot a series. The target's parts (each gun of a battery, each stack of a dump, each wagon) are damaged by a table of calibre against hardness, and a pillbox needs heavier shells or more of them. Dumps cook off in chains.
5. **Counter-battery.** Every round builds the unit's signature (flash and sound ranging), more at night and, by day, while the German kite balloon is up. German batteries walk fire onto the loudest unit; the incoming scream warns you about four seconds ahead. Go to HOLD to let the signature fade, or silence the hostile battery itself.
6. **SOS.** When the Germans form up for an assault, the hurricane bombardment is a warning, then red rockets go up over a sector (A Frezenberg, B Zonnebeke road, C Polygon, D Gheluvelt). Press S, or click the sector's SOS button: every unit that can reach the line lays on it and fires. Infantry that reach the British trench breach the sector; two lost sectors lose the game.
7. **Zero hour.** In the last phase the British infantry go forward behind a creeping barrage that lifts on a timetable. Keep the guns on the lane and lift on time. The game is won when enough of the infantry reach the objective (50 % on Easy, 60 % on Normal, 70 % on Hard). It is lost when two front sectors fall or every gun is destroyed.

### The day and the map

- **The day** runs as a time lapse of about 40 minutes of game time in five phases: Registration (a quiet dawn that teaches the loop), the bombardment, the counter-attack, Night (harassing fire, star shells, the railhead) and Zero hour.
- **Map references** use the British 1:20,000 trench map system for sheet 28: a lettered 6000-yard square, a numbered 1000-yard square, a quarter a to d and tenths of 50 yards, for example `J.14.c.3.7`.

## WW2 German: five operations

In the menu, **WW2 German** switches to a second mode (`/?mode=ww2`): German artillery in the Second World War, in five separate operations, because these weapons never served together. Pick one in the menu's Battles tab, or open it directly with `&play=1`. The four special-weapon operations are open from the start, each with its whole roster.

| Operation (menu name) | URL | What you do |
|---|---|---|
| Flanders, autumn 1944 ("Open battle") | `/?mode=ww2&op=flanders` | The backbone battle on the game's Ypres map, sides turned round: up to seven units (keys 1 to 7) against the Allied gun line, tanks, dumps, the AOP strip, the HQ and the railhead; Sperrfeuer when their infantry attacks, Störungsfeuer at night, a Feuerwalze for our counter-attack |
| Sevastopol, June 1942 ("Gustav siege", WIP) | `/?mode=ww2&op=sevastopol` | Build the 80 cm Gustav on its firing curve (work gangs on survey, track, gantry cranes, assembly, ammunition train, flak, camouflage), then spend its few 4.8 t shells on the coastal turrets, the forts and the cliff magazine; a 21 cm Mörser battery supports |
| Brest-Litovsk, 22 June 1941 ("Karl-Gerät") | `/?mode=ww2&op=karl` | The 60 cm Karl-Gerät: drive to a firing position, turn the whole vehicle onto the target (4 degrees of traverse), lower the hull, load 2.2 t shells from the Munitionsschlepper's crane, fire, fetch more shells, displace; an sFH 18 battery supports |
| V-1 launch site ("V-1 (Fi 103)") | `/?mode=ww2&op=v1` | The launch drill at the Walter catapult: missile, wings, compass in the Richthaus, air log, sled, fuel, steam generator, fuzes, clear, fire; faults, air raids (take cover), the flight and its report |
| V-2 mobile battery ("V-2 (A4)") | `/?mode=ww2&op=v2` | Erect the A4 on its firing table, align it, set the Brennschluss, checks, alcohol, T-Stoff and Z-Stoff, liquid oxygen (it boils off: launch or top up), withdraw, Vorstufe, Hauptstufe |

The Flanders roster:

1. 10.5 cm leFH 18 (four field howitzers)
2. 15 cm sFH 18 (four heavy howitzers)
3. 17 cm K 18 (two long guns, counter-battery)
4. 21 cm Mörser 18 (two heavy mortars)
5. 15 cm Nebelwerfer 41 (three six-tube launchers: a round is a ripple of six rockets)
6. 80 cm Gustav (assembled on its railway firing curve with eight shells)
7. 60 cm Karl-Gerät (set up, hull down in the first of its two prepared positions)

**The console** works the same way in metres and Strich (6400 to the circle), German grid references (r and h in km) and German words: the VB (forward observer) telephones "weiter 150, links 50", the Storch radios in metres, Gegenbatterie, Sperrfeuer (S), Feuerwalze. The Gustav, the Karl-Gerät and the V-weapons are worked from the procedure cards and launch drills below.

### The procedure cards

The special weapons have a procedure card instead of the range table (the Gustav is work in progress):

- **The Gustav's preparation tasks:** + and - put work gangs on them, J all hands.
- **The Karl's positions:** T turn, L lower or raise, Y fetch shells.
- **The launch drills:** Enter next step, arrow keys dial the compass and the range, B take cover, O fix a fault.

The V-1 and V-2 sites have a launch console of their own in place of the usual one. The keys and buttons of the cards and drills:

| Weapon | Key or button | Action |
|---|---|---|
| Gustav | + and − on a task | one work gang more or less on that task (buttons on the card, not keys) |
| | J | all hands: every gang on the critical path |
| | click a task | the camera watches that task's work; click it again to return to the gun |
| Karl-Gerät | STELLUNG buttons | drive to that firing position |
| | T | turn the whole vehicle onto the laid line (the mortar itself traverses only 4 degrees either way) |
| | L | lower the hull (needed to fire), or raise it to drive or turn |
| | Y | send the Munitionsschlepper to the dump for four more shells |
| V-1 and V-2 | Enter or Space | the big key: start the drill, go on to the next step, fire |
| | Left, Right | the compass (V-1) or the table bearing (V-2), 0.1 degree a press (Shift: 1 degree) |
| | Up, Down | the air log (V-1) or the Brennschluss (V-2), 1 km a press (Shift: 10 km) |
| | B | take cover from an air raid |
| | O, I, X | a fault: fix it, carry on through it at a risk, or scrub the round |
| | R | repair the damaged ramp (V-1) or firing table (V-2), 1:30 |
| | T | top up the liquid oxygen (V-2) |
| | A | auto or manual |

## WW1 German: the Gruppe in 1918

In the menu, **WW1 German** switches to a third mode (`/?mode=ww1&play=1`): the heavy artillery of a German Gruppe on the ridge east of Ypres in the spring of 1918, firing west at the British side of the same map.

- **A sandbox.** No campaign and no locks: one open battle ("Open battle") with every battery but the Paris Gun from the start, and the Paris Gun's own mission ("Paris Gun", `/?mode=ww1&op=paris&play=1`).
- **The targets** include the British game's own guns, standing in their own pits (the 15-inch, the 9.2-inch pair, the 6-inch battery, the 60-pounders and the 18-inch railway gun), with 18-pounder batteries, Mark IV tanks, dumps, road traffic and the railhead.
- **The enemy in the air.** RE8 spotters circle over whichever unit has been firing most and make the British counter-battery accurate; Sopwith Camels come in low with bombs.
- **The console** speaks metres and Strich, German grid references ("7037 b 13": a 1 km square, its quarter, a 100 m square) and German words.

The battle's roster, smallest calibre first (keys 1 to 6):

1. 10 cm K 17 (two long guns, shrapnel too)
2. 15 cm sFH 13 (four heavy field howitzers)
3. 21 cm Mörser 16 (two heavy howitzers)
4. the 38 cm "Langer Max" (a battleship gun on its railway mounting, set down on a prepared bed)
5. the 42 cm M-Gerät "Dicke Bertha"
6. the 42 cm Gamma-Mörser (fixed on its bed, set up and ready)

- **The beds.** Bertha and the Gamma turn only 11.5 and 23 degrees either way on their beds. For a target beyond, press T (or BETTUNG UMLEGEN on the guns card) to relay the bed onto its line.
- **The day** runs like the WW2 Flanders battle: Einschießen at dawn, the Artilleriekampf, the British attack (Sperrfeuer, S), night and Störungsfeuer.
- **X-Zeit.** A three-minute Feuervorbereitung and the Feuerwalze for our own assault, which needs the barrage kept dense on every lane.

### The Paris Gun's mission (work in progress)

The mission plays like the WW2 Gustav and V-weapon missions, in two stages. First the **Stellungsbau**: the gun arrives by rail at an empty site, and the three work gangs you send to the tasks build the position. Then the **Feuerablauf**, round by round: gauge the bore and raise the charge with its wear, lay the firing data for the Earth's turning and the wind aloft, load the numbered shell, fire, and correct from the agents' fall reports.

**Building the position (STELLUNGSBAU)**

- **Watch it go up.** The STELLUNGSBAU card, in the guns card's place, lists the tasks: the concrete bed with the turntable and racer, the earth bank, the firing frame, the barrel lowered in by the portal crane, the truss that holds it straight, the field railway and the ammunition train, the weather station and the Rechenstelle, and (optional) the camouflage nets and flak posts.
- **Send the gangs.** Put the three work gangs on the tasks with + and − (a task waits for the ones it needs), or press J for all hands on the critical path.

**Firing (FEUERABLAUF)**

- **A round.** Once the gun stands, the card becomes the FEUERABLAUF, and Enter starts a round. The crew gauges the bore (the charge must rise with the wear: Q and E). The Rechenstelle works out the firing data (T lays the table for the Earth's turning and the day's wind aloft, with what the reports have taught). Then the crew loads the numbered shell and raises the barrel.
- **SCHUSSWERTE.** This firing data card, in the fire order card's place, holds the charge against the gauge and the line and range corrections against the table.
- **Aiming.** The gun lays itself on the target you pick, and you aim by correcting that lay: SEITE moves it left or right, ENTFERNUNG shorter or further.
- **Reports.** When the agents' report comes in, the card says where the round fell and what to correct, and REPORT (`.`) lays it for you. The blue ring on the map's close-up shows where the next round should fall and moves as you correct.
- **The map** shows the gun, the four targets far to the west with the orders on them, the band the gun can reach and where every round fell, with a close-up of the target laid on. Click a target to lay on it.
- **Help on hover.** Every control and label explains itself in English. The big key always says what the drill wants, and FEUER is yours (Enter or Space).
- **Faults.** Now and then a fault (a cut obturator, a slack truss) is fixed (O) or carried on through (I) at a risk to the round.

**Targets, wear and raids**

- **The targets.** The gun fires at four military targets about 120 km away, off the map: a railway junction, a tank depot, a reserve camp and an aerodrome. The Armee orders rounds on one or another (five orders; carry out four to win), listed on the ZIELE card in the range table's place (click one, or Tab and L, to lay on it).
- **The flight.** The camera rides each shell up out of sight by itself (F leaves the ride). The agents' report comes about two minutes later (`.` applies it).
- **Wear.** After 65 rounds the barrel is changed (Y); the mission opens on a barrel already well worn.
- **Air raids.** British Camels come looking for the site by day. While they attack, the crew is in cover; the camouflage and rounds on their aerodrome keep some of them away.
- **Auto.** The gun starts on manual; A hands it to the crew.

The mission's keys:

| Stage | Key or button | Action |
|---|---|---|
| STELLUNGSBAU | + and − on a task | one work gang more or less on that task (buttons on the card) |
| | J | all hands on the critical path |
| FEUERABLAUF | Enter | the big key: start a round, go on with a setting as it is, fire |
| | Space | fire, at the firing step |
| | Q, E | half a kilo less or more powder (Shift: 5 kg) |
| | T | lay the firing table (the Earth's turning, the latest wind aloft, what the reports taught) |
| | Up, Down | range correction 100 m further or shorter (Shift: 1 km) |
| | Left, Right | line correction 0.5 Strich left or right (Shift: 5) |
| | `.` | REPORT: correct the aim by the latest fall report (the card says what it wants) |
| | O, I | a fault: fix it, or carry on through it |
| | Y | change the barrel |
| | Tab, then L | pick a target on the ZIELE card, then lay on it (or click it) |
| | A | hand the gun to the crew (auto) or take it back |

## Big Bertha (demo, work in progress)

A separate first-person demo (`/bertha.html`, in the Battles tab of the WW1 German era).

- **The gun:** one German 42 cm M-Gerät behind the Passchendaele ridge in 1917, and its detachment.
- **Your part:** take each man's place in turn: gun commander, layer for line, layer for elevation, loader, firer.
- **The drill:** take the fire order on the field telephone, lay the line through the panoramic sight, set the clinometer and crank the barrel, hoist, ram and charge the 810 kg shell, and pull the lanyard.
- **The enemy:** the British gun line 10 to 13 km to the west answers.
- **The title screen** has the difficulty, a crew-assist option (the stations you are not at work themselves), a tutorial (one round, key by key, in about five minutes) and an English or German switch. The menu opens the demo straight into a game; the **Title screen** button beside the gear leads there, and its link back to the main menu.

## Controls

### Main keys

| Key | Action |
|---|---|
| 1 to 9 | select a unit (the number on its tab; a battery not yet earned says so) |
| Mouse drag, wheel | orbit and zoom the camera |
| F | ride the selected unit's newest shell to its burst; F again returns to the gun |
| C | free camera (drag to orbit, wheel to zoom out to 3 km, WASD to move); C again returns |
| `[` and `]` | slower and faster time compression (x0.25 to x8); clicking the readout returns to x1 |
| M | mute |
| H | hide the overlay |
| F3 | statistics (frame time, draw calls, particles, lights) |
| Esc | leave a lesson for the menu |

The gear button opens a settings panel (quality, colour grade, bloom, fog, exposure and so on).

### Console keys

For the selected unit; clicking the buttons does the same.

| Key | Action |
|---|---|
| Tab, Shift+Tab | move the mission cursor |
| Enter | take the mission under the cursor |
| Space | fire the guns chosen by the GUNS selector |
| G | GUNS selector: 1 GUN (the directing gun, for ranging), SECTION, BATTERY (hidden for one-piece units). It sits on 1 GUN while ranging and goes to all guns for effect; G or a click overrides it |
| Arrow keys | correct the aim: up adds range, down drops, left and right shift the line (Shift = 10 yards, otherwise the current step; metres in the German modes) |
| X | cycle the correction step (10, 25, 50, 100, 200 yards) |
| Q, E | charge down, up |
| R | rounds per piece for the next series |
| Z | fuze (instant, delay, and shrapnel or airburst on the guns that have it) |
| A | toggle auto and manual (the header also has a HOLD button, which ceases fire) |
| S | SOS: every gun that can reach it lays on the alarmed sector's line |
| Backspace, Delete | cease fire |
| `.` | apply the pencilled correction of the newest observer report |
| T | WW1 German: relay the bed of Bertha or the Gamma onto the ordered target's line |

- **The artillery board.** Clicking the board lays the guns on that point; clicking a known target takes its mission; dragging pans and the wheel zooms the board.
- **Manual first.** Any control the AI crew would undo (laying, firing, charge) switches the unit to manual first.
- **Special weapons.** The Gustav, Karl-Gerät, V-1 and V-2 keys are under [The procedure cards](#the-procedure-cards); the Paris Gun's under [The Paris Gun's mission](#the-paris-guns-mission-work-in-progress).

### Big Bertha demo

| Key | Action |
|---|---|
| 1 to 5, Tab | change station |
| Mouse | look round (click to capture it) |
| E (held) | act |
| A and D, W and S | crank |
| Arrow keys | set the instrument (Shift: fine) |
| V | look through the instrument |
| F | ride the shell |
| `[` and `]` | change the time compression |
| C | switch crew assists (the stations you are not at work themselves; remembered between games) |
| F1 | show the help |

## Tutorials

- **Where.** The menu's Tutorials tab holds short guided lessons on a quiet scripted range, always in daylight: the sun is held at 10:00 and the weather is Clear or Overcast; your own settings come back when you leave.
- **How.** Each lesson shows an instruction card over the 3D view, pulses the console controls it is about, and completes a step when you have done what it asks. Skip step and Esc are always there.
- **Always open.** Lessons are open whatever the campaign has earned, and completed ones are ticked (stored in the browser).

**1917 British**, six lessons (`/?tutorial=basics|ranging|clockcode|heavy|counter|sos`):

- **The basics:** the screen, five units, camera, console, time compression; watch the 15-inch load, fire and ride its shell with F.
- **Ranging with the F.O.O.:** the 6-inch battery: take a mission, ranging round, telephone report, corrections, bracketing, fire for effect.
- **The aeroplane and the clock code:** the 9.2-inch: wireless messages and the RFC clock code.
- **The heavies:** the 15-inch with the delay fuze on a pillbox, then the railway gun on the railhead.
- **Counter-battery:** German fire walks onto you; HOLD; the 60-pounders on the sound rangers' reference.
- **S.O.S.:** red rockets, every gun on the line, shrapnel, break the attack.

**WW2 German**, six lessons (`/?mode=ww2&tutorial=w-basics|w-werfer|w-gustav|w-karl|w-v1|w-v2`; a lesson on another operation reloads the page there):

- **Die Grundlagen:** the leFH 18, metres and Strich.
- **Der Nebelwerfer**
- **Gustav: railway preparation**
- **Karl-Gerät**
- **V-1: the launch drill**
- **V-2: the A4 drill**

**WW1 German** has no lessons of its own; the 1917 and WW2 lessons teach the same drill. The Big Bertha demo has its own tutorial.
