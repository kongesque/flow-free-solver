/* Bounded Classic frontier search, independently implemented from path-end
 * matching and the corner-dual observations described by Thomas Ahle:
 * https://github.com/thomasahle/numberlink#how-it-works
 * Frontier path matching is also described by Yoshinaka et al. (2012):
 * https://doi.org/10.3390/a5020176
 * No upstream implementation is included or translated. This helper shares
 * flow_solver.c's Matt Zucker attribution and CC BY-NC 2.0 exception.
 *
 * Partial paths have two open ends (or one end and a terminal color). Joining
 * paths changes at most two mates, avoiding whole-component bitset copies.
 * Corner pruning applies only when both diagonal contact edges are open.
 * Completed covers are checked for every unselected same-color contact.
 * Failure/limits delegate to the existing search, never certify unsatisfiability.
 */
#define FRONTIER_MAX ((MAX_SIZE + 2) * (MAX_SIZE + 2))
#define DIAG_VISIT_LIMIT 50000u

enum { FRONTIER_W = 1, FRONTIER_E = 2, FRONTIER_N = 4, FRONTIER_S = 8 };
static const int8_t frontier_corner_index[16] = {-1,-1,-1,-1,-1,0,1,-1,-1,2,3,-1,-1,-1,-1,-1};
static const uint8_t frontier_degree[16] = {0,1,1,2,1,2,2,3,1,2,2,3,2,3,3,4};

typedef struct {
  uint16_t changed[4], corner;
  int16_t old_mate[4];
  uint8_t undo_count, old_allowed, next, incoming, applied;
} frontier_frame_t;

typedef struct {
  uint16_t stride, count, order[MAX_CELLS], native[FRONTIER_MAX];
  uint16_t corner[FRONTIER_MAX][4], patterns[FRONTIER_MAX];
  int16_t mate[FRONTIER_MAX];
  uint8_t target[FRONTIER_MAX], open[FRONTIER_MAX];
  uint8_t available[FRONTIER_MAX], allowed[FRONTIER_MAX], links[FRONTIER_MAX], turns[FRONTIER_MAX];
  uint16_t source[MAX_COLORS], trail[MAX_CELLS];
  uint32_t stamp[FRONTIER_MAX], epoch;
  int8_t owner[FRONTIER_MAX];
  frontier_frame_t frames[MAX_CELLS];
  size_t visits;
  clock_t started;
  int limited, masked;
} frontier_search_t;

static void frontier_set_mate(frontier_search_t *s, frontier_frame_t *f, uint16_t id, int16_t mate) {
  assert(f->undo_count < 4);
  f->changed[f->undo_count] = id; f->old_mate[f->undo_count++] = s->mate[id];
  s->mate[id] = mate;
}

static int frontier_join(frontier_search_t *s, frontier_frame_t *f, uint16_t a, uint16_t b) {
  int16_t ma = s->mate[a], mb = s->mate[b];
  if (ma == b) return 0; // Joining the two ends of one path closes a cycle.
  if (ma < 0 && mb < 0) return ma == mb ? 2 : 0;
  if (ma >= 0) frontier_set_mate(s, f, ma, mb);
  if (mb >= 0) frontier_set_mate(s, f, mb, ma);
  return 1;
}

static void frontier_restore(frontier_search_t *s, uint16_t depth) {
  frontier_frame_t *f = &s->frames[depth];
  uint16_t id = s->order[depth];
  if (f->corner) s->allowed[f->corner] = f->old_allowed;
  if (f->applied) {
    unsigned outgoing = s->links[id] & (FRONTIER_E | FRONTIER_S);
    if (s->open[id] & FRONTIER_E) {
      s->available[id + 1] |= FRONTIER_W;
      if (outgoing & FRONTIER_E) s->links[id + 1] &= ~FRONTIER_W;
    }
    if (s->open[id] & FRONTIER_S) {
      s->available[id + s->stride] |= FRONTIER_N;
      if (outgoing & FRONTIER_S) s->links[id + s->stride] &= ~FRONTIER_N;
    }
    s->links[id] = f->incoming;
  }
  while (f->undo_count) {
    --f->undo_count;
    s->mate[f->changed[f->undo_count]] = f->old_mate[f->undo_count];
  }
  f->corner = 0; f->applied = 0;
}

