/* Variant graph search. Included by flow_solver.c; shares its color/input contract.
 * This module is covered by the same Matt Zucker CC BY-NC 2.0 exception.
 * It deliberately does not use Standard's packed positions or geometric pruning.
 */
#define TOPO_MAX 450
#define TOPO_NONE UINT16_MAX
#define TOPO_NODE_LIMIT 2000000u

typedef struct {
  uint16_t count, area, width, height, free_count;
  uint16_t neighbors[TOPO_MAX][4], mate[TOPO_MAX];
  uint16_t head[MAX_COLORS], goal[MAX_COLORS], path[MAX_COLORS][TOPO_MAX], length[MAX_COLORS];
  int8_t owner[TOPO_MAX];
  uint16_t complete;
  size_t colors, visits;
  int limit;
  clock_t started;
} topology_search_t;

static int topo_usable(const topology_search_t *s, uint16_t id, int color) {
  return id != TOPO_NONE && (s->owner[id] < 0 || id == s->goal[color]) &&
      (s->mate[id] == TOPO_NONE || s->owner[s->mate[id]] != color);
}

/* Necessary degree and reachability conditions only; unselected adjacency is
 * allowed. In particular, there is no planar, parity, or same-color touch test. */
static int topo_viable(const topology_search_t *s) {
  uint8_t available[TOPO_MAX] = {0};
  for (int c = 0; c < (int)s->colors; c++) if (!(s->complete & (1u << c))) {
    available[s->head[c]] = available[s->goal[c]] = 1;
  }
  for (uint16_t id = 0; id < s->count; id++) if (s->owner[id] < 0) {
    int degree = 0;
    for (int d = 0; d < 4; d++) {
      uint16_t n = s->neighbors[id][d];
      degree += n != TOPO_NONE && (s->owner[n] < 0 || available[n]);
    }
    if (degree < 2) return 0;
  }
  for (int c = 0; c < (int)s->colors; c++) if (!(s->complete & (1u << c))) {
    uint8_t seen[TOPO_MAX] = {0};
    uint16_t queue[TOPO_MAX];
    size_t read = 0, write = 0;
    queue[write++] = s->head[c]; seen[s->head[c]] = 1;
    while (read < write) {
      uint16_t id = queue[read++];
      for (int d = 0; d < 4; d++) {
        uint16_t n = s->neighbors[id][d];
        if (n != TOPO_NONE && !seen[n] && topo_usable(s, n, c)) {
          seen[n] = 1; queue[write++] = n;
        }
      }
    }
    if (!seen[s->goal[c]]) return 0;
  }
  /* Each remaining component needs an unfinished endpoint/head to enter it. */
  uint8_t seen[TOPO_MAX] = {0};
  for (uint16_t root = 0; root < s->count; root++) if (s->owner[root] < 0 && !seen[root]) {
    uint16_t queue[TOPO_MAX]; size_t read = 0, write = 0; int touches = 0;
    seen[root] = 1; queue[write++] = root;
    while (read < write) {
      uint16_t id = queue[read++];
      for (int d = 0; d < 4; d++) {
        uint16_t n = s->neighbors[id][d];
        if (n == TOPO_NONE) continue;
        if (available[n]) touches = 1;
        if (s->owner[n] < 0 && !seen[n]) { seen[n] = 1; queue[write++] = n; }
      }
    }
    if (!touches) return 0;
  }
  return 1;
}

static int topo_search(topology_search_t *s) {
  if (++s->visits > TOPO_NODE_LIMIT ||
      ((s->visits & 255u) == 0 && (double)(clock() - s->started) / CLOCKS_PER_SEC > 10.0)) {
    s->limit = 1; return 0;
  }
  if (s->complete == (uint16_t)((1u << s->colors) - 1u)) return s->free_count == 0;
  if (!topo_viable(s)) return 0;
  int chosen = -1, best = 5;
  for (int c = 0; c < (int)s->colors; c++) if (!(s->complete & (1u << c))) {
    int moves = 0;
    for (int d = 0; d < 4; d++) moves += topo_usable(s, s->neighbors[s->head[c]][d], c);
    if (!moves) return 0;
    if (moves < best) { best = moves; chosen = c; }
  }
  uint16_t old_head = s->head[chosen];
  /* Try filling space before closing a path, so covers are found sooner. */
  for (int pass = 0; pass < 2; pass++) for (int d = 0; d < 4; d++) {
    uint16_t n = s->neighbors[old_head][d];
    if (!topo_usable(s, n, chosen) || (n == s->goal[chosen]) != pass) continue;
    int finishing = n == s->goal[chosen];
    s->head[chosen] = n; s->path[chosen][s->length[chosen]++] = n;
    if (finishing) s->complete |= 1u << chosen;
    else { s->owner[n] = chosen; --s->free_count; }
    if (topo_search(s)) return 1;
    if (finishing) s->complete &= ~(1u << chosen);
    else { s->owner[n] = -1; ++s->free_count; }
    --s->length[chosen]; s->head[chosen] = old_head;
    if (s->limit) return 0;
  }
  return 0;
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
  uint8_t bridge[225] = {0}, wall[225] = {0}, rows[15] = {0}, cols[15] = {0};
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
  uint16_t vertical[225]; memset(vertical, 0xff, sizeof(vertical));
  for (uint16_t id = 0; id < s->area; id++) if (bridge[id]) {
    if (wall[id]) { free(s); return invalid; }
    vertical[id] = s->count++; s->mate[id] = vertical[id]; s->mate[vertical[id]] = id;
  }
  for (uint16_t id = 0; id < s->area; id++) {
    int x = id % s->width, y = id / s->width;
    for (int d = 0; d < 4; d++) {
      if (wall[id] & (1 << d)) continue;
      int nx = x + DIR_DELTA[d][0], ny = y + DIR_DELTA[d][1];
      if (nx < 0 || nx >= s->width) { if (!rows[y]) continue; nx = nx < 0 ? s->width - 1 : 0; }
      if (ny < 0 || ny >= s->height) { if (!cols[x]) continue; ny = ny < 0 ? s->height - 1 : 0; }
      uint16_t neighbor = ny * s->width + nx;
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
  }
  s->free_count = s->count - 2 * s->colors; s->started = clock();
  int solved = topo_search(s);
  size_t used = (size_t)snprintf(result, sizeof(result), "{\"version\":1,\"status\":\"%s\",\"nodeCount\":%zu", solved ? "solved" : s->limit ? "limit" : "unsatisfiable", s->visits);
  if (solved) {
    used += (size_t)snprintf(result + used, sizeof(result) - used, ",\"paths\":[");
    for (int c = 0; c < (int)s->colors; c++) {
      used += (size_t)snprintf(result + used, sizeof(result) - used, "%s{\"color\":%d,\"nodes\":[", c ? "," : "", color_dict[info.color_ids[c]].input_char);
      for (uint16_t i = 0; i < s->length[c]; i++) used += (size_t)snprintf(result + used, sizeof(result) - used, "%s%u", i ? "," : "", s->path[c][i]);
      used += (size_t)snprintf(result + used, sizeof(result) - used, "]}");
    }
    used += (size_t)snprintf(result + used, sizeof(result) - used, "]");
  }
  snprintf(result + used, sizeof(result) - used, "}");
  free(s); return result;
}
