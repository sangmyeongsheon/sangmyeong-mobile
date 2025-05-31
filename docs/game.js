// --- 상수 (이전과 동일) ---
let BOARD_SIZE = 8;
let SQUARE_SIZE = 80;
let MARGIN = 0;

let WIDTH;
let CANVAS_HEIGHT;

const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
// ... (다른 상수들 이전과 동일) ...
const HIGHLIGHT_JUMP_DST_COLOR = 'rgba(255,255,0,0.5)';


// --- 전역 변수 (이전과 동일) ---
let canvas, ctx;
let board;
// ... (다른 전역 변수들 이전과 동일) ...
let humanTimerInterval = null;

// DOM 요소 참조
let redScoreTextEl, blueScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl, restartButtonEl;
let showRulesButtonEl, rulesModalEl, modalCloseButtonEl; // 룰 모달 관련 DOM 요소 추가


// --- 화면 크기 조절 함수 (이전과 동일) ---
function adjustGameSize() {
    // ... (이전 코드와 동일) ...
    const gameContainer = document.getElementById('game-container');
    const containerPadding = parseInt(window.getComputedStyle(gameContainer).paddingLeft) * 2 || 30;
    let availableWidth = window.innerWidth - containerPadding;
    if (window.innerWidth > 700) {
        availableWidth = 680 - containerPadding;
    }

    SQUARE_SIZE = Math.floor(availableWidth / BOARD_SIZE);
    if (SQUARE_SIZE > 80) SQUARE_SIZE = 80;
    if (SQUARE_SIZE < 30) SQUARE_SIZE = 30;

    WIDTH = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
    CANVAS_HEIGHT = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;

    if (canvas) {
        canvas.width = WIDTH;
        canvas.height = CANVAS_HEIGHT;
        const infoPanelEl = document.getElementById('infoPanel');
        if (infoPanelEl) {
             infoPanelEl.style.maxWidth = `${WIDTH}px`;
        }
    }
    if (board && ctx) { // ctx가 초기화된 후에만 renderGame 호출
        renderGame();
    }
}


