/* Bounded classic-grid fast path, independently implemented from the diagonal
 * traversal / partial-link ideas described by Thomas Ahle's Numberlink:
 * https://github.com/thomasahle/numberlink#how-it-works
 * No upstream implementation is included. This helper shares flow_solver.c's
 * Matt Zucker attribution and CC BY-NC 2.0 exception.
 *
 * Each vertex chooses its remaining east/south edges after its north/west
 * edges are settled. Rollback components forbid cycles, mismatched endpoints,
 * and contacts across unselected edges. Failed/bounded probes always fall back
 * to the existing search; they never certify unsatisfiability.
 */
#define DIAG_WORDS ((MAX_CELLS + 63) / 64)
#define DIAG_VISIT_LIMIT 50000u

typedef struct {
  uint16_t root, child, size;
  int8_t color;
  uint64_t members[DIAG_WORDS], forbidden[DIAG_WORDS];
  uint64_t colored[DIAG_WORDS];
  int8_t changed_color;
} diagonal_undo_t;

typedef struct {
  diagonal_undo_t undo[4];
  uint8_t count;
} diagonal_frame_t;

typedef struct {
  uint16_t width, height, area, order[MAX_CELLS];
  uint16_t parent[MAX_CELLS], size[MAX_CELLS];
  int8_t color[MAX_CELLS];
  uint8_t endpoint[MAX_CELLS], edges[MAX_CELLS];
  uint64_t members[MAX_CELLS][DIAG_WORDS];
  uint64_t forbidden[MAX_CELLS][DIAG_WORDS];
  // Both unjoined endpoint components already have the same final color.
  // Contacts with either half must also be rejected when a component is colored.
  uint64_t colored[MAX_COLORS][DIAG_WORDS];
  diagonal_frame_t frames[MAX_CELLS];
  size_t visits;
  clock_t started;
  int limited;
} diagonal_search_t;

static uint16_t diag_root(const diagonal_search_t *s, uint16_t id) {
  while (s->parent[id] != id) id = s->parent[id];
  return id;
}

static int diag_intersects(const uint64_t *a, const uint64_t *b) {
  for (int w = 0; w < DIAG_WORDS; w++) if (a[w] & b[w]) return 1;
  return 0;
}

static diagonal_undo_t *diag_save(diagonal_search_t *s, diagonal_frame_t *f, uint16_t root) {
  assert(f->count < 4);
  diagonal_undo_t *u = &f->undo[f->count++];
  u->root = root; u->child = INVALID_POS; u->changed_color = -1;
  u->size = s->size[root]; u->color = s->color[root];
  memcpy(u->members, s->members[root], sizeof(u->members));
  memcpy(u->forbidden, s->forbidden[root], sizeof(u->forbidden));
  return u;
}

static void diag_restore(diagonal_search_t *s, diagonal_frame_t *f) {
  while (f->count) {
    diagonal_undo_t *u = &f->undo[--f->count];
    if (u->child != INVALID_POS) s->parent[u->child] = u->child;
    s->size[u->root] = u->size; s->color[u->root] = u->color;
    memcpy(s->members[u->root], u->members, sizeof(u->members));
    memcpy(s->forbidden[u->root], u->forbidden, sizeof(u->forbidden));
    if (u->changed_color >= 0)
      memcpy(s->colored[u->changed_color], u->colored, sizeof(u->colored));
  }
}

static int diag_join(diagonal_search_t *s, diagonal_frame_t *f, uint16_t a, uint16_t b) {
  a = diag_root(s, a); b = diag_root(s, b);
  if (a == b || (s->color[a] >= 0 && s->color[b] >= 0 && s->color[a] != s->color[b]) ||
      diag_intersects(s->members[a], s->forbidden[b])) return 0;
  int color = s->color[a] >= 0 ? s->color[a] : s->color[b];
  if (color >= 0 && (diag_intersects(s->forbidden[a], s->colored[color]) ||
                    diag_intersects(s->forbidden[b], s->colored[color]))) return 0;
  if (s->size[a] < s->size[b]) { uint16_t tmp = a; a = b; b = tmp; }
  diagonal_undo_t *u = diag_save(s, f, a);
  u->child = b;
  if (color >= 0) {
    u->changed_color = color;
    memcpy(u->colored, s->colored[color], sizeof(u->colored));
  }
  s->parent[b] = a; s->size[a] += s->size[b]; s->color[a] = color;
  for (int w = 0; w < DIAG_WORDS; w++) {
    s->members[a][w] |= s->members[b][w];
    s->forbidden[a][w] |= s->forbidden[b][w];
    if (color >= 0) s->colored[color][w] |= s->members[a][w];
  }
  return 1;
}

