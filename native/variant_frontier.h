/* Compact rollback components for Bridges/Warps movement graphs.
 * Independently implemented; shares flow_solver.c's Matt Zucker attribution
 * and CC BY-NC 2.0 exception. No planar corner or checkerboard assumptions.
 * Failure and probe limits always delegate to the existing graph/path search.
 * Circular member lists and local excluded-edge masks replace copied bitsets.
 */
typedef struct {
  uint16_t root, child, size, next_root, next_child;
  int8_t color;
} variant_union_t;

typedef struct {
  variant_union_t undo[2];
  uint8_t undo_count, next, needed, required, excluded, applied;
} variant_frontier_frame_t;

typedef struct {
  cover_graph_t *graph;
  uint16_t count, order[COVER_MAX], future[COVER_MAX][4], reverse[COVER_MAX][4];
  uint16_t parent[COVER_MAX], size[COVER_MAX], next_member[COVER_MAX];
  uint8_t target[COVER_MAX], degree[COVER_MAX], remaining[COVER_MAX], future_count[COVER_MAX], chosen[COVER_MAX], forbidden[COVER_MAX];
  int8_t color[COVER_MAX];
  variant_frontier_frame_t frames[COVER_MAX];
  size_t visits;
  int limited, constraints;
} variant_frontier_t;

static uint16_t variant_frontier_root(const variant_frontier_t *s, uint16_t id) {
  while (s->parent[id] != id) id = s->parent[id];
  return id;
}

/* Inspect only actual contact edges, rather than all words of a component's
 * member/forbidden/color bitsets. The circular list survives rollback in O(1).
 * other is a component being joined; color also excludes separate components
 * already assigned the same terminal color. Bridge mates are always contacts.
 */
static int variant_frontier_conflict(const variant_frontier_t *s, uint16_t root, uint16_t other, int color) {
  const cover_graph_t *g = s->graph;
  uint16_t id = root;
  do {
    uint16_t mate = g->mate[id];
    if (mate != INVALID_POS) {
      uint16_t r = variant_frontier_root(s, mate);
      if (r == other || (color >= 0 && s->color[r] == color)) return 1;
    }
    unsigned forbidden = s->forbidden[id];
    while (forbidden) {
      int d = __builtin_ctz(forbidden); forbidden &= forbidden - 1;
      uint16_t r = variant_frontier_root(s, g->neighbors[id][d]);
      if (r == other || (color >= 0 && s->color[r] == color)) return 1;
    }
    id = s->next_member[id];
  } while (id != root);
  return 0;
}

static int variant_frontier_join(variant_frontier_t *s, variant_frontier_frame_t *f, uint16_t a, uint16_t b) {
  a = variant_frontier_root(s, a); b = variant_frontier_root(s, b);
  if (a == b || (s->color[a] >= 0 && s->color[b] >= 0 && s->color[a] != s->color[b])) return 0;
  if (s->size[a] < s->size[b]) { uint16_t tmp = a; a = b; b = tmp; }
  int color = s->color[a] >= 0 ? s->color[a] : s->color[b];
  if (s->constraints) {
    // Every constraint between the two components has an end in the smaller.
    if (variant_frontier_conflict(s, b, a, -1)) return 0;
    // Only newly colored members need checks against other colored components.
    if (color >= 0 && ((s->color[a] < 0 && variant_frontier_conflict(s, a, INVALID_POS, color)) ||
                      (s->color[b] < 0 && variant_frontier_conflict(s, b, INVALID_POS, color)))) return 0;
  }
  assert(f->undo_count < 2);
  variant_union_t *u = &f->undo[f->undo_count++];
  *u = (variant_union_t){a, b, s->size[a], s->next_member[a], s->next_member[b], s->color[a]};
  s->parent[b] = a; s->size[a] += s->size[b]; s->color[a] = color;
  uint16_t tmp = s->next_member[a]; s->next_member[a] = s->next_member[b]; s->next_member[b] = tmp;
  return 1;
}

static void variant_frontier_restore(variant_frontier_t *s, uint16_t depth) {
  variant_frontier_frame_t *f = &s->frames[depth];
  uint16_t id = s->order[depth]; unsigned mask = s->chosen[id];
  while (f->undo_count) {
    variant_union_t *u = &f->undo[--f->undo_count];
    s->parent[u->child] = u->child; s->size[u->root] = u->size; s->color[u->root] = u->color;
    s->next_member[u->root] = u->next_root; s->next_member[u->child] = u->next_child;
  }
  if (f->applied) for (int i = 0; i < s->future_count[id]; i++) {
    uint16_t n = s->future[id][i];
    ++s->remaining[n]; s->degree[n] -= (mask >> i) & 1;
    if (s->graph->induced && !(mask & (1u << i))) {
      unsigned directions = s->reverse[id][i];
      s->forbidden[id] &= ~(directions & 15); s->forbidden[n] &= ~(directions >> 4);
    }
  }
  f->applied = 0;
}

