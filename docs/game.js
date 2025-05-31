// --- 상수 ---
let BOARD_SIZE = 8;
let SQUARE_SIZE = 80;
let MARGIN = 0;

let WIDTH;
let CANVAS_HEIGHT;

const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
const GREY_COLOR = 'rgb(200,200,200)';
const RED_PIECE_COLOR = 'rgb(200,0,0)';
const BLUE_PIECE_COLOR = 'rgb(0,0,200)';
const HIGHLIGHT_VALID_DST_COLOR = 'rgba(100,255,100,0.5)';
const HIGHLIGHT_JUMP_DST_COLOR = 'rgba(255,255,0,0.5)';
const HIGHLIGHT_SELECTED_COLOR = 'rgba(255,255,0,0.4)';

const EMPTY = '.';
const PLAYER_R = 'R'; // 실제 빨강색 말
const PLAYER_B = 'B'; // 실제 파랑색 말

// 게임 설정 (이제 동적으로 설정됨)
// const HUMAN_PLAYER = PLAYER_R; // 삭제
// const AI_PLAYER = PLAYER_B;    // 삭제
const HUMAN_TIME_LIMIT_S = 20;

// --- 전역 변수 ---
let canvas, ctx;
let board;
let currentPlayer; // 항상 PLAYER_R (빨강)이 선공
let selectedPieceCoords = null;
let humanValidMovesFromSelected = [];
let gameOver = false;
let winner = null;
let gameMessage = "";
let turnStartTime;
let lastPlayerPassed = false;
let humanTimerInterval = null;

let humanPlayerColor; // 사용자가 선택한 색 (PLAYER_R 또는 PLAYER_B)
let aiPlayerColor;    // AI의 색
let colorSelected = false; // 사용자가 색상을 선택했는지 여부

// DOM 요소 참조
let playerRScoreTextEl, playerBScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl, restartButtonEl;
let showRulesButtonEl, rulesModalEl, modalCloseButtonEl;
let colorSelectionScreenEl, selectRedButtonEl, selectBlueButtonEl, gameInterfaceEl;


const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
const dc = [0, 1, 1, 1, 0, -1, -1, -1];

// --- 화면 크기 조절 함수 (이전과 동일) ---
function adjustGameSize() {
    const gameContainer = document.getElementById('game-container');
    if (!gameContainer) return; // game-container가 아직 없을 수 있음 (초기 로드 시)
    const containerStyle = window.getComputedStyle(gameContainer);
    const containerPadding = (parseInt(containerStyle.paddingLeft) || 0) + (parseInt(containerStyle.paddingRight) || 0);
    
    let availableWidth = window.innerWidth - containerPadding - 20;
    if (window.innerWidth > 700) {
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
             infoPanelEl.style.maxWidth = `${WIDTH}px`;
        }
    }
    if (board && ctx && colorSelected) { // 색상 선택 후 게임 진행 중일 때만 렌더링
        renderGame();
    }
}


// --- 게임 로직 함수들 (이전과 동일) ---
function initialBoard() { /* ... 이전과 동일 ... */ 
    const newBoard = Array(BOARD_SIZE).fill(null).map(() => Array(BOARD_SIZE).fill(EMPTY));
    newBoard[0][0] = PLAYER_R;
    newBoard[0][BOARD_SIZE - 1] = PLAYER_B;
    newBoard[BOARD_SIZE - 1][0] = PLAYER_B;
    newBoard[BOARD_SIZE - 1][BOARD_SIZE - 1] = PLAYER_R;
    return newBoard;
}
function inBounds(r, c) { /* ... 이전과 동일 ... */ 
    return r >= 0 && r < BOARD_SIZE && c >= 0 && c < BOARD_SIZE;
}
// opponent 함수는 이제 실제 말 색깔 기준이 아닌, 현재 플레이어의 상대방 색깔을 찾는 용도로는 부적합.
// 대신 (currentPlayer === humanPlayerColor) ? aiPlayerColor : humanPlayerColor 형태로 사용.
// 또는, gameLogic 내에서 player1, player2를 명확히 구분하는 방식으로 재설계 필요.
// 여기서는 간단히 humanPlayerColor, aiPlayerColor를 직접 비교.
// function opponentGamePieceColor(playerPieceColor) { // 특정 말 색의 상대방 말 색
//     return playerPieceColor === PLAYER_R ? PLAYER_B : PLAYER_R;
// }

