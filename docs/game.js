// --- 상수 ---
const BOARD_SIZE = 8;
const SQUARE_SIZE = 80; // 화면 크기에 따라 조절 가능 (CSS와 동기화)
const MARGIN = 0; // Canvas 내부의 MARGIN, HTML에서 padding으로 대체했으므로 0으로 설정 가능
const INFO_PANEL_HEIGHT_JS = 100; // CSS에서 설정되지만 JS에서 참조할 수 있음

const WIDTH = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
const CANVAS_HEIGHT = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN; // 캔버스 자체의 높이

// 색상 (CSS 클래스 또는 직접 스타일링으로 대체되거나 JS에서 사용)
const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
const GREY_COLOR = 'rgb(200,200,200)'; // 보드 선
const RED_PIECE_COLOR = 'rgb(200,0,0)';
const BLUE_PIECE_COLOR = 'rgb(0,0,200)';
const HIGHLIGHT_VALID_SRC_COLOR = 'rgba(0,200,0,0.3)';
const HIGHLIGHT_VALID_DST_COLOR = 'rgba(100,255,100,0.5)';
const HIGHLIGHT_SELECTED_COLOR = 'rgba(255,255,0,0.4)';

// 말 상수
const EMPTY = '.';
const PLAYER_R = 'R'; // 사람 (빨강)
const PLAYER_B = 'B'; // AI (파랑)

// 게임 설정
const HUMAN_PLAYER = PLAYER_R;
const AI_PLAYER = PLAYER_B;
const HUMAN_TIME_LIMIT_S = 20;

// --- 전역 변수 ---
let canvas, ctx;
let board;
let currentPlayer;
let selectedPieceCoords = null; // {r, c}
let humanValidMovesFromSelected = [];
let gameOver = false;
let winner = null;
let gameMessage = "";
let turnStartTime;
let lastPlayerPassed = false;
let humanTimerInterval = null;

// DOM 요소 참조
let redScoreTextEl, blueScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl;

// 방향 벡터 (8방향)
const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
const dc = [0, 1, 1, 1, 0, -1, -1, -1];

// --- 게임 로직 함수 ---
function initialBoard() {
    const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    newBoard[0][0] = PLAYER_R;
    newBoard[0][BOARD_SIZE - 1] = PLAYER_B;
    newBoard[BOARD_SIZE - 1][0] = PLAYER_B;
    newBoard[BOARD_SIZE - 1][BOARD_SIZE - 1] = PLAYER_R;
    return newBoard;
}

function inBounds(r, c) {
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}

function opponent(playerColor) {
    return playerColor === PLAYER_R ? PLAYER_B : PLAYER_R;
}

function deepCopy(obj) {
    if (obj === null || typeof obj !== 'object') {
        return obj;
    }
    if (Array.isArray(obj)) {
        return obj.map(deepCopy);
    }
    const copiedObject = {};
    for (const key in obj) {
        if (obj.hasOwnProperty(key)) {
            copiedObject[key] = deepCopy(obj[key]);
        }
    }
    return copiedObject;
}


function isValidMoveOnTempBoard(tempBoard, sr, sc, tr, tc, playerColor) {
    if (!inBounds(sr, sc) || !inBounds(tr, tc)) return false;
    if (tempBoard[sr][sc] !== playerColor) return false;
    if (tempBoard[tr][tc] !== EMPTY) return false;

    const dRow = tr - sr;
    const dCol = tc - sc;
    const absDRow = Math.abs(dRow);
    const absDCol = Math.abs(dCol);
    const step = Math.max(absDRow, absDCol);

    if (!(step >= 1 && step <= 2)) return false; // 1 또는 2칸 이동

    // 직선 또는 대각선 이동 확인
    return (absDRow === step && absDCol === 0) ||
           (absDRow === 0 && absDCol === step) ||
           (absDRow === step && absDCol === step);
}

