/**
 * 📊 Metrics Utility
 * 
 * Simple in-memory metrics storage and middleware
 */

// Simple in-memory metrics (reset on restart)
const metrics = {
    checkIn: { success: 0, fail: 0, durationMs: [] },
    confirm: { success: 0, fail: 0, durationMs: [] },
    cancel: { success: 0, fail: 0, durationMs: [] },
};

// Wrapper to capture duration/success per route
function withMetrics(name, handler) {
    return async (req, res, next) => {
        const start = Date.now();
        const bucket = metrics[name] || { success: 0, fail: 0, durationMs: [] };

        // Wrap res.end to inspect status
        const originalEnd = res.end;
        res.end = function (...args) {
            const duration = Date.now() - start;
            bucket.durationMs.push(duration);
            if (res.statusCode >= 200 && res.statusCode < 400) {
                bucket.success += 1;
            } else {
                bucket.fail += 1;
            }
            metrics[name] = bucket;
            return originalEnd.apply(this, args);
        };

        try {
            await handler(req, res, next);
        } catch (err) {
            bucket.fail += 1;
            metrics[name] = bucket;
            next(err);
        }
    };
}

module.exports = { metrics, withMetrics };