function deepCopy(obj) { /* ... 이전과 동일 ... */ 
    if (obj === null || typeof obj !== 'object') { return obj; }
    if (Array.isArray(obj)) { return obj.map(deepCopy); }
    const copiedObject = {};
    for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) { copiedObject[key] = deepCopy(obj[key]); }
    }
    return copiedObject;
}
function isValidMoveOnTempBoard(tempBoard, sr, sc, tr, tc, playerColor) { /* ... 이전과 동일 ... */
    if (!inBounds(sr, sc) || !inBounds(tr, tc)) return false;
    if (tempBoard[sr][sc] !== playerColor) return false;
    if (tempBoard[tr][tc] !== EMPTY) return false;
    const dRow = tr - sr; const dCol = tc - sc;
    const absDRow = Math.abs(dRow); const absDCol = Math.abs(dCol);
    const step = Math.max(absDRow, absDCol);
    if (!(step >= 1 && step <= 2)) return false;
    return (absDRow === step && absDCol === 0) || (absDRow === 0 && absDCol === step) || (absDRow === step && absDCol === step);
 }
function applyMoveOnTempBoard(tempBoard, sr, sc, tr, tc, playerColorToPlace) { /* ... 이전과 동일, playerColor -> playerColorToPlace ... */
    const isJump = Math.max(Math.abs(tr - sr), Math.abs(tc - sc)) === 2;
    let flippedCount = 0;
    if (isJump) { tempBoard[sr][sc] = EMPTY; }
    tempBoard[tr][tc] = playerColorToPlace;
    
    const opponentPieceColor = (playerColorToPlace === PLAYER_R) ? PLAYER_B : PLAYER_R; // 뒤집을 상대방 말 색깔
    for (let i = 0; i < 8; i++) {
        const r_adj = tr + dr[i]; const c_adj = tc + dc[i];
        if (inBounds(r_adj, c_adj) && tempBoard[r_adj][c_adj] === opponentPieceColor) {
            tempBoard[r_adj][c_adj] = playerColorToPlace;
            flippedCount++;
        }
    }
    return { flippedCount, isJump };
 }
function countPieces(boardState, pieceColor) { /* ... 이전과 동일, playerColor -> pieceColor ... */
    let count = 0;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            if (boardState[r][c] === pieceColor) { count++; }
        }
    }
    return count;
 }
function getValidMoves(boardState, playerPieceColor) { /* ... 이전과 동일, playerColor -> playerPieceColor ... */
    const moves = [];
    for (let rStart = 0; rStart < BOARD_SIZE; rStart++) {
        for (let cStart = 0; cStart < BOARD_SIZE; cStart++) {
            if (boardState[rStart][cStart] === playerPieceColor) {
                for (let stepSize = 1; stepSize <= 2; stepSize++) {
                    for (let i = 0; i < 8; i++) {
                        const rTarget = rStart + dr[i] * stepSize;
                        const cTarget = cStart + dc[i] * stepSize;
                        if (isValidMoveOnTempBoard(boardState, rStart, cStart, rTarget, cTarget, playerPieceColor)) {
                            moves.push({ sx: rStart, sy: cStart, tx: rTarget, ty: cTarget, is_jump: stepSize === 2 });
                        }
                    }
                }
            }
        }
    }
    return moves;
 }

