/**
 * 🛡️ Shared Middleware
 */

// Simple request body validator for required fields
const requireFields = (fields = []) => (req, res, next) => {
    const missing = fields.filter((f) =>
        req.body?.[f] === undefined || req.body?.[f] === null || req.body?.[f] === ''
    );

    if (missing.length) {
        return res.status(400).json({
            error: 'BAD_REQUEST',
            message: `Missing required field(s): ${missing.join(', ')}`,
            requestId: req.id,
        });
    }
    next();
};

module.exports = { requireFields };