function applyMoveOnTempBoard(tempBoard, sr, sc, tr, tc, playerColor) {
    const isJump = Math.max(Math.abs(tr - sr), Math.abs(tc - sc)) === 2;
    let flippedCount = 0;

    if (isJump) {
        tempBoard[sr][sc] = EMPTY;
    }
    tempBoard[tr][tc] = playerColor;

    const oppColor = opponent(playerColor);
    for (let i = 0; i < 8; i++) {
        const r = tr + dr[i];
        const c = tc + dc[i];
        if (inBounds(r, c) && tempBoard[r][c] === oppColor) {
            tempBoard[r][c] = playerColor;
            flippedCount++;
        }
    }
    return { flippedCount, isJump }; // AI 로직을 위해 isJump 반환
}

function countPieces(boardState, playerColor) {
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] === playerColor) {
                count++;
            }
        }
    }
    return count;
}

function getValidMoves(boardState, playerColor) {
    const moves = [];
    for (let rStart = 0; rStart < BOARD_SIZE; rStart++) {
        for (let cStart = 0; cStart < BOARD_SIZE; cStart++) {
            if (boardState[rStart][cStart] === playerColor) {
                for (let stepSize = 1; stepSize <= 2; stepSize++) { // 1 (복제) 또는 2 (점프)
                    for (let i = 0; i < 8; i++) { // 8 방향
                        const rTarget = rStart + dr[i] * stepSize;
                        const cTarget = cStart + dc[i] * stepSize;
                        if (isValidMoveOnTempBoard(boardState, rStart, cStart, rTarget, cTarget, playerColor)) {
                            moves.push({ sx: rStart, sy: cStart, tx: rTarget, ty: cTarget, is_jump: stepSize === 2 });
                        }
                    }
                }
            }
        }
    }
    return moves;
}


// --- AI 로직 ---
function aiMoveGenerate(currentBoardState, aiColor) {
    const possibleMoves = getValidMoves(currentBoardState, aiColor);

    if (!possibleMoves.length) {
        return null; // AI 패스
    }

    let bestMoveCandidate = possibleMoves[0];
    let maxScoreAfterOpponentReply = -Infinity;
    let maxImmediateFlipsForBestScore = -1;
    const humanColor = opponent(aiColor);

    for (const move of possibleMoves) {
        let tempBoardAfterMyMove = deepCopy(currentBoardState);
        const { flippedCount: immediateFlips } = applyMoveOnTempBoard(
            tempBoardAfterMyMove,
            move.sx, move.sy, move.tx, move.ty,
            aiColor
        );
        move.immediate_flips = immediateFlips; // 동점 해결을 위해 저장

        const opponentPossibleMoves = getValidMoves(tempBoardAfterMyMove, humanColor);
        let minMyScoreThisBranch = Infinity;

        if (!opponentPossibleMoves.length) { // 상대방(사람)이 응수할 수 없는 경우
            const myScore = countPieces(tempBoardAfterMyMove, aiColor);
            const opponentScore = countPieces(tempBoardAfterMyMove, humanColor);
            minMyScoreThisBranch = myScore - opponentScore;
        } else {
            for (const oppMove of opponentPossibleMoves) {
                let tempBoardAfterOpponentMove = deepCopy(tempBoardAfterMyMove);
                applyMoveOnTempBoard( // 상대방 이동 적용 시 flippedCount는 사용 안 함
                    tempBoardAfterOpponentMove,
                    oppMove.sx, oppMove.sy, oppMove.tx, oppMove.ty,
                    humanColor
                );
                const myScore = countPieces(tempBoardAfterOpponentMove, aiColor);
                const opponentScore = countPieces(tempBoardAfterOpponentMove, humanColor);
                const currentScoreDiff = myScore - opponentScore;
                if (currentScoreDiff < minMyScoreThisBranch) {
                    minMyScoreThisBranch = currentScoreDiff;
                }
            }
        }
        move.score_after_opponent_reply = minMyScoreThisBranch;

        // 결정 로직
        if (move.score_after_opponent_reply > maxScoreAfterOpponentReply) {
            maxScoreAfterOpponentReply = move.score_after_opponent_reply;
            maxImmediateFlipsForBestScore = move.immediate_flips;
            bestMoveCandidate = move;
        } else if (move.score_after_opponent_reply === maxScoreAfterOpponentReply) {
            if (move.immediate_flips > maxImmediateFlipsForBestScore) {
                maxImmediateFlipsForBestScore = move.immediate_flips;
                bestMoveCandidate = move;
            } else if (move.immediate_flips === maxImmediateFlipsForBestScore) {
                if (bestMoveCandidate.is_jump && !move.is_jump) { // 점프보다 복제 선호
                    bestMoveCandidate = move;
                }
            }
        }
    }
    return bestMoveCandidate;
}