// AI 로직: aiPlayerColor를 사용
function aiMoveGenerate(currentBoardState, currentAiActualColor) {
    const possibleMoves = getValidMoves(currentBoardState, currentAiActualColor);

    if (!possibleMoves.length) return null;

    let bestMoveCandidate = possibleMoves[0];
    let maxScoreAfterOpponentReply = -Infinity;
    let maxImmediateFlipsForBestScore = -1;
    
    // AI의 상대는 사람 플레이어
    const humanActualColor = (currentAiActualColor === PLAYER_R) ? PLAYER_B : PLAYER_R;

    for (const move of possibleMoves) {
        let tempBoardAfterMyMove = deepCopy(currentBoardState);
        const { flippedCount: immediateFlips } = applyMoveOnTempBoard(
            tempBoardAfterMyMove, move.sx, move.sy, move.tx, move.ty, currentAiActualColor
        );
        move.immediate_flips = immediateFlips;

        const opponentPossibleMoves = getValidMoves(tempBoardAfterMyMove, humanActualColor);
        let minMyScoreThisBranch = Infinity;

        if (!opponentPossibleMoves.length) {
            const myScore = countPieces(tempBoardAfterMyMove, currentAiActualColor);
            const opponentScore = countPieces(tempBoardAfterMyMove, humanActualColor);
            minMyScoreThisBranch = myScore - opponentScore;
        } else {
            for (const oppMove of opponentPossibleMoves) {
                let tempBoardAfterOpponentMove = deepCopy(tempBoardAfterMyMove);
                applyMoveOnTempBoard(
                    tempBoardAfterOpponentMove, oppMove.sx, oppMove.sy, oppMove.tx, oppMove.ty, humanActualColor
                );
                const myScore = countPieces(tempBoardAfterOpponentMove, currentAiActualColor);
                const opponentScore = countPieces(tempBoardAfterOpponentMove, humanActualColor);
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
function drawBoard() { /* ... 이전과 동일 ... */ 
    if (!ctx) return;
    ctx.strokeStyle = GREY_COLOR; ctx.lineWidth = 1;
    for (let r = 0; r < BOARD_SIZE; r++) {
        for (let c = 0; c < BOARD_SIZE; c++) {
            ctx.strokeRect(MARGIN + c * SQUARE_SIZE, MARGIN + r * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
        }
    }
}
function drawPieces() { /* ... 이전과 동일 ... */ 
    if (!ctx || !board) return;
    let radius = SQUARE_SIZE / 2 - Math.max(4, SQUARE_SIZE * 0.1);
    if (radius < 2) radius = 2;
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
                ctx.fillStyle = RED_PIECE_COLOR; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); ctx.fill();
            } else if (piece === PLAYER_B) {
                ctx.fillStyle = BLUE_PIECE_COLOR; ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); ctx.fill();
            }
        }
    }
    if (selectedPieceCoords && humanValidMovesFromSelected.length > 0) {
        humanValidMovesFromSelected.forEach(move => {
            const tr = move.tx; const tc = move.ty;
            ctx.fillStyle = move.is_jump ? HIGHLIGHT_JUMP_DST_COLOR : HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);
            ctx.beginPath(); let smallRadius = radius / 3; if (smallRadius < 1) smallRadius = 1;
            ctx.arc(MARGIN + tc * SQUARE_SIZE + SQUARE_SIZE / 2, MARGIN + tr * SQUARE_SIZE + SQUARE_SIZE / 2, smallRadius, 0, 2 * Math.PI);
            ctx.fillStyle = 'rgba(0,0,0,0.2)'; ctx.fill();
        });
    }
}

// 정보 패널 업데이트 시 humanPlayerColor, aiPlayerColor 사용
function updateInfoPanel() {
    if (!playerRScoreTextEl || !playerBScoreTextEl || !currentPlayerTurnTextEl || !gameMessageTextEl || !board || !colorSelected) return;
    
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);

    const playerR_RoleText = (PLAYER_R === humanPlayerColor) ? "(당신)" : "(AI)";
    const playerB_RoleText = (PLAYER_B === humanPlayerColor) ? "(당신)" : "(AI)";

    playerRScoreTextEl.textContent = `빨강 ${playerR_RoleText}: ${rPieces}`;
    playerBScoreTextEl.textContent = `파랑 ${playerB_RoleText}: ${bPieces}`;

    let turnMsg = "게임 종료!";
    if (!gameOver) {
        if (currentPlayer === humanPlayerColor) {
            turnMsg = `당신 턴 (${humanPlayerColor === PLAYER_R ? '빨강' : '파랑'})`;
        } else {
            turnMsg = `AI 턴 (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'})`;
        }
    }
    currentPlayerTurnTextEl.textContent = turnMsg;
    gameMessageTextEl.textContent = gameMessage;
}

