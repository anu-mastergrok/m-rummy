<?php
declare(strict_types=1);
require_once __DIR__ . '/../server/game.php';
$passed = 0;
function check(bool $ok, string $message = 'Assertion failed'): void { if (!$ok) throw new RuntimeException($message); }
function same(mixed $actual, mixed $expected): void { check($actual === $expected, 'Expected ' . json_encode($expected) . ', got ' . json_encode($actual)); }
function rejects(callable $f, string $contains = ''): void {
    try { $f(); } catch (RuntimeException $e) { check(!$contains || str_contains($e->getMessage(), $contains), $e->getMessage()); return; }
    throw new RuntimeException('Expected rejection.');
}
function test(string $name, callable $f): void {
    global $passed;
    try { $f(); $passed++; echo "✓ $name\n"; } catch (Throwable $e) { fwrite(STDERR, "FAIL $name: " . $e->getMessage() . "\n" . $e->getTraceAsString() . "\n"); exit(1); }
}
function cards(string $spec): array {
    $result = []; $counts = [];
    foreach (explode(' ', $spec) as $item) {
        $suit = $item[0]; $rank = (int)substr($item, 1); $key = "$suit-$rank"; $pack = $counts[$key] ?? 0; $counts[$key] = $pack + 1;
        $result[] = ['id' => "$pack-$suit-$rank", 'suit' => $suit, 'rank' => $rank];
    }
    return $result;
}
function valid_hand(): array { return cards('S1 S2 S3 H4 H5 H6 D7 C7 H7 S9 S10 S11 S12'); }
function table(int $count = 2): array {
    $r = rummy_create('p0', 'Sunil');
    for ($i = 1; $i < $count; $i++) rummy_join($r, "p$i", "Friend $i", '');
    rummy_start($r, 'p0'); return $r;
}
function physical_count(array $r): int { return count($r['stock']) + count($r['discard']) + ($r['indicator'] ? 1 : 0) + array_sum(array_map(fn($p) => count($p['hand']), $r['players'])); }
