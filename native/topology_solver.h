/* Variant graph search. Included by flow_solver.c; shares its color/input contract.
 * This module is covered by the same Matt Zucker CC BY-NC 2.0 exception.
 * It deliberately does not use Classic's grid positions or geometric pruning.
 */
#define TOPO_MAX (2 * MAX_CELLS)
#define TOPO_NONE UINT16_MAX
#define TOPO_NODE_LIMIT 2000000u

typedef struct {
  // Keep backtracking snapshots off the bounded Wasm stack on long covers.
  uint16_t moves[4];
  uint8_t saved_moves[2 * MAX_COLORS];
} topology_frame_t;

typedef struct {
  uint16_t count, area, width, height, free_count;
  uint16_t neighbors[TOPO_MAX][4], mate[TOPO_MAX];
  uint16_t head[MAX_COLORS], goal[MAX_COLORS], path[MAX_COLORS][TOPO_MAX];
  // Paths grow from both ends of the same buffer and join at one shared vertex.
  uint16_t length[MAX_COLORS], back_length[MAX_COLORS];
  int8_t owner[TOPO_MAX];
  int8_t end_at[TOPO_MAX];
  uint8_t moves[2 * MAX_COLORS];
  topology_frame_t frames[TOPO_MAX];
  uint16_t forced[2 * MAX_COLORS];
  uint16_t complete;
  size_t colors, visits;
  int limit, force_only;
  clock_t started;
} topology_search_t;

static int topo_usable_from(const topology_search_t *s, uint16_t id, int color, int reverse) {
  uint16_t goal = reverse ? s->head[color] : s->goal[color];
  if (id == TOPO_NONE || (s->owner[id] >= 0 && id != goal) ||
      (s->mate[id] != TOPO_NONE && s->owner[s->mate[id]] == color)) return 0;
  return 1;
}

static int topo_usable(const topology_search_t *s, uint16_t id, int color) {
  return topo_usable_from(s, id, color, 0);
}

static void topo_refresh(topology_search_t *s, int color) {
  for (int reverse = 0; reverse < 2; reverse++) {
    uint16_t head = reverse ? s->goal[color] : s->head[color];
    uint8_t moves = 0;
    for (int d = 0; d < 4; d++) {
      uint16_t n = s->neighbors[head][d];
      if ((d & 1) && s->neighbors[head][d ^ 1] == n) continue;
      if (topo_usable_from(s, n, color, reverse)) moves |= 1u << d;
    }
    s->moves[2 * color + reverse] = moves;
  }
}

/* Necessary degree and reachability conditions only; unselected adjacency is
 * allowed. In particular, there is no planar, parity, or same-color touch test. */
static int topo_viable(const topology_search_t *s, uint16_t forced[2 * MAX_COLORS]) {
  memset(forced, 0xff, 2 * MAX_COLORS * sizeof(*forced));
  for (uint16_t id = 0; id < s->count; id++) if (s->owner[id] < 0) {
    int degree = 0;
    for (int d = 0; d < 4; d++) {
      uint16_t n = s->neighbors[id][d];
      // A two-cell wrapped dimension can name the same neighbor twice.
      if ((d & 1) && s->neighbors[id][d ^ 1] == n) continue;
      degree += n != TOPO_NONE && (s->owner[n] < 0 || s->end_at[n] >= 0);
    }
    if (degree < 2) return 0;
    if (degree == 2) {
      // A free vertex with just two possible neighbors must use both edges.
      // If either is an unfinished head, its next move is therefore forced.
      // This also applies to bridge lanes and odd wrapped cycles: no planar
      // or same-color contact assumption is involved.
      for (int d = 0; d < 4; d++) {
        uint16_t n = s->neighbors[id][d];
        int c = n == TOPO_NONE ? -1 : s->end_at[n];
        if (c < 0) continue;
        if (forced[c] != TOPO_NONE && forced[c] != id) return 0;
        forced[c] = id;
      }
    }
  }
  uint8_t seen[TOPO_MAX] = {0};
  uint16_t queue[TOPO_MAX];
  for (int c = 0; c < (int)s->colors; c++) if (!(s->complete & (1u << c))) {
    uint8_t stamp = c + 1;
    size_t read = 0, write = 0;
    queue[write++] = s->head[c]; seen[s->head[c]] = stamp;
    // Reachability needs only a witness, not the entire reachable component.
    while (read < write && seen[s->goal[c]] != stamp) {
      uint16_t id = queue[read++];
      for (int d = 0; d < 4; d++) {
        uint16_t n = s->neighbors[id][d];
        if (n != TOPO_NONE && seen[n] != stamp && topo_usable(s, n, c)) {
          seen[n] = stamp; queue[write++] = n;
        }
      }
    }
    if (seen[s->goal[c]] != stamp) return 0;
  }
  /* A path can cover a free component only when both of its ends can enter.
   * Occupied ends cannot connect two different free components. */
  memset(seen, 0, sizeof(seen));
  for (uint16_t root = 0; root < s->count; root++) if (s->owner[root] < 0 && !seen[root]) {
    size_t read = 0, write = 0; uint16_t starts = 0, goals = 0;
    seen[root] = 1; queue[write++] = root;
    while (read < write) {
      uint16_t id = queue[read++];
      for (int d = 0; d < 4; d++) {
        uint16_t n = s->neighbors[id][d];
        if (n == TOPO_NONE) continue;
        if (s->end_at[n] >= 0) {
          int c = s->owner[n];
          if (n == s->head[c]) starts |= 1u << c;
          if (n == s->goal[c]) goals |= 1u << c;
        }
        if (s->owner[n] < 0 && !seen[n]) { seen[n] = 1; queue[write++] = n; }
      }
    }
    if (!(starts & goals)) return 0;
  }
  return 1;
}