function updateTimerDisplay() { /* ... 이전과 동일 ... */ 
    if (!timerTextEl) return;
    if (!gameOver && currentPlayer === humanPlayerColor) { // humanPlayerColor로 체크
        const timeElapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        const timeLeft = Math.max(0, HUMAN_TIME_LIMIT_S - timeElapsed);
        timerTextEl.textContent = `남은 시간: ${timeLeft}초`;
        if (timeLeft <= 0) { handleHumanTimeout(); }
    } else {
        timerTextEl.textContent = "";
    }
}
function handleHumanTimeout() { /* ... 이전과 동일 ... */ 
    if (gameOver) return;
    clearInterval(humanTimerInterval); humanTimerInterval = null;
    gameMessage = "시간 초과! 턴을 넘깁니다.";
    selectedPieceCoords = null; humanValidMovesFromSelected = [];
    if (lastPlayerPassed) { endGameDueToConsecutivePassOrTimeout("AI 패스 후 사람 시간 초과!"); }
    else { lastPlayerPassed = true; switchTurn(); }
    if (ctx) renderGame();
}

// --- 게임 흐름 및 상태 관리 ---

// 게임 시작 및 재시작 시 색상 선택 화면 표시
function showColorSelection() {
    colorSelected = false;
    if (colorSelectionScreenEl) colorSelectionScreenEl.style.display = 'flex';
    if (gameInterfaceEl) gameInterfaceEl.style.display = 'none';
    if (gameOverScreenEl) gameOverScreenEl.style.display = 'none';
    if (rulesModalEl) rulesModalEl.style.display = 'none';
    if (humanTimerInterval) clearInterval(humanTimerInterval); // 이전 타이머 정리
}

// 색상 선택 후 게임 시작
function startGameWithSelectedColor(chosenHumanColor) {
    humanPlayerColor = chosenHumanColor;
    aiPlayerColor = (humanPlayerColor === PLAYER_R) ? PLAYER_B : PLAYER_R;
    colorSelected = true;

    if (colorSelectionScreenEl) colorSelectionScreenEl.style.display = 'none';
    if (gameInterfaceEl) gameInterfaceEl.style.display = 'flex'; // 게임 UI 보이기

    initializeBoardAndLogic(); // 보드 및 게임 로직 초기화
}

// 보드 및 주요 게임 로직 초기화 (resetGame의 핵심 부분)
function initializeBoardAndLogic() {
    board = initialBoard();
    currentPlayer = PLAYER_R; // 빨강이 항상 선공
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];
    gameOver = false;
    winner = null;
    gameMessage = (currentPlayer === humanPlayerColor) ? "당신의 턴입니다." : "AI의 턴입니다.";
    turnStartTime = Date.now();
    lastPlayerPassed = false;

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (currentPlayer === humanPlayerColor && !gameOver) {
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else if (timerTextEl) {
        timerTextEl.textContent = "";
    }
    
    adjustGameSize(); // 여기서 renderGame() 호출될 수 있음

    // 첫 턴이 AI인 경우 AI 턴 실행
    if (!gameOver && currentPlayer === aiPlayerColor) {
        gameMessage = `AI 턴 (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'})`;
        if (ctx) renderGame();
        setTimeout(runAiTurn, 800);
    } else if (ctx) { // 사람 턴이거나, AI 턴이 아니면 그냥 렌더링
        renderGame();
    }
}


function switchTurn() {
    if (gameOver) return;
    // 현재 플레이어(currentPlayer)는 항상 PLAYER_R 또는 PLAYER_B 중 하나.
    // 다음 턴은 현재 턴의 반대 색 말.
    currentPlayer = (currentPlayer === PLAYER_R) ? PLAYER_B : PLAYER_R;
    turnStartTime = Date.now();
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];

    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (!gameOver && currentPlayer === humanPlayerColor) { // 이제 사람 턴이면
        gameMessage = `당신 턴 (${humanPlayerColor === PLAYER_R ? '빨강' : '파랑'})`;
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else if (timerTextEl) { // AI 턴이거나 게임 종료 시
        timerTextEl.textContent = "";
    }

    checkForPassOrGameOver();

    if (!gameOver && currentPlayer === aiPlayerColor) { // 이제 AI 턴이면
        gameMessage = `AI 턴 (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'})`;
        if (ctx) renderGame();
        setTimeout(runAiTurn, 800);
    } else if (ctx) {
       renderGame();
    }
}

