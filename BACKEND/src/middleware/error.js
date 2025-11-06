module.exports = function (err, _req, res, _next) {
console.error('[ERROR]', err.message);
const code = err.status || 500;
res.status(code).json({ error: err.message || 'server_error' });
};