static int topo_choose(const topology_search_t *s, const uint16_t *forced, int *best_out) {
  int chosen = -1, best = 5;
  for (int c = 0; c < (int)s->colors; c++) if (!(s->complete & (1u << c))) {
    // Grow whichever end is more constrained, including forced goal-side moves.
    for (int reverse = 0; reverse < 2; reverse++) {
      int end = 2 * c + reverse;
      uint16_t head = reverse ? s->goal[c] : s->head[c];
      uint8_t mask = s->moves[end];
      if (forced && forced[end] != TOPO_NONE) for (int d = 0; d < 4; d++)
        if (s->neighbors[head][d] != forced[end]) mask &= ~(1u << d);
      int moves = __builtin_popcount((unsigned)mask);
      if (!moves) return -1;
      if (moves < best) { best = moves; chosen = end; }
    }
  }
  *best_out = best;
  return chosen;
}

static int topo_search(topology_search_t *s, unsigned depth) {
  if (++s->visits > TOPO_NODE_LIMIT ||
      ((s->visits & 255u) == 0 && (double)(clock() - s->started) / CLOCKS_PER_SEC > 10.0)) {
    s->limit = 1; return 0;
  }
  if (s->complete == (uint16_t)((1u << s->colors) - 1u)) return s->free_count == 0;
  int best, chosen = topo_choose(s, NULL, &best);
  if (chosen < 0) return 0;
  uint16_t next = TOPO_NONE;
  if (best > 1) {
    if (!topo_viable(s, s->forced)) return 0;
    chosen = topo_choose(s, s->forced, &best);
    if (chosen < 0) return 0;
    next = s->forced[chosen];
  }
  // Finish deterministic covers before allocating the graph probe. A branch
  // unwinds to the original endpoints; it is not an unsatisfiability result.
  if (s->force_only && best > 1) { s->limit = 1; return 0; }
  // With one legal move, a complete cover has to take it. Defer flood fills
  // until the next branch instead of repeating them along every forced lane.
  int reverse = chosen & 1; chosen /= 2;
  uint16_t old_head = reverse ? s->goal[chosen] : s->head[chosen];
  uint16_t target = reverse ? s->head[chosen] : s->goal[chosen];
  topology_frame_t *frame = &s->frames[depth];
  int scores[4], count = 0;
  // Visit tighter cells first; on ties, continue straight. Closing a path last
  // retains the original preference to fill space before finishing.
  for (int d = 0; d < 4; d++) {
    uint16_t n = s->neighbors[old_head][d];
    if ((next != TOPO_NONE && next != n) || !(s->moves[2 * chosen + reverse] & (1u << d))) continue;
    int score = n == target ? 50 : 0;
    if (n != target) for (int e = 0; e < 4; e++) {
      uint16_t adjacent = s->neighbors[n][e];
      score += 10 * (adjacent != TOPO_NONE && (s->owner[adjacent] < 0 || adjacent == target));
    }
    uint16_t length = reverse ? s->back_length[chosen] : s->length[chosen];
    if (length > 1) {
      uint16_t previous = s->path[chosen][reverse ? TOPO_MAX - length + 1 : length - 2];
      if (s->neighbors[old_head][d ^ 1] == previous) --score;
    }
    int at = count++;
    while (at && score < scores[at - 1]) {
      frame->moves[at] = frame->moves[at - 1]; scores[at] = scores[at - 1]; --at;
    }
    frame->moves[at] = n; scores[at] = score;
  }
  for (int i = 0; i < count; i++) {
    uint16_t n = frame->moves[i];
    int finishing = n == target;
    memcpy(frame->saved_moves, s->moves, sizeof(frame->saved_moves));
    if (reverse) { s->goal[chosen] = n; s->path[chosen][TOPO_MAX - 1 - s->back_length[chosen]++] = n; }
    else { s->head[chosen] = n; s->path[chosen][s->length[chosen]++] = n; }
    s->end_at[old_head] = -1;
    if (finishing) { s->complete |= 1u << chosen; s->end_at[n] = -1; }
    else {
      s->owner[n] = chosen; --s->free_count; s->end_at[n] = 2 * chosen + reverse;
      // Only ends adjacent to the newly occupied cell lose a legal move.
      // The moved color also needs its new location and bridge-mate exclusion.
      for (int d = 0; d < 4; d++) {
        uint16_t adjacent = s->neighbors[n][d];
        int end = adjacent == TOPO_NONE ? -1 : s->end_at[adjacent];
        if (end < 0 || end / 2 == chosen) continue;
        for (int e = 0; e < 4; e++) if (s->neighbors[adjacent][e] == n) s->moves[end] &= ~(1u << e);
      }
      topo_refresh(s, chosen);
    }
    if (topo_search(s, depth + 1)) return 1;
    if (finishing) s->complete &= ~(1u << chosen);
    else { s->owner[n] = -1; ++s->free_count; }
    if (reverse) { --s->back_length[chosen]; s->goal[chosen] = old_head; }
    else { --s->length[chosen]; s->head[chosen] = old_head; }
    s->end_at[old_head] = 2 * chosen + reverse;
    s->end_at[n] = finishing ? 2 * chosen + !reverse : -1;
    memcpy(s->moves, frame->saved_moves, sizeof(frame->saved_moves));
    if (s->limit) return 0;
  }
  return 0;
}