function runAiTurn() {
    if (gameOver || currentPlayer !== aiPlayerColor) return;

    const aiMove = aiMoveGenerate(board, aiPlayerColor); // AI는 자신의 실제 색(aiPlayerColor)으로 수를 생성
    if (aiMove) {
        applyMoveOnTempBoard(board, aiMove.sx, aiMove.sy, aiMove.tx, aiMove.ty, aiPlayerColor);
        gameMessage = `AI 이동 (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'}): (${aiMove.sx + 1},${aiMove.sy + 1}) → (${aiMove.tx + 1},${aiMove.ty + 1})`;
        lastPlayerPassed = false;
    } else {
        gameMessage = `AI (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'})가 움직일 수 없어 패스합니다.`;
        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 패스!");
            return; 
        }
        lastPlayerPassed = true;
    }
    if (!gameOver) switchTurn(); 
}

function checkForPassOrGameOver() { /* ... 이전과 거의 동일, 메시지 부분만 미세 조정 가능 ... */ 
    if (gameOver || !colorSelected) return;

    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);

    if (rPieces === 0) {
        triggerGameOver(PLAYER_B, "빨강 플레이어 말이 없습니다."); return;
    }
    if (bPieces === 0) {
        triggerGameOver(PLAYER_R, "파랑 플레이어 말이 없습니다."); return;
    }
    if (board.flat().filter(cell => cell === EMPTY).length === 0) {
        endGameDueToBoardFull(); return;
    }

    // currentPlayer는 현재 턴인 말의 색 (PLAYER_R 또는 PLAYER_B)
    const currentPlayerActualMoves = getValidMoves(board, currentPlayer);
    if (!currentPlayerActualMoves.length) {
        if (currentPlayer === humanPlayerColor) { // 사람 플레이어가 패스할 차례
            gameMessage = `당신 (${humanPlayerColor === PLAYER_R ? '빨강' : '파랑'})이(가) 움직일 수 없어 패스합니다.`;
        } else { // AI가 패스할 차례 (이 메시지는 runAiTurn에서 이미 설정되었을 수 있음)
            gameMessage = `AI (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'})가 움직일 수 없어 패스합니다.`;
        }

        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("양쪽 모두 움직일 수 없습니다!");
        } else {
            lastPlayerPassed = true;
            if (currentPlayer === humanPlayerColor) { // 사람이 패스하면
                if (ctx) renderGame();
                setTimeout(() => { if (!gameOver) switchTurn(); }, 1500);
            }
            // AI가 패스한 경우는 runAiTurn에서 처리 후 switchTurn이 호출되어 사람 턴으로 넘어감.
            // 그때 이 함수가 다시 호출되어 사람도 패스인지 확인.
        }
    } else {
        lastPlayerPassed = false;
    }
}

// 게임 종료 시 승자 메시지 동적 변경
function triggerGameOver(winningPieceColor, reason) {
    gameOver = true;
    // winner = winningPieceColor; // winningPieceColor는 R 또는 B. 사람/AI 여부로 판단해야 함.
    gameMessage = reason;
    if (humanTimerInterval) clearInterval(humanTimerInterval);
    if (timerTextEl) timerTextEl.textContent = "";

    let WinnerText;
    if (winningPieceColor === "Draw") {
        WinnerText = "무승부입니다!";
    } else if (winningPieceColor === humanPlayerColor) {
        WinnerText = `당신 (${humanPlayerColor === PLAYER_R ? '빨강' : '파랑'}) 승리!`;
    } else { // winningPieceColor === aiPlayerColor
        WinnerText = `AI (${aiPlayerColor === PLAYER_R ? '빨강' : '파랑'}) 승리!`;
    }
    
    if (gameOverTitleEl) gameOverTitleEl.textContent = WinnerText;
    if (gameOverReasonEl) gameOverReasonEl.textContent = reason;
    if (gameOverScreenEl) gameOverScreenEl.style.display = 'flex';
    
    if (ctx) renderGame();
}

