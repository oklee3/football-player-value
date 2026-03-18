import './style.css'
import { supabase } from './supabaseClient.js'

const app = document.querySelector('#app')

app.innerHTML = `
  <main class="page">
    <header class="hero">
      <div>
        <p class="eyebrow">Supabase + FBref</p>
        <h1>Player Snapshot</h1>
        <p class="subtitle">Basic season stats pulled live from your Supabase table.</p>
      </div>
      <div class="hero-card">
        <div class="stat">
          <span class="label">Table</span>
          <span class="value">player_seasons</span>
        </div>
        <div class="stat">
          <span class="label">Source</span>
          <span class="value">standard_player.csv</span>
        </div>
      </div>
    </header>

    <section class="panel">
      <div class="panel-header">
        <h2>Top Contributors</h2>
        <p class="muted">Sorted by goals, then assists (latest fetch).</p>
      </div>
      <div id="state" class="state">Loading players…</div>
      <div id="grid" class="grid" aria-live="polite"></div>
    </section>
  </main>
`

const stateEl = document.querySelector('#state')
const gridEl = document.querySelector('#grid')

const formatNum = (value) => {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('en-US').format(value)
}

const renderPlayers = (players) => {
  gridEl.innerHTML = players
    .map((player) => {
      const goals = formatNum(player.goals)
      const assists = formatNum(player.assists)
      const minutes = formatNum(player.minutes)
      const nation = player.nation || '—'
      const squad = player.squad || '—'
      const season = player.season || '—'
      const league = player.league || '—'

      return `
        <article class="card">
          <div class="card-top">
            <div>
              <h3>${player.player}</h3>
              <p class="meta">${nation} · ${squad}</p>
            </div>
            <span class="badge">${season}</span>
          </div>
          <p class="league">${league}</p>
          <div class="stats">
            <div>
              <span class="stat-label">Goals</span>
              <span class="stat-value">${goals}</span>
            </div>
            <div>
              <span class="stat-label">Assists</span>
              <span class="stat-value">${assists}</span>
            </div>
            <div>
              <span class="stat-label">Minutes</span>
              <span class="stat-value">${minutes}</span>
            </div>
          </div>
        </article>
      `
    })
    .join('')
}

const loadPlayers = async () => {
  stateEl.textContent = 'Loading players…'
  gridEl.innerHTML = ''

  const { data, error } = await supabase
    .from('player_seasons')
    .select('player, nation, squad, season, league, goals, assists, minutes')
    .neq('player', 'Player')
    .order('goals', { ascending: false })
    .order('assists', { ascending: false })
    .limit(12)

  if (error) {
    stateEl.textContent = `Failed to load: ${error.message}`
    stateEl.classList.add('error')
    return
  }

  if (!data || data.length === 0) {
    stateEl.textContent = 'No data found yet. Check your table and RLS policies.'
    return
  }

  stateEl.textContent = ''
  renderPlayers(data)
}

loadPlayers()