static int topo_cover_probe(topology_search_t *s) {
  cover_graph_t *g = calloc(1, sizeof(*g));
  if (!g) return 0;
  g->count = s->count; g->width = s->width;
  memcpy(g->neighbors, s->neighbors, sizeof(g->neighbors));
  memcpy(g->mate, s->mate, sizeof(g->mate));
  for (uint16_t id = 0; id < s->count; id++) {
    g->position[id] = id < s->area ? id : s->mate[id];
    g->endpoint[id] = s->owner[id] == MAX_COLORS ? -2 : s->owner[id];
  }
  // Induced covers are also valid explicit paths and usually prune far more.
  // Try the other diagonal orientation if bounded, then permit self-touching
  // paths. All attempts share one time budget; none of their failures is UNSAT.
  g->induced = 1;
  int solved = cover_probe(g);
  if (!solved && g->limited) { g->transpose = 1; solved = cover_probe(g); }
  if (!solved) { g->induced = 0; solved = cover_probe(g); }
  if (solved) {
    for (int c = 0; c < (int)s->colors; c++) {
      uint16_t id = s->head[c], previous = TOPO_NONE;
      s->length[c] = 0; s->back_length[c] = 1;
      while (1) {
        s->path[c][s->length[c]++] = id;
        if (id == s->goal[c]) break;
        uint16_t next = g->selected[id][0] == previous ? g->selected[id][1] : g->selected[id][0];
        previous = id; id = next;
      }
    }
    s->visits = g->visits;
  }
  free(g); return solved;
}

/* Strict unsigned decimal parser; rejects signs, whitespace, and overflow. */
static int topo_uint(const char **ptr, unsigned *out, char delimiter) {
  const char *p = *ptr; unsigned value = 0;
  if (*p < '0' || *p > '9') return 0;
  do { value = value * 10 + (unsigned)(*p++ - '0'); if (value > TOPO_MAX) return 0; }
  while (*p >= '0' && *p <= '9');
  if (*p++ != delimiter) return 0;
  *ptr = p; *out = value; return 1;
}

