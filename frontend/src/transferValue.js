const AGE_FACTORS = [
  { maxAge: 21, factor: 1.45 },
  { maxAge: 24, factor: 1.3 },
  { maxAge: 27, factor: 1.15 },
  { maxAge: 30, factor: 1 },
  { maxAge: 33, factor: 0.85 }
]

export const getAgeFactor = (age) => {
  if (!age) return 1

  const bracket = AGE_FACTORS.find(({ maxAge }) => age <= maxAge)
  return bracket ? bracket.factor : 0.7
}

export const getTransferValueScore = ({ goals = 0, assists = 0, age = null }) => {
  const productionScore = goals * 4 + assists * 3
  return productionScore * getAgeFactor(age)
}

export const getPlayerValueProfile = (player) => {
  const goals = player.goals || 0
  const assists = player.assists || 0
  const age = player.age || null

  return {
    ...player,
    goals_plus_assists: goals + assists,
    transfer_value: getTransferValueScore({ goals, assists, age })
  }
}

const joinUniqueValues = (items) => Array.from(new Set(items.filter(Boolean))).join(', ')
const compareSeasonStrings = (left = '', right = '') => left.localeCompare(right)

export const aggregatePlayerProfiles = (players) => {
  const playerMap = new Map()

  players.forEach((player) => {
    const profile = getPlayerValueProfile(player)
    const key = player.player_id || player.player

    if (!playerMap.has(key)) {
      playerMap.set(key, {
        player_id: player.player_id || null,
        player: player.player,
        nation: player.nation || null,
        goals: 0,
        assists: 0,
        minutes: 0,
        goals_plus_assists: 0,
        transfer_value: 0,
        current_age: null,
        latest_season: null,
        seasons: [],
        leagues: [],
        squads: []
      })
    }

    const aggregate = playerMap.get(key)
    aggregate.goals += profile.goals || 0
    aggregate.assists += profile.assists || 0
    aggregate.minutes += profile.minutes || 0
    aggregate.goals_plus_assists += profile.goals_plus_assists || 0
    aggregate.transfer_value += profile.transfer_value || 0

    if (
      profile.age &&
      (!aggregate.latest_season || compareSeasonStrings(profile.season, aggregate.latest_season) > 0)
    ) {
      aggregate.latest_season = profile.season
      aggregate.current_age = profile.age
    }

    if (profile.season) aggregate.seasons.push(profile.season)
    if (profile.league) aggregate.leagues.push(profile.league)
    if (profile.squad) aggregate.squads.push(profile.squad)
    if (!aggregate.nation && profile.nation) aggregate.nation = profile.nation
  })

  return Array.from(playerMap.values()).map((player) => {
    const seasons = Array.from(new Set(player.seasons)).sort((a, b) => b.localeCompare(a))

    return {
      ...player,
      age: player.current_age,
      season_count: seasons.length,
      season_label: seasons.length ? `${seasons[seasons.length - 1]} to ${seasons[0]}` : '—',
      league_label: joinUniqueValues(player.leagues) || '—',
      squad_label: joinUniqueValues(player.squads) || '—'
    }
  })
}
