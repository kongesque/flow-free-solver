# UI/UX research and improvement plan

Date: 2026-10-06 (Asia/Taipei). App baseline: `8f01167`, branch `feat/flow-free-walls`.

This is a research and planning milestone. No application behavior changes in
this document. Findings combine primary design guidance, a source review, and
measurements of the running local app in Chromium. Recommendations and expected
usage frequency are hypotheses to validate with people, not product analytics.

## Direction

Keep the interface quiet, predictable, and centered on the puzzle. The current
hierarchy is a useful foundation: a large board, automatic endpoint colors,
one shared Undo, Solve/Edit in one position, and specialist controls in one
collapsed Board options disclosure. The next improvements should help people
understand the current state, avoid losing work, and edit accurately.

Apple recommends keeping essential controls visible and advanced functions
hidden until relevant. NN/g describes the same approach as progressive
disclosure. This supports the existing panel; another layer of menus would
make finding walls and custom dimensions harder.
[Apple: disclosure controls](https://developer.apple.com/design/human-interface-guidelines/disclosure-controls),
[NN/g: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/).

Translate the philosophy into these decision rules:

- Keep frequent puzzle actions visible and in stable positions.
- Show one relevant instruction near the current task.
- Hide specialist configuration, but make the active editing mode obvious.
- Preserve work when an action is cancelled or fails.
- Use muted colors and thin borders while keeping meaningful information legible.
- Let the footer scroll when space is tight. Keep the board stable through
  browser-bar changes, disclosure changes, and Solve/Edit transitions.

## Expected use and placement

These rankings describe the expected workflow. A person recreating a wall
puzzle will use walls frequently within that task, even if walls are uncommon
across all sessions. Rank controls by both overall use and current context.

| Action | Expected use | Recommended placement |
| --- | --- | --- |
| Place/remove dots | Constant during editing | Directly on the board; automatic colors |
| Undo | Frequent recovery | Visible, fixed position; Ctrl/⌘Z |
| Solve / Edit | Core transition | One primary button in the same position |
| Generate | Common alternative starting path | Visible secondary button |
| Size preset | Occasional setup | Visible compact field |
| Reset | Occasional recovery | Quiet action in its current position; confirm populated boards |
| Draw walls | Specialist overall; frequent within wall editing | Board options; obvious active-mode cue and easy return to dots |
| Width / Height | Specialist setup | Board options |
| Algorithm | Specialist comparison | Board options; meaningful explanation when fixed by board type |
| Clear walls | Occasional within wall editing | Only when walls exist and wall tools are open |
| Zoom / Fit | Context dependent | Available to dense-board editing, including dots |
| Unavailable modes | No usable task today | Remove from the interactive selector until implemented |
| Timing / implementation details | Rare inspection | Secondary detail; keep completion feedback simple |

Keep text labels on core actions. Recognition cues reduce memory demands;
unfamiliar icons or gesture-only features would work against this philosophy.
[NN/g: recognition and recall](https://www.nngroup.com/articles/recognition-and-recall/).

## What the current app does well

- The default panel has four visible buttons: Undo, Solve, Generate, Reset,
  plus Size and Board options.
- Puzzle controls and the disclosure have at least 44px-high targets.
- Solve/Edit share a position; Undo is shared across dots and walls.
- Editing uses familiar click/tap behavior and advances endpoint colors.
- Walls preserve cell coverage and use direct manipulation with previews.
- Keyboard editing uses one board tab stop, arrow navigation, and wall shortcuts.
- Saved endpoints and walls survive reloads.
- Existing browser tests cover stable board layout across mobile browser-bar
  changes, real workers, wall solving, and mixed Undo sequences.
- The status area already uses a polite live region.

Preserve these behaviors when improving the details.

## Measured findings

Measurements used fresh browser contexts at the local preview, with square
boards and options opened only for inspecting wall targets. Values are rounded
CSS pixels; they describe this Chromium run, not every device or browser.

| Viewport | 5×5 cell | 15×15 cell | 15×15 vertical wall target |
| --- | ---: | ---: | ---: |
| 320×568 | 62×62 | 20×20 | 9.3×21.1 |
| 390×844 | 76×76 | 24.7×24.7 | 11.3×25.7 |
| 1280×900 | 126.8×126.8 | 41.6×41.6 | 18.8×42.7 |

The wall spans are measured hit-area elements. Actual boundary selection also
uses coordinate snapping and pointer interpolation; the table is not a complete
assessment of all effective pointer targets. Enlarging adjacent boundary targets
indiscriminately can create ambiguity near corners and steal dot taps.

WCAG 2.2 defines a 24×24 CSS-pixel minimum with specific exceptions. The dense
grid needs a contextual assessment; these measurements alone do not establish
conformance. They do establish a practical precision problem worth addressing
with an equivalent enlarged editing view.
[W3C: target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).

Current button text is 12px, field labels 10px, and disclosure text 11px in these
viewports. Some landscape helpers use 8–10px. A practical trial is 13–14px for
action labels and 12px for essential helper text, preserving the 44px targets.
These sizes are design choices, not WCAG minimum font sizes. Check enlarged text
and narrow layouts before adopting them.
[W3C: resize text](https://www.w3.org/WAI/WCAG22/Understanding/resize-text.html).

Calculated contrast from current solid CSS colors:

| Pair | Ratio | Interpretation |
| --- | ---: | --- |
| Muted text `#8A8E8C` / page `#151716` | 5.43:1 | Good foundation for ordinary text |
| Primary text `#E6E4DF` / page | 14.17:1 | Strong contrast |
| Focus accent `#2B9EA8` / cell `#1C1F1E` | 5.19:1 | Good foundation for a visible focus indicator |
| Grid line `#272A2B` / cell | 1.15:1 | Cell boundaries are visually subtle |
| Blue `#0000FF` / cell | 1.93:1 | Low luminance separation |
| Maroon `#800000` / cell | 1.52:1 | Low luminance separation |
| Purple `#800080` / cell | 1.76:1 | Low luminance separation |
| Dark blue `#00008B` / cell | 1.09:1 | Particularly difficult to distinguish |

These calculations exclude the thin inset dot outline, antialiasing, and hover
states. They are an audit signal, not a full accessibility certification. Ordinary
text generally needs 4.5:1; meaningful graphical and state cues generally need
3:1 under the applicable criteria. Decorative borders do not all require 3:1.
[W3C: text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html),
[W3C: non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Prioritized improvements

Priority weighs work-loss risk, relevance to the core task, discoverability,
and effort. It is not a numerical score backed by usage telemetry.

### 1. Protect populated boards when changing dimensions — P0

**Observed:** Reset and replacement of manually edited endpoints ask for
confirmation. Size, Width, and Height immediately clear the board and Undo
history. A small setup change therefore destroys work through a less obvious
path than Reset.

**Recommendation:** Use one consistent populated-board guard for every
dimension change. Keep empty-board resizing immediate. On cancellation, restore
the selected dimensions and preserve endpoints, walls, color phase, generated
solution, and Undo history. Selecting the existing dimensions should be a no-op.

Use a specific prompt such as “Resize this puzzle?” and brief consequences.
Native confirmation is a reasonable first implementation. A later accessible
dialog can offer explicit “Resize” and “Cancel” labels instead of generic OK.
Apple recommends clear action names and concise alerts.
[Apple: alerts](https://developer.apple.com/design/human-interface-guidelines/alerts?changes=_1).

**Acceptance:** Cancel preserves the exact puzzle and saved state; accepting
resizes once; square and rectangular selectors behave consistently. Keep the
user-requested Reset warning.

### 2. Make endpoint identity and the next placement clear — P0

**Observed:** The status says “Place ● Start/End.” The colored chip has no text
equivalent identifying the active color. Board labels use numeric colors, and
visible pairs are distinguished by color alone.

**Recommendation:** Try “Place first dot” and “Place matching dot” with the
existing chip. Give its color a readable accessible name, such as “Red, place
matching dot.” Add a compact pair number or symbol to endpoints so matching
pairs can be recognized without hue alone; retain automatic color advancement.
Review the darkest colors against the board and improve their visible contour
or lightness while keeping identities distinct.

Do not add a permanent color picker. Test symbol legibility on dense boards
with the enlarged view before choosing a final treatment. W3C advises an
additional visual cue when color communicates information.
[W3C: use of color](https://www.w3.org/WAI/WCAG22/Understanding/use-of-color.html).

**Acceptance:** People can identify the pending pair and matching endpoints
without guessing a color; placed dots, previews, and solved output agree.

### 3. Extend precise editing to dense dot boards — P1

**Observed:** Zoom is available in wall tools. The same dense board in dot mode
has no equivalent enlarged editor; 15×15 cells can be 20px wide.

**Recommendation:** Reuse the existing zoom/fit concept across both tools.
Offer it when measured cell size makes precision difficult, rather than showing
an always-present zoom toolbar. Keep the outer board frame fixed and enlarge
its internal content. Keep Fit easy to find. Establish and test a clear gesture
rule for panning versus editing in dot mode; the existing wall-mode center-pan
rule cannot simply be copied because dot placement uses cell centers.

**Acceptance:** Dense endpoints and boundaries can be edited accurately;
panning does not place dots or walls; no document-level horizontal overflow;
Fit restores the same board frame. Keyboard editing remains available.

### 4. Remove unavailable choices and explain real restrictions — P1

**Observed:** Bridges, Hexes, and Warps are selectable “coming soon” modes that
disable puzzle actions. Algorithm becomes fixed for rectangular or wall boards,
without an adjacent explanation.

**Recommendation:** Show only implemented modes as interactive choices. If
Standard is the only implemented mode, remove the redundant Mode field for now.
Keep Algorithm in Board options for comparison; when fixed, use a simple value
and a short contextual reason, such as “Wall boards use Heuristic BFS.” Preserve
the existing “Clear walls to generate” explanation.

Disabled controls can be useful, but unexplained restrictions leave people
guessing. A hover tooltip alone would not help touch users.
[NN/g: disabled buttons](https://www.nngroup.com/videos/why-disabled-buttons-hurt-ux-and-how-to-fix-them/).

**Acceptance:** Every selectable mode works; restrictions have a visible,
accessible explanation; users can still compare supported square-board solvers.

### 5. Give wall editing an easy exit and one instruction — P1

**Observed:** Closing options keeps wall editing active. The summary says
“· Walls,” but returning to dots requires opening options again. The general
header still says “Click to place or remove,” while the status and wall helper
both explain boundaries.

**Recommendation:** Keep the Draw walls toggle in Board options. When wall
editing is active, provide a contextual “Place dots” action near the active-mode
cue, with a full-sized hit area. Avoid a permanent Dots/Walls segmented control.
Use one boundary instruction while editing walls, and remove conflicting or
duplicate placement advice. Changes remain immediate; no extra Save step.

Also align the toggle’s accessible name with the visible “Draw walls” label;
the current `aria-label="Walls"` omits the visible verb. Matching labels supports
speech input and predictable navigation.
[W3C: label in name](https://www.w3.org/WAI/WCAG22/Understanding/label-in-name.html).

**Acceptance:** People can leave wall mode without hunting for a setting;
helper text matches the active tool; existing walls and Undo history survive.
Any contextual action must fit a reserved area without moving the board or
primary action, and must not become a nested button inside a disclosure summary.

### 6. Make busy and error feedback actionable — P2

**Observed:** Solving and generation show a spinner; Reset can cancel the worker
but also clears the puzzle. Errors occupy the same status area as next-action
guidance. Completion timing is visible alongside “Solved.”

**Recommendation:** For long operations, offer cancellation that preserves the
puzzle, separate from Reset. Keep immediate busy feedback; do not invent a
percentage when workers cannot report progress. Write errors as a problem plus
one useful next step, such as “Blue needs a matching dot.” Keep completion calm,
and consider moving solve timing to Board options if testing shows it distracts.

Retain polite status announcements without moving focus for routine feedback.
Avoid announcing every pointer move; check wall announcements and Undo together
so the interface does not become excessively talkative.
[W3C: status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html),
[NN/g: usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/).

**Acceptance:** Cancel preserves the puzzle; a fresh solve works afterward;
errors identify a fix; completion is announced without unexpected focus changes.

## Implementation sequence

1. Protect all dimension changes; fix the Draw walls accessible label.
2. Improve placement guidance, endpoint identification, and essential text size.
3. Remove unusable mode choices and clarify fixed algorithms.
4. Design and test dense-board precision editing and the wall-mode exit.
5. Refine worker cancellation and completion details after the core editing flow.

Likely touchpoints: `FlowSolver.tsx` for dimension guards, cancellation, and
history; `StatusIndicator.tsx` for guidance; `SolverControls.tsx` for hierarchy
and contextual controls; `PuzzleGrid.tsx` for endpoint identity and input;
`src/app/index.css` for text, contrast, and stable layout.

## Validate the philosophy with tasks

Run a small formative study with people unfamiliar with this solver, including
phone and keyboard use. Five participants is a practical starting budget here,
not a claim of statistical representativeness. Ask people to:

1. Recreate a two-pair puzzle, remove a dot, and recover with Undo.
2. Find walls, draw a boundary, collapse options, and return to dot placement.
3. Change dimensions, cancel, and verify their work remains.
4. Place a dot and a wall accurately on a 15×15 phone board.
5. Generate, solve, and return to editing; cancel a deliberately slow operation.

Record task completion without help, wrong taps, time to find wall editing and
its exit, lost-work incidents, and questions about inactive controls. Compare
against the current app; choose improvements based on observed friction.
Proposed goals are zero lost-work incidents in cancellation tasks, no explanation
needed to restore an edit, and fewer corrections on dense boards. A small study
can guide iteration; it cannot certify accessibility or population-wide usage.

Regression checks should preserve the existing board-position tests, real-worker
solution validation, and mixed Undo coverage. Add focused cases for resize
cancellation and the chosen precision-input behavior. Check 320px portrait,
short landscape, desktop, enlarged text, and keyboard focus visibility. The
controls may reflow and the footer may scroll when text grows; keeping the board
stable during ordinary browser-bar changes must not hide enlarged controls.
[W3C: focus not obscured](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html).

## Preserve restraint

Keep the calm palette, thin visual structure, generous board, labeled core
actions, and single options disclosure. Avoid adding permanent toolbars,
multiple nested settings levels, gesture-only commands, decorative animation,
or frequent confirmation prompts for reversible edits. Improvements should
remove uncertainty at the moment it occurs.


## Implementation record · October 6, 2026

The approved changes are implemented on `feat/flow-free-walls`:

- Dimension confirmation preserves all work and history on cancellation; choosing
  existing dimensions is a no-op.
- Guidance moved from the static header to the existing status area. It introduces
  the first dot, matching dot, next pair, and tap-again removal. Endpoints include
  pair numbers and accessible color names; the darker palette was adjusted for
  contrast against the board and number text.
- Unavailable modes are hidden and old placeholder saves normalize to Standard.
  Fixed algorithms explain why they are selected.
- Zoom supports dot and wall editing within a fixed outer frame; native touch and
  mouse panning suppress edit clicks. Advanced controls remain in Board options.
- Wall editing uses two adjacent cell taps, highlighting the first cell and its
  neighbors. This supersedes boundary dragging after the user's feedback that
  dragging a boundary was difficult. Tap the same pair to remove a wall. Keyboard
  selection and Shift+Arrow remain available, with a direct Place dots exit.
- Cancel stops solving/generation while preserving the puzzle and Undo history.
  Errors identify incomplete colors, and solve timing lives in Board options.

Browser regressions cover first/matching/next guidance, removal, wall selection,
keyboard use, precision panning, resize cancellation, worker cancellation, legacy
saves, and independently validated full-board solutions. The frequency ranking
above remains a design hypothesis; these checks are not a usability study.

Verification: `npm run check` passed with Node.js 24 and the pinned Emscripten
4.0.23 compiler: 76 C/Wasm tests, 42 unit tests, TypeScript checks, the production
build, and 97 browser tests (93 Chromium and 4 mobile WebKit). Focused development
server checks also exercised the new guidance, wall selection, precision panning,
and cancellation. Visual inspection covered portrait mobile, short landscape,
desktop, and the 320px wall-selection layout.
