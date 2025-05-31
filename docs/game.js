// --- 상수 ---
let BOARD_SIZE = 8;
let SQUARE_SIZE = 80; // 초기값, 동적으로 변경됨
let MARGIN = 0;

let WIDTH; // 동적 계산
let CANVAS_HEIGHT; // 동적 계산

const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
const GREY_COLOR = 'rgb(200,200,200)';
const RED_PIECE_COLOR = 'rgb(200,0,0)';
const BLUE_PIECE_COLOR = 'rgb(0,0,200)';
const HIGHLIGHT_VALID_DST_COLOR = 'rgba(100,255,100,0.5)'; // 1칸 이동
const HIGHLIGHT_JUMP_DST_COLOR = 'rgba(255,255,0,0.5)';   // 2칸 이동
const HIGHLIGHT_SELECTED_COLOR = 'rgba(255,255,0,0.4)';

const EMPTY = '.';
const PLAYER_R = 'R';
const PLAYER_B = 'B';

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

// DOM 요소 참조 (window.onload에서 할당)
let redScoreTextEl, blueScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl, restartButtonEl;
let showRulesButtonEl, rulesModalEl, modalCloseButtonEl;

const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
const dc = [0, 1, 1, 1, 0, -1, -1, -1];

// --- 화면 크기 조절 함수 ---
function adjustGameSize() {
    const gameContainer = document.getElementById('game-container');
    // getComputedStyle은 요소가 DOM에 완전히 로드된 후 사용 가능
    const containerStyle = window.getComputedStyle(gameContainer);
    const containerPadding = (parseInt(containerStyle.paddingLeft) || 0) + (parseInt(containerStyle.paddingRight) || 0);
    
    let availableWidth = window.innerWidth - containerPadding - 20; // 양쪽 여유 공간 10px씩 추가 고려
    if (window.innerWidth > 700) { // 데스크탑 유사 환경 최대 너비 제한
        availableWidth = (parseInt(containerStyle.maxWidth) || 680) - containerPadding;
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
             infoPanelEl.style.maxWidth = `${WIDTH}px`; // 정보 패널 너비도 캔버스에 맞춤
        }
    }
    // 게임 상태가 존재하고, 컨텍스트(ctx)가 준비되었다면 다시 그림
    if (board && ctx) {
        renderGame();
    }
}

// --- 게임 로직 함수들 ---
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
        if (Object.prototype.hasOwnProperty.call(obj, key)) { // 더 안전한 hasOwnProperty 체크
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
        const r_adj = tr + dr[i];
        const c_adj = tc + dc[i];
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

// --- 렌더링 함수들 ---
function drawBoard() {
    if (!ctx) return;
    ctx.strokeStyle = GREY_COLOR;
    ctx.lineWidth = 1;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            ctx.strokeRect(MARGIN + c * SQUARE_SIZE, MARGIN + r * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        }
    }
}

function drawPieces() {
    if (!ctx || !board) return;
    let radius = SQUARE_SIZE / 2 - Math.max(4, SQUARE_SIZE * 0.1); // 동적으로 반지름 조절
    if (radius < 2) radius = 2; // 최소 반지름

    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            const piece = board[r][c];
            const centerX = MARGIN + c * SQUARE_SIZE + SQUARE_SIZE / 2;
            const centerY = MARGIN + r * SQUARE_SIZE + SQUARE_SIZE / 2;

            // 선택된 말 강조 (말 아래에)
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

    // 유효 이동 경로 강조 (말 위에)
    if (selectedPieceCoords && humanValidMovesFromSelected.length > 0) {
        humanValidMovesFromSelected.forEach(move => {
            const tr = move.tx;
            const tc = move.ty;
            ctx.fillStyle = move.is_jump ? HIGHLIGHT_JUMP_DST_COLOR : HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);

            // 목적지 작은 원
            ctx.beginPath();
            let smallRadius = radius / 3;
            if (smallRadius < 1) smallRadius = 1;
            ctx.arc(MARGIN + tc * SQUARE_SIZE + SQUARE_SIZE / 2, MARGIN + tr * SQUARE_SIZE + SQUARE_SIZE / 2, smallRadius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.2)';
            ctx.fill();
        });
    }
}