// Walls/holes weaken corner spikes. Reject a completed path's unselected
// contacts immediately, before searching the rest of a masked board.
static int frontier_closed_path(frontier_search_t *s, int color) {
  uint16_t id = s->source[color], previous = 0, count = 0;
  uint32_t epoch = ++s->epoch;
  while (1) {
    if (s->stamp[id] == epoch || count == s->count) return 0;
    s->stamp[id] = epoch; s->trail[count++] = id;
    if (previous && s->target[id] == 1) break;
    uint16_t next = 0; unsigned links = s->links[id];
    if ((links & FRONTIER_W) && id - 1 != previous) next = id - 1;
    if ((links & FRONTIER_E) && id + 1 != previous) next = id + 1;
    if ((links & FRONTIER_N) && id - s->stride != previous) next = id - s->stride;
    if ((links & FRONTIER_S) && id + s->stride != previous) next = id + s->stride;
    if (!next) return 0;
    previous = id; id = next;
  }
  for (uint16_t i = 0; i < count; i++) {
    id = s->trail[i];
    if (((s->open[id] & FRONTIER_E) && !(s->links[id] & FRONTIER_E) && s->stamp[id + 1] == epoch) ||
        ((s->open[id] & FRONTIER_S) && !(s->links[id] & FRONTIER_S) && s->stamp[id + s->stride] == epoch)) return 0;
  }
  return 1;
}

// Check selected paths independently of the partial-mate and corner pruning.
// A path may not touch itself across an open, unselected edge in Classic.
static int frontier_finish(frontier_search_t *s, const game_info_t *info,
                           const game_state_t *initial, game_state_t *result) {
  memset(s->owner, -1, sizeof(s->owner));
  for (unsigned color = 0; color < info->num_colors; color++) {
    int x, y; pos_get_coords(info->init_pos[color], &x, &y);
    uint16_t id = (y + 1) * s->stride + x + 1, previous = 0;
    pos_get_coords(info->goal_pos[color], &x, &y);
    uint16_t goal = (y + 1) * s->stride + x + 1;
    while (1) {
      if (s->owner[id] >= 0) return 0;
      s->owner[id] = color;
      if (id == goal) break;
      uint16_t next = 0;
      unsigned links = s->links[id];
      if ((links & FRONTIER_W) && id - 1 != previous) next = id - 1;
      if ((links & FRONTIER_E) && id + 1 != previous) next = id + 1;
      if ((links & FRONTIER_N) && id - s->stride != previous) next = id - s->stride;
      if ((links & FRONTIER_S) && id + s->stride != previous) next = id + s->stride;
      if (!next) return 0;
      previous = id; id = next;
    }
  }
  for (uint16_t i = 0; i < s->count; i++) {
    uint16_t id = s->order[i];
    if (s->owner[id] < 0 ||
        ((s->open[id] & FRONTIER_E) && !(s->links[id] & FRONTIER_E) && s->owner[id] == s->owner[id + 1]) ||
        ((s->open[id] & FRONTIER_S) && !(s->links[id] & FRONTIER_S) && s->owner[id] == s->owner[id + s->stride])) return 0;
  }
  *result = *initial;
  for (uint16_t i = 0; i < s->count; i++) {
    uint16_t id = s->order[i]; pos_t pos = s->native[id];
    result->cells[pos] = cell_create(s->target[id] == 1 ? cell_get_type(initial->cells[pos]) : TYPE_PATH, s->owner[id], 0);
  }
  result->num_free = 0; result->completed = (1u << info->num_colors) - 1;
  return 1;
}

