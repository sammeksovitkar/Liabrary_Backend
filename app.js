// // app.js
// const express = require('express');
// const mongoose = require('mongoose');
// const cors = require('cors');
// const { GoogleSpreadsheet } = require('google-spreadsheet');
// const { JWT } = require('google-auth-library');
// require('dotenv').config();

// const app = express();

// // --- 1. MIDDLEWARE ---
// app.use(cors({
//     origin: '*', 
//     methods: ['GET', 'POST', 'PUT', 'DELETE']
// }));
// app.use(express.json());

// // --- 2. MONGODB CONNECTION (Muddemal) ---
// const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/muddemal_db';
// mongoose.connect(MONGO_URI)
//     .then(() => console.log('✅ Connected to MongoDB'))
//     .catch(err => console.error('❌ MongoDB Connection Error:', err));

// const assetSchema = new mongoose.Schema({
//     gmrVmrNo: { type: String, required: true, unique: true },
//     caseNo: { type: String, required: true },
//     firyadicheName: String,
//     aropicheName: String,
//     varnan: String,
//     kimmat: String,
//     nextDate: String,
//     decidedDate: String,
// }, { timestamps: true });

// const Asset = mongoose.model('Asset', assetSchema);

// // --- 3. GOOGLE SHEETS SETUP (Library) ---
// let doc; 
// try {
//     const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
//     const serviceAccountAuth = new JWT({
//         email: credentials.client_email,
//         key: credentials.private_key.replace(/\\n/g, '\n'),
//         scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//     });
//     doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
// } catch (e) {
//     console.error("!!! Google Credentials Error !!!", e.message);
//     doc = null; 
// }

// async function loadSheet() {
//     if (!doc) throw new Error("API Initialization failed. Check Google Credentials.");
//     if (!doc.isLoaded) await doc.loadInfo(); 
//     return doc.sheetsByIndex[1]; 
// }

// const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
// const NUMERIC_FIELDS = ['SrNo', 'Volume', 'Book Price'];

// // --- 4. ASSET ROUTES (Muddemal Management) ---

// app.get('/api/assets', async (req, res) => {
//     try {
//         const assets = await Asset.find().sort({ createdAt: -1 });
//         res.json({ assets });
//     } catch (error) { res.status(500).json({ error: 'Failed to fetch assets' }); }
// });

// app.get('/api/assets/:id', async (req, res) => {
//     try {
//         const asset = await Asset.findOne({ gmrVmrNo: req.params.id });
//         if (!asset) return res.status(404).json({ error: 'Asset not found' });
//         res.json(asset);
//     } catch (error) { res.status(500).json({ error: 'Server error' }); }
// });

// app.post('/api/assets', async (req, res) => {
//     try {
//         const newAsset = new Asset(req.body);
//         await newAsset.save();
//         res.status(201).json(newAsset);
//     } catch (error) {
//         if (error.code === 11000) return res.status(400).json({ error: 'GMR/VMR No already exists' });
//         res.status(400).json({ error: error.message });
//     }
// });

// // --- 5. BOOK ROUTES (Library Management) ---

// app.get('/api/books', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const rows = await sheet.getRows();
//         let books = rows.map(row => ({
//             rowIndex: row.rowNumber, 
//             Class: row.get('Class'),
//             SrNo: row.get('SrNo'), 
//             'Book Name': row.get('Book Name'),
//             'Book Price': row.get('Book Price'),
//             Reader: row.get('Reader'), 
//             Writer:row.get('Writer'),
//             Volume:row.get('Volume'),
//             Date:row.get('Date'),
//             Reader:row.get('Reader'),
//             Room:row.get('SrNo'),




//             // 



//         }));
//         res.status(200).json(books);
//     } catch (error) { res.status(500).json({ message: 'Error fetching books', error: error.message }); }
// });

// app.post('/api/books', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const missing = REQUIRED_FIELDS_FOR_BOOK.filter(f => !req.body[f]);
//         if (missing.length) return res.status(400).json({ message: `Missing: ${missing.join(', ')}` });
//         await sheet.addRow(req.body); 
//         res.status(201).json({ message: 'Book added successfully!' });
//     } catch (error) { res.status(500).json({ message: 'Error adding book', error: error.message }); }
// });

// // --- 6. START SERVER (Local Only) ---
// // const PORT = process.env.PORT || 5000;
// // if (require.main === module) {
// //     app.listen(PORT, '0.0.0.0', () => {
// //         console.log(`Server running on port ${PORT}`);
// //     });
// // }

// // EXPORT FOR VERCEL
// module.exports = app;
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
require('dotenv').config();

const app = express();