// --- 렌더링 함수 ---
function drawBoard() {
    ctx.strokeStyle = GREY_COLOR;
    ctx.lineWidth = 1;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            ctx.strokeRect(MARGIN + c * SQUARE_SIZE, MARGIN + r * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        }
    }
}

function drawPieces() {
    const radius = SQUARE_SIZE / 2 - 8;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            const centerX = MARGIN + c * SQUARE_SIZE + SQUARE_SIZE / 2;
            const centerY = MARGIN + r * SQUARE_SIZE + SQUARE_SIZE / 2;

            // 하이라이트 먼저 그려서 말 아래에 깔리도록
            if (selectedPieceCoords && selectedPieceCoords.r === r && selectedPieceCoords.c === c) {
                ctx.fillStyle = HIGHLIGHT_SELECTED_COLOR;
                ctx.fillRect(MARGIN + c * SQUARE_SIZE, MARGIN + r * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
            }

            if (piece === PLAYER_R) {
                ctx.fillStyle = RED_PIECE_COLOR;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
            } else if (piece === PLAYER_B) {
                ctx.fillStyle = BLUE_PIECE_COLOR;
                ctx.beginPath();
                ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI);
                ctx.fill();
            }
        }
    }

    // 선택된 말의 유효한 목적지 강조 (말 위에 겹쳐서 그려도 됨)
    if (selectedPieceCoords && humanValidMovesFromSelected.length > 0) {
        humanValidMovesFromSelected.forEach(move => {
            const tr = move.tx;
            const tc = move.ty;
            ctx.fillStyle = HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
            // 목적지에 작은 원이나 표시를 추가할 수도 있음
            ctx.beginPath();
            ctx.arc(MARGIN + tc * SQUARE_SIZE + SQUARE_SIZE / 2, MARGIN + tr * SQUARE_SIZE + SQUARE_SIZE / 2, radius / 3, 0, 2*Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();

        });
    }
}

function updateInfoPanel() {
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    redScoreTextEl.textContent = `빨강 (사람): ${rPieces}`;
    blueScoreTextEl.textContent = `파랑 (AI): ${bPieces}`;

    let turnMsg = "게임 종료!";
    if (!gameOver) {
        turnMsg = currentPlayer === HUMAN_PLAYER ? "당신 턴 (빨강)" : "AI 턴 (파랑)";
    }
    currentPlayerTurnTextEl.textContent = turnMsg;
    gameMessageTextEl.textContent = gameMessage;
}

function updateTimerDisplay() {
    if (!gameOver && currentPlayer === HUMAN_PLAYER) {
        const timeElapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        const timeLeft = Math.max(0, HUMAN_TIME_LIMIT_S - timeElapsed);
        timerTextEl.textContent = `남은 시간: ${timeLeft}초`;
        if (timeLeft <= 0) {
            handleHumanTimeout();
        }
    } else {
        timerTextEl.textContent = "";
    }
}