// Explicit heap frames also keep 19x19 masked boards within Safari's Wasm stack.
static int frontier_search(frontier_search_t *s, const game_info_t *info,
                           const game_state_t *initial, game_state_t *result) {
  uint16_t depth = 0, id;
  frontier_frame_t *f;
  unsigned outgoing, available, needed, required, excluded;
enter:
  if (++s->visits > DIAG_VISIT_LIMIT ||
      (!(s->visits & 255) && (double)(clock() - s->started) / CLOCKS_PER_SEC > 0.025)) {
    s->limited = 1; return 0;
  }
  if (depth == s->count) {
    if (frontier_finish(s, info, initial, result)) return 1;
    goto backtrack;
  }
  id = s->order[depth]; f = &s->frames[depth];
  f->incoming = s->links[id]; f->next = 0;
  if ((f->incoming & ~s->allowed[id]) || frontier_degree[f->incoming] > s->target[id]) goto backtrack;
try_next:
  id = s->order[depth]; f = &s->frames[depth];
  needed = s->target[id] - frontier_degree[f->incoming];
  available = s->open[id] & s->allowed[id] & (FRONTIER_E | FRONTIER_S);
  if (needed > frontier_degree[available]) goto backtrack;
  required = excluded = 0;
  if (s->masked && (s->open[id] & FRONTIER_E)) {
    uint16_t n = id + 1;
    unsigned left = s->target[n] - frontier_degree[s->links[n]];
    unsigned possible = s->available[n] & s->allowed[n];
    if (frontier_degree[possible] < left || (s->links[n] & ~s->allowed[n])) goto backtrack;
    if (!(possible & FRONTIER_W) || !left) excluded |= FRONTIER_E;
    else if (left == frontier_degree[possible]) required |= FRONTIER_E;
  }
  if (s->masked && (s->open[id] & FRONTIER_S)) {
    uint16_t n = id + s->stride;
    unsigned left = s->target[n] - frontier_degree[s->links[n]];
    unsigned possible = s->available[n] & s->allowed[n];
    if (frontier_degree[possible] < left || (s->links[n] & ~s->allowed[n])) goto backtrack;
    if (!(possible & FRONTIER_N) || !left) excluded |= FRONTIER_S;
    else if (left == frontier_degree[possible]) required |= FRONTIER_S;
  }
  while (f->next < (needed == 1 ? 2 : 1)) {
    outgoing = needed == 1 ? (f->next ? FRONTIER_S : FRONTIER_E) : needed ? FRONTIER_E | FRONTIER_S : 0;
    ++f->next;
    if ((outgoing & ~available) || (outgoing & excluded) || (outgoing & required) != required) continue;
    unsigned shape = f->incoming | outgoing;
    int corner = shape == (FRONTIER_W | FRONTIER_N) ? 0 : shape == (FRONTIER_E | FRONTIER_N) ? 1 :
      shape == (FRONTIER_W | FRONTIER_S) ? 2 : shape == (FRONTIER_E | FRONTIER_S) ? 3 : -1;
    if (corner >= 0 && !(s->turns[id] & (1u << corner))) continue;
    f->undo_count = 0; f->corner = 0; f->applied = 0;
    if ((outgoing & FRONTIER_E) && frontier_degree[s->links[id + 1]] >= s->target[id + 1]) continue;
    if ((outgoing & FRONTIER_S) && frontier_degree[s->links[id + s->stride]] >= s->target[id + s->stride]) continue;
    int closed = -1, joined;
    if (outgoing & FRONTIER_E) {
      joined = frontier_join(s, f, id, id + 1);
      if (!joined) goto reject;
      if (joined == 2) closed = -1 - s->mate[id];
    }
    if (outgoing & FRONTIER_S) {
      joined = frontier_join(s, f, id, id + s->stride);
      if (!joined) goto reject;
      if (joined == 2) closed = -1 - s->mate[id];
    }
    s->links[id] = f->incoming | outgoing; f->applied = 1;
    if (s->open[id] & FRONTIER_E) {
      s->available[id + 1] &= ~FRONTIER_W;
      if (outgoing & FRONTIER_E) s->links[id + 1] |= FRONTIER_W;
    }
    if (s->open[id] & FRONTIER_S) {
      s->available[id + s->stride] &= ~FRONTIER_N;
      if (outgoing & FRONTIER_S) s->links[id + s->stride] |= FRONTIER_N;
    }
    if (s->masked && closed >= 0 && !frontier_closed_path(s, closed)) goto reject;
    if (corner >= 0 && s->corner[id][corner]) {
      uint16_t n = s->corner[id][corner]; f->corner = n; f->old_allowed = s->allowed[n];
      s->allowed[n] &= shape;
      if ((s->links[n] & ~s->allowed[n]) || frontier_degree[s->open[n] & s->allowed[n]] < s->target[n]) goto reject;
    }
    ++depth; goto enter;
reject:
    frontier_restore(s, depth);
  }
backtrack:
  if (!depth) return 0;
  --depth; frontier_restore(s, depth); goto try_next;
}