// --- 1. MIDDLEWARE ---
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE'] }));
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

// --- 3. GOOGLE SHEETS SETUP ---
let doc;
const initializeGoogleSheets = async () => {
    try {
        if (doc) return doc;
        if (!process.env.GOOGLE_CREDENTIALS || !process.env.SPREADSHEET_ID) {
            throw new Error("Missing GOOGLE_CREDENTIALS or SPREADSHEET_ID in .env file");
        }
        const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
        const serviceAccountAuth = new JWT({
            email: credentials.client_email,
            key: credentials.private_key.replace(/\\n/g, '\n'),
            scopes: ['https://www.googleapis.com/auth/spreadsheets'],
        });
        const newDoc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
        await newDoc.loadInfo();
        doc = newDoc;
        console.log("✅ Google Sheets Connected Successfully");
        return doc;
    } catch (e) {
        console.error("❌ Google Sheets Connection Error:", e.message);
        throw e;
    }
};

async function getSheet(name) {
    const currentDoc = await initializeGoogleSheets();
    const sheet = currentDoc.sheetsByTitle[name];
    if (!sheet) throw new Error(`Sheet with name "${name}" not found!`);
    return sheet;
}

// --- CONSTANTS ---
const LIBRARY_SHEET_NAME = "Library";
const MAR_INWARD_NAME = "Inward_Marathi";
const ENG_INWARD_NAME = "Inward_English";
const MAR_OUTWARD_NAME = "Outward_Marathi";
const ENG_OUTWARD_NAME = "Outward_English";
const MUDDEMAL_SHEET_NAME = "Muddemal";
const POST_TRACKING_DUMMY_INDEX = 999;

