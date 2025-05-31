// --- ��� ---
let BOARD_SIZE = 8;
let SQUARE_SIZE = 80; // �ʱⰪ, �������� �����
let MARGIN = 0; // HTML���� padding���� ó��

// �ʱ� ĵ���� ũ��� SQUARE_SIZE�� ���� ������
let WIDTH;
let CANVAS_HEIGHT;


// ����
const BLACK_COLOR = 'rgb(0,0,0)';
const WHITE_COLOR = 'rgb(255,255,255)';
const GREY_COLOR = 'rgb(200,200,200)'; // ���� ��
const RED_PIECE_COLOR = 'rgb(200,0,0)';
const BLUE_PIECE_COLOR = 'rgb(0,0,200)';
const HIGHLIGHT_VALID_DST_COLOR = 'rgba(100,255,100,0.5)'; // 1ĭ �̵�
const HIGHLIGHT_JUMP_DST_COLOR = 'rgba(255,255,0,0.5)'; // 2ĭ �̵� (���ο� ��)
const HIGHLIGHT_SELECTED_COLOR = 'rgba(255,255,0,0.4)';


// �� ���
const EMPTY = '.';
const PLAYER_R = 'R';
const PLAYER_B = 'B';

// ���� ����
const HUMAN_PLAYER = PLAYER_R;
const AI_PLAYER = PLAYER_B;
const HUMAN_TIME_LIMIT_S = 20;

// --- ���� ���� ---
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

// DOM ��� ����
let redScoreTextEl, blueScoreTextEl, currentPlayerTurnTextEl, timerTextEl, gameMessageTextEl;
let gameOverScreenEl, gameOverTitleEl, gameOverReasonEl, restartButtonEl;


const dr = [-1, -1, 0, 1, 1, 1, 0, -1];
const dc = [0, 1, 1, 1, 0, -1, -1, -1];

// --- ȭ�� ũ�� ���� �Լ� ---
function adjustGameSize() {
    const gameContainer = document.getElementById('game-container');
    // game-container�� padding�� ����ؾ� ��Ȯ�� ���� �ʺ� ���� �� �ֽ��ϴ�.
    // ���⼭�� ������ window.innerWidth�� ����մϴ�.
    const containerPadding = 30; // game-container�� �¿� padding �� (15px + 15px)
    let availableWidth = window.innerWidth - containerPadding; // �¿� ���� ����
    if (window.innerWidth > 700) { // ����ũž ���� ȯ�� �ִ� �ʺ� ����
        availableWidth = 680 - containerPadding; // CSS�� max-width�� �����ϰ�
    }


    SQUARE_SIZE = Math.floor(availableWidth / BOARD_SIZE);
    if (SQUARE_SIZE > 80) SQUARE_SIZE = 80; // �ִ� ���簢�� ũ�� ����
    if (SQUARE_SIZE < 30) SQUARE_SIZE = 30; // �ּ� ���簢�� ũ�� ����


    WIDTH = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;
    CANVAS_HEIGHT = BOARD_SIZE * SQUARE_SIZE + 2 * MARGIN;

    if (canvas) {
        canvas.width = WIDTH;
        canvas.height = CANVAS_HEIGHT;
        // ���� �г� �ʺ� �������� ���� (���� ����, CSS�ε� ����)
        const infoPanelEl = document.getElementById('infoPanel');
        if (infoPanelEl) {
             infoPanelEl.style.maxWidth = `${WIDTH}px`;
        }
    }
    // ������ ���� ���̶�� ȭ�� �ٽ� �׸���
    if (board && !gameOver) { // ������ ���۵� ���Ŀ��� renderGame ȣ��
        renderGame();
    }
}


// --- ���� ���� �Լ� (������ ����, ���� ����) ---
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

// getValidMoves�� is_jump �÷��׸� �̹� ��ȯ�ϹǷ� ���� ����
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


// --- AI ���� (������ ����, ���� ����) ---
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

