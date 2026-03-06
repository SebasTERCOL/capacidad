

## Visual Improvements Plan - Page by Page

### Current State
The app is a 7-step production capacity tool with 3 routes: Cover (`/`), Main App (`/app`), and History (`/historial`). The UI is functional but visually flat -- plain white cards, no visual hierarchy beyond borders, no transitions, no micro-interactions, and dense data tables without visual relief.

---

### 1. Cover Page (`/`)

| Improvement | Detail |
|---|---|
| Hero gradient background | Add a subtle gradient or pattern behind the hero section instead of plain white |
| Animated entrance | Apply `animate-fade-in` to hero text and card on mount |
| Feature cards grid | Replace the single bullet-point card with 3-4 individual feature cards with icons, each with `hover-scale` |
| CTA button polish | Add gradient or glow effect to primary CTA, subtle hover animation |
| Visual illustration | Add a decorative SVG or abstract geometric element in the right column |

### 2. Main App - Step Progress Bar (`/app` header)

| Improvement | Detail |
|---|---|
| Connected step indicator | Replace the current badge+arrow layout with a proper stepper: circles connected by lines, with completed steps showing checkmarks and color fill |
| Smooth step transitions | Wrap `renderStepContent()` in a fade/slide transition when switching steps |
| Sticky header | Make the header with progress bar sticky on scroll for large content areas |

### 3. File Upload (Step 1)

| Improvement | Detail |
|---|---|
| Drag-and-drop zone | Add a dashed-border drop zone with icon, hover highlight, and drag-over state |
| File status indicators | Show file name with animated checkmark after successful parse |
| Upload animation | Subtle loading spinner or progress bar during CSV parsing |

### 4. Operator Configuration (Step 4)

| Improvement | Detail |
|---|---|
| Process cards | Give each process a colored left-border accent based on capacity status |
| Machine toggle styling | Use colored switches with status indicators (green=operational, gray=off) |
| Calendar highlighting | Better visual distinction for holidays vs weekends in the calendar picker |

### 5. Projection / Hierarchical View (Step 5)

| Improvement | Detail |
|---|---|
| Capacity color bars | Replace plain percentage text with colored progress bars (green/yellow/orange/red) |
| Collapsible animations | Add smooth height transitions to process group expand/collapse |
| Bottleneck card | Make the bottleneck alert more prominent with a pulsing icon or colored left border |
| Lead Time cards | Add subtle gradient backgrounds to Lead Time PT cards |
| Data density relief | Add alternating row colors to tables, increase row padding slightly |

### 6. Gantt Chart & Schedule (Step 7)

| Improvement | Detail |
|---|---|
| Tooltip on hover | Show detailed node info on Gantt bar hover with a styled tooltip |
| Critical path highlighting | Add a pulsing or dashed border animation to critical path bars |
| Legend | Add a compact color legend for references |

### 7. History Page (`/historial`)

| Improvement | Detail |
|---|---|
| Empty state illustration | Add an illustration/icon for "no snapshots" state instead of plain text |
| Row hover effect | Add hover background transition on table rows |
| Snapshot detail cards | Add icons and subtle color coding to the summary stat cards |

### 8. Global / Cross-cutting

| Improvement | Detail |
|---|---|
| Page transition | Add fade-in animation when navigating between routes |
| Skeleton loaders | Replace "Cargando..." text with skeleton placeholders during data fetches |
| Toast styling | Ensure success/error toasts have distinct icons and colors |
| Scroll-to-top | Auto-scroll to top when changing steps |
| Dark mode toggle | Add a theme toggle button in the header (infrastructure already exists via `next-themes`) |

---

### Implementation Priority (recommended order)

1. **Step progress bar redesign** -- highest visual impact, seen on every step
2. **Cover page polish** -- first impression, animations + feature cards
3. **Capacity view color bars + collapsible animations** -- core data view improvement
4. **Drag-and-drop file upload** -- better UX on first interaction
5. **Global transitions + skeleton loaders** -- polish across all pages
6. **History page empty states + hover effects** -- lower priority finishing touches

### Technical Notes
- All animations use existing Tailwind keyframes already defined in `tailwind.config.ts`
- No new dependencies required; all achievable with current stack (Tailwind + Radix + Lucide)
- Changes are purely visual/UX; no business logic modifications