function handleHumanTimeout() {
    clearInterval(humanTimerInterval);
    humanTimerInterval = null;
    gameMessage = "시간 초과! 턴을 넘깁니다.";
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];

    if (lastPlayerPassed) { // 상대방(AI)도 패스한 상태에서 사람 시간 초과 -> 게임 종료
        endGameDueToConsecutivePassOrTimeout("AI 패스 후 사람 시간 초과!");
    } else {
        lastPlayerPassed = true; // 사람이 패스한 것으로 간주 (시간 초과로)
        switchTurn();
    }
    renderGame(); // 메시지 업데이트 즉시 반영
}


// --- 게임 흐름 및 상태 관리 ---
function resetGame() {
    board = initialBoard();
    currentPlayer = HUMAN_PLAYER;
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];
    gameOver = false;
    winner = null;
    gameMessage = "게임을 시작합니다. 당신의 턴입니다.";
    turnStartTime = Date.now();
    lastPlayerPassed = false;

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (currentPlayer === HUMAN_PLAYER) {
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else {
        timerTextEl.textContent = "";
    }
    
    gameOverScreenEl.style.display = 'none';
    renderGame();
}

function switchTurn() {
    currentPlayer = opponent(currentPlayer);
    turnStartTime = Date.now();
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];
    // gameMessage는 AI 턴 시작 시 또는 패스 시 설정됨

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (!gameOver && currentPlayer === HUMAN_PLAYER) {
        gameMessage = "당신의 턴입니다.";
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay(); // 즉시 타이머 업데이트
    } else {
        timerTextEl.textContent = ""; // AI 턴에는 타이머 숨김
    }

    checkForPassOrGameOver(); // 턴 시작 시 패스/종료 여부 확인

    if (!gameOver && currentPlayer === AI_PLAYER) {
        gameMessage = "AI가 생각 중입니다...";
        renderGame(); // "AI 생각 중" 메시지 즉시 표시
        setTimeout(runAiTurn, 800); // AI 생각 시간 시뮬레이션
    }
    renderGame();
}

function runAiTurn() {
    if (gameOver || currentPlayer !== AI_PLAYER) return;

    const aiMove = aiMoveGenerate(board, AI_PLAYER);
    if (aiMove) {
        applyMoveOnTempBoard(board, aiMove.sx, aiMove.sy, aiMove.tx, aiMove.ty, AI_PLAYER);
        gameMessage = `AI 이동: (${aiMove.sx + 1},${aiMove.sy + 1}) → (${aiMove.tx + 1},${aiMove.ty + 1})`;
        lastPlayerPassed = false;
    } else {
        gameMessage = "AI가 움직일 수 없어 패스합니다.";
        if (lastPlayerPassed) { // 사람도 이전에 패스했다면
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 패스!");
            return;
        }
        lastPlayerPassed = true;
    }
    switchTurn(); // AI 턴 종료 후 사람 턴으로
}

function checkForPassOrGameOver() {
    if (gameOver) return;

    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);

    // 1. 말 개수 0개
    if (rPieces === 0) {
        triggerGameOver(PLAYER_B, "빨강 플레이어 말이 없습니다.");
        return;
    }
    if (bPieces === 0) {
        triggerGameOver(PLAYER_R, "파랑 플레이어 말이 없습니다.");
        return;
    }

    // 2. 빈 칸 없음
    const emptyCells = board.flat().filter(cell => cell === EMPTY).length;
    if (emptyCells === 0) {
        endGameDueToBoardFull();
        return;
    }

    // 3. 현재 플레이어가 움직일 수 없는 경우 (checkForPassOrGameOver는 턴 시작 시 호출됨)
    const currentPlayerMoves = getValidMoves(board, currentPlayer);
    if (!currentPlayerMoves.length) {
        if (currentPlayer === HUMAN_PLAYER) gameMessage = "움직일 수 있는 말이 없습니다. 턴이 자동으로 넘어갑니다.";
        // AI의 패스는 runAiTurn에서 처리
        
        if (lastPlayerPassed) { // 이전 플레이어도 패스했다면
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 움직일 수 없습니다!");
        } else {
            lastPlayerPassed = true;
            // AI 턴에서 패스한 경우, 이 함수를 다시 부르지 않고 바로 switchTurn()으로 사람에게 넘어가므로
            // 사람 턴 시작 시 이 로직에 걸려 다시 사람도 패스인지 확인.
            // 현재 플레이어가 사람이고 패스하면, 바로 switchTurn() 호출
            if (currentPlayer === HUMAN_PLAYER) {
                renderGame(); // 패스 메시지 표시
                setTimeout(switchTurn, 1500); // 메시지 볼 시간 주고 턴 넘김
            }
        }
    } else {
        lastPlayerPassed = false; // 현재 플레이어는 움직일 수 있음
    }
}

