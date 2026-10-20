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
];
export const rosterFor = era => BATTERIES.filter(b => b.era === era);
export const CAMPAIGN = ['1917', 'ww2'].flatMap(era => rosterFor(era).slice(1).map((b, i) => ({
  id: `earn-${b.kind}`, era, reward: b.kind, title: b.title, briefing: b.task,
  roster: rosterFor(era).slice(0, i + 2).map(b => b.kind),
  prerequisite: i ? `earn-${rosterFor(era)[i].kind}` : null,
  // More batteries means more concurrent assignments; time allows for siege preparation and slow cycles.
  timeLimit: 900 + i * 150,
})));
export const missionById = id => CAMPAIGN.find(m => m.id === id);