static int variant_frontier_search(variant_frontier_t *s) {
  cover_graph_t *g = s->graph;
  uint16_t depth = 0, id;
  variant_frontier_frame_t *f;
  int needed, count;
  unsigned mask, required, excluded;
enter:
  if (++s->visits > COVER_VISIT_LIMIT ||
      (!(s->visits & 255) && (double)(clock() - g->started) / CLOCKS_PER_SEC > 0.025)) {
    s->limited = 1; return 0;
  }
  if (depth == s->count) return 1;
  id = s->order[depth]; f = &s->frames[depth];
  needed = s->target[id] - s->degree[id]; count = s->future_count[id];
  if (needed < 0 || needed > count) goto backtrack;
  required = excluded = 0;
  for (int i = 0; i < count; i++) {
    uint16_t n = s->future[id][i]; int left = s->target[n] - s->degree[n];
    if (left < 0 || left > s->remaining[n]) goto backtrack;
    if (!left) excluded |= 1u << i;
    else if (left == s->remaining[n]) required |= 1u << i;
  }
  f->next = 0; f->needed = needed; f->required = required; f->excluded = excluded;
try_masks:
  id = s->order[depth]; count = s->future_count[id]; f = &s->frames[depth];
  for (mask = f->next; mask < (1u << count); mask++) {
    f->next = mask + 1;
    if (__builtin_popcount(mask) != f->needed || (mask & f->required) != f->required || (mask & f->excluded)) continue;
    f->undo_count = 0; f->applied = 0;
    // Introduce every excluded edge before joining. This rejects a candidate
    // that would connect two components separated by another candidate edge.
    if (g->induced) for (int i = 0; i < count; i++) if (!(mask & (1u << i))) {
      uint16_t a = variant_frontier_root(s, id), b = variant_frontier_root(s, s->future[id][i]);
      if (a == b || (s->color[a] >= 0 && s->color[a] == s->color[b])) goto reject;
    }
    for (int i = 0; i < count; i++) {
      uint16_t n = s->future[id][i];
      --s->remaining[n]; s->degree[n] += (mask >> i) & 1;
      if (g->induced && !(mask & (1u << i))) {
        unsigned directions = s->reverse[id][i];
        s->forbidden[id] |= directions & 15; s->forbidden[n] |= directions >> 4;
      }
    }
    s->chosen[id] = mask; f->applied = 1;
    for (int i = 0; i < count; i++) if ((mask & (1u << i)) && !variant_frontier_join(s, f, id, s->future[id][i])) goto reject;
    ++depth; goto enter;
reject:
    variant_frontier_restore(s, depth);
  }
backtrack:
  if (!depth) return 0;
  variant_frontier_restore(s, --depth); goto try_masks;
}

static int variant_frontier_probe(cover_graph_t *g) {
  if (!g->started) g->started = clock();
  if ((double)(clock() - g->started) / CLOCKS_PER_SEC > 0.025) return 0;
  variant_frontier_t *s = calloc(1, sizeof(*s));
  if (!s) return 0;
  s->graph = g; s->constraints = g->induced;
  uint16_t rank[COVER_MAX];
  for (uint16_t id = 0; id < g->count; id++) if (g->endpoint[id] != -2) {
    uint16_t p = g->position[id], x = p % g->width, y = p / g->width;
    unsigned key = (x + y) * MAX_SIZE + (g->transpose ? y : x), at = s->count++;
    while (at) {
      uint16_t prev = g->position[s->order[at - 1]];
      unsigned prev_key = (prev % g->width + prev / g->width) * MAX_SIZE +
        (g->transpose ? prev / g->width : prev % g->width);
      if (prev_key <= key) break;
      s->order[at] = s->order[at - 1]; --at;
    }
    s->order[at] = id;
    s->target[id] = g->endpoint[id] >= 0 ? 1 : 2;
    s->parent[id] = s->next_member[id] = id; s->size[id] = 1; s->color[id] = g->endpoint[id];
    if (g->mate[id] != INVALID_POS) s->constraints = 1;
  }
  for (uint16_t i = 0; i < s->count; i++) rank[s->order[i]] = i;
  for (uint16_t i = 0; i < s->count; i++) {
    uint16_t id = s->order[i];
    for (int d = 0; d < 4; d++) {
      uint16_t n = g->neighbors[id][d];
      if (n == INVALID_POS) continue;
      int duplicate = 0;
      for (int e = 0; e < d; e++) if (g->neighbors[id][e] == n) duplicate = 1;
      if (duplicate) continue;
      ++s->remaining[id];
      if (rank[n] > i) {
        unsigned directions = 0;
        for (int e = 0; e < 4; e++) {
          if (g->neighbors[id][e] == n) directions |= 1u << e;
          if (g->neighbors[n][e] == id) directions |= 1u << (4 + e);
        }
        int at = s->future_count[id]++;
        s->future[id][at] = n; s->reverse[id][at] = directions;
      }
    }
    if (s->remaining[id] < s->target[id]) { free(s); return 0; }
  }
  int solved = variant_frontier_search(s);
  g->visits += s->visits; g->limited = s->limited;
  if (solved) {
    memset(g->selected, 0xff, sizeof(g->selected));
    uint8_t degree[COVER_MAX] = {0};
    for (uint16_t i = 0; i < s->count; i++) {
      uint16_t id = s->order[i];
      g->owner[id] = s->color[variant_frontier_root(s, id)];
      if (g->owner[id] < 0) { solved = 0; break; }
      for (int e = 0; e < s->future_count[id]; e++) if (s->chosen[id] & (1u << e)) {
        uint16_t n = s->future[id][e];
        assert(degree[id] < 2 && degree[n] < 2);
        g->selected[id][degree[id]++] = n; g->selected[n][degree[n]++] = id;
      }
    }
  }
  free(s); return solved;
}
