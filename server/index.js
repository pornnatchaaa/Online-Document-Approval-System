const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');
const path = require('path');

const app = express();
const port = 8000;  // ใช้พอร์ต 8000 สำหรับ Express
const upload = multer({
    dest: 'uploads/', 
    limits: { fileSize: 10 * 1024 * 1024 }  // ขนาดไฟล์สูงสุด 10MB
});

/*const title = document.getElementById('title').value;
const createdBy = document.getElementById('created_by').value;

formData.append('file', file);
formData.append('title', title);
formData.append('created_by', createdBy);*/


app.use(express.static(path.join(__dirname, '../public')));  // เสิร์ฟไฟล์จาก public

app.use(cors({
    origin: '*',  // ยอมรับทุก origin
    methods: 'GET,POST,PUT,DELETE', // กำหนด method ที่อนุญาต
    allowedHeaders: 'Content-Type, Authorization'  // กำหนด headers ที่อนุญาต
}));

app.use(express.json());

let db;

// เชื่อมต่อกับฐานข้อมูล MySQL ที่ใช้พอร์ต 8832
const initMySQL = async () => {
    try {
        db = await mysql.createConnection({
            host: 'localhost',
            user: 'root',
            password: 'root',
            database: 'newwebdb',  // ชื่อฐานข้อมูลที่ต้องการ
            port: 8832,  // พอร์ตที่ MySQL ใช้งาน
        });
        console.log("Connected to MySQL successfully");
    } catch (error) {
        console.error("Database connection error:", error);
        process.exit(1); // Exit if DB connection fails
    }
};

// API สำหรับการสมัครสมาชิก (register)
app.post('/api/register', async (req, res) => {
    const { username, password, email, role } = req.body;

    if (!username || !password || !email || !role) {
        return res.status(400).json({
            success: false,
            error: 'Please provide all required fields'
        });
    }

    try {
        // ใช้รหัสผ่านแบบธรรมดา (ไม่เข้ารหัส)
        const result = await db.query(
            'INSERT INTO users (username, password, email, role) VALUES (?, ?, ?, ?)',
            [username, password, email, role]  // เก็บรหัสผ่านแบบธรรมดา
        );

        res.json({
            success: true,
            message: 'User registered successfully',
            userId: result.insertId
        });

    } catch (error) {
        console.error('Register error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// API สำหรับ login
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    if (!username || !password) {
        return res.status(400).json({
            success: false,
            error: 'Please provide both username and password'
        });
    }

    try {
        const [users] = await db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);

        if (users.length === 0) {
            return res.status(401).json({
                success: false,
                error: 'Invalid credentials'
            });
        }

        // ดึง role ของผู้ใช้จากฐานข้อมูล
        const user = users[0];  // เพราะมีผู้ใช้คนเดียวที่ตรงกับชื่อผู้ใช้และรหัสผ่าน
        const role = user.role;  // ดึง role จากข้อมูลที่ได้มา

        res.json({
            success: true,
            message: 'Login successful',
            role: role ,
            userId: user.user_id  // ส่ง role กลับไปใน response
        });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            error: 'Internal server error',
            details: error.message
        });
    }
});

// API ที่ให้ Requester ส่งเอกสารไปยัง Approver
/*app.post('/api/upload', async (req, res) => {
    const { title, approverId, filePath, requesterId } = req.body;

    if (!title || !approverId || !filePath || !requesterId) {
        return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO documents (title, file_path, requester_id, approver_id, status) VALUES (?, ?, ?, ?, ?)',
            [title, filePath, requesterId, approverId, 'pending']
        );

        res.json({ success: true, message: 'Document uploaded successfully', documentId: result.insertId });
    } catch (error) {
        console.error('Error uploading document:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});*/