// --- 5. REGISTER & LIBRARY HANDLER ---
const handleSheetsRequest = async (sheetIndex, req, res) => {
    const timeout = setTimeout(() => {
        if (!res.headersSent) res.status(504).json({ error: "Timeout" });
    }, 15000);

    try {
        // --- A. SPECIAL LOGIC: POST TRACKING (DUMMY 999) ---
        if (sheetIndex === POST_TRACKING_DUMMY_INDEX) {
            const marOutSheet = await getSheet(MAR_OUTWARD_NAME);
            const engOutSheet = await getSheet(ENG_OUTWARD_NAME);

            if (req.method === 'GET') {
                const [marRows, engRows] = await Promise.all([marOutSheet.getRows(), engOutSheet.getRows()]);
                const processRows = (rows, origin) => rows
                    .filter(r => {
                        const m = (r.get('mode') || r.get('deliveryMode') || '').toLowerCase().trim();
                        return m === 'by post';
                    })
                    .map(r => ({
                        id: r.get('officeSrNo') || r.rowNumber,
                        source: origin,
                        ...r.toObject(),
                        stampAmount: r.get('postAmount') || '0'
                    }));
                clearTimeout(timeout);
                return res.json([...processRows(marRows, "Marathi"), ...processRows(engRows, "English")]);
            }

            if (req.method === 'POST') {
                const { ids, amount, source } = req.body;
                const targetSheet = source === "Marathi" ? marOutSheet : engOutSheet;
                const rows = await targetSheet.getRows();
                const trackingGroupId = Date.now().toString();

                for (let index = 0; index < ids.length; index++) {
                    const id = ids[index];
                    const row = rows.find(r => (r.get('officeSrNo') || r.rowNumber).toString() === id.toString());
                    if (row) {
                        row.set('mode', 'By Post');
                        row.set('trackingGroupId', trackingGroupId);
                        if (index === 0) row.set('postAmount', amount);
                        else row.set('postAmount', '0');
                        await row.save();
                    }
                }
                clearTimeout(timeout);
                return res.status(200).json({ success: true });
            }
            
            // Handle PUT/Edit specifically for Post Tracking
            if (req.method === 'PUT') {
                const { source, stampAmount } = req.body;
                const targetSheet = source === "Marathi" ? marOutSheet : engOutSheet;
                const rows = await targetSheet.getRows();
                const targetId = req.params.id;

                const row = rows.find(r => (r.get('officeSrNo') || r.rowNumber).toString() === targetId.toString());
                
                if (!row) {
                    clearTimeout(timeout);
                    return res.status(404).json({ error: "Record not found" });
                }

                // Map stampAmount to postAmount column
                if (stampAmount !== undefined) row.set('postAmount', stampAmount);

                // Update any other fields sent in the body
                Object.keys(req.body).forEach(key => {
                    if (['id', 'source', 'stampAmount', 'rowNumber'].includes(key)) return;
                    const header = targetSheet.headerValues.find(h => h.toLowerCase() === key.toLowerCase());
                    if (header) row.set(header, req.body[key]);
                });

                await row.save();
                clearTimeout(timeout);
                return res.json({ success: true });
            }
            return;
        }

        // --- B. STANDARD LOGIC (All other sheets) ---
        const sheet = await getSheet(sheetIndex);

        if (req.method === 'GET') {
            const rows = await sheet.getRows();
            const data = rows.map(r => {
                const rawData = r.toObject();
                let uniqueId = (sheetIndex === MUDDEMAL_SHEET_NAME ? r.get('gmrVmrNo') :
                    sheetIndex === LIBRARY_SHEET_NAME ? r.get('SrNo') :
                        r.get('officeSrNo')) || r.rowNumber;
                return {
                    ...rawData,
                    id: uniqueId.toString(),
                    rowNumber: r.rowNumber,
                    deliveryMode: r.get('deliveryMode') || r.get('mode') || '',
                };
            });
            clearTimeout(timeout);
            const result = req.params.id ? data.find(d => d.id.toString() === req.params.id.toString()) : data;
            return res.json(sheetIndex === MUDDEMAL_SHEET_NAME && !req.params.id ? { assets: result } : result);
        }

        if (req.method === 'POST') {
            const rows = await sheet.getRows();
            let nextNum = rows.length > 0 ? (parseInt(rows[rows.length - 1].get(sheetIndex === LIBRARY_SHEET_NAME ? 'SrNo' : 'officeSrNo')) || rows.length) + 1 : 1;
            const payload = { ...req.body };
            if (payload.deliveryMode && sheet.headerValues.includes('mode')) payload.mode = payload.deliveryMode;
            if (sheetIndex === LIBRARY_SHEET_NAME) payload.SrNo = nextNum.toString();
            else if (sheetIndex !== MUDDEMAL_SHEET_NAME) payload.officeSrNo = nextNum.toString();
            await sheet.addRow(payload);
            clearTimeout(timeout);
            return res.status(201).json({ success: true, newSrNo: nextNum });
        }

        if (req.method === 'PUT' || req.method === 'DELETE') {
            const rows = await sheet.getRows();
            const targetId = req.params.id;
            const row = rows.find(r =>
                r.rowNumber.toString() === targetId ||
                (r.get('officeSrNo') || r.get('gmrVmrNo') || r.get('SrNo') || '').toString() === targetId
            );

            if (!row) {
                clearTimeout(timeout);
                return res.status(404).json({ error: "Record not found" });
            }

            if (req.method === 'PUT') {
                const headers = sheet.headerValues;
                const incomingData = req.body;
                Object.keys(incomingData).forEach(key => {
                    if (key === 'id' || key === 'rowNumber') return;
                    let targetKey = key;
                    if (key === 'deliveryMode') {
                        const foundMode = headers.find(h => h.toLowerCase().trim() === 'mode');
                        if (foundMode) targetKey = foundMode;
                    }
                    const actualHeader = headers.find(h => h.toLowerCase().trim() === targetKey.toLowerCase().trim());
                    if (actualHeader) row.set(actualHeader, incomingData[key]);
                });
                await row.save();
                clearTimeout(timeout);
                return res.json({ success: true, message: "Sheet updated successfully" });
            }

            if (req.method === 'DELETE') {
                await row.delete();
                clearTimeout(timeout);
                return res.json({ success: true });
            }
        }
    } catch (e) {
        console.error("Handler Error:", e.message);
        if (!res.headersSent) {
            clearTimeout(timeout);
            res.status(500).json({ error: e.message });
        }
    }
};

// --- ROUTES ---
const sheetRoutes = [
    { path: '/api/books', idx: LIBRARY_SHEET_NAME },
    { path: '/inward/marathi', idx: MAR_INWARD_NAME },
    { path: '/inward/english', idx: ENG_INWARD_NAME },
    { path: '/outward/marathi', idx: MAR_OUTWARD_NAME },
    { path: '/outward/english', idx: ENG_OUTWARD_NAME },
    { path: '/post-tracking', idx: POST_TRACKING_DUMMY_INDEX },
    { path: '/api/assets', idx: MUDDEMAL_SHEET_NAME },
];

sheetRoutes.forEach(r => {
    app.all(r.path, (req, res) => handleSheetsRequest(r.idx, req, res));
    app.all(`${r.path}/:id`, (req, res) => handleSheetsRequest(r.idx, req, res));
});

// const PORT = process.env.PORT || 5000;
// app.listen(PORT, () => console.log(`🚀 Final Unified Server running on port ${PORT}`));

module.exports = app;