// On an open rectangle, diagonal predecessor turns provide the restrictions
// directly. No mutable degree-lookahead/permission arrays need to be updated.
static void frontier_restore_open(frontier_search_t *s, uint16_t depth) {
  frontier_frame_t *f = &s->frames[depth]; uint16_t id = s->order[depth];
  if (f->applied) {
    unsigned outgoing = s->links[id] & (FRONTIER_E | FRONTIER_S);
    if (outgoing & FRONTIER_E) s->links[id + 1] &= ~FRONTIER_W;
    if (outgoing & FRONTIER_S) s->links[id + s->stride] &= ~FRONTIER_N;
    s->links[id] = f->incoming;
  }
  while (f->undo_count) {
    --f->undo_count;
    s->mate[f->changed[f->undo_count]] = f->old_mate[f->undo_count];
  }
  f->applied = 0;
}

static int frontier_search_open(frontier_search_t *s, const game_info_t *info,
                                const game_state_t *initial, game_state_t *result) {
  uint16_t depth = 0, id, neighbor;
  frontier_frame_t *f;
  unsigned needed, outgoing, shape, permitted;
  int corner;
enter:
  if (++s->visits > DIAG_VISIT_LIMIT ||
      (!(s->visits & 255) && (double)(clock() - s->started) / CLOCKS_PER_SEC > 0.025)) {
    s->limited = 1; return 0;
  }
  if (depth == s->count) {
    if (frontier_finish(s, info, initial, result)) return 1;
    goto backtrack;
  }
  id = s->order[depth]; f = &s->frames[depth];
  f->incoming = s->links[id]; f->next = 0;
  if (frontier_degree[f->incoming] > s->target[id]) goto backtrack;
try_next:
  id = s->order[depth]; f = &s->frames[depth];
  needed = s->target[id] - frontier_degree[f->incoming];
  permitted = 15;
  neighbor = s->corner[id][0]; // Earlier NW neighbor pointing SE.
  if (neighbor && s->links[neighbor] == (FRONTIER_E | FRONTIER_S)) permitted &= FRONTIER_E | FRONTIER_S;
  neighbor = s->corner[id][1]; // Earlier NE neighbor pointing SW.
  if (neighbor && s->links[neighbor] == (FRONTIER_W | FRONTIER_S)) permitted &= FRONTIER_W | FRONTIER_S;
  while (f->next < (needed == 1 ? 2 : 1)) {
    outgoing = needed == 1 ? (f->next ? FRONTIER_S : FRONTIER_E) : needed ? FRONTIER_E | FRONTIER_S : 0;
    ++f->next; shape = f->incoming | outgoing;
    if (!(s->patterns[id] & (1u << shape)) || (shape & ~permitted)) continue;
    corner = frontier_corner_index[shape];
    if (corner >= 0 && (neighbor = s->corner[id][corner]) && (s->links[neighbor] & ~shape)) continue;
    if ((outgoing & FRONTIER_E) && frontier_degree[s->links[id + 1]] >= s->target[id + 1]) continue;
    if ((outgoing & FRONTIER_S) && frontier_degree[s->links[id + s->stride]] >= s->target[id + s->stride]) continue;
    f->undo_count = 0; f->applied = 0;
    if ((outgoing & FRONTIER_E) && !frontier_join(s, f, id, id + 1)) goto reject;
    if ((outgoing & FRONTIER_S) && !frontier_join(s, f, id, id + s->stride)) goto reject;
    s->links[id] = shape; f->applied = 1;
    if (outgoing & FRONTIER_E) s->links[id + 1] |= FRONTIER_W;
    if (outgoing & FRONTIER_S) s->links[id + s->stride] |= FRONTIER_N;
    ++depth; goto enter;
reject:
    frontier_restore_open(s, depth);
  }
backtrack:
  if (!depth) return 0;
  --depth; frontier_restore_open(s, depth); goto try_next;
}