function updateInfoPanel() {
    if (!redScoreTextEl || !blueScoreTextEl || !currentPlayerTurnTextEl || !gameMessageTextEl || !board) return;
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
    if (!timerTextEl) return;
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
    if (gameOver) return; // 이미 게임 종료면 실행 안함
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
    if (ctx) renderGame(); // ctx가 있을 때만 호출
}

// --- 게임 흐름 및 상태 관리 함수들 ---
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
    if (currentPlayer === HUMAN_PLAYER && !gameOver) {
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else if (timerTextEl) {
        timerTextEl.textContent = "";
    }

    if (gameOverScreenEl) gameOverScreenEl.style.display = 'none';
    if (rulesModalEl) rulesModalEl.style.display = 'none';
    
    adjustGameSize(); // 여기서 ctx 설정 및 renderGame() 호출될 수 있음
}

function switchTurn() {
    if (gameOver) return;
    currentPlayer = opponent(currentPlayer);
    turnStartTime = Date.now();
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (!gameOver && currentPlayer === HUMAN_PLAYER) {
        gameMessage = "당신의 턴입니다.";
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else if (timerTextEl) {
        timerTextEl.textContent = "";
    }

    checkForPassOrGameOver(); // 여기서 게임 종료될 수 있음

    if (!gameOver && currentPlayer === AI_PLAYER) {
        gameMessage = "AI가 생각 중입니다...";
        if (ctx) renderGame(); // 메시지 즉시 표시
        setTimeout(runAiTurn, 800);
    } else if (ctx) { // 사람 턴이거나 게임 종료 시
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
        if (lastPlayerPassed) { // 사람도 이전에 패스했다면
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 패스!");
            return; 
        }
        lastPlayerPassed = true;
    }
    if (!gameOver) switchTurn(); 
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
        // AI 패스 시 메시지는 runAiTurn에서 설정

        if (lastPlayerPassed) { // 이전 플레이어도 패스했었다면
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 움직일 수 없습니다!");
        } else {
            lastPlayerPassed = true;
            if (currentPlayer === HUMAN_PLAYER) {
                if (ctx) renderGame(); // 패스 메시지 표시
                setTimeout(() => {
                    if (!gameOver) switchTurn(); 
                }, 1500);
            }
            // AI가 패스한 경우는 runAiTurn에서 lastPlayerPassed = true로 설정하고 switchTurn을 호출.
            // 그 후 사람 턴 시작 시 이 함수가 다시 호출되어 사람도 패스인지 확인.
        }
    } else {
        lastPlayerPassed = false; // 현재 플레이어는 움직일 수 있음
    }
}

