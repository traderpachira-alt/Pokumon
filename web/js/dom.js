export const $ = s => document.querySelector(s);
export const view = typeof document !== 'undefined' ? $('#view') : null;