app.get('/api/pending-documents/:approverId', async (req, res) => {
    const { approverId } = req.params;

    try {
        const [documents] = await db.query(
            `SELECT d.document_id, d.title, d.file_path, u.username AS requester 
             FROM documents d 
             JOIN users u ON d.created_by = u.user_id 
             WHERE d.created_by = ? AND d.status = 'pending'`,
            [approverId]
        );

        res.json({ success: true, documents });
    } catch (error) {
        console.error('Error fetching pending documents:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});



/*
app.post('/api/update-document-status', async (req, res) => {
    const { documentId, status } = req.body;

    if (!documentId || !status) {
        return res.status(400).json({ success: false, error: 'Please provide document ID and status.' });
    }

    try {
        const result = await db.query(
            'UPDATE documents SET status = ? WHERE id = ?',
            [status, documentId]
        );

        if (result.affectedRows > 0) {
            res.json({ success: true, message: `Document ${status}` });
        } else {
            res.status(404).json({ success: false, error: 'Document not found.' });
        }
    } catch (error) {
        console.error('Error updating document status:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});*/

/*app.post('/api/upload', upload.single('file'), async (req, res) => {
    const { title, requesterId, description } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!title || !filePath || !requesterId) {
        return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO documents (title , description, file_path, created_by, status) VALUES (?, ?, ?, ?, ?)',
            [title, description, filePath, requesterId, 'pending']
        );

        res.json({ success: true, message: 'Document uploaded successfully', documentId: result.insertId });
    } catch (error) {
        console.error('Error uploading document:', error.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});*/

app.post('/api/upload', upload.single('file'), async (req, res) => {
    const { title, requesterId, approverId, description } = req.body;
    const filePath = req.file ? req.file.path : null;

    if (!title || !filePath || !requesterId || !approverId) {
        return res.status(400).json({ success: false, error: 'Please provide all required fields.' });
    }

    try {
        const result = await db.query(
            'INSERT INTO documents (title, description, file_path, created_by, approver_id, status) VALUES (?, ?, ?, ?, ?, ?)',
            [title, description, filePath, requesterId, approverId, 'pending']
        );

        res.json({ success: true, message: 'Document uploaded successfully', documentId: result.insertId });
    } catch (error) {
        console.error('Error uploading document:', error.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API สำหรับ Approver อนุมัติหรือปฏิเสธเอกสาร



app.get('/api/pending-docs', async (req, res) => {
    const { approverId } = req.query;

    try {
        const [rows] = await db.query(
            `SELECT d.document_id, d.title, d.file_path, u.username AS requester 
             FROM documents d 
             JOIN users u ON d.created_by = u.user_id 
             WHERE d.approver_id = ? AND d.status = 'pending'`,
            [approverId]
        );
        res.json(rows);
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch documents' });
    }
});

app.post('/api/update-status', async (req, res) => {
    const { documentId, status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const [result] = await db.query(
            'UPDATE documents SET status = ? WHERE document_id = ?',
            [status, documentId]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Document not found' });
        }

        res.json({ success: true, message: `Document ${status}` });
    } catch (err) {
        console.error("Error updating document status:", err);
        res.status(500).json({ error: 'Failed to update status' });
    }
});


/*app.post('/api/update-status', async (req, res) => {
    const { documentId, status } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        await db.query('UPDATE documents SET status = ? WHERE document_id = ?', [status, documentId]);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: 'Failed to update status' });
    }
});*/

// ดึงรายชื่อ Approver ทั้งหมด
app.get('/api/approvers', async (req, res) => {
    try {
        const [users] = await db.query("SELECT user_id AS id, username FROM users WHERE role = 'approver'");
        res.json(users);
    } catch (error) {
        console.error('Error fetching approvers:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.post('/api/documents/:documentId/decision', async (req, res) => {
    const documentId = req.params.documentId;
    const { decision } = req.body;

    if (!['approved', 'rejected'].includes(decision)) {
        return res.status(400).json({ error: 'Invalid decision' });
    }

    try {
        await db.query('UPDATE documents SET status = ? WHERE document_id = ?', [decision, documentId]);
        res.json({ message: `Document ${decision}` });
    } catch (error) {
        console.error('Error updating status:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get('/api/requester-documents/:requesterId', async (req, res) => {
    const { requesterId } = req.params;

    try {
        const [docs] = await db.query(
            `SELECT d.document_id, d.title, d.status, d.file_path, u.username AS approver
             FROM documents d 
             JOIN users u ON d.approver_id = u.user_id 
             WHERE d.created_by = ?`,
            [requesterId]
        );

        res.json({ success: true, documents: docs });
    } catch (err) {
        console.error("Error fetching requester documents:", err);
        res.status(500).json({ error: 'Failed to fetch requester documents' });
    }
});



app.listen(port, async () => {
    await initMySQL();
    console.log('Http Server is running on port ' + port);
});