function triggerGameOver(winPlayer, reason) {
    gameOver = true;
    winner = winPlayer;
    gameMessage = reason; // 상세 사유
    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (timerTextEl) timerTextEl.textContent = "";

    if (gameOverTitleEl) gameOverTitleEl.textContent = winner === "Draw" ? "무승부입니다!" : (winner === HUMAN_PLAYER ? "당신 (빨강) 승리!" : "AI (파랑) 승리!");
    if (gameOverReasonEl) gameOverReasonEl.textContent = reason; // 상세 사유 표시
    if (gameOverScreenEl) gameOverScreenEl.style.display = 'flex';
    
    if (ctx) renderGame(); // 최종 게임 보드 상태 렌더링
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

// --- 이벤트 핸들러들 ---
function getClickedSquare(event) {
    if (!canvas) return null;
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
    // 룰 모달이 떠 있을 때는 캔버스 인터랙션 무시 (게임오버 화면 클릭도)
    if (rulesModalEl && rulesModalEl.style.display === 'flex') return;

    if (gameOver) { 
        resetGame();
        return;
    }
    if (currentPlayer !== HUMAN_PLAYER) return; // 사람 턴일때만

    const clickedPos = getClickedSquare(event);
    if (!clickedPos) {
        selectedPieceCoords = null;
        humanValidMovesFromSelected = [];
        gameMessage = "보드 안을 클릭하세요.";
        if (ctx) renderGame();
        return;
    }

    const { r: rClicked, c: cClicked } = clickedPos;

    if (!selectedPieceCoords) { // 첫 클릭: 말 선택
        if (board[rClicked][cClicked] === HUMAN_PLAYER) {
            selectedPieceCoords = { r: rClicked, c: cClicked };
            humanValidMovesFromSelected = getValidMoves(board, HUMAN_PLAYER).filter(
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
            gameMessage = "";
            lastPlayerPassed = false;
            switchTurn(); // 여기서 renderGame() 호출됨
            return; 
        } else { // 잘못된 목적지 또는 다른 자신의 말 선택
            if (board[rClicked][cClicked] === HUMAN_PLAYER) { // 다른 자신의 말 클릭 -> 선택 변경
                selectedPieceCoords = { r: rClicked, c: cClicked };
                humanValidMovesFromSelected = getValidMoves(board, HUMAN_PLAYER).filter(
                    m => m.sx === rClicked && m.sy === cClicked
                );
                if (!humanValidMovesFromSelected.length) {
                    gameMessage = "이 말은 움직일 수 없습니다. 다른 말을 선택하세요.";
                    selectedPieceCoords = null;
                } else {
                    gameMessage = "선택 변경됨. 목적지를 클릭하세요.";
                }
            } else { // 유효하지 않은 목적지
                 gameMessage = "잘못된 목적지입니다. 유효한 위치를 선택하세요.";
            }
        }
    }
    if (ctx) renderGame();
}

// --- 메인 렌더링 함수 ---
function renderGame() {
    if (!ctx) { // ctx가 없으면 렌더링 불가
        console.error("Canvas context(ctx) is not initialized for renderGame.");
        return;
    }
    ctx.fillStyle = WHITE_COLOR;
    ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);

    drawBoard();
    drawPieces();
    updateInfoPanel();
}

// --- 초기화 ---
window.onload = function() {
    // DOM 요소 먼저 모두 가져오기
    canvas = document.getElementById('gameCanvas');
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

    // 콘솔 로그로 DOM 요소 선택 확인
    console.log("DOM Elements Loaded:");
    console.log("  Canvas:", canvas);
    console.log("  Show Rules Button:", showRulesButtonEl);
    console.log("  Rules Modal:", rulesModalEl);
    console.log("  Modal Close Button:", modalCloseButtonEl);
    console.log("  Restart Button:", restartButtonEl);
    console.log("  Game Over Screen:", gameOverScreenEl);


    if (canvas) {
        ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error("Failed to get 2D context from canvas.");
            return; // ctx 없으면 더 이상 진행 불가
        }
    } else {
        console.error("Canvas element not found.");
        return; // canvas 없으면 더 이상 진행 불가
    }
    
    adjustGameSize(); // 여기서 canvas 크기 설정 및 최초 renderGame() 호출될 수 있음
    resetGame();    // 게임 상태 초기화 및 전체 다시 그리기

    // 이벤트 리스너 (DOM 요소들이 확실히 로드된 후 추가)
    if (canvas) {
      canvas.addEventListener('click', handleCanvasInteraction);
      // canvas.addEventListener('touchstart', handleCanvasInteraction, { passive: false }); // 스크롤 방지 필요시
    }

    if (gameOverScreenEl) {
        gameOverScreenEl.addEventListener('click', () => {
            if(rulesModalEl && rulesModalEl.style.display === 'none') { // 룰 모달 안 떠 있을 때만
                resetGame();
            }
        });
    }
    if (restartButtonEl) {
        restartButtonEl.addEventListener('click', resetGame);
    }

    if (showRulesButtonEl && rulesModalEl) {
        showRulesButtonEl.addEventListener('click', () => {
            console.log("룰 보기 버튼 클릭됨. 현재 모달 display:", rulesModalEl.style.display);
            rulesModalEl.style.display = 'flex'; // 모달을 flex로 표시 (CSS에서 중앙 정렬 위해)
            console.log("모달 display를 'flex'로 변경 후:", rulesModalEl.style.display);
        });
    }
    if (modalCloseButtonEl && rulesModalEl) {
        modalCloseButtonEl.addEventListener('click', () => {
            rulesModalEl.style.display = 'none';
        });
    }
    if (rulesModalEl) {
        rulesModalEl.addEventListener('click', (event) => { // 모달 배경 클릭 시 닫기
            if (event.target === rulesModalEl) { // 클릭된 요소가 모달 배경 자체인지 확인
                rulesModalEl.style.display = 'none';
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r') {
            resetGame();
        }
        // ESC 키로 룰 모달 닫기
        if (event.key === "Escape" && rulesModalEl && rulesModalEl.style.display === 'flex') {
            rulesModalEl.style.display = 'none';
        }
    });

    window.addEventListener('resize', () => {
        adjustGameSize(); // 여기서 내부적으로 renderGame()이 호출됨
    });
};