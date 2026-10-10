/* Numberlink-inspired diagonal edge search for nonstandard movement graphs.
 * Independent implementation; shares flow_solver.c's Matt Zucker attribution
 * and CC BY-NC 2.0 exception. Traversal/rollback ideas: Thomas Ahle's Numberlink.
 * Classic's specialized fast path remains in diagonal_solver.h.
 *
 * Removing walls/blocked vertices, splitting crossing lanes, and adding warp
 * edges happens before search. Classic uses induced paths; variants allow
 * unselected same-color adjacencies. Crossing mates must have different colors.
 * A failed or bounded probe always delegates to the original search.
 */
#define COVER_MAX (2 * MAX_CELLS)
#define COVER_WORDS ((COVER_MAX + 63) / 64)
#define COVER_VISIT_LIMIT 50000u

typedef struct {
  uint16_t count, width, position[COVER_MAX], neighbors[COVER_MAX][4], mate[COVER_MAX];
  // -2: blocked, -1: nonterminal, >=0: endpoint color.
  int8_t endpoint[COVER_MAX];
  uint16_t selected[COVER_MAX][2];
  int8_t owner[COVER_MAX];
  size_t visits;
  clock_t started;
  int induced, transpose, limited;
} cover_graph_t;

typedef struct {
  uint16_t root, child, size;
  int8_t color, changed_color;
  uint64_t members[COVER_WORDS], forbidden[COVER_WORDS], colored[COVER_WORDS];
} cover_undo_t;

typedef struct { cover_undo_t *undo; uint8_t count, capacity; } cover_frame_t;

typedef struct {
  const cover_graph_t *graph;
  uint16_t count, words, order[COVER_MAX], future[COVER_MAX][4];
  uint16_t parent[COVER_MAX], size[COVER_MAX];
  uint8_t target[COVER_MAX], degree[COVER_MAX], remaining[COVER_MAX];
  uint8_t future_count[COVER_MAX], chosen[COVER_MAX];
  int8_t color[COVER_MAX];
  uint64_t members[COVER_MAX][COVER_WORDS], forbidden[COVER_MAX][COVER_WORDS];
  uint64_t colored[MAX_COLORS][COVER_WORDS];
  cover_frame_t frames[COVER_MAX];
  cover_undo_t *undo;
  size_t visits;
  clock_t started;
  int limited;
} cover_search_t;

static uint16_t cover_root(const cover_search_t *s, uint16_t id) {
  while (s->parent[id] != id) id = s->parent[id];
  return id;
}

static int cover_intersects(const cover_search_t *s, const uint64_t *a, const uint64_t *b) {
  for (int w = 0; w < s->words; w++) if (a[w] & b[w]) return 1;
  return 0;
}

static cover_undo_t *cover_save(cover_search_t *s, cover_frame_t *f, uint16_t root) {
  assert(f->count < f->capacity);
  cover_undo_t *u = &f->undo[f->count++];
  u->root = root; u->child = INVALID_POS; u->changed_color = -1;
  u->size = s->size[root]; u->color = s->color[root];
  memcpy(u->members, s->members[root], s->words * sizeof(uint64_t));
  memcpy(u->forbidden, s->forbidden[root], s->words * sizeof(uint64_t));
  return u;
}

static void cover_restore(cover_search_t *s, cover_frame_t *f) {
  while (f->count) {
    cover_undo_t *u = &f->undo[--f->count];
    if (u->child != INVALID_POS) s->parent[u->child] = u->child;
    s->size[u->root] = u->size; s->color[u->root] = u->color;
    memcpy(s->members[u->root], u->members, s->words * sizeof(uint64_t));
    memcpy(s->forbidden[u->root], u->forbidden, s->words * sizeof(uint64_t));
    if (u->changed_color >= 0)
      memcpy(s->colored[u->changed_color], u->colored, s->words * sizeof(uint64_t));
  }
}