static int diag_separate(diagonal_search_t *s, diagonal_frame_t *f, uint16_t a, uint16_t b) {
  uint16_t ra = diag_root(s, a), rb = diag_root(s, b);
  if (ra == rb || (s->color[ra] >= 0 && s->color[ra] == s->color[rb])) return 0;
  diag_save(s, f, ra); diag_save(s, f, rb);
  s->forbidden[ra][b / 64] |= UINT64_C(1) << (b % 64);
  s->forbidden[rb][a / 64] |= UINT64_C(1) << (a % 64);
  return 1;
}

static int diag_search(diagonal_search_t *s, uint16_t depth) {
  if (++s->visits > DIAG_VISIT_LIMIT ||
      (!(s->visits & 255) && (double)(clock() - s->started) / CLOCKS_PER_SEC > 0.025)) {
    s->limited = 1; return 0;
  }
  if (depth == s->area) return 1;
  uint16_t id = s->order[depth], x = id % s->width, y = id / s->width;
  int incoming = (x > 0 && (s->edges[id - 1] & 1)) + (y > 0 && (s->edges[id - s->width] & 2));
  int needed = (s->endpoint[id] ? 1 : 2) - incoming;
  if (needed < 0 || needed > 2) return 0;
  // Each nonterminal has degree two, each endpoint degree one. With cycles
  // forbidden, a finished component is a path between two matching endpoints.
  for (uint8_t edges = 0; edges < 4; edges++) {
    if (((edges & 1) != 0) + ((edges & 2) != 0) != needed ||
        (x + 1 == s->width && (edges & 1)) || (y + 1 == s->height && (edges & 2))) continue;
    diagonal_frame_t *f = &s->frames[depth]; f->count = 0;
    s->edges[id] = edges;
    int valid = 1;
    if (x + 1 < s->width) valid = edges & 1 ? diag_join(s, f, id, id + 1) : diag_separate(s, f, id, id + 1);
    if (valid && y + 1 < s->height) valid = edges & 2 ? diag_join(s, f, id, id + s->width) : diag_separate(s, f, id, id + s->width);
    if (valid && diag_search(s, depth + 1)) return 1;
    diag_restore(s, f);
    s->edges[id] = 0;
    if (s->limited) return 0;
  }
  return 0;
}

static int game_diagonal_probe(const game_info_t *info, const game_state_t *initial, game_state_t *result) {
  if (info->num_walls || info->num_blocks) return 0;
  diagonal_search_t *s = calloc(1, sizeof(*s));
  if (!s) return 0;
  s->width = info->width; s->height = info->height; s->area = s->width * s->height;
  uint16_t count = 0;
  for (int sum = 0; sum < s->width + s->height - 1; sum++)
    for (int x = 0; x < s->width; x++) {
      int y = sum - x;
      if (y >= 0 && y < s->height) s->order[count++] = y * s->width + x;
    }
  for (uint16_t id = 0; id < s->area; id++) {
    cell_t cell = initial->cells[pos_from_coords(id % s->width, id / s->width)];
    s->parent[id] = id; s->size[id] = 1; s->color[id] = -1;
    s->members[id][id / 64] = UINT64_C(1) << (id % 64);
    if (cell_get_type(cell) != TYPE_FREE) {
      int color = cell_get_color(cell);
      s->endpoint[id] = 1; s->color[id] = color;
      s->colored[color][id / 64] |= UINT64_C(1) << (id % 64);
    }
  }
  s->started = clock();
  int solved = diag_search(s, 0);
  if (solved) {
    *result = *initial;
    for (uint16_t id = 0; id < s->area; id++) {
      int color = s->color[diag_root(s, id)];
      if (color < 0) { solved = 0; break; }
      pos_t pos = pos_from_coords(id % s->width, id / s->width);
      result->cells[pos] = cell_create(s->endpoint[id] ? cell_get_type(initial->cells[pos]) : TYPE_PATH, color, 0);
    }
    result->num_free = 0;
    result->completed = (1u << info->num_colors) - 1;
  }
  free(s);
  return solved;
}
