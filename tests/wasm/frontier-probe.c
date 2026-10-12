/* Private adapter for the actual Classic probe. Never part of the web build. */
#include "../../native/flow_solver.c"

EMSCRIPTEN_KEEPALIVE
const char *test_frontier(const char *input, const char *walls) {
  static char output[4096];
  game_info_t info; game_state_t initial, final;
  if (!game_read_buffer(input, &info, &initial) || !game_read_walls(walls, &info)) return "null";
  game_build_neighbors(&info);
  if (!game_diagonal_probe(&info, &initial, &final, clock())) return "null";
  game_format_solution(output, &info, &final);
  return output;
}
