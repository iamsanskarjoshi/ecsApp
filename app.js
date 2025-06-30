// Load environment variables for local development
require('dotenv').config();

const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs-extra');
const path = require('path');
const mimeTypes = require('mime-types');

const app = express();
const port = process.env.PORT || 3000;

// EFS mount point - this will be mounted from EFS in ECS
const EFS_MOUNT_PATH = process.env.EFS_MOUNT_PATH || '/mnt/efs';
const UPLOADS_DIR = path.join(EFS_MOUNT_PATH, 'uploads');
const DOCUMENTS_DIR = path.join(EFS_MOUNT_PATH, 'documents');

// Ensure directories exist
async function ensureDirectories() {
  try {
    await fs.ensureDir(UPLOADS_DIR);
    await fs.ensureDir(DOCUMENTS_DIR);
    console.log('EFS directories initialized successfully');
  } catch (error) {
    console.error('Error creating EFS directories:', error);
  }
}

// Initialize directories on startup
ensureDirectories();

// Configure multer for file uploads to EFS
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow common document types
    const allowedTypes = /jpeg|jpg|png|pdf|doc|docx|txt|zip/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    
    if (mimetype && extname) {
      return cb(null, true);
    } else {
      cb(new Error('Only documents, images, and archives are allowed'));
    }
  }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'Document Management System with EFS Storage',
    timestamp: new Date().toISOString(),
    version: '2.0.0',
    environment: process.env.NODE_ENV || 'development',
    efsPath: EFS_MOUNT_PATH,
    features: [
      'File Upload to EFS',
      'Document Storage',
      'File Listing',
      'File Download',
      'Shared Storage across ECS Tasks'
    ]
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    efsStatus: fs.existsSync(EFS_MOUNT_PATH) ? 'mounted' : 'not mounted',
    efsPath: EFS_MOUNT_PATH
  });
});

// File upload endpoint
app.post('/api/upload', upload.single('document'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const fileInfo = {
      id: path.basename(req.file.filename, path.extname(req.file.filename)),
      originalName: req.file.originalname,
      filename: req.file.filename,
      path: req.file.path,
      size: req.file.size,
      mimetype: req.file.mimetype,
      uploadDate: new Date().toISOString(),
      efsPath: path.relative(process.cwd(), req.file.path)
    };

    // Save file metadata to EFS as well
    const metadataPath = path.join(DOCUMENTS_DIR, `${fileInfo.id}.json`);
    await fs.writeJson(metadataPath, fileInfo, { spaces: 2 });

    res.json({
      message: 'File uploaded successfully to EFS',
      file: fileInfo
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'Upload failed' });
  }
});

// List all uploaded files
app.get('/api/files', async (req, res) => {
  try {
    const files = [];
    const metadataFiles = await fs.readdir(DOCUMENTS_DIR);
    
    for (const metaFile of metadataFiles) {
      if (path.extname(metaFile) === '.json') {
        try {
          const metadata = await fs.readJson(path.join(DOCUMENTS_DIR, metaFile));
          files.push(metadata);
        } catch (error) {
          console.error('Error reading metadata:', error);
        }
      }
    }

    files.sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));

    res.json({
      files,
      totalFiles: files.length,
      efsPath: EFS_MOUNT_PATH
    });
  } catch (error) {
    console.error('Error listing files:', error);
    res.status(500).json({ error: 'Failed to list files' });
  }
});

// Download file endpoint
app.get('/api/download/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const metadataPath = path.join(DOCUMENTS_DIR, `${fileId}.json`);
    
    if (!(await fs.exists(metadataPath))) {
      return res.status(404).json({ error: 'File not found' });
    }

    const metadata = await fs.readJson(metadataPath);
    const filePath = path.join(UPLOADS_DIR, metadata.filename);

    if (!(await fs.exists(filePath))) {
      return res.status(404).json({ error: 'File data not found' });
    }

    res.setHeader('Content-Disposition', `attachment; filename="${metadata.originalName}"`);
    res.setHeader('Content-Type', metadata.mimetype);
    
    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Download error:', error);
    res.status(500).json({ error: 'Download failed' });
  }
});

// Delete file endpoint
app.delete('/api/files/:fileId', async (req, res) => {
  try {
    const { fileId } = req.params;
    const metadataPath = path.join(DOCUMENTS_DIR, `${fileId}.json`);
    
    if (!(await fs.exists(metadataPath))) {
      return res.status(404).json({ error: 'File not found' });
    }

    const metadata = await fs.readJson(metadataPath);
    const filePath = path.join(UPLOADS_DIR, metadata.filename);

    // Delete both file and metadata
    await fs.remove(filePath);
    await fs.remove(metadataPath);

    res.json({ message: 'File deleted successfully', fileId });
  } catch (error) {
    console.error('Delete error:', error);
    res.status(500).json({ error: 'Delete failed' });
  }
});

// EFS storage stats
app.get('/api/storage/stats', async (req, res) => {
  try {
    const stats = await fs.stat(EFS_MOUNT_PATH);
    const files = await fs.readdir(UPLOADS_DIR);
    
    let totalSize = 0;
    for (const file of files) {
      try {
        const fileStat = await fs.stat(path.join(UPLOADS_DIR, file));
        totalSize += fileStat.size;
      } catch (error) {
        console.error('Error reading file stats:', error);
      }
    }

    res.json({
      efsPath: EFS_MOUNT_PATH,
      totalFiles: files.length,
      totalSize: totalSize,
      totalSizeFormatted: `${(totalSize / (1024 * 1024)).toFixed(2)} MB`,
      efsCreated: stats.birthtime,
      lastAccessed: stats.atime
    });
  } catch (error) {
    console.error('Stats error:', error);
    res.status(500).json({ error: 'Failed to get storage stats' });
  }
});

app.get('/api/users', (req, res) => {
  const users = [
    { id: 1, name: 'John Doe', email: 'john@example.com' },
    { id: 2, name: 'Jane Smith', email: 'jane@example.com' },
    { id: 3, name: 'Bob Johnson', email: 'bob@example.com' }
  ];
  res.json(users);
});

app.get('/api/status', (req, res) => {
  res.json({
    server: 'running',
    database: 'connected',
    cache: 'active',
    memory: process.memoryUsage(),
    cpu: process.cpuUsage()
  });
});

// Error handling
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Start server
app.listen(port, '0.0.0.0', () => {
  console.log(`Document Management Server running on port ${port}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`EFS Mount Path: ${EFS_MOUNT_PATH}`);
  console.log(`Uploads Directory: ${UPLOADS_DIR}`);
  console.log(`Documents Directory: ${DOCUMENTS_DIR}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully');
  process.exit(0);
});