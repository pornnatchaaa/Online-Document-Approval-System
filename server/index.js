const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
const multer = require('multer');  // ใช้จัดการไฟล์อัปโหลด
const path = require('path');  // สำหรับจัดการ path ไฟล์

const app = express();
const port = 8000;  // ใช้พอร์ต 8000 สำหรับ Express

// ตั้งค่า static file (frontend, ไฟล์ที่อัปโหลด)
app.use(express.static(path.join(__dirname, '../public')));  // เสิร์ฟไฟล์จาก public
app.use('/uploads', express.static(path.join(__dirname, 'uploads'))); // ให้เข้าถึงไฟล์อัปโหลดผ่าน /uploads

// กำหนดการตั้งค่าเก็บไฟล์โดยใช้ multer
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');  // บอกให้เก็บไฟล์ในโฟลเดอร์ uploads
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now(); // ใช้ timestamp กันชื่อซ้ำ
        const sanitizedOriginal = file.originalname.replace(/\s+/g, '-'); // แก้ชื่อไฟล์ลบช่องว่าง
        cb(null, `${timestamp}-${sanitizedOriginal}`);  // ตั้งชื่อไฟล์ใหม่
    }
});
const upload = multer({ storage });  // สร้าง multer ด้วย config ที่กำหนดไว้

// เปิดใช้งาน CORS เพื่อให้ frontend เรียก API ข้าม origin ได้
app.use(cors({
    origin: '*',  // ยอมรับทุก origin
    methods: 'GET,POST,PUT,DELETE', // กำหนด method ที่อนุญาต
    allowedHeaders: 'Content-Type, Authorization'  // กำหนด headers ที่อนุญาต
}));

app.use(express.json()); // ใช้ middleware ให้ express อ่าน request body เป็น JSON ได้

let db; // ตัวแปรสำหรับเก็บ connection กับฐานข้อมูล

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
        process.exit(1); // ออกจากโปรแกรมทันทีถ้าเชื่อมไม่ได้
    }
};

// API สำหรับการสมัครสมาชิก (register)
app.post('/api/register', async (req, res) => {
    const { username, password, email, role } = req.body; // รับข้อมูลจาก body
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
            [username, password, email, role]  // เก็บรหัสผ่านแบบธรรมดา // ใช้ parameterized query ป้องกัน SQL injection
        );

        res.json({
            success: true,
            message: 'User registered successfully',
            userId: result.insertId // ส่ง user_id กลับ
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
            userId: user.user_id  // ส่งข้อมูลผู้ใช้กลับ
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

// API สำหรับดึงเอกสารที่อยู่ในสถานะ pending (รออนุมัติ) จาก approverId
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

// API สำหรับอัปโหลดเอกสาร
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

// API สำหรับดึงเอกสารที่มีสถานะเป็น pending
app.get('/api/pending-docs', async (req, res) => {
    const { approverId } = req.query;

    try {
        const [rows] = await db.query(
            `SELECT d.document_id, d.title, d.description, d.file_path, u.username AS requester 
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

// API สำหรับอัปเดตสถานะเอกสาร
app.post('/api/update-status', async (req, res) => {
    const { documentId, status, reason } = req.body;

    if (!['approved', 'rejected'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    try {
        const [result] = await db.query(
            'UPDATE documents SET status = ?, reason = ? WHERE document_id = ?',
            [status, reason, documentId]
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


// API ดึงรายชื่อ Approver ทั้งหมด
app.get('/api/approvers', async (req, res) => {
    try {
        const [users] = await db.query("SELECT user_id AS id, username FROM users WHERE role = 'approver'");
        res.json(users);
    } catch (error) {
        console.error('Error fetching approvers:', error.message);
        res.status(500).json({ error: 'Internal server error' });
    }
});

// API: ดึงเอกสารที่สร้างโดย requester  เอกสารที่ requester เคยส่ง
app.get('/api/requester-documents/:requesterId', async (req, res) => {
    const { requesterId } = req.params;

    try {
        const [docs] = await db.query(
            `SELECT d.document_id, d.title, d.description, d.status, d.file_path, d.created_at,d.reason ,u.username AS approver
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


// API: ดึงเอกสารที่ไม่ใช่ pending คือเคยอนุมัติหรือปฏิเสธแล้ว
app.get('/api/history-docs/:approverId', async (req, res) => {
    const { approverId } = req.params;

    try {
        const [rows] = await db.query(
            `SELECT d.document_id, d.title, d.description, d.status, d.file_path, d.created_at, d.reason, u.username AS requester
             FROM documents d 
             JOIN users u ON d.created_by = u.user_id 
             WHERE d.approver_id = ? AND d.status != 'pending' 
             ORDER BY d.created_at DESC`,
            [approverId]
          );

        res.json({ success: true, documents: rows });
    } catch (error) {
        console.error("Error fetching history:", error);
        res.status(500).json({ success: false, error: 'Failed to fetch history documents' });
    }
});


// API แก้ไขเอกสาร (เฉพาะสถานะ pending เท่านั้น)
app.put('/api/documents/:id', upload.single('file'), async (req, res) => {
    const docId = req.params.id;
    const { title, description } = req.body;
    const filePath = req.file ? req.file.path : null;

    try {
        const [docs] = await db.query('SELECT * FROM documents WHERE document_id = ?', [docId]);

        if (docs.length === 0) {
            return res.status(404).json({ success: false, error: 'Document not found' });
        }

        const doc = docs[0];
        if (doc.status !== 'pending') {
            return res.status(400).json({ success: false, error: 'Cannot edit approved/rejected document' });
        }

        // สร้าง SQL แบบ dynamic ตามว่าอัปเดต file ใหม่มั้ย
        let sql = 'UPDATE documents SET title = ?, description = ?';
        const params = [title, description];

        if (filePath) {
            sql += ', file_path = ?';
            params.push(filePath);
        }

        sql += ' WHERE document_id = ?';
        params.push(docId);

        await db.query(sql, params);

        res.json({ success: true, message: 'Document updated successfully' });
    } catch (error) {
        console.error('Error updating document:', error);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// API ลบเอกสาร
 app.delete('/api/documents/:id', async (req, res) => {
    const documentId = req.params.id;
    try {
      await db.query('DELETE FROM documents WHERE document_id = ?', [documentId]);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ success: false, error: 'Failed to delete document' });
    }
  });

// API สำหรับดึงข้อมูลเอกสารตาม ID
app.get('/api/documents/:id', async (req, res) => {
    const docId = req.params.id;
    
    try {
      const [docs] = await db.query(
        'SELECT * FROM documents WHERE document_id = ?',
        [docId]
      );
      
      if (docs.length === 0) {
        return res.status(404).json({ success: false, error: 'Document not found' });
      }
      
      res.json({ success: true, document: docs[0] });
    } catch (error) {
      console.error('Error fetching document:', error);
      res.status(500).json({ success: false, error: 'Internal server error' });
    }
  });
  

app.listen(port, async () => {
    await initMySQL();
    console.log('Http Server is running on port ' + port);
});