EMSCRIPTEN_KEEPALIVE
const char *solve_puzzle_topology_wasm(const char *board_text, const char *topology_text) {
  static char result[65536];
  const char *invalid = "{\"version\":1,\"status\":\"invalid\"}";
  game_info_t info; game_state_t state;
  if (!game_read_buffer(board_text, &info, &state) || !topology_text || strlen(topology_text) > 16384) return invalid;
  topology_search_t *s = calloc(1, sizeof(*s));
  if (!s) return "{\"version\":1,\"status\":\"error\"}";
  uint8_t bridge[MAX_CELLS] = {0}, wall[MAX_CELLS] = {0}, rows[MAX_SIZE] = {0}, cols[MAX_SIZE] = {0};
  int mode = 0, line_index = 0, valid = 1; unsigned records = 0;
  const char *cursor = topology_text;
  while (*cursor && valid) {
    char line[48]; size_t length = 0;
    while (*cursor && *cursor != '\n' && *cursor != '\r') {
      if (length >= sizeof(line) - 1) { valid = 0; break; }
      line[length++] = *cursor++;
    }
    if (!valid) break;
    line[length] = '\0';
    if (*cursor == '\r') { cursor++; if (*cursor != '\n') { valid = 0; break; } }
    if (*cursor == '\n') cursor++;
    if (line_index++ == 0) { valid = !strcmp(line, "V1"); continue; }
    if (line_index == 2) {
      mode = !strcmp(line, "MODE,W") ? 1 : !strcmp(line, "MODE,B") ? 2 : 0;
      valid = mode != 0; continue;
    }
    if (++records > 2 * info.width * info.height + info.width + info.height) { valid = 0; break; }
    unsigned x, y, index; const char *p = line;
    if ((line[0] == 'W' || line[0] == 'B') && line[1] == ',') {
      p += 2;
      if (!topo_uint(&p, &x, ',') || !topo_uint(&p, &y, ',') || !*p || p[1] || x >= info.width || y >= info.height) { valid = 0; break; }
      unsigned id = y * info.width + x;
      if (line[0] == 'B') {
        if (mode != 2 || x == 0 || y == 0 || x + 1 >= info.width || y + 1 >= info.height ||
            state.cells[pos_from_coords(x, y)] || (*p != 'H' && *p != 'V')) { valid = 0; break; }
        uint8_t orientation = *p == 'H' ? 1 : 2;
        if (bridge[id] && bridge[id] != orientation) { valid = 0; break; }
        bridge[id] = orientation;
      } else if (*p == 'R' && x + 1 < info.width) {
        wall[id] |= 1 << DIR_RIGHT; wall[id + 1] |= 1 << DIR_LEFT;
      } else if (*p == 'D' && y + 1 < info.height) {
        wall[id] |= 1 << DIR_DOWN; wall[id + info.width] |= 1 << DIR_UP;
      } else valid = 0;
    } else if (line[0] == 'S' && line[1] == ',' && (line[2] == 'H' || line[2] == 'V') && line[3] == ',') {
      p += 4;
      if (mode != 1 || !topo_uint(&p, &index, '\0') || index >= (line[2] == 'H' ? info.height : info.width)) valid = 0;
      else if (line[2] == 'H') rows[index] = 1;
      else cols[index] = 1;
    } else valid = 0;
  }
  if (!valid || line_index < 2) { free(s); return invalid; }
  s->width = info.width; s->height = info.height; s->area = info.width * info.height; s->count = s->area; s->colors = info.num_colors;
  memset(s->neighbors, 0xff, sizeof(s->neighbors)); memset(s->mate, 0xff, sizeof(s->mate)); memset(s->owner, -1, sizeof(s->owner));
  memset(s->end_at, -1, sizeof(s->end_at));
  uint16_t vertical[MAX_CELLS]; memset(vertical, 0xff, sizeof(vertical));
  for (uint16_t id = 0; id < s->area; id++) {
    int x = id % s->width, y = id / s->width;
    if (info.blocks[pos_from_coords(x, y)]) {
      // A nonnegative owner excludes this slot from free-space search.
      s->owner[id] = MAX_COLORS;
      if ((x == 0 || x + 1 == s->width) && rows[y]) { free(s); return invalid; }
      if ((y == 0 || y + 1 == s->height) && cols[x]) { free(s); return invalid; }
    }
  }
  for (uint16_t id = 0; id < s->area; id++) if (bridge[id]) {
    int x = id % s->width, y = id / s->width;
    if (wall[id] || info.blocks[pos_from_coords(x - 1, y)] || info.blocks[pos_from_coords(x + 1, y)] ||
        info.blocks[pos_from_coords(x, y - 1)] || info.blocks[pos_from_coords(x, y + 1)]) { free(s); return invalid; }
    vertical[id] = s->count++; s->mate[id] = vertical[id]; s->mate[vertical[id]] = id;
  }
  for (uint16_t id = 0; id < s->area; id++) {
    if (s->owner[id] == MAX_COLORS) continue;
    int x = id % s->width, y = id / s->width;
    for (int d = 0; d < 4; d++) {
      if (wall[id] & (1 << d)) continue;
      int nx = x + DIR_DELTA[d][0], ny = y + DIR_DELTA[d][1];
      if (nx < 0 || nx >= s->width) { if (!rows[y]) continue; nx = nx < 0 ? s->width - 1 : 0; }
      if (ny < 0 || ny >= s->height) { if (!cols[x]) continue; ny = ny < 0 ? s->height - 1 : 0; }
      uint16_t neighbor = ny * s->width + nx;
      if (s->owner[neighbor] == MAX_COLORS) continue;
      uint16_t from = bridge[id] && d >= DIR_UP ? vertical[id] : id;
      uint16_t to = bridge[neighbor] && d >= DIR_UP ? vertical[neighbor] : neighbor;
      s->neighbors[from][d] = to;
    }
  }
  for (int c = 0; c < (int)s->colors; c++) {
    int x, y; pos_get_coords(info.init_pos[c], &x, &y); s->head[c] = y * s->width + x;
    pos_get_coords(info.goal_pos[c], &x, &y); s->goal[c] = y * s->width + x;
    s->owner[s->head[c]] = s->owner[s->goal[c]] = c;
    s->path[c][0] = s->head[c]; s->length[c] = 1;
    s->path[c][TOPO_MAX - 1] = s->goal[c]; s->back_length[c] = 1;
    s->end_at[s->head[c]] = 2 * c; s->end_at[s->goal[c]] = 2 * c + 1;
  }
  for (int c = 0; c < (int)s->colors; c++) topo_refresh(s, c);
  s->free_count = s->count - info.num_blocks - 2 * s->colors; s->started = clock();
  s->force_only = 1;
  int solved = topo_search(s, 0), probed = 0;
  if (!solved && s->limit) {
    s->force_only = s->limit = 0; s->visits = 0;
    probed = topo_cover_probe(s);
    s->started = clock();
    solved = probed || topo_search(s, 0);
  }
  size_t used = (size_t)snprintf(result, sizeof(result), "{\"version\":1,\"status\":\"%s\",\"nodeCount\":%zu,\"searchMethod\":\"%s\"", solved ? "solved" : s->limit ? "limit" : "unsatisfiable", s->visits, probed ? "pruned-dfs" : "path-search");
  if (solved) {
    used += (size_t)snprintf(result + used, sizeof(result) - used, ",\"paths\":[");
    for (int c = 0; c < (int)s->colors; c++) {
      used += (size_t)snprintf(result + used, sizeof(result) - used, "%s{\"color\":%d,\"nodes\":[", c ? "," : "", color_dict[info.color_ids[c]].input_char);
      for (uint16_t i = 0; i < s->length[c]; i++) used += (size_t)snprintf(result + used, sizeof(result) - used, "%s%u", i ? "," : "", s->path[c][i]);
      for (uint16_t i = TOPO_MAX - s->back_length[c] + 1; i < TOPO_MAX; i++) used += (size_t)snprintf(result + used, sizeof(result) - used, ",%u", s->path[c][i]);
      used += (size_t)snprintf(result + used, sizeof(result) - used, "]}");
    }
    used += (size_t)snprintf(result + used, sizeof(result) - used, "]");
  }
  snprintf(result + used, sizeof(result) - used, "}");
  free(s); return result;
}
