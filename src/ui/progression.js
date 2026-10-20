import './progression.css';

// the campaign mission's objectives over the view, while one is played (the menu is ui/menu.js)
export function mountCampaignObjectives() {
  const root = document.createElement('section');
  root.id = 'campaign-objectives';
  root.hidden = true;
  document.getElementById('view').append(root);
  let last = '';
  return (sim, active) => {
    root.hidden = !active || !sim?.campaignObjectives?.length;
    if (root.hidden) return;
    const remaining = Math.max(0, Math.ceil(sim.theatre.campaign.timeLimit * sim.difficulty.time - sim.time));
    const text = `${sim.theatre.campaign.title} · ${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining\n` +
      sim.campaignObjectives.map(o => `${o.done ? '✓' : `${Math.floor(o.progress * 100)}%`} ${o.name}${o.fuze ? ` · ${o.fuze} fuze` : ' · launch drill'}`).join('\n');
    if (text !== last) { root.textContent = text; last = text; }
  };
}