// --- ������ �Լ� ---
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
    const radius = SQUARE_SIZE / 2 - 8; // �� ũ�� ����
    if (radius < 5) radius = 5; // �ּ� ������

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
            // 2ĭ �̵�(����)���� 1ĭ �̵������� ���� �ٸ� ���� ����
            ctx.fillStyle = move.is_jump ? HIGHLIGHT_JUMP_DST_COLOR : HIGHLIGHT_VALID_DST_COLOR;
            ctx.fillRect(MARGIN + tc * SQUARE_SIZE, MARGIN + tr * SQUARE_SIZE, SQUARE_SIZE, SQUARE_SIZE);

            // �������� ���� �� ǥ�� (���� ����)
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
    redScoreTextEl.textContent = `���� (���): ${rPieces}`;
    blueScoreTextEl.textContent = `�Ķ� (AI): ${bPieces}`;

    let turnMsg = "���� ����!";
    if (!gameOver) {
        turnMsg = currentPlayer === HUMAN_PLAYER ? "��� �� (����)" : "AI �� (�Ķ�)";
    }
    currentPlayerTurnTextEl.textContent = turnMsg;
    gameMessageTextEl.textContent = gameMessage;
}

function updateTimerDisplay() {
    if (!gameOver && currentPlayer === HUMAN_PLAYER) {
        const timeElapsed = Math.floor((Date.now() - turnStartTime) / 1000);
        const timeLeft = Math.max(0, HUMAN_TIME_LIMIT_S - timeElapsed);
        timerTextEl.textContent = `���� �ð�: ${timeLeft}��`;
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
    gameMessage = "�ð� �ʰ�! ���� �ѱ�ϴ�.";
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];

    if (lastPlayerPassed) {
        endGameDueToConsecutivePassOrTimeout("AI �н� �� ��� �ð� �ʰ�!");
    } else {
        lastPlayerPassed = true;
        switchTurn();
    }
    renderGame();
}


