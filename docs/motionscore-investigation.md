# MotionScore Regression — Investigation & Fix

> **Date**: 2026-06-05
> **Starting score**: S-tier (91/100) — but non-deterministic, actual baseline was A-tier (87)
> **Problem score**: A-tier (87/100) — 14 JavaScript animations detected
> **Root cause**: Framer Motion JS orchestration layer detected as JavaScript animations

## Timeline

1. MotionScore audit returned S-tier (91/100) with 4 findings — likely a timing-favorable run
2. Attempted to fix findings with `requestAnimationFrame` wrappers and `will-change` overrides
3. Re-audit consistently returned A-tier (87/100) — 14 JS animations detected
4. Reverted all `rAF` and `will-change` changes — score remained 87 (confirmed baseline)
5. Identified true source: Framer Motion stagger in `hierarchy-tree.tsx` (14 `motion.li` nodes)
6. **Fix**: Replaced Framer Motion stagger with pure CSS `@keyframes` + `animation-delay`

---

## Root Cause

The `HierarchyTree` component used `motion.li` with `variants` for a staggered entrance animation across 14 tree nodes. Framer Motion uses JavaScript to orchestrate WAAPI animations — MotionScore detects both the WAAPI output (14 WAAPI) and the JS orchestration (14 JavaScript), resulting in a B-tier Desktop Animation score.

```tsx
// BEFORE: Framer Motion (JS-orchestrated)
<motion.li variants={itemVariants}>  // × 14 nodes = 14 JS detections
<motion.ul variants={containerVariants} initial="hidden" animate="visible">
```

```tsx
// AFTER: Pure CSS (WAAPI-only)
<li className="tree-stagger-item" style={{ animationDelay: `${i * 0.04}s` }}>
<ul role="group">
```

## Files Changed

| File | Change |
|------|--------|
| `src/components/hierarchy-tree.tsx` | Replaced `motion.li`/`motion.ul` + variants with plain `li`/`ul` + CSS class + `animation-delay`. Removed `motion/react` import. Added `countVisible()` helper for stagger index calculation. |
| `src/app/globals.css` | Added `@keyframes tree-fade-in` and `.tree-stagger-item` class |

## Failed Approaches (reverted)

| Approach | Why it failed |
|----------|---------------|
| `requestAnimationFrame` wrappers on `scrollTop`/`setDpr` | MotionScore counts rAF DOM writes as JS animations — worse penalty than thrashing |
| `style={{ willChange: 'auto' }}` on Framer Motion elements | The stale `will-change` source is the R3F Canvas, not these components |
| `useWillChangeToggle` hook with `onAnimationComplete` | Same — wrong source identified |

## Remaining Findings

| Severity | Finding | Status |
|----------|---------|--------|
| HIGH | Stale `will-change` (×2) | Accepted — source is R3F Canvas compositor layer |
| LOW | Mount thrashing | Accepted — rAF fix is counterproductive |
