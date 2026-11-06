// Authored roles are shared by briefings, scenario construction and objective checks.
export const BATTERIES = [
  { kind: 'bl6', era: '1917', name: '6-inch howitzers', role: 'Rapid HE support', target: 'battery', range: 4200, fuze: 'instant', damage: .35, rounds: 4, task: 'Suppress the forward gun pits with a four-gun concentration.' },
  { kind: 'bl60', era: '1917', name: '60-pounders', role: 'Long-range counter-battery', target: 'battery', range: 10200, fuze: 'instant', damage: .35, rounds: 1, title: 'Beyond the howitzers', task: 'Range onto the distant battery, then fire for effect. The 6-inch battery clears the nearer gun pits.' },
  { kind: 'bl92', era: '1917', name: '9.2-inch howitzers', role: 'Concrete demolition', target: 'mebu', range: 6500, fuze: 'delay', damage: .7, rounds: 1, title: 'Crack the pillboxes', task: 'Use delay-fuzed heavy shells against concrete while your field guns silence the gun line.' },
  { kind: 'bl15', era: '1917', name: '15-inch howitzer', role: 'Slow, heavy siege fire', target: 'hq', range: 5500, fuze: 'delay', damage: .65, rounds: 1, title: 'The buried command post', task: 'Place deliberate heavy rounds on the fortified command post. Earlier batteries handle gun pits and pillboxes during the long reload.' },
  { kind: 'rail', era: '1917', name: '18-inch railway gun', role: 'Heavy fire at extreme range', target: 'hq', range: 14500, fuze: 'delay', damage: .65, rounds: 1, title: 'The distant command centre', task: 'Use the railway gun’s range and heavy shells against the rear command centre. Your entire group must finish its closer objectives.' },
  { kind: 'lefh18', era: 'ww2', name: '10.5 cm leFH 18', role: 'Fast field support', target: 'abattery', range: 4200, fuze: 'instant', damage: .35, rounds: 4, task: 'Keep the forward battery suppressed with concentrated field-howitzer fire.' },
  { kind: 'sfh18', era: 'ww2', name: '15 cm sFH 18', role: 'Heavy HE concentrations', target: 'adump', range: 6500, fuze: 'delay', damage: .5, rounds: 1, title: 'Break the supply position', task: 'Concentrate heavy HE on the supply dump while the leFH battery deals with the forward guns.' },
  { kind: 'nbw41', era: 'ww2', name: 'Nebelwerfer 41', role: 'Six-rocket area salvo', target: 'abattery', range: 4000, fuze: 'instant', damage: .35, rounds: 6, title: 'A storm over the assembly area', task: 'Deliver a complete six-rocket ripple into the exposed gun assembly area. Your howitzers suppress the guns and break the supply position.' },
  { kind: 'k18', era: 'ww2', name: '17 cm K 18', role: 'Long-range counter-battery', target: 'amedium', range: 18000, fuze: 'instant', damage: .35, rounds: 1, title: 'Reach their heavy guns', task: 'Silence the medium battery beyond the field howitzers’ reach; the earlier batteries clear the closer positions.' },
  { kind: 'mrs18', era: 'ww2', name: '21 cm Mörser 18', role: 'Plunging heavy fire', target: 'fort', range: 8500, fuze: 'delay', damage: .6, rounds: 1, title: 'Over the parapet', task: 'Use plunging, delay-fuzed fire on the fortified works while the long guns and field batteries complete their own fire plans.' },
  { kind: 'karl', era: 'ww2', name: 'Karl-Gerät', role: 'Mobile siege mortar and emplacement', target: 'citadel', range: 3200, fuze: 'delay', damage: .65, rounds: 1, title: 'Into firing position', task: 'Drive to Stellung A, lower the hull and crane-load a concrete-piercing shell. Complete the citadel shoot while the established batteries clear the approaches.' },
  { kind: 'gustav', era: 'ww2', name: 'Schwerer Gustav', role: 'Long-range deep penetration', target: 'magazine', range: 22000, fuze: 'delay', damage: .75, rounds: 1, title: 'Under the rock', task: 'Gustav is assembled and supplied. Penetrate the deep magazine at long range with delay fuze. Every earlier battery has a covering objective.' },
  { kind: 'v1', era: 'ww2', sandbox: false, name: 'V-1 catapult', role: 'Compass, air log and launch drill', range: 160000, rounds: 1, title: 'Prepare the launch corridor', task: 'Complete the catapult drill with compass error under 1° and range error under 1%. Earlier batteries clear the local positions. Success measures launch procedure, not casualties.' },
  { kind: 'v2', era: 'ww2', sandbox: false, name: 'V-2 firing table', role: 'Erection, fuelling and timed launch', range: 180000, rounds: 1, title: 'The mobile launch operation', task: 'Erect, align and fuel the A4; launch with correct range and bearing before oxygen loss causes a shortfall. The V-1 crew and every earlier battery must complete their supporting assignments.' },
  // the 1918 guns of the German tree (research.js); no campaign mission earns them (CAMPAIGN below is the 1917 and WW2 eras')
  { kind: 'k17', era: 'ww1', name: '10 cm Kanone 17', role: 'Long field gun: deep targets, roads and traffic' },
  { kind: 'sfh13', era: 'ww1', name: '15 cm sFH 13', role: 'Heavy field howitzer: batteries, barrages and the Sperrfeuer' },
  { kind: 'm16', era: 'ww1', name: '21 cm Mörser 16', role: 'Heavy mortar: plunging fire on batteries, tanks and dumps' },
  { kind: 'max38', era: 'ww1', name: '38 cm Langer Max', role: 'Long naval gun: heavy shells anywhere on the map' },
  { kind: 'gamma', era: 'ww1', name: '42 cm Gamma-Mörser', role: 'Fortress mortar on its concrete bed: the heaviest shell' },
  { kind: 'bertha', era: 'ww1', name: '42 cm Dicke Bertha', role: 'Siege howitzer: few shells, slow, terrible' },
  { kind: 'paris', era: 'ww1', name: 'Paris Gun', role: 'Off-map support: one shell at a time, 120 km away' },
  // the rest of the German tree (research.js TREES.de, 2026-11-01); era 'de': the career's ridge only, no campaign
  // mission earns them (CAMPAIGN below reads the 1917 and WW2 rosters)
  { kind: 'fk16', era: 'de', name: '7.7 cm FK 16', role: 'Field gun: quick, shrapnel over infantry, the Sperrfeuer', range: 10000 },
  { kind: 'k16', era: 'de', name: '15 cm K 16', role: 'Long heavy gun: 51 kg shells to 22 km', range: 22000 },
  { kind: 'm99', era: 'de', name: '21 cm Mörser 99', role: 'Old mortar without a recoil system: every round laid afresh', range: 8300 },
  { kind: 'beta', era: 'de', name: '30.5 cm Beta-Gerät', role: 'Siege mortar on its steel bed: 410 kg shells on concrete', range: 12000 },
  { kind: 'rk92', era: 'de', name: '15 cm Ringkanone C/92', role: 'Old fortress gun without a recoil system: off its ramps, re-laid every round', range: 12000 },
  { kind: 'sfh93', era: 'de', name: '15 cm sFH 93', role: 'Old heavy field howitzer without a recoil system: off its ramps, re-laid every round', range: 6000 },
  { kind: 'gotha', era: 'de', name: 'Gotha bomber strike', role: 'Off-map support: three Gothas bomb a point on the map', range: 0 },
  { kind: 'k38', era: 'de', name: '21 cm K 38', role: 'Long heavy gun: 120 kg shells to 34 km', range: 33900 },
  { kind: 'hm1', era: 'de', name: '35.5 cm Haubitze M1', role: 'Siege howitzer: 575 kg shells plunging onto concrete', range: 20800 },
  { kind: 'bruno', era: 'de', name: '28 cm Kurze Bruno', role: 'Railway gun on its firing curve: 240 kg shells to 29 km', range: 29500 },
  { kind: 'k5', era: 'de', name: '28 cm K5 (E)', role: 'Railway gun on its turntable: any bearing, slowly', range: 62000 },
  { kind: 'k12', era: 'de', name: '21 cm K 12 (E)', role: 'The longest gun on rails: everything on the map in reach', range: 115000 },
  { kind: 'wespe', era: 'de', name: '10.5 cm Wespe', role: 'Self-propelled field howitzer: fire, then move', range: 10700 },
  { kind: 'hummel', era: 'de', name: '15 cm Hummel', role: 'Self-propelled heavy howitzer: fire, then move', range: 13300 },
  { kind: 'nbw42', era: 'de', name: '21 cm Nebelwerfer 42', role: 'Five-tube rocket launcher: 112 kg rockets to 7.8 km', range: 7850 },
  { kind: 'swg40', era: 'de', name: 'schweres Wurfgerät 40', role: 'Heavy rockets fired from their crates at short range', range: 1930 },
];
export const rosterFor = era => BATTERIES.filter(b => b.era === era);
export const CAMPAIGN = ['1917', 'ww2'].flatMap(era => rosterFor(era).slice(1).map((b, i) => ({
  id: `earn-${b.kind}`, era, reward: b.kind, title: b.title, briefing: b.task,
  roster: rosterFor(era).slice(0, i + 2).map(b => b.kind),
  // More batteries means more concurrent assignments; time allows for siege preparation and slow cycles.
  timeLimit: 900 + i * 150,
})));
export const missionById = id => CAMPAIGN.find(m => m.id === id);