function endGameDueToBoardFull() { /* ... 이전과 동일, triggerGameOver가 승자 판단 ... */ 
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    let finalWinnerColor;
    if (rPieces > bPieces) finalWinnerColor = PLAYER_R;
    else if (bPieces > rPieces) finalWinnerColor = PLAYER_B;
    else finalWinnerColor = "Draw";
    triggerGameOver(finalWinnerColor, "보드가 가득 찼습니다.");
}
function endGameDueToConsecutivePassOrTimeout(reasonPrefix) { /* ... 이전과 동일, triggerGameOver가 승자 판단 ... */ 
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    let finalWinnerColor;
    if (rPieces > bPieces) finalWinnerColor = PLAYER_R;
    else if (bPieces > rPieces) finalWinnerColor = PLAYER_B;
    else finalWinnerColor = "Draw";
    triggerGameOver(finalWinnerColor, `${reasonPrefix} 최종 점수로 승패를 결정합니다.`);
}


// --- 이벤트 핸들러들 ---
function getClickedSquare(event) { /* ... 이전과 동일 ... */ 
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const clientX = event.touches ? event.touches[0].clientX : event.clientX;
    const clientY = event.touches ? event.touches[0].clientY : event.clientY;
    const x = clientX - rect.left; const y = clientY - rect.top;
    if (x >= MARGIN && x < WIDTH - MARGIN && y >= MARGIN && y < CANVAS_HEIGHT - MARGIN) {
        const c = Math.floor((x - MARGIN) / SQUARE_SIZE); const r = Math.floor((y - MARGIN) / SQUARE_SIZE);
        if (inBounds(r,c)) return { r, c };
    }
    return null;
}

// 캔버스 인터랙션은 humanPlayerColor 턴일 때만 활성화
function handleCanvasInteraction(event) {
    if (!colorSelected) return; // 색상 선택 전에는 무시
    if (rulesModalEl && rulesModalEl.style.display === 'flex') return;

    if (gameOver) { 
        showColorSelection(); // 게임 종료 시 색상 선택 화면으로
        return;
    }
    // 현재 턴의 말 색깔(currentPlayer)이 사람 플레이어의 색깔(humanPlayerColor)과 같을 때만 진행
    if (currentPlayer !== humanPlayerColor) return; 

    const clickedPos = getClickedSquare(event);
    if (!clickedPos) {
        selectedPieceCoords = null; humanValidMovesFromSelected = [];
        gameMessage = "보드 안을 클릭하세요.";
        if (ctx) renderGame();
        return;
    }

    const { r: rClicked, c: cClicked } = clickedPos;

    if (!selectedPieceCoords) {
        if (board[rClicked][cClicked] === humanPlayerColor) { // 자신의 말 선택
            selectedPieceCoords = { r: rClicked, c: cClicked };
            humanValidMovesFromSelected = getValidMoves(board, humanPlayerColor).filter(
                m => m.sx === rClicked && m.sy === cClicked
            );
            if (!humanValidMovesFromSelected.length) {
                gameMessage = "이 말은 움직일 수 없습니다."; selectedPieceCoords = null;
            } else {
                gameMessage = "선택됨. 목적지를 클릭하세요.";
            }
        } else if (board[rClicked][cClicked] === EMPTY) {
            gameMessage = "빈 칸입니다. 당신의 말을 선택하세요.";
        } else { // 상대방(AI) 말
            gameMessage = `상대방(${aiPlayerColor === PLAYER_R ? '빨강':'파랑'})의 말입니다. 당신의 말을 선택하세요.`;
        }
    } else { // 목적지 선택
        const sr = selectedPieceCoords.r; const sc = selectedPieceCoords.c;
        const chosenMove = humanValidMovesFromSelected.find(
            move => move.tx === rClicked && move.ty === cClicked
        );

        if (chosenMove) {
            applyMoveOnTempBoard(board, sr, sc, rClicked, cClicked, humanPlayerColor);
            selectedPieceCoords = null; humanValidMovesFromSelected = [];
            gameMessage = ""; lastPlayerPassed = false;
            switchTurn(); return; 
        } else { 
            if (board[rClicked][cClicked] === humanPlayerColor) {
                selectedPieceCoords = { r: rClicked, c: cClicked };
                humanValidMovesFromSelected = getValidMoves(board, humanPlayerColor).filter(
                    m => m.sx === rClicked && m.sy === cClicked
                );
                if (!humanValidMovesFromSelected.length) {
                    gameMessage = "이 말은 움직일 수 없습니다. 다른 말을 선택하세요."; selectedPieceCoords = null;
                } else {
                    gameMessage = "선택 변경됨. 목적지를 클릭하세요.";
                }
            } else {
                 gameMessage = "잘못된 목적지입니다. 유효한 위치를 선택하세요.";
            }
        }
    }
    if (ctx) renderGame();
}


