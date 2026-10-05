from z3 import Solver, Sum, Int, If, Or, sat
import time

def solve(board, n):
    M = n
    N = n
    B = [[Int(f'B_{i}_{j}') for j in range(N)] for i in range(M)]

    s = Solver()

    for i in range(M):
        for j in range(N):
            if board[i][j] > 0:
                s.add(B[i][j] == board[i][j])
            else:
                s.add(B[i][j] > 0)

    for i in range(M):
        for j in range(N):
            neighs = Sum([If(B[i][j] == B[k][l], 1, 0)
                                  for k in range(M) 
                                    for l in range(N) 
                                        if abs(k - i) + abs(l - j) == 1])  # Manhattan distance
            
            if board[i][j] > 0:
                s.add(neighs == 1)
            else:
                s.add(Or(neighs == 2, B[i][j] == 0))

    if s.check() == sat:
        m = s.model()
        solved_board = [[m[B[i][j]].as_long() for j in range(N)] for i in range(M)]
        return solved_board
    else:
        print('cant be solve')
        return None

def display_matrix(matrix):
    for row in matrix:
        print(''.join(f'\033[9{cell % 7 + 1}m{cell:2}\033[0m' if cell != 0 else f'{cell:2}' for cell in row))

board = [
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 2, 0, 0, 0, 0],
    [3, 4, 5, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 5, 4, 6, 0, 0, 0],
    [0, 0, 0, 0, 0, 2, 0, 0, 0],
    [3, 0, 0, 7, 0, 0, 0, 0, 0],
    [7, 0, 8, 1, 0, 0, 0, 0, 0],
    [8, 0, 0, 6, 0, 0, 9, 0, 9]
]

board1 = [
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 2, 0, 0, 3, 4, 5, 0],
    [0, 0, 0, 0, 2, 0, 0, 0],
    [0, 4, 0, 0, 0, 0, 0, 0],
    [0, 0, 7, 6, 8, 0, 0, 0],
    [0, 0, 0, 0, 7, 8, 0, 0],
    [0, 0, 6, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 5, 0, 1, 0],
]

board4 = [ # unsolvable
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 3, 0, 0],
    [0, 0, 0, 4, 0, 0, 0, 2],
    [0, 3, 0, 0, 5, 0, 0, 1],
    [0, 0, 0, 0, 0, 0, 0, 2],
    [4, 0, 0, 0, 0, 0, 0, 5],
]

board5 = [
    [1, 0, 2, 0, 5],
    [0, 0, 3, 0, 4],
    [0, 0, 0, 0, 0],
    [0, 2, 0, 5, 0],
    [0, 1, 3, 4, 0],
]

start_time = time.time()
solved_board = solve(board5, len(board5))
end_time = time.time() 
print('Solved: ')
display_matrix(solved_board)
print(f"Final time: {end_time - start_time:.3f} sec")