// Соло-игра: заглушка модуля правил для платформы (вся логика на клиенте).
export const meta = { game: 'last-candle', minPlayers: 1, maxPlayers: 1 };
export function setup() { return {}; }
export function validateAction() { return { ok: true }; }
export function applyAction(state) { return state; }
export function isGameOver() { return { over: false }; }
export function viewFor(state) { return state; }