static frontier_search_t *frontier_prepare(const game_info_t *info, const game_state_t *initial, clock_t started) {
  frontier_search_t *s = calloc(1, sizeof(*s));
  if (!s) return NULL;
  s->stride = info->width + 2; s->started = started; s->masked = info->num_walls || info->num_blocks;
  for (int sum = 0; sum < info->width + info->height - 1; sum++)
    for (int x = info->width - 1; x >= 0; x--) {
      int y = sum - x;
      if (y < 0 || y >= info->height) continue;
      pos_t pos = pos_from_coords(x, y);
      if (info->blocks[pos]) continue;
      uint16_t id = (y + 1) * s->stride + x + 1;
      cell_t cell = initial->cells[pos];
      s->order[s->count++] = id; s->native[id] = pos;
      s->target[id] = cell_get_type(cell) == TYPE_FREE ? 2 : 1;
      s->mate[id] = s->target[id] == 1 ? -1 - cell_get_color(cell) : id;
      if (cell_get_type(cell) == TYPE_INIT) s->source[cell_get_color(cell)] = id;
      for (int d = 0; d < 4; d++) if (info->neighbors[pos][d] != INVALID_POS) s->open[id] |= 1u << d;
      s->allowed[id] = 15; s->available[id] = s->open[id];
      if (frontier_degree[s->open[id]] < s->target[id]) { free(s); return NULL; }
    }
  const int offsets[4] = {-1, 1, -s->stride, s->stride};
  // A turn at u restricts its diagonal neighbor only when both contacts from
  // that neighbor to u's path are playable/open. Walls and holes break spikes.
  for (uint16_t i = 0; i < s->count; i++) {
    uint16_t id = s->order[i];
    for (int c = 0; c < 4; c++) {
      int horizontal = c & 1, vertical = 2 + (c >> 1);
      uint16_t a = id + offsets[horizontal], b = id + offsets[vertical];
      if ((s->open[id] & (1u << horizontal)) && (s->open[id] & (1u << vertical)) &&
          (s->open[a] & (1u << vertical)) && (s->open[b] & (1u << horizontal)))
        s->corner[id][c] = id + offsets[horizontal] + offsets[vertical];
    }
  }
  // A corner spike must eventually reach a terminal or a missing contact.
  // Compute admissibility in dependency order for all four orientations.
  for (int c = 0; c < 4; c++) {
    unsigned shape = (1u << (c & 1)) | (1u << (2 + (c >> 1)));
    for (uint16_t step = 0; step < s->count; step++) {
      uint16_t id = s->order[c < 2 ? step : s->count - 1 - step], n = s->corner[id][c];
      if ((s->open[id] & shape) != shape) continue;
      if (!n || (s->target[n] == 1 ? (s->open[n] & shape) != 0 : (s->turns[n] & (1u << c)) != 0))
        s->turns[id] |= 1u << c;
    }
  }
  if (!s->masked) for (uint16_t i = 0; i < s->count; i++) {
    uint16_t id = s->order[i];
    unsigned open = s->open[id], turns = s->turns[id];
    if (s->target[id] == 1) {
      s->patterns[id] = ((open & FRONTIER_W) ? 1u << FRONTIER_W : 0) |
        ((open & FRONTIER_E) ? 1u << FRONTIER_E : 0) |
        ((open & FRONTIER_N) ? 1u << FRONTIER_N : 0) |
        ((open & FRONTIER_S) ? 1u << FRONTIER_S : 0);
    } else {
      s->patterns[id] = ((turns & 3) << 5) | ((turns & 12) << 7) |
        (((open & 3) == 3) ? 1u << 3 : 0) | (((open & 12) == 12) ? 1u << 12 : 0);
    }
  }
  return s;
}

static int game_diagonal_probe(const game_info_t *info, const game_state_t *initial,
                               game_state_t *result, clock_t started) {
  frontier_search_t *s = frontier_prepare(info, initial, started);
  if (!s) return 0;
  int solved = s->masked ? frontier_search(s, info, initial, result) : frontier_search_open(s, info, initial, result);
  free(s); return solved;
}