function triggerGameOver(winPlayer, reason) {
    gameOver = true;
    winner = winPlayer;
    gameMessage = reason;
    if (humanTimerInterval) clearInterval(humanTimerInterval);

    gameOverTitleEl.textContent = winner === "Draw" ? "무승부입니다!" : (winner === HUMAN_PLAYER ? "당신 (빨강) 승리!" : "AI (파랑) 승리!");
    gameOverReasonEl.textContent = reason;
    gameOverScreenEl.style.display = 'flex';
    renderGame();
}

function endGameDueToBoardFull() {
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    let finalWinner;
    if (rPieces > bPieces) finalWinner = PLAYER_R;
    else if (bPieces > rPieces) finalWinner = PLAYER_B;
    else finalWinner = "Draw";
    triggerGameOver(finalWinner, "보드가 가득 찼습니다.");
}

function endGameDueToConsecutivePassOrTimeout(reasonPrefix) {
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    let finalWinner;
    if (rPieces > bPieces) finalWinner = PLAYER_R;
    else if (bPieces > rPieces) finalWinner = PLAYER_B;
    else finalWinner = "Draw";
    triggerGameOver(finalWinner, `${reasonPrefix} 최종 점수로 승패를 결정합니다.`);
}


// --- 이벤트 핸들러 ---
function getClickedSquare(event) {
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;

    if (x >= MARGIN && x < WIDTH - MARGIN && y >= MARGIN && y < CANVAS_HEIGHT - MARGIN) {
        const c = Math.floor((x - MARGIN) / SQUARE_SIZE);
        const r = Math.floor((y - MARGIN) / SQUARE_SIZE);
        if (inBounds(r,c)) return { r, c };
    }
    return null;
}

