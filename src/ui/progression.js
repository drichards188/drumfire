import { BATTERIES, CAMPAIGN, rosterFor } from '../campaign-data.js';
import './progression.css';
export function mountProgression(career, era, active, navigate, onChange) {
  const root = document.createElement('section');
  root.id = 'career';
  root.setAttribute('aria-label', 'Campaign and battery unlocks');
  root.innerHTML = `<header class="career-heading"><div><small>FIELD COMMAND</small><h2>Battery campaign</h2></div><span id="career-total"></span></header>
    <nav class="career-tabs" aria-label="Campaign pages"><button type="button" data-page="missions" aria-pressed="true">Missions</button><button type="button" data-page="batteries" aria-pressed="false">Your batteries <span id="career-count"></span></button></nav>
    <div class="career-page" data-panel="missions"><p id="career-next" aria-live="polite"></p><div id="campaign-list"></div></div>
    <div class="career-page" data-panel="batteries" hidden><p class="career-help">Earn batteries in campaign, then take them into sandbox.</p><ul id="career-roster"></ul></div>
    <footer class="career-footer"><span id="career-save"></span><button id="dev-unlock" type="button">Dev: unlock all batteries</button></footer>`;
  const menu = document.getElementById('title-screen');
  const overview = document.createElement('div');
  overview.className = 'menu-overview';
  const briefing = document.getElementById('campaign-briefing');
  if (briefing) {
    const tab = document.createElement('button');
    tab.type = 'button'; tab.dataset.page = 'briefing'; tab.textContent = 'Briefing'; tab.setAttribute('aria-pressed', 'false');
    root.querySelector('.career-tabs').append(tab);
    const page = document.createElement('div');
    page.className = 'career-page'; page.dataset.panel = 'briefing'; page.hidden = true;
    page.append(briefing);
    root.querySelector('.career-footer').before(page);
  }
  root.querySelectorAll('[data-page]').forEach(tab => tab.addEventListener('click', () => {
    root.querySelectorAll('[data-page]').forEach(t => t.setAttribute('aria-pressed', String(t === tab)));
    root.querySelectorAll('[data-panel]').forEach(p => { p.hidden = p.dataset.panel !== tab.dataset.page; });
  }));
  overview.append(...menu.children);
  menu.append(overview, root);
  function refresh() {
    const missions = CAMPAIGN.filter(m => m.era === era), roster = rosterFor(era);
    root.querySelector('#career-total').textContent = `${missions.filter(m => career.completed.has(m.id)).length}/${missions.length} missions`;
    root.querySelector('#career-next').textContent = active ? `Selected: ${active.title}` : 'Choose a campaign mission, or test your earned roster in sandbox.';
    root.querySelector('#career-count').textContent = `${roster.filter(b => career.unlocked(b.kind)).length}/${roster.length}`;
    root.querySelector('#campaign-list').replaceChildren(...missions.map((m, i) => {
      const button = document.createElement('button');
      const reward = BATTERIES.find(b => b.kind === m.reward);
      button.type = 'button';
      button.disabled = !career.canPlay(m.id);
      button.classList.toggle('on', m.id === active?.id);
      const number = document.createElement('span'); number.className = 'mission-number';
      number.textContent = career.completed.has(m.id) ? '✓' : String(i + 1).padStart(2, '0');
      const label = document.createElement('span'); label.className = 'mission-label';
      const name = document.createElement('b'); name.textContent = m.title;
      const battery = document.createElement('small'); battery.textContent = reward.name;
      label.append(name, battery); button.append(number, label);
      button.title = `${m.briefing} Force: ${m.roster.map(k => BATTERIES.find(b => b.kind === k).name).join(', ')}.`;
      button.addEventListener('click', () => navigate(m));
      return button;
    }));
    root.querySelector('ul').replaceChildren(...roster.map(b => {
      const row = document.createElement('li');
      row.classList.toggle('available', career.unlocked(b.kind));
      const name = document.createElement('b'); name.textContent = b.name;
      const status = document.createElement('small'); status.textContent = career.unlocked(b.kind) ? 'Available in sandbox' : b.title ? `Earn in “${b.title}”` : 'Starting battery';
      row.append(name, status);
      return row;
    }));
    const dev = root.querySelector('#dev-unlock');
    dev.disabled = career.dev;
    dev.textContent = career.dev ? 'Dev: all batteries unlocked' : 'Dev: unlock all batteries';
    root.querySelector('#career-save').textContent = career.saved ? 'Saved in this browser' : 'Saving unavailable — progress will be lost on navigation';
    onChange();
  }
  root.querySelector('#dev-unlock').addEventListener('click', () => { career.unlockAll(); refresh(); });
  refresh();
  return refresh;
}

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
