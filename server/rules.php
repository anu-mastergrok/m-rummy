<?php
declare(strict_types=1);

function rummy_deck(): array {
    $cards = [];
    for ($pack = 0; $pack < 2; $pack++) {
        foreach (['S', 'H', 'D', 'C'] as $suit) for ($rank = 1; $rank <= 13; $rank++) {
            $cards[] = ['id' => "$pack-$suit-$rank", 'suit' => $suit, 'rank' => $rank];
        }
        $cards[] = ['id' => "$pack-J", 'suit' => 'J', 'rank' => 0];
    }
    return $cards;
}
function rummy_shuffle(array $cards): array {
    for ($i = count($cards) - 1; $i > 0; $i--) {
        $j = random_int(0, $i); [$cards[$i], $cards[$j]] = [$cards[$j], $cards[$i]];
    }
    return $cards;
}
function rummy_wild(array $card, int $wild): bool { return $card['rank'] === 0 || $card['rank'] === $wild; }
function rummy_points(array $card, int $wild): int {
    return rummy_wild($card, $wild) ? 0 : ($card['rank'] === 1 ? 10 : min(10, $card['rank']));
}
function rummy_run(array $cards, int $length): bool {
    if (!$cards) return false;
    foreach ($cards as $c) if ($c['suit'] !== $cards[0]['suit']) return false;
    foreach ([false, true] as $aceHigh) {
        $ranks = array_map(fn($c) => $aceHigh && $c['rank'] === 1 ? 14 : $c['rank'], $cards);
        if (count(array_unique($ranks)) !== count($ranks)) continue;
        sort($ranks);
        for ($start = $aceHigh ? 2 : 1; $start + $length - 1 <= ($aceHigh ? 14 : 13); $start++) {
            if ($ranks[0] >= $start && $ranks[count($ranks) - 1] <= $start + $length - 1) return true;
        }
    }
    return false;
}
function rummy_meld(array $cards, int $wild): ?string {
    if (count($cards) < 3) return null;
    $natural = array_values(array_filter($cards, fn($c) => !rummy_wild($c, $wild)));
    if (!array_filter($cards, fn($c) => $c['rank'] === 0) && rummy_run($cards, count($cards))) return 'pure';
    if (!$natural) return null;
    if (rummy_run($natural, count($cards))) return 'sequence';
    if (count($cards) <= 4 && count(array_unique(array_column($natural, 'rank'))) === 1 && count(array_unique(array_column($natural, 'suit'))) === count($natural)) return 'set';
    return null;
}

/** Exact physical-card cover with two-sequence / pure-sequence constraints. */
function rummy_analyze(array $cards, int $wild): array {
    $n = count($cards);
    if (!$n || $n > 14 || count(array_unique(array_column($cards, 'id'))) !== $n) throw new RuntimeException('Invalid hand.');
    $full = (1 << $n) - 1;
    $byIndex = array_fill(0, $n, []);
    $sums = [0]; $indexes = [];
    for ($i = 0; $i < $n; $i++) $indexes[1 << $i] = $i;
    for ($mask = 1; $mask <= $full; $mask++) {
        $bit = $mask & -$mask; $index = $indexes[$bit];
        $sums[$mask] = $sums[$mask ^ $bit] + rummy_points($cards[$index], $wild);
        // Groups longer than 13 cannot fit a declaration.
        $group = [];
        for ($i = 0; $i < $n; $i++) if ($mask & (1 << $i)) $group[] = $cards[$i];
        if (count($group) < 3 || count($group) > 13) continue;
        $type = rummy_meld($group, $wild);
        if (!$type) continue;
        $m = ['mask' => $mask, 'type' => $type, 'ids' => array_column($group, 'id')];
        for ($i = 0; $i < $n; $i++) if ($mask & (1 << $i)) $byIndex[$i][] = $m;
    }
    $memo = [];
    $solve = function(int $mask, bool $pure, int $seqs) use (&$solve, &$memo, $byIndex, $indexes, $cards, $wild): array {
        $key = "$mask:" . (int)$pure . ":$seqs";
        if (isset($memo[$key])) return $memo[$key];
        if (!$mask) return ['valid' => $pure && $seqs >= 2, 'deadwood' => 0, 'groups' => [], 'loose' => []];
        $bit = $mask & -$mask; $index = $indexes[$bit];
        $skip = $solve($mask ^ $bit, $pure, $seqs);
        $best = $skip;
        $best['valid'] = false;
        $best['deadwood'] += rummy_points($cards[$index], $wild);
        array_unshift($best['loose'], $cards[$index]['id']);
        foreach ($byIndex[$index] as $m) {
            if (($mask & $m['mask']) !== $m['mask']) continue;
            $candidate = $solve($mask ^ $m['mask'], $pure || $m['type'] === 'pure', min(2, $seqs + ($m['type'] !== 'set' ? 1 : 0)));
            array_unshift($candidate['groups'], ['type' => $m['type'], 'ids' => $m['ids']]);
            if (($candidate['valid'] && !$best['valid']) || ($candidate['valid'] === $best['valid'] && ($candidate['deadwood'] < $best['deadwood'] || ($candidate['deadwood'] === $best['deadwood'] && count($candidate['loose']) < count($best['loose']))))) $best = $candidate;
        }
        return $memo[$key] = $best;
    };
    $result = $solve($full, false, 0);
    // Score independently from display arrangement: maximize exempt cards under
    // either pure-only or full sequence requirements, using memoized subsets.
    $maxExempt = function(bool $onlyPure) use ($full, $byIndex, $indexes, $sums): int {
        $cache = [];
        $search = function(int $mask, bool $pure, int $seqs) use (&$search, &$cache, $onlyPure, $byIndex, $indexes, $sums): int {
            if (!$mask) return $pure && ($onlyPure || $seqs >= 2) ? 0 : -10000;
            $key = "$mask:" . (int)$pure . ":$seqs";
            if (isset($cache[$key])) return $cache[$key];
            $bit = $mask & -$mask; $index = $indexes[$bit];
            $best = $search($mask ^ $bit, $pure, $seqs);
            foreach ($byIndex[$index] as $m) {
                if (($mask & $m['mask']) !== $m['mask'] || ($onlyPure && $m['type'] !== 'pure')) continue;
                $best = max($best, $sums[$m['mask']] + $search($mask ^ $m['mask'], $pure || $m['type'] === 'pure', min(2, $seqs + ($m['type'] !== 'set' ? 1 : 0))));
            }
            return $cache[$key] = $best;
        };
        return $search($full, false, 0);
    };
    $result['penalty'] = $result['valid'] ? 0 : max(0, min(80, $sums[$full] - max(0, $maxExempt(true), $maxExempt(false))));
    return $result;
}
