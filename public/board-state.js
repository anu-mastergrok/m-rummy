// Presentation helpers only. The PHP engine remains authoritative.
export function remainingSeconds(deadline, serverOffset, now = Date.now()) {
  return Math.max(0, Math.ceil((deadline - now - serverOffset) / 1000));
}

export function reconcileGroups(value, hand) {
  const available = new Set(hand.map(card => card.id));
  const used = new Set();
  if (!Array.isArray(value)) return [];
  return value.flatMap(group => {
    if (!group || !Array.isArray(group.ids)) return [];
    const ids = group.ids.filter(id => {
      if (!available.has(id) || used.has(id)) return false;
      used.add(id); return true;
    });
    return ids.length ? [{ ids, title: ids.length === group.ids.length && typeof group.title === 'string' ? group.title : 'Group' }] : [];
  });
}

export function tableStandings(players) {
  // A tie stays a tie; sorting must not manufacture a winner.
  const sorted = [...players].sort((a, b) => a.total - b.total || a.name.localeCompare(b.name));
  return sorted.map((player, index) => ({ ...player, place: sorted.findIndex(p => p.total === player.total) + 1 }));
}

export function presencePresentation(value) {
  const labels = { online: 'Connected', away: 'Away', offline: 'Not responding', unknown: 'Status unknown', bot: 'Practice bot', reconnecting: 'Reconnecting' };
  const status = Object.hasOwn(labels, value) ? value : 'unknown';
  return { status, label: labels[status] };
}