static int cover_join(cover_search_t *s, cover_frame_t *f, uint16_t a, uint16_t b) {
  a = cover_root(s, a); b = cover_root(s, b);
  if (a == b || (s->color[a] >= 0 && s->color[b] >= 0 && s->color[a] != s->color[b]) ||
      cover_intersects(s, s->members[a], s->forbidden[b])) return 0;
  int color = s->color[a] >= 0 ? s->color[a] : s->color[b];
  if (color >= 0 && (cover_intersects(s, s->forbidden[a], s->colored[color]) ||
                    cover_intersects(s, s->forbidden[b], s->colored[color]))) return 0;
  if (s->size[a] < s->size[b]) { uint16_t tmp = a; a = b; b = tmp; }
  cover_undo_t *u = cover_save(s, f, a); u->child = b;
  if (color >= 0) {
    u->changed_color = color;
    memcpy(u->colored, s->colored[color], s->words * sizeof(uint64_t));
  }
  s->parent[b] = a; s->size[a] += s->size[b]; s->color[a] = color;
  for (int w = 0; w < s->words; w++) {
    s->members[a][w] |= s->members[b][w];
    s->forbidden[a][w] |= s->forbidden[b][w];
    if (color >= 0) s->colored[color][w] |= s->members[a][w];
  }
  return 1;
}

static int cover_separate(cover_search_t *s, cover_frame_t *f, uint16_t a, uint16_t b) {
  uint16_t ra = cover_root(s, a), rb = cover_root(s, b);
  if (ra == rb || (s->color[ra] >= 0 && s->color[ra] == s->color[rb])) return 0;
  cover_save(s, f, ra); cover_save(s, f, rb);
  s->forbidden[ra][b / 64] |= UINT64_C(1) << (b % 64);
  s->forbidden[rb][a / 64] |= UINT64_C(1) << (a % 64);
  return 1;
}

static int cover_search(cover_search_t *s, uint16_t depth) {
  if (++s->visits > COVER_VISIT_LIMIT ||
      (!(s->visits & 255) && (double)(clock() - s->started) / CLOCKS_PER_SEC > 0.025)) {
    s->limited = 1; return 0;
  }
  if (depth == s->count) return 1;
  uint16_t id = s->order[depth];
  int needed = s->target[id] - s->degree[id], count = s->future_count[id];
  if (needed < 0 || needed > count) return 0;
  unsigned required = 0, excluded = 0;
  for (int i = 0; i < count; i++) {
    uint16_t n = s->future[id][i];
    int left = s->target[n] - s->degree[n];
    if (!left) excluded |= 1u << i;
    else if (left == s->remaining[n]) required |= 1u << i;
    else if (left < 0 || left > s->remaining[n]) return 0;
  }
  for (unsigned mask = 0; mask < (1u << count); mask++) {
    if (__builtin_popcount(mask) != needed || (mask & required) != required || (mask & excluded)) continue;
    cover_frame_t *f = &s->frames[depth]; f->count = 0;
    int valid = 1;
    for (int i = 0; i < count && valid; i++) {
      uint16_t n = s->future[id][i];
      valid = mask & (1u << i) ? cover_join(s, f, id, n)
        : !s->graph->induced || cover_separate(s, f, id, n);
    }
    if (valid) {
      for (int i = 0; i < count; i++) {
        uint16_t n = s->future[id][i];
        --s->remaining[n]; s->degree[n] += (mask >> i) & 1;
      }
      s->chosen[id] = mask;
      if (cover_search(s, depth + 1)) return 1;
      for (int i = 0; i < count; i++) {
        uint16_t n = s->future[id][i];
        ++s->remaining[n]; s->degree[n] -= (mask >> i) & 1;
      }
    }
    cover_restore(s, f);
    if (s->limited) return 0;
  }
  return 0;
}