function handleCanvasClick(event) {
    if (gameOver) {
        resetGame(); // 게임 오버 화면 클릭 시 재시작
        return;
    }
    if (currentPlayer !== HUMAN_PLAYER) return;

    const clickedPos = getClickedSquare(event);
    if (!clickedPos) { // 보드 바깥 클릭
        selectedPieceCoords = null;
        humanValidMovesFromSelected = [];
        gameMessage = "보드 안을 클릭하세요.";
        renderGame();
        return;
    }

    const { r: rClicked, c: cClicked } = clickedPos;

    if (!selectedPieceCoords) { // 첫 번째 클릭: 말 선택
        if (board[rClicked][cClicked] === HUMAN_PLAYER) {
            selectedPieceCoords = { r: rClicked, c: cClicked };
            const allHumanMoves = getValidMoves(board, HUMAN_PLAYER);
            humanValidMovesFromSelected = allHumanMoves.filter(
                m => m.sx === rClicked && m.sy === cClicked
            );
            if (!humanValidMovesFromSelected.length) {
                gameMessage = "이 말은 움직일 수 없습니다.";
                selectedPieceCoords = null; // 이동 불가 시 선택 해제
            } else {
                gameMessage = "선택됨. 목적지를 클릭하세요.";
            }
        } else if (board[rClicked][cClicked] === EMPTY) {
            gameMessage = "빈 칸입니다. 자신의 말을 선택하세요.";
        } else {
            gameMessage = "상대방의 말입니다. 자신의 말을 선택하세요.";
        }
    } else { // 두 번째 클릭: 목적지 선택
        const sr = selectedPieceCoords.r;
        const sc = selectedPieceCoords.c;
        const chosenMove = humanValidMovesFromSelected.find(
            move => move.tx === rClicked && move.ty === cClicked
        );

        if (chosenMove) {
            applyMoveOnTempBoard(board, sr, sc, rClicked, cClicked, HUMAN_PLAYER);
            selectedPieceCoords = null;
            humanValidMovesFromSelected = [];
            gameMessage = ""; // 이동 성공 시 메시지 초기화
            lastPlayerPassed = false; // 이동했으므로 패스 아님
            switchTurn(); // 턴 넘김
        } else {
            // 다른 자신의 말을 클릭했는지 확인 (선택 변경)
            if (board[rClicked][cClicked] === HUMAN_PLAYER) {
                selectedPieceCoords = { r: rClicked, c: cClicked }; // 선택 변경
                const allHumanMoves = getValidMoves(board, HUMAN_PLAYER);
                humanValidMovesFromSelected = allHumanMoves.filter(
                    m => m.sx === rClicked && m.sy === cClicked
                );
                if (!humanValidMovesFromSelected.length) {
                    gameMessage = "이 말은 움직일 수 없습니다. 다른 말을 선택하세요.";
                    selectedPieceCoords = null; 
                } else {
                    gameMessage = "선택 변경됨. 목적지를 클릭하세요.";
                }
            } else { // 빈 칸이나 상대방 말을 목적지로 클릭 (유효하지 않은 이동)
                 gameMessage = "잘못된 목적지입니다. 유효한 위치를 선택하세요.";
            }
        }
    }
    renderGame();
}


// --- 메인 게임 루프 ---
function renderGame() {
    // 캔버스 클리어
    ctx.fillStyle = WHITE_COLOR; // 배경색
    ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);

    drawBoard();
    drawPieces();
    updateInfoPanel(); // 점수, 턴, 메시지 업데이트
}

// --- 초기화 ---
window.onload = function() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    canvas.width = WIDTH;
    canvas.height = CANVAS_HEIGHT;

    // DOM 요소 가져오기
    redScoreTextEl = document.getElementById('redScoreText');
    blueScoreTextEl = document.getElementById('blueScoreText');
    currentPlayerTurnTextEl = document.getElementById('currentPlayerTurnText');
    timerTextEl = document.getElementById('timerText');
    gameMessageTextEl = document.getElementById('gameMessageText');
    gameOverScreenEl = document.getElementById('gameOverScreen');
    gameOverTitleEl = document.getElementById('gameOverTitle');
    gameOverReasonEl = document.getElementById('gameOverReason');

    // 이벤트 리스너
    canvas.addEventListener('click', handleCanvasClick);
    gameOverScreenEl.addEventListener('click', resetGame); // 게임오버 화면 클릭 시 리셋
    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r' && gameOver) {
            resetGame();
        }
    });
    
    // 반응형 SQUARE_SIZE 조정 (선택적)
    // if (window.innerWidth < 768) {
    //     SQUARE_SIZE = 60; // CSS와 동기화 필요
    //     WIDTH = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
    //     CANVAS_HEIGHT = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
    //     canvas.width = WIDTH;
    //     canvas.height = CANVAS_HEIGHT;
    //     document.getElementById('infoPanel').style.width = `${BOARD_SIZE * SQUARE_SIZE}px`;
    // }

    resetGame(); // 게임 시작
    // gameLoop는 requestAnimationFrame 기반이 아니라 이벤트 기반으로 동작.
    // 타이머 업데이트는 setInterval로, 나머지는 이벤트 발생 시 renderGame() 호출.
};