// --- ���� �帧 �� ���� ���� ---
function resetGame() {
    adjustGameSize(); // ���� �� ���� ũ�� �ٽ� ����
    board = initialBoard();
    currentPlayer = HUMAN_PLAYER;
    selectedPieceCoords = null;
    humanValidMovesFromSelected = [];
    gameOver = false;
    winner = null;
    gameMessage = "������ �����մϴ�. ����� ���Դϴ�.";
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
        gameMessage = "����� ���Դϴ�.";
        humanTimerInterval = setInterval(updateTimerDisplay, 1000);
        updateTimerDisplay();
    } else {
        timerTextEl.textContent = "";
    }

    checkForPassOrGameOver();

    if (!gameOver && currentPlayer === AI_PLAYER) {
        gameMessage = "AI�� ���� ���Դϴ�...";
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
        gameMessage = `AI �̵�: (${aiMove.sx + 1},${aiMove.sy + 1}) �� (${aiMove.tx + 1},${aiMove.ty + 1})`;
        lastPlayerPassed = false;
    } else {
        gameMessage = "AI�� ������ �� ���� �н��մϴ�.";
        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("���� ��� �н�!");
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
        triggerGameOver(PLAYER_B, "���� �÷��̾� ���� �����ϴ�.");
        return;
    }
    if (bPieces === 0) {
        triggerGameOver(PLAYER_R, "�Ķ� �÷��̾� ���� �����ϴ�.");
        return;
    }

    const emptyCells = board.flat().filter(cell => cell === EMPTY).length;
    if (emptyCells === 0) {
        endGameDueToBoardFull();
        return;
    }

    const currentPlayerMoves = getValidMoves(board, currentPlayer);
    if (!currentPlayerMoves.length) {
        if (currentPlayer === HUMAN_PLAYER) gameMessage = "������ �� �ִ� ���� �����ϴ�. ���� �ڵ����� �Ѿ�ϴ�.";

        if (lastPlayerPassed) {
            endGameDueToConsecutivePassOrTimeout("���� ��� ������ �� �����ϴ�!");
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

    gameOverTitleEl.textContent = winner === "Draw" ? "���º��Դϴ�!" : (winner === HUMAN_PLAYER ? "��� (����) �¸�!" : "AI (�Ķ�) �¸�!");
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
    triggerGameOver(finalWinner, "���尡 ���� á���ϴ�.");
}

function endGameDueToConsecutivePassOrTimeout(reasonPrefix) {
    const rPieces = countPieces(board, PLAYER_R);
    const bPieces = countPieces(board, PLAYER_B);
    let finalWinner;
    if (rPieces > bPieces) finalWinner = PLAYER_R;
    else if (bPieces > rPieces) finalWinner = PLAYER_B;
    else finalWinner = "Draw";
    triggerGameOver(finalWinner, `${reasonPrefix} ���� ������ ���и� �����մϴ�.`);
}


// --- �̺�Ʈ �ڵ鷯 ---
function getClickedSquare(event) {
    const rect = canvas.getBoundingClientRect();
    // ��ġ �̺�Ʈ�� ���콺 �̺�Ʈ ��ǥ ��� ��� ����
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
    // �⺻ ��ũ�� ���� ���� (��ġ �� ȭ�� �̵� ����)
    // event.preventDefault(); // �ʿ信 ���� �߰�. Ŭ�� �̺�Ʈ������ ���� ���ʿ�.

    if (gameOver) {
        resetGame();
        return;
    }
    if (currentPlayer !== HUMAN_PLAYER) return;

    const clickedPos = getClickedSquare(event);
    if (!clickedPos) {
        selectedPieceCoords = null;
        humanValidMovesFromSelected = [];
        gameMessage = "���� ���� Ŭ���ϼ���.";
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
                gameMessage = "�� ���� ������ �� �����ϴ�.";
                selectedPieceCoords = null;
            } else {
                gameMessage = "���õ�. �������� Ŭ���ϼ���.";
            }
        } else if (board[rClicked][cClicked] === EMPTY) {
            gameMessage = "�� ĭ�Դϴ�. �ڽ��� ���� �����ϼ���.";
        } else {
            gameMessage = "������ ���Դϴ�. �ڽ��� ���� �����ϼ���.";
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
                    gameMessage = "�� ���� ������ �� �����ϴ�. �ٸ� ���� �����ϼ���.";
                    selectedPieceCoords = null;
                } else {
                    gameMessage = "���� �����. �������� Ŭ���ϼ���.";
                }
            } else {
                 gameMessage = "�߸��� �������Դϴ�. ��ȿ�� ��ġ�� �����ϼ���.";
            }
        }
    }
    renderGame();
}


// --- ���� ���� ���� (������) ---
function renderGame() {
    if (!ctx) return; // ���� �ʱ�ȭ���� �ʾҴٸ� �������� ����
    ctx.fillStyle = WHITE_COLOR;
    ctx.fillRect(0, 0, WIDTH, CANVAS_HEIGHT);

    drawBoard();
    drawPieces();
    updateInfoPanel();
}

// --- �ʱ�ȭ ---
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
    restartButtonEl = document.getElementById('restartButton'); // Restart ��ư DOM ���

    // ȭ�� ũ�� ���� �� �ʱ� ���� ����
    adjustGameSize(); // ���� �ε� �� ũ�� ����
    resetGame(); // ���� ���� �ʱ�ȭ �� ù ������

    // �̺�Ʈ ������
    // ����� ��ġ�� ����ũž ���콺 Ŭ�� ��� ����
    canvas.addEventListener('click', handleCanvasInteraction);
    // canvas.addEventListener('touchstart', handleCanvasInteraction, { passive: false }); // ��ũ�� ������ �ʿ��ϴٸ� passive: false


    gameOverScreenEl.addEventListener('click', resetGame);
    restartButtonEl.addEventListener('click', resetGame); // Restart ��ư�� resetGame �Լ� ����

    document.addEventListener('keydown', (event) => {
        if (event.key.toLowerCase() === 'r' && (gameOver || !gameOver)) { // ������ RŰ�� ���� �����ϵ���
            resetGame();
        }
    });

    window.addEventListener('resize', () => {
        adjustGameSize();
        renderGame(); // �������� �� ��� �ٽ� �׸���
    });
};