static int cover_probe(cover_graph_t *g) {
  if (!g->started) g->started = clock();
  if ((double)(clock() - g->started) / CLOCKS_PER_SEC > 0.025) return 0;
  cover_search_t *s = calloc(1, sizeof(*s));
  if (!s) return 0;
  s->graph = g; s->words = (g->count + 63) / 64;
  uint16_t rank[COVER_MAX];
  // Keep each crossing's two independent vertices beside its diagonal cell.
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
    s->parent[id] = id; s->size[id] = 1; s->color[id] = g->endpoint[id];
    s->target[id] = g->endpoint[id] < 0 ? 2 : 1;
    s->members[id][id / 64] = UINT64_C(1) << (id % 64);
    if (g->endpoint[id] >= 0) s->colored[g->endpoint[id]][id / 64] |= UINT64_C(1) << (id % 64);
    if (g->mate[id] != INVALID_POS)
      s->forbidden[id][g->mate[id] / 64] |= UINT64_C(1) << (g->mate[id] % 64);
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
      s->remaining[id]++;
      if (rank[n] > i) s->future[id][s->future_count[id]++] = n;
    }
    if (s->remaining[id] < s->target[id]) { free(s); return 0; }
  }
  // Size rollback storage to actual forward edges, including small masks.
  // Typical diagonal cells have only two; wrap borders can have four.
  size_t undos = 0;
  for (uint16_t i = 0; i < s->count; i++) undos += s->future_count[s->order[i]] * (g->induced ? 2 : 1);
  s->undo = malloc((undos ? undos : 1) * sizeof(*s->undo));
  if (!s->undo) { free(s); return 0; }
  size_t offset = 0;
  for (uint16_t i = 0; i < s->count; i++) {
    s->frames[i].undo = s->undo + offset;
    s->frames[i].capacity = s->future_count[s->order[i]] * (g->induced ? 2 : 1);
    offset += s->frames[i].capacity;
  }
  s->started = g->started;
  int solved = cover_search(s, 0);
  g->visits += s->visits; g->limited = s->limited;
  if (solved) {
    memset(g->selected, 0xff, sizeof(g->selected));
    uint8_t degree[COVER_MAX] = {0};
    for (uint16_t i = 0; i < s->count; i++) {
      uint16_t id = s->order[i];
      g->owner[id] = s->color[cover_root(s, id)];
      if (g->owner[id] < 0) { solved = 0; break; }
      for (int e = 0; e < s->future_count[id]; e++) if (s->chosen[id] & (1u << e)) {
        uint16_t n = s->future[id][e];
        assert(degree[id] < 2 && degree[n] < 2);
        g->selected[id][degree[id]++] = n; g->selected[n][degree[n]++] = id;
      }
    }
  }
  free(s->undo); free(s); return solved;
}

static int game_graph_probe(const game_info_t *info, const game_state_t *initial, game_state_t *result) {
  cover_graph_t *g = calloc(1, sizeof(*g));
  if (!g) return 0;
  g->count = info->width * info->height; g->width = info->width; g->induced = 1;
  memset(g->neighbors, 0xff, sizeof(g->neighbors)); memset(g->mate, 0xff, sizeof(g->mate));
  for (uint16_t id = 0; id < g->count; id++) {
    int x = id % info->width, y = id / info->width;
    pos_t pos = pos_from_coords(x, y); cell_t cell = initial->cells[pos];
    g->position[id] = id;
    g->endpoint[id] = info->blocks[pos] ? -2 : cell_get_type(cell) == TYPE_FREE ? -1 : cell_get_color(cell);
    if (info->blocks[pos]) continue;
    for (int d = 0; d < 4; d++) if (info->neighbors[pos][d] != INVALID_POS) {
      int nx, ny; pos_get_coords(info->neighbors[pos][d], &nx, &ny);
      g->neighbors[id][d] = ny * info->width + nx;
    }
  }
  int solved = cover_probe(g);
  if (solved) {
    *result = *initial;
    for (uint16_t id = 0; id < g->count; id++) if (g->endpoint[id] != -2) {
      pos_t pos = pos_from_coords(id % info->width, id / info->width);
      result->cells[pos] = cell_create(g->endpoint[id] >= 0 ? cell_get_type(initial->cells[pos]) : TYPE_PATH, g->owner[id], 0);
    }
    result->num_free = 0; result->completed = (1u << info->num_colors) - 1;
  }
  free(g); return solved;
}
