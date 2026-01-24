// app.js
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARE ---
app.use(cors({
    origin: '*', 
    methods: ['GET', 'POST', 'PUT', 'DELETE']
}));
app.use(express.json());

// --- 2. MONGODB CONNECTION (Muddemal) ---
const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/muddemal_db';
mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Connected to MongoDB'))
    .catch(err => console.error('❌ MongoDB Connection Error:', err));

const assetSchema = new mongoose.Schema({
    gmrVmrNo: { type: String, required: true, unique: true },
    caseNo: { type: String, required: true },
    firyadicheName: String,
    aropicheName: String,
    varnan: String,
    kimmat: String,
    nextDate: String,
    decidedDate: String,
}, { timestamps: true });

const Asset = mongoose.model('Asset', assetSchema);

// --- 3. GOOGLE SHEETS SETUP (Library) ---
let doc; 
try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    const serviceAccountAuth = new JWT({
        email: credentials.client_email,
        key: credentials.private_key.replace(/\\n/g, '\n'),
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });
    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
} catch (e) {
    console.error("!!! Google Credentials Error !!!", e.message);
    doc = null; 
}

async function loadSheet() {
    if (!doc) throw new Error("API Initialization failed. Check Google Credentials.");
    if (!doc.isLoaded) await doc.loadInfo(); 
    return doc.sheetsByIndex[1]; 
}

const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
const NUMERIC_FIELDS = ['SrNo', 'Volume', 'Book Price'];

// --- 4. ASSET ROUTES (Muddemal Management) ---

app.get('/api/assets', async (req, res) => {
    try {
        const assets = await Asset.find().sort({ createdAt: -1 });
        res.json({ assets });
    } catch (error) { res.status(500).json({ error: 'Failed to fetch assets' }); }
});

app.get('/api/assets/:id', async (req, res) => {
    try {
        const asset = await Asset.findOne({ gmrVmrNo: req.params.id });
        if (!asset) return res.status(404).json({ error: 'Asset not found' });
        res.json(asset);
    } catch (error) { res.status(500).json({ error: 'Server error' }); }
});

app.post('/api/assets', async (req, res) => {
    try {
        const newAsset = new Asset(req.body);
        await newAsset.save();
        res.status(201).json(newAsset);
    } catch (error) {
        if (error.code === 11000) return res.status(400).json({ error: 'GMR/VMR No already exists' });
        res.status(400).json({ error: error.message });
    }
});

// --- 5. BOOK ROUTES (Library Management) ---

app.get('/api/books', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const rows = await sheet.getRows();
        let books = rows.map(row => ({
            rowIndex: row.rowNumber, 
            Class: row.get('Class'),
            SrNo: row.get('SrNo'), 
            'Book Name': row.get('Book Name'),
            'Book Price': row.get('Book Price'),
            Reader: row.get('Reader'), 
            Writer:row.get('Writer'),
            Volume:row.get('Volume'),
            Date:row.get('Date'),
            Reader:row.get('Reader'),
            Room:row.get('Room'),




            // 



        }));
        res.status(200).json(books);
    } catch (error) { res.status(500).json({ message: 'Error fetching books', error: error.message }); }
});

app.post('/api/books', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const missing = REQUIRED_FIELDS_FOR_BOOK.filter(f => !req.body[f]);
        if (missing.length) return res.status(400).json({ message: `Missing: ${missing.join(', ')}` });
        await sheet.addRow(req.body); 
        res.status(201).json({ message: 'Book added successfully!' });
    } catch (error) { res.status(500).json({ message: 'Error adding book', error: error.message }); }
});

// --- 6. START SERVER (Local Only) ---
const PORT = process.env.PORT || 5000;
if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server running on port ${PORT}`);
    });
}

// EXPORT FOR VERCEL
// module.exports = app;
