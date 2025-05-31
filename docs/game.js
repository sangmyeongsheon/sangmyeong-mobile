// --- 상수 ---
let BOARD_SIZE = 8;
let SQUARE_SIZE = 80; // 초기값, 동적으로 변경됨
let MARGIN = 0; // HTML에서 padding으로 처리

// 초기 캔버스 크기는 SQUARE_SIZE에 따라 설정됨
let WIDTH;
let CANVAS_HEIGHT;


// 색상
const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
const GREY_COLOR = 'rgb(200,200,200)'; // 보드 선
const RED_PIECE_COLOR = 'rgb(200,0,0)';
const BLUE_PIECE_COLOR = 'rgb(0,0,200)';
const HIGHLIGHT_VALID_DST_COLOR = 'rgba(100,255,100,0.5)'; // 1칸 이동
const HIGHLIGHT_JUMP_DST_COLOR = 'rgba(255,255,0,0.5)'; // 2칸 이동 (새로운 색)
const HIGHLIGHT_SELECTED_COLOR = 'rgba(255,255,0,0.4)';


// 말 상수
const EMPTY = '.';
const PLAYER_R = 'R';
const PLAYER_B = 'B';

// 게임 설정
const HUMAN_PLAYER = PLAYER_R;
const AI_PLAYER = PLAYER_B;
const HUMAN_TIME_LIMIT_S = 20;

// --- 전역 변수 ---
let canvas, ctx;
let board;
let currentPlayer;
let selectedPieceCoords = null;
let humanValidMovesFromSelected = [];
let gameOver = false;
let winner = null;
let gameMessage = "";
let turnStartTime;
let lastPlayerPassed = false;
let humanTimerInterval = null;

// DOM 요소 참조
let redScoreTextEl, blueScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl, restartButtonEl;


const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
const dc = [0, 1, 1, 1, 0, -1, -1, -1];

// --- 화면 크기 조절 함수 ---
function adjustGameSize() {
    const gameContainer = document.getElementById('game-container');
    // game-container의 padding을 고려해야 정확한 가용 너비를 얻을 수 있습니다.
    // 여기서는 간단히 window.innerWidth를 사용합니다.
    const containerPadding = 30; // game-container의 좌우 padding 합 (15px + 15px)
    let availableWidth = window.innerWidth - containerPadding; // 좌우 여백 제외
    if (window.innerWidth > 700) { // 데스크탑 유사 환경 최대 너비 제한
        availableWidth = 680 - containerPadding; // CSS의 max-width와 유사하게
    }


    SQUARE_SIZE = Math.floor(availableWidth / BOARD_SIZE);
    if (SQUARE_SIZE > 80) SQUARE_SIZE = 80; // 최대 정사각형 크기 제한
    if (SQUARE_SIZE < 30) SQUARE_SIZE = 30; // 최소 정사각형 크기 제한


    WIDTH = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
    CANVAS_HEIGHT = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;

    if (canvas) {
        canvas.width = WIDTH;
        canvas.height = CANVAS_HEIGHT;
        // 정보 패널 너비도 동적으로 조절 (선택 사항, CSS로도 가능)
        const infoPanelEl = document.getElementById('infoPanel');
        if (infoPanelEl) {
             infoPanelEl.style.maxWidth = `${WIDTH}px`;
        }
    }
    // 게임이 진행 중이라면 화면 다시 그리기
    if (board && !gameOver) { // 게임이 시작된 이후에만 renderGame 호출
        renderGame();
    }
}


// --- 게임 로직 함수 (이전과 동일, 변경 없음) ---
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
        const r = tr + dr[i];
        const c = tc + dc[i];
        if (inBounds(r, c) && tempBoard[r][c] === oppColor) {
            tempBoard[r][c] = playerColor;
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

// getValidMoves는 is_jump 플래그를 이미 반환하므로 변경 없음
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


// --- AI 로직 (이전과 동일, 변경 없음) ---
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
    const radius = SQUARE_SIZE / 2 - 8; // 말 크기 조절
    if (radius < 5) radius = 5; // 최소 반지름

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
            // 2칸 이동(점프)인지 1칸 이동인지에 따라 다른 색상 적용
            ctx.fillStyle = move.is_jump ? HIGHLIGHT_JUMP_DST_COLOR : HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);

            // 목적지에 작은 원 표시 (선택 사항)
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


// --- 게임 흐름 및 상태 관리 ---
function resetGame() {
    adjustGameSize(); // 리셋 시 게임 크기 다시 조절
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
        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 패스!");
            return;
        }
        lastPlayerPassed = true;
    }
    switchTurn();
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

        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 움직일 수 없습니다!");
        } else {
            lastPlayerPassed = true;
            if (currentPlayer === HUMAN_PLAYER) {
                renderGame();
                setTimeout(switchTurn, 1500);
            }
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
    // 터치 이벤트와 마우스 이벤트 좌표 얻는 방식 통일
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
    // 기본 스크롤 동작 방지 (터치 시 화면 이동 방지)
    // event.preventDefault(); // 필요에 따라 추가. 클릭 이벤트에서는 보통 불필요.

    if (gameOver) {
        resetGame();
        return;
    }
    if (currentPlayer !== HUMAN_PLAYER) return;

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
            switchTurn();
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


// --- 메인 게임 루프 (렌더링) ---
function renderGame() {
    if (!ctx) return; // 아직 초기화되지 않았다면 실행하지 않음
    ctx.fillStyle = WHITE_COLOR;
    ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);

    drawBoard();
    drawPieces();
    updateInfoPanel();
}

// --- 초기화 ---
window.onload = function() {
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');

    redScoreTextEl = document.getElementById('redScoreText');
    blueScoreTextEl = document.getElementById('blueScoreText');
    currentPlayerTurnTextEl = document.getElementById('currentPlayerTurnText');
    timerTextEl = document.getElementById('timerText');
    gameMessageTextEl = document.getElementById('gameMessageText');
    gameOverScreenEl = document.getElementById('gameOverScreen');
    gameOverTitleEl = document.getElementById('gameOverTitle');
    gameOverReasonEl = document.getElementById('gameOverReason');
    restartButtonEl = document.getElementById('restartButton'); // Restart 버튼 DOM 요소

    // 화면 크기 조절 및 초기 게임 설정
    adjustGameSize(); // 최초 로드 시 크기 조절
    resetGame(); // 게임 상태 초기화 및 첫 렌더링

    // 이벤트 리스너
    // 모바일 터치와 데스크탑 마우스 클릭 모두 지원
    canvas.addEventListener('click', handleCanvasInteraction);
    // canvas.addEventListener('touchstart', handleCanvasInteraction, { passive: false }); // 스크롤 방지가 필요하다면 passive: false


    gameOverScreenEl.addEventListener('click', resetGame);
    restartButtonEl.addEventListener('click', resetGame); // Restart 버튼에 resetGame 함수 연결

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r' && (gameOver || !gameOver)) { // 언제든 R키로 리셋 가능하도록
            resetGame();
        }
    });

    window.addEventListener('resize', () => {
        adjustGameSize();
        renderGame(); // 리사이즈 후 즉시 다시 그리기
    });
};