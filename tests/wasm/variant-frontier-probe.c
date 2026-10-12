/* Private direct-probe adapter: production C, with no fallback. */
#include "../../native/flow_solver.c"

EMSCRIPTEN_KEEPALIVE
const char *test_variant_frontier(const char *text, int induced, int transpose) {
  static char out[32768];
  cover_graph_t *g = calloc(1, sizeof(*g));
  if (!g) return "null";
  int count, width, used = 0;
  if (sscanf(text, "%d %d%n", &count, &width, &used) != 2 || count < 1 || count > COVER_MAX || width < 1 || width > MAX_SIZE) { free(g); return "null"; }
  text += used; g->count = count; g->width = width; g->induced = induced; g->transpose = transpose;
  for (int id = 0; id < count; id++) {
    int endpoint, position, mate, n[4];
    if (sscanf(text, "%d %d %d %d %d %d %d%n", &endpoint, &position, &mate, &n[0], &n[1], &n[2], &n[3], &used) != 7) { free(g); return "null"; }
    text += used; g->endpoint[id] = endpoint; g->position[id] = position;
    g->mate[id] = mate < 0 ? INVALID_POS : mate;
    for (int d = 0; d < 4; d++) g->neighbors[id][d] = n[d] < 0 ? INVALID_POS : n[d];
  }
  int solved = variant_frontier_probe(g);
  size_t at = snprintf(out, sizeof(out), "{\"solved\":%s,\"limited\":%s,\"visits\":%zu", solved ? "true" : "false", g->limited ? "true" : "false", g->visits);
  if (solved) {
    at += snprintf(out + at, sizeof(out) - at, ",\"owner\":[");
    for (int id = 0; id < count; id++) at += snprintf(out + at, sizeof(out) - at, "%s%d", id ? "," : "", g->endpoint[id] == -2 ? -2 : g->owner[id]);
    at += snprintf(out + at, sizeof(out) - at, "],\"selected\":[");
    for (int id = 0; id < count; id++) {
      int a = g->selected[id][0], b = g->selected[id][1];
      at += snprintf(out + at, sizeof(out) - at, "%s[%d,%d]", id ? "," : "", a == INVALID_POS || g->endpoint[id] == -2 ? -1 : a, b == INVALID_POS || g->endpoint[id] == -2 ? -1 : b);
    }
    at += snprintf(out + at, sizeof(out) - at, "]");
  }
  snprintf(out + at, sizeof(out) - at, "}");
  free(g); return out;
}
