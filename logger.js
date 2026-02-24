// ==========================================
// logger.js — Логирование
// ==========================================

const LEVELS = { ERROR: 'ERROR', WARN: 'WARN', INFO: 'INFO', DEBUG: 'DEBUG' };

function log(level, category, message, data) {
    const ts = new Date().toISOString();
    const suffix = data !== undefined ? ` ${JSON.stringify(data)}` : '';
    console.log(`[${ts}] [${level}] [${category}] ${message}${suffix}`);
}

module.exports = {
    error: (cat, msg, data) => log(LEVELS.ERROR, cat, msg, data),
    warn:  (cat, msg, data) => log(LEVELS.WARN,  cat, msg, data),
    info:  (cat, msg, data) => log(LEVELS.INFO,  cat, msg, data),
    debug: (cat, msg, data) => log(LEVELS.DEBUG, cat, msg, data),
};