// --- 게임 로직 함수들 (initialBoard, inBounds, opponent, deepCopy, isValidMoveOnTempBoard, applyMoveOnTempBoard, countPieces, getValidMoves, aiMoveGenerate - 이전과 동일) ---
// ... (이전 코드와 동일하게 유지) ...
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

    if (!(step >= 1 && step <= 2)) return false;

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
        const r_adj = tr + dr[i]; // 변수명 충돌 피하기 위해 r -> r_adj
        const c_adj = tc + dc[i]; // 변수명 충돌 피하기 위해 c -> c_adj
        if (inBounds(r_adj, c_adj) && tempBoard[r_adj][c_adj] === oppColor) {
            tempBoard[r_adj][c_adj] = playerColor;
            flippedCount++;
        }
    }
    return { flippedCount, isJump };
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
                for (let stepSize = 1; stepSize <= 2; stepSize++) {
                    for (let i = 0; i < 8; i++) {
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

function aiMoveGenerate(currentBoardState, aiColor) {
    const possibleMoves = getValidMoves(currentBoardState, aiColor);

    if (!possibleMoves.length) {
        return null;
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
        move.immediate_flips = immediateFlips;

        const opponentPossibleMoves = getValidMoves(tempBoardAfterMyMove, humanColor);
        let minMyScoreThisBranch = Infinity;

        if (!opponentPossibleMoves.length) {
            const myScore = countPieces(tempBoardAfterMyMove, aiColor);
            const opponentScore = countPieces(tempBoardAfterMyMove, humanColor);
            minMyScoreThisBranch = myScore - opponentScore;
        } else {
            for (const oppMove of opponentPossibleMoves) {
                let tempBoardAfterOpponentMove = deepCopy(tempBoardAfterMyMove);
                applyMoveOnTempBoard(
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

        if (move.score_after_opponent_reply > maxScoreAfterOpponentReply) {
            maxScoreAfterOpponentReply = move.score_after_opponent_reply;
            maxImmediateFlipsForBestScore = move.immediate_flips;
            bestMoveCandidate = move;
        } else if (move.score_after_opponent_reply === maxScoreAfterOpponentReply) {
            if (move.immediate_flips > maxImmediateFlipsForBestScore) {
                maxImmediateFlipsForBestScore = move.immediate_flips;
                bestMoveCandidate = move;
            } else if (move.immediate_flips === maxImmediateFlipsForBestScore) {
                if (bestMoveCandidate.is_jump && !move.is_jump) {
                    bestMoveCandidate = move;
                }
            }
        }
    }
    return bestMoveCandidate;
}


// --- 렌더링 함수들 (drawBoard, drawPieces, updateInfoPanel, updateTimerDisplay, handleHumanTimeout - 이전과 동일 또는 약간 수정) ---
// ... (이전 코드와 동일하게 유지, drawPieces는 이미 수정됨) ...
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
    let radius = SQUARE_SIZE / 2 - 8;
    if (radius < 5) radius = 5;

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            const centerX = MARGIN + c * SQUARE_SIZE + SQUARE_SIZE / 2;
            const centerY = MARGIN + r * SQUARE_SIZE + SQUARE_SIZE / 2;

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

    if (selectedPieceCoords && humanValidMovesFromSelected.length > 0) {
        humanValidMovesFromSelected.forEach(move => {
            const tr = move.tx;
            const tc = move.ty;
            ctx.fillStyle = move.is_jump ? HIGHLIGHT_JUMP_DST_COLOR : HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);

            ctx.beginPath();
            let smallRadius = radius / 3;
            if (smallRadius < 2) smallRadius = 2;
            ctx.arc(MARGIN + tc * SQUARE_SIZE + SQUARE_SIZE / 2, MARGIN + tr * SQUARE_SIZE + SQUARE_SIZE / 2, smallRadius, 0, 2 * Math.PI);
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

    if (lastPlayerPassed) {
        endGameDueToConsecutivePassOrTimeout("AI 패스 후 사람 시간 초과!");
    } else {
        lastPlayerPassed = true;
        switchTurn();
    }
    renderGame();
}


// --- 게임 흐름 및 상태 관리 함수들 (resetGame, switchTurn, runAiTurn, checkForPassOrGameOver, triggerGameOver, endGameDueToBoardFull, endGameDueToConsecutivePassOrTimeout - 이전과 동일) ---
// ... (이전 코드와 동일하게 유지) ...
function resetGame() {
    // adjustGameSize는 window.onload와 resize에서 호출되므로, 여기서는 호출하지 않거나,
    // resetGame 호출 시 항상 현재 크기에 맞추고 싶다면 호출할 수 있습니다.
    // adjustGameSize(); // 필요시 주석 해제
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
    if (currentPlayer === HUMAN_PLAYER && !gameOver) { // gameOver가 아닐 때만 타이머 시작
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else {
        timerTextEl.textContent = "";
    }

    gameOverScreenEl.style.display = 'none';
    rulesModalEl.style.display = 'none'; // 룰 모달도 숨김
    renderGame();
}

function switchTurn() {
    currentPlayer = opponent(currentPlayer);
    turnStartTime = Date.now();
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (!gameOver && currentPlayer === HUMAN_PLAYER) {
        gameMessage = "당신의 턴입니다.";
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else {
        timerTextEl.textContent = "";
    }

    checkForPassOrGameOver();

    if (!gameOver && currentPlayer === AI_PLAYER) {
        gameMessage = "AI가 생각 중입니다...";
        renderGame();
        setTimeout(runAiTurn, 800);
    } else { // 사람 턴이거나 게임 종료 시 즉시 렌더링
       renderGame();
    }
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
        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 패스!");
            return; // 게임 종료이므로 switchTurn 호출 안 함
        }
        lastPlayerPassed = true;
    }
    if (!gameOver) switchTurn(); // 게임이 종료되지 않았을 때만 턴 전환
}

function checkForPassOrGameOver() {
    if (gameOver) return;

    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);

    if (rPieces === 0) {
        triggerGameOver(PLAYER_B, "빨강 플레이어 말이 없습니다.");
        return;
    }
    if (bPieces === 0) {
        triggerGameOver(PLAYER_R, "파랑 플레이어 말이 없습니다.");
        return;
    }

    const emptyCells = board.flat().filter(cell => cell === EMPTY).length;
    if (emptyCells === 0) {
        endGameDueToBoardFull();
        return;
    }

    const currentPlayerMoves = getValidMoves(board, currentPlayer);
    if (!currentPlayerMoves.length) {
        if (currentPlayer === HUMAN_PLAYER) gameMessage = "움직일 수 있는 말이 없습니다. 턴이 자동으로 넘어갑니다.";
        // AI 패스는 runAiTurn에서 gameMessage 설정

        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 움직일 수 없습니다!");
        } else {
            lastPlayerPassed = true;
            if (currentPlayer === HUMAN_PLAYER) { // 사람 플레이어가 패스하는 경우
                renderGame(); // 메시지 표시
                setTimeout(() => { // 메시지 확인 후 턴 넘김
                    if (!gameOver) switchTurn(); // 게임오버가 중간에 발생하지 않았다면 턴 넘김
                }, 1500);
            }
            // AI가 패스하는 경우는 runAiTurn에서 처리 후 switchTurn() 호출
        }
    } else {
        lastPlayerPassed = false;
    }
}

function triggerGameOver(winPlayer, reason) {
    gameOver = true;
    winner = winPlayer;
    gameMessage = reason;
    if (humanTimerInterval) clearInterval(humanTimerInterval);
    timerTextEl.textContent = ""; // 게임 종료 시 타이머 텍스트 지우기

    gameOverTitleEl.textContent = winner === "Draw" ? "무승부입니다!" : (winner === HUMAN_PLAYER ? "당신 (빨강) 승리!" : "AI (파랑) 승리!");
    gameOverReasonEl.textContent = reason;
    gameOverScreenEl.style.display = 'flex';
    renderGame(); // 최종 상태 렌더링
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


// --- 이벤트 핸들러들 (getClickedSquare, handleCanvasInteraction - 이전과 동일) ---
// ... (이전 코드와 동일하게 유지) ...
function getClickedSquare(event) {
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;

    const x = clientX - rect.left;
    const y = clientY - rect.top;

    if (x >= MARGIN && x < WIDTH - MARGIN && y >= MARGIN && y < CANVAS_HEIGHT - MARGIN) {
        const c = Math.floor((x - MARGIN) / SQUARE_SIZE);
        const r = Math.floor((y - MARGIN) / SQUARE_SIZE);
        if (inBounds(r,c)) return { r, c };
    }
    return null;
}

function handleCanvasInteraction(event) {
    if (gameOver && rulesModalEl.style.display === 'none') { // 룰 모달이 안떠있을 때만 게임오버 화면 클릭으로 리셋
        resetGame();
        return;
    }
    if (currentPlayer !== HUMAN_PLAYER || gameOver) return; // 게임 진행중 사람 턴일 때만

    const clickedPos = getClickedSquare(event);
    if (!clickedPos) {
        selectedPieceCoords = null;
        humanValidMovesFromSelected = [];
        gameMessage = "보드 안을 클릭하세요.";
        renderGame();
        return;
    }

    const { r: rClicked, c: cClicked } = clickedPos;

    if (!selectedPieceCoords) {
        if (board[rClicked][cClicked] === HUMAN_PLAYER) {
            selectedPieceCoords = { r: rClicked, c: cClicked };
            const allHumanMoves = getValidMoves(board, HUMAN_PLAYER);
            humanValidMovesFromSelected = allHumanMoves.filter(
                m => m.sx === rClicked && m.sy === cClicked
            );
            if (!humanValidMovesFromSelected.length) {
                gameMessage = "이 말은 움직일 수 없습니다.";
                selectedPieceCoords = null;
            } else {
                gameMessage = "선택됨. 목적지를 클릭하세요.";
            }
        } else if (board[rClicked][cClicked] === EMPTY) {
            gameMessage = "빈 칸입니다. 자신의 말을 선택하세요.";
        } else {
            gameMessage = "상대방의 말입니다. 자신의 말을 선택하세요.";
        }
    } else {
        const sr = selectedPieceCoords.r;
        const sc = selectedPieceCoords.c;
        const chosenMove = humanValidMovesFromSelected.find(
            move => move.tx === rClicked && move.ty === cClicked
        );

        if (chosenMove) {
            applyMoveOnTempBoard(board, sr, sc, rClicked, cClicked, HUMAN_PLAYER);
            selectedPieceCoords = null;
            humanValidMovesFromSelected = [];
            gameMessage = "";
            lastPlayerPassed = false;
            switchTurn(); // 여기서 renderGame()이 호출됨
            return; // 이동 후 추가 렌더링 방지
        } else {
            if (board[rClicked][cClicked] === HUMAN_PLAYER) {
                selectedPieceCoords = { r: rClicked, c: cClicked };
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
            } else {
                 gameMessage = "잘못된 목적지입니다. 유효한 위치를 선택하세요.";
            }
        }
    }
    renderGame();
}


// --- 메인 게임 루프 (렌더링 함수) ---
function renderGame() {
    if (!ctx) return;
    ctx.fillStyle = WHITE_COLOR;
    ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);

    drawBoard();
    drawPieces();
    updateInfoPanel();
}

// --- 초기화 ---
window.onload = function() {
    canvas = document.getElementById('gameCanvas');
    // ctx는 adjustGameSize 또는 resetGame에서 설정될 수 있으므로, null 체크 후 사용
    // ctx = canvas.getContext('2d'); // 여기서 바로 할당해도 무방

    redScoreTextEl = document.getElementById('redScoreText');
    blueScoreTextEl = document.getElementById('blueScoreText');
    currentPlayerTurnTextEl = document.getElementById('currentPlayerTurnText');
    timerTextEl = document.getElementById('timerText');
    gameMessageTextEl = document.getElementById('gameMessageText');
    gameOverScreenEl = document.getElementById('gameOverScreen');
    gameOverTitleEl = document.getElementById('gameOverTitle');
    gameOverReasonEl = document.getElementById('gameOverReason');
    restartButtonEl = document.getElementById('restartButton');
    showRulesButtonEl = document.getElementById('showRulesButton');
    rulesModalEl = document.getElementById('rulesModal');
    modalCloseButtonEl = document.querySelector('#rulesModal .modal-close-button');


    adjustGameSize(); // 여기서 canvas.getContext('2d') 호출될 수 있음
    if (!ctx && canvas) ctx = canvas.getContext('2d'); // adjustGameSize 후에도 ctx가 없을 경우 대비
    resetGame();

    // 이벤트 리스너
    canvas.addEventListener('click', handleCanvasInteraction);
    // canvas.addEventListener('touchstart', handleCanvasInteraction); // 필요시 터치 이벤트 추가

    gameOverScreenEl.addEventListener('click', () => {
        if(rulesModalEl.style.display === 'none') resetGame(); // 룰 모달이 꺼져있을때만 리셋
    });
    restartButtonEl.addEventListener('click', resetGame);

    showRulesButtonEl.addEventListener('click', () => {
        rulesModalEl.style.display = 'flex';
    });
    modalCloseButtonEl.addEventListener('click', () => {
        rulesModalEl.style.display = 'none';
    });
    rulesModalEl.addEventListener('click', (event) => { // 모달 배경 클릭 시 닫기
        if (event.target === rulesModalEl) {
            rulesModalEl.style.display = 'none';
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r') {
            resetGame();
        }
        if (event.key === "Escape" && rulesModalEl.style.display === 'flex') { // ESC로 룰 모달 닫기
            rulesModalEl.style.display = 'none';
        }
    });

    window.addEventListener('resize', () => {
        adjustGameSize();
        // renderGame()은 adjustGameSize 내부에서 호출됨
    });
};