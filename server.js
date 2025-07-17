const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const path = require('path'); // Add this line

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // Serve static files from a 'public' folder

// This is the database connection function
const getDbConnection = () => {
    // Vercel uses a temporary, writable directory at /tmp
    const dbPath = process.env.VERCEL ? '/tmp/attendance.db' : './attendance.db';
    const db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
            console.error("Error opening database:", err.message);
        }
    });
    db.run(`CREATE TABLE IF NOT EXISTS attendance_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        student_id TEXT NOT NULL,
        class_id TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
    return db;
};

// --- API ENDPOINTS ---

// Check-in endpoint (for the mobile app)
app.post('/api/check-in', (req, res) => {
    const { studentId, classId } = req.body;
    if (!studentId || !classId) {
        return res.status(400).json({ error: "studentId and classId are required." });
    }

    const db = getDbConnection();
    const sql = `INSERT INTO attendance_log (student_id, class_id) VALUES (?, ?)`;
    
    db.run(sql, [studentId, classId], function(err) {
        if (err) {
            return res.status(500).json({ error: "Failed to record attendance." });
        }
        res.status(201).json({ message: "Attendance recorded successfully" });
    });
    db.close();
});

// Endpoint to get all attendance data (for the frontend)
app.get('/api/attendance', (req, res) => {
    const db = getDbConnection();
    const sql = `SELECT * FROM attendance_log ORDER BY timestamp DESC`;
    
    db.all(sql, [], (err, rows) => {
        if (err) {
            return res.status(500).json({ error: "Failed to fetch attendance." });
        }
        res.status(200).json(rows);
    });
    db.close();
});

// --- VERCELL EXPORT ---
// This makes the app compatible with Vercel's serverless environment
module.exports = app;
// This block allows the server to run locally for testing
if (process.env.VERCEL_ENV !== 'production') {
    const port = 3000;
    app.listen(port, () => {
      console.log(`Server running locally on http://localhost:${port}`);
    });
  }