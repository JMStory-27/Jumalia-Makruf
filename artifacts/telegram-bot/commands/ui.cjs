'use strict';

function divider(char = '─', len = 20) {
    return char.repeat(len);
}

function bold(text) {
    return `*${text}*`;
}

function italic(text) {
    return `_${text}_`;
}

function code(text) {
    return `\`${text}\``;
}

function codeBlock(text, lang = '') {
    return `\`\`\`${lang}\n${text}\n\`\`\``;
}

function escapeMarkdown(text) {
    return String(text || '').replace(/([_*\[\]()~`>#+=|{}.!\\-])/g, '\\$1');
}

function progressBar(current, total, width = 16) {
    const filled = Math.round((current / total) * width);
    return '█'.repeat(filled) + '░'.repeat(width - filled);
}

module.exports = {
    divider,
    bold,
    italic,
    code,
    codeBlock,
    escapeMarkdown,
    progressBar,
};
