from collections import deque
import heapq
import time
import os

def findPairs(board, number):
    startCell = None
    endCell = None
    for i in range(len(board)):
        for j in range(len(board[i])):
            if board[i][j] == number:
                if startCell is None:
                    startCell = (i, j)
                else:
                    endCell = (i, j)
                    return startCell, endCell 
    return startCell, endCell

def a_star(board, start, end):
    n = len(board)
    directions = [(-1, 0), (1, 0), (0, -1), (0, 1)]
    visited = [[False] * n for _ in range(n)]
    priority_queue = []
    heapq.heappush(priority_queue, (0, 0, start, [start])) 
    visited[start[0]][start[1]] = True
    
    while priority_queue:
        f, g, current_position, path = heapq.heappop(priority_queue)
        x, y = current_position

        for dx, dy in directions:
            nx, ny = x + dx, y + dy
            
            if 0 <= nx < n and 0 <= ny < n and not visited[nx][ny]:
                if (nx, ny) == end:
                    return g + 1  # Return the distance including the end cell
                if board[nx][ny] == 0:  
                    visited[nx][ny] = True
                    g_new = g + 1  # Increment the distance
                    h_new = abs(nx - end[0]) + abs(ny - end[1])  # Manhattan distance heuristic
                    f_new = g_new + h_new 
                    heapq.heappush(priority_queue, (f_new, g_new, (nx, ny), path + [(nx, ny)]))

    return float('inf') 

def ApplyPath(board, path, number):
    for x, y in path:
        board[x][y] = number
    return board

def lookaheadHeuristics(board, pairs, current_number):
    #n = len(board)

    for number in range(current_number, len(pairs) + 1):
        startCell, endCell = pairs[number]
        if startCell and endCell:
            minDist = a_star(board, startCell, endCell)
            if minDist == float('inf'):
                return float('inf') 

    return None

def explorePathsForNumber(board, sumPath, number, pairs, node_count):
    startCell = pairs[number][0]
    endCell = pairs[number][1]
    minDist = a_star(board, startCell, endCell)
    if minDist == float('inf'):
        return None, node_count

    lookAhead = lookaheadHeuristics(board, pairs, number + 1)
    if lookAhead == float('inf'):
        return None, node_count
    
    

    queue = deque([(startCell, [startCell])])
    visitedPaths = set()
   
    while queue:
        curPos, path = queue.popleft()
        
        if curPos == endCell:
            if minDist <= len(path):
                pathTuple = tuple(path)
                if pathTuple not in visitedPaths:
                    visitedPaths.add(pathTuple)
                    boardCopy = [row[:] for row in board]
                    boardCopy = ApplyPath(boardCopy, path, number)
                    
                    #os.system('clear')
                    #for row in boardCopy: print(''.join(f'\033[9{cell % 7 + 1}m{cell:2}\033[0m' if cell != 0 else f'{cell:2}' for cell in row))
                   

                    node_count += 1

                    nextNum = number + 1   
                    if nextNum:
                        newSumPath = sumPath + len(path)
                        if newSumPath == len(board) ** 2:
                            return boardCopy, node_count

                        result, node_count = explorePathsForNumber(boardCopy, newSumPath, nextNum, pairs, node_count) 
                        
                        if result:
                            return result, node_count
            
        for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
            nx, ny = curPos[0] + dx, curPos[1] + dy
            if 0 <= nx < len(board) and 0 <= ny < len(board[0]) and (nx, ny) not in path:
                if board[nx][ny] == 0 or (nx, ny) == endCell:
                    if len(path) == 1 or len(path) == len(path) - 1 or sum((nx + dx, ny + dy) in path for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]) <= 1:
                        queue.append(((nx, ny), path + [(nx, ny)]))

    return None, node_count

def solveBoard(board):
    start_time = time.time()
    #n = len(board)
    #minDists = {}
    #minDistSum = 0  # not counting the start and end cells
    pairs = {}
    sumPath = 0
    node_count = 0

    maxNum = max(max(row) for row in board)
    for number in range(1, maxNum + 1):
        startCell, endCell = findPairs(board, number)
        pairs[number] = (startCell, endCell)
        #if startCell and endCell:
            #minDist = a_star(board, startCell, endCell)
            #minDists[number] = minDist
            #minDistSum += minDist

    firstNum = 1
    
    final_board, node_count = explorePathsForNumber(board, sumPath, firstNum, pairs, node_count)
    end_time = time.time()

    os.system('clear')
    if final_board:
        for row in final_board:
            print(''.join(f'\033[9{cell % 7 + 1}m{cell:2}\033[0m' if cell != 0 else f'{cell:2}' for cell in row))
    else:
        print("No solution found.")
    print(f"Final time: {end_time - start_time:.3f} sec")
    # print(f"Number of nodes created: {node_count}")

board = [ 
    [1, 0, 0, 0],
    [2, 0, 3, 0],
    [0, 3, 2, 0],
    [0, 0, 0, 1]
] 


board1 = [
    [1, 0, 0, 0, 1],
    [0, 0, 0, 0, 0],
    [0, 4, 3, 0, 2],
    [0, 0, 0, 0, 3],
    [0, 2, 0, 0, 4],
]

board2 = [
    [0, 0, 0, 0, 0, 1],
    [0, 0, 0, 0, 0, 0],
    [0, 3, 4, 0, 0, 0],
    [0, 0, 0, 5, 0, 3],
    [0, 5, 0, 1, 4, 2],
    [0, 0, 0, 2, 0, 0],
]

board3 = [
    [0, 0, 0, 1, 0, 0, 0, 0],
    [0, 2, 0, 0, 3, 4, 5, 0],
    [0, 0, 0, 0, 2, 0, 0, 0],
    [0, 4, 0, 0, 0, 0, 0, 0],
    [0, 0, 7, 6, 8, 0, 0, 0],
    [0, 0, 0, 0, 7, 8, 0, 0],
    [0, 0, 6, 0, 0, 0, 0, 0],
    [3, 0, 0, 0, 5, 0, 1, 0],
]

board4 = [ # 53.324772119522095 seconds => 1.2489380836486816 seconds (37215 nodes)
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

board7 = [ 
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
    [0, 1, 2, 3, 0, 0, 0, 0, 0],
    [0, 0, 0, 2, 4, 0, 4, 3, 0],
    [0, 0, 0, 0, 0, 0, 0, 5, 0],
    [0, 9, 0, 9, 1, 0, 0, 0, 0],
    [6, 5, 0, 0, 0, 0, 0, 8, 7],
    [0, 7, 6, 0, 0, 0, 0, 0, 0],
    [0, 8, 0, 0, 0, 0, 0, 0, 0],
    [0, 0, 0, 0, 0, 0, 0, 0, 0],
]

solveBoard(board1)