// --- 메인 렌더링 함수 ---
function renderGame() { /* ... 이전과 동일 ... */ 
    if (!ctx || !colorSelected) { return; } // 색상 선택 후에만 렌더링
    ctx.fillStyle = WHITE_COLOR; ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);
    drawBoard(); drawPieces(); updateInfoPanel();
}

// --- 초기화 ---
window.onload = function() {
    canvas = document.getElementById('gameCanvas');
    playerRScoreTextEl = document.getElementById('playerRScoreText'); // ID 변경됨
    playerBScoreTextEl = document.getElementById('playerBScoreText'); // ID 변경됨
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
    colorSelectionScreenEl = document.getElementById('colorSelectionScreen');
    selectRedButtonEl = document.getElementById('selectRedButton');
    selectBlueButtonEl = document.getElementById('selectBlueButton');
    gameInterfaceEl = document.getElementById('game-interface');


    if (canvas) {
        ctx = canvas.getContext('2d');
        if (!ctx) { console.error("Failed to get 2D context"); return; }
    } else {
        console.error("Canvas element not found."); return;
    }
    
    adjustGameSize(); // 최초 크기 조절
    showColorSelection(); // 게임 시작 시 색상 선택 화면부터 보여줌

    // 이벤트 리스너
    if (canvas) {
      canvas.addEventListener('click', handleCanvasInteraction);
    }

    if (gameOverScreenEl) {
        gameOverScreenEl.addEventListener('click', () => {
            if(rulesModalEl && rulesModalEl.style.display === 'none') {
                showColorSelection(); // 게임오버 후 클릭 시 색상 선택으로
            }
        });
    }
    if (restartButtonEl) { // 게임 중 "게임 재시작" 버튼
        restartButtonEl.addEventListener('click', showColorSelection);
    }

    // 색상 선택 버튼 리스너
    if (selectRedButtonEl) {
        selectRedButtonEl.addEventListener('click', () => startGameWithSelectedColor(PLAYER_R));
    }
    if (selectBlueButtonEl) {
        selectBlueButtonEl.addEventListener('click', () => startGameWithSelectedColor(PLAYER_B));
    }


    if (showRulesButtonEl && rulesModalEl) {
        showRulesButtonEl.addEventListener('click', () => {
            rulesModalEl.style.display = 'flex';
        });
    }
    if (modalCloseButtonEl && rulesModalEl) {
        modalCloseButtonEl.addEventListener('click', () => {
            rulesModalEl.style.display = 'none';
        });
    }
    if (rulesModalEl) {
        rulesModalEl.addEventListener('click', (event) => {
            if (event.target === rulesModalEl) {
                rulesModalEl.style.display = 'none';
            }
        });
    }

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r') { // R 키로 색상 선택 화면으로 (재시작)
            showColorSelection();
        }
        if (event.key === "Escape" && rulesModalEl && rulesModalEl.style.display === 'flex') {
            rulesModalEl.style.display = 'none';
        }
    });

    window.addEventListener('resize', adjustGameSize);
};