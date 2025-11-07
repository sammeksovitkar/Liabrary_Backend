
require('dotenv').config();
const express = require('express');
const { GoogleSpreadsheet } = require('google-spreadsheet');
const { JWT } = require('google-auth-library');
const cors = require('cors');

const app = express();
const port = 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Google Sheet Setup - Modified for Vercel Serverless
let doc; // Declare doc outside the try block so loadSheet can access it
console.log(process.env.GOOGLE_CREDENTIALS,"value")
try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    // JWT authentication setup
    const serviceAccountAuth = new JWT({
        email: credentials.client_email,
        
        // CRITICAL FIX: Ensure the private key is cleaned up correctly.
        key: credentials.private_key.replace(/\\n/g, '\n'),
        
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    
} catch (e) {
    // 🛑 VERCEL CRITICAL FIX: DO NOT use process.exit(1) in a serverless function!
    console.error("!!! FATAL CONFIGURATION ERROR !!!");
    console.error("Original Error: Could not initialize Google Sheets connection.", e.message);
    // Setting doc to null/undefined will cause the loadSheet() function to throw an error 
    // when an API endpoint is hit, but it allows the function to boot.
    doc = null; 
}

// Function to load the sheet (now checks for initialization status)
async function loadSheet() {
    if (!doc) {
        throw new Error("API Initialization failed. Check Vercel GOOGLE_CREDENTIALS and SPREADSHEET_ID variables.");
    }
    // Optimization: only load info if it hasn't been loaded yet.
    if (!doc.isLoaded) {
        await doc.loadInfo(); 
    }
    return doc.sheetsByIndex[1]; // Assuming data is in the second sheet (index 1)
}

// Define required fields ONCE for both POST and PUT
const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
// 🔑 ADDED: List of ALL fields that are expected to be numeric
const NUMERIC_FIELDS = ['SrNo', 'Volume', 'Book Price'];

const generateBackendSrNo = () => {
    const uniquePart = Date.now().toString().slice(-6);
    return Number(uniquePart) + Math.floor(Math.random() * 1000); 
};
// ----------------------------------------------------
// 📖 ADD BOOK FACILITY (POST)
// ----------------------------------------------------
app.post('/api/books', async (req, res) => {
    try {
        const sheet = await loadSheet();
        let bookData = req.body;

        const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !bookData[field]);
        if (missing.length) {
             return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
        }
        
        if (!bookData.SrNo) {
            bookData.SrNo = generateBackendSrNo();
            console.log(`Warning: SrNo not provided by frontend. Generating fallback: ${bookData.SrNo}`);
        }
        
        // POST: bookData now includes the 'Reader' field if sent by the client.
        await sheet.addRow(bookData); 
        res.status(201).json({ message: 'Book added successfully!', srNo: bookData.SrNo });
    } catch (error) {
        console.error('Error adding book:', error);
        res.status(500).json({ message: 'Error adding book', error: error.message });
    }
});

// ----------------------------------------------------
// 📚 LIST & FILTER SEARCH BOOKS (GET)
// ----------------------------------------------------
app.get('/api/books', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const rows = await sheet.getRows();
        
        let books = rows.map((row) => {
            return {
                rowIndex: row.rowNumber, 
                Class: row.get('Class'),
                SrNo: row.get('SrNo'), 
                'Book Name': row.get('Book Name'),
                Volume: row.get('Volume'),
                Date: row.get('Date'),
                'Book Price': row.get('Book Price'),
                Room: row.get('Room'),
                Kapat: row.get('Kapat'),
                other1: row.get('other1'),
                other2: row.get('other2'),
                // 🔑 ADDED: Map the new 'Reader' column
                Writer:row.get("Writer"),
                Reader: row.get("Reader"), 
            };
        });
        
        const { class: classFilter, search: searchTerm } = req.query; 

        // 1. APPLY CLASS FILTER
        if (classFilter && classFilter !== 'All') {
            books = books.filter(book => 
                String(book.Class).toLowerCase() === classFilter.toLowerCase()
            );
        }

        // 2. APPLY GENERAL SEARCH TERM FILTER (This will now also search the 'Reader' field)
        if (searchTerm) {
            const lowerSearch = searchTerm.toLowerCase();
            books = books.filter(book => 
                Object.values(book).some(value => 
                    String(value).toLowerCase().includes(lowerSearch)
                )
            );
        }

        res.status(200).json(books);
    } catch (error) {
        console.error('Error fetching books:', error);
        res.status(500).json({ message: 'Error fetching books', error: error.message });
    }
});

// ----------------------------------------------------
// ✏️ EDIT BOOK FACILITY (PUT)
// ----------------------------------------------------
// app.put('/api/books/:srNo', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const srNoToUpdate = req.params.srNo;
//         const updatedData = req.body;

//         const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !updatedData[field]);
//         if (missing.length) {
//              return res.status(400).json({ message: `Missing required fields for update: ${missing.join(', ')}` });
//         }
        
//         const rows = await sheet.getRows();
//         const rowToUpdate = rows.find(row => String(row.get('SrNo')) === String(srNoToUpdate));
        
//         if (!rowToUpdate) {
//             return res.status(404).json({ message: `Book with SrNo ${srNoToUpdate} not found.` });
//         }

//         Object.keys(updatedData).forEach(key => {
//             let value = updatedData[key];
            
//             if (key === 'rowIndex') return; 

//             // 🔑 UPDATED: Use the new NUMERIC_FIELDS constant here
//             const isNumericField = NUMERIC_FIELDS.includes(key);

//             if (isNumericField) {
//                 if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
//                     value = 0; 
//                 } else {
//                     value = Number(value);
//                 }
//             } else {
//                 if (value === null || value === undefined) {
//                     value = '';
//                 } else {
//                     value = String(value);
//                 }
//             }
            
//             // PUT: rowToUpdate.set will now correctly save the 'Reader' value
//             rowToUpdate.set(key, value);
//         });

//         await rowToUpdate.save();
//         res.status(200).json({ message: `Book ${srNoToUpdate} updated successfully!` });
//     } catch (error) {
//         console.error('FATAL Error updating book:', error.message, error.stack);
//         res.status(500).json({ message: 'Error updating book', error: error.message });
//     }
// });
// ----------------------------------------------------
// ✏️ EDIT BOOK FACILITY (PUT) - OPTIMIZED FOR ROBUSTNESS
// ----------------------------------------------------
// In your Node.js/Express server file:
// Define this constant globally, as you already have:
// const NUMERIC_FIELDS = ['SrNo', 'Volume', 'Book Price']; 

// ----------------------------------------------------
// ✏️ EDIT BOOK FACILITY (PUT) - COMPLETE & CORRECTED
// ----------------------------------------------------
// ----------------------------------------------------
// ✏️ EDIT BOOK FACILITY (PUT) - COMPLETE & CORRECTED
// ----------------------------------------------------
app.put('/api/books/:srNo', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const srNoToUpdate = req.params.srNo; // <--- RE-ADDED
        const updatedData = req.body;         // <--- RE-ADDED

        const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !updatedData[field]);
        if (missing.length) {
              return res.status(400).json({ message: `Missing required fields for update: ${missing.join(', ')}` });
        }
        
        const rows = await sheet.getRows(); // <--- RE-ADDED
        const rowToUpdate = rows.find(row => String(row.get('SrNo')) === String(srNoToUpdate));
        
        if (!rowToUpdate) {
            return res.status(404).json({ message: `Book with SrNo ${srNoToUpdate} not found.` });
        }

        // --- Data Normalization Logic (The Robust Part) ---
        Object.keys(updatedData).forEach(key => {
            // Skip the internal 'rowIndex' field
            if (key === 'rowIndex') return; 

            let value = updatedData[key];
            
            // 1. Determine if the field is expected to be numeric
            const isNumericField = NUMERIC_FIELDS.includes(key);

            if (isNumericField) {
                // For numeric fields, convert to a number, defaulting to 0
                const numValue = Number(value);
                // CRITICAL CHECK: Handles null, undefined, '', and NaN safely
                value = isNaN(numValue) || value === null || value === '' ? 0 : numValue;
            } else {
                // For all other fields (strings), ensure they are non-null strings
                value = (value === null || value === undefined) ? '' : String(value);
            }
            
            rowToUpdate.set(key, value);
        });
        // --- End Data Normalization Logic ---

        await rowToUpdate.save(); 
        
        res.status(200).json({ message: `Book ${srNoToUpdate} updated successfully!` });
    } catch (error) {
        console.error('FATAL Error updating book:', error.message, error.stack);
        res.status(500).json({ message: 'Error updating book', error: error.message });
    }
});
// ----------------------------------------------------
// 🗑️ DELETE BOOK FACILITY (DELETE)
// ----------------------------------------------------
app.delete('/api/books/:srNo', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const srNoToDelete = req.params.srNo;
        
        const rows = await sheet.getRows();
        const rowToDelete = rows.find(row => String(row.get('SrNo')) === String(srNoToDelete));
        
        if (!rowToDelete) {
            return res.status(404).json({ message: `Book with SrNo ${srNoToDelete} not found.` });
        }

        await rowToDelete.delete();

        res.status(200).json({ message: `Book ${srNoToDelete} deleted successfully!` });
    } catch (error) {
        console.error('Error deleting book:', error);
        res.status(500).json({ message: 'Error deleting book', error: error.message });
    }
});

// ----------------------------------------------------
// VERCEL EXPORT
// ----------------------------------------------------
module.exports = app;
// require('dotenv').config();
// const express = require('express');
// const { GoogleSpreadsheet } = require('google-spreadsheet');
// const { JWT } = require('google-auth-library');
// const cors = require('cors');

// const app = express();
// const port = 5000;

// // Middleware
// app.use(cors());
// app.use(express.json());

// // Google Sheet Setup - Modified for Vercel Serverless
// let doc; // Declare doc outside the try block so loadSheet can access it
// console.log(process.env.GOOGLE_CREDENTIALS,"value")
// try {
//     const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
//     // JWT authentication setup
//     const serviceAccountAuth = new JWT({
//         email: credentials.client_email,
        
//         // CRITICAL FIX: Ensure the private key is cleaned up correctly.
//         key: credentials.private_key.replace(/\\n/g, '\n'),
        
//         scopes: ['https://www.googleapis.com/auth/spreadsheets'],
//     });

//     doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);
    
// } catch (e) {
//     // 🛑 VERCEL CRITICAL FIX: DO NOT use process.exit(1) in a serverless function!
//     console.error("!!! FATAL CONFIGURATION ERROR !!!");
//     console.error("Original Error: Could not initialize Google Sheets connection.", e.message);
//     // Setting doc to null/undefined will cause the loadSheet() function to throw an error 
//     // when an API endpoint is hit, but it allows the function to boot.
//     doc = null; 
// }

// // Function to load the sheet (now checks for initialization status)
// async function loadSheet() {
//     if (!doc) {
//         throw new Error("API Initialization failed. Check Vercel GOOGLE_CREDENTIALS and SPREADSHEET_ID variables.");
//     }
//     // Optimization: only load info if it hasn't been loaded yet.
//     if (!doc.isLoaded) {
//         await doc.loadInfo(); 
//     }
//     return doc.sheetsByIndex[1]; // Assuming data is in the second sheet (index 1)
// }

// // Define required fields ONCE for both POST and PUT
// const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
// const generateBackendSrNo = () => {
//     const uniquePart = Date.now().toString().slice(-6);
//     return Number(uniquePart) + Math.floor(Math.random() * 1000); 
// };
// // ----------------------------------------------------
// // 📖 ADD BOOK FACILITY (POST)
// // ----------------------------------------------------
// app.post('/api/books', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         let bookData = req.body;

//         const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !bookData[field]);
//         if (missing.length) {
//              return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
//         }
        
//         if (!bookData.SrNo) {
//             bookData.SrNo = generateBackendSrNo();
//             console.log(`Warning: SrNo not provided by frontend. Generating fallback: ${bookData.SrNo}`);
//         }
        
//         await sheet.addRow(bookData); 
//         res.status(201).json({ message: 'Book added successfully!', srNo: bookData.SrNo });
//     } catch (error) {
//         console.error('Error adding book:', error);
//         res.status(500).json({ message: 'Error adding book', error: error.message });
//     }
// });

// // ----------------------------------------------------
// // 📚 LIST & FILTER SEARCH BOOKS (GET)
// // ----------------------------------------------------
// app.get('/api/books', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const rows = await sheet.getRows();
        
//         let books = rows.map((row) => {
//             return {
//                 rowIndex: row.rowNumber, 
//                 Class: row.get('Class'),
//                 SrNo: row.get('SrNo'), 
//                 'Book Name': row.get('Book Name'),
//                 Volume: row.get('Volume'),
//                 Date: row.get('Date'),
//                 'Book Price': row.get('Book Price'),
//                 Room: row.get('Room'),
//                 Kapat: row.get('Kapat'),
//                 other1: row.get('other1'),
//                 other2: row.get('other2'),
//             };
//         });
        
//         const { class: classFilter, search: searchTerm } = req.query; 

//         // 1. APPLY CLASS FILTER
//         if (classFilter && classFilter !== 'All') {
//             books = books.filter(book => 
//                 String(book.Class).toLowerCase() === classFilter.toLowerCase()
//             );
//         }

//         // 2. APPLY GENERAL SEARCH TERM FILTER
//         if (searchTerm) {
//             const lowerSearch = searchTerm.toLowerCase();
//             books = books.filter(book => 
//                 Object.values(book).some(value => 
//                     String(value).toLowerCase().includes(lowerSearch)
//                 )
//             );
//         }

//         res.status(200).json(books);
//     } catch (error) {
//         console.error('Error fetching books:', error);
//         res.status(500).json({ message: 'Error fetching books', error: error.message });
//     }
// });

// // ----------------------------------------------------
// // ✏️ EDIT BOOK FACILITY (PUT)
// // ----------------------------------------------------
// app.put('/api/books/:srNo', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const srNoToUpdate = req.params.srNo;
//         const updatedData = req.body;

//         const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !updatedData[field]);
//         if (missing.length) {
//              return res.status(400).json({ message: `Missing required fields for update: ${missing.join(', ')}` });
//         }
        
//         const rows = await sheet.getRows();
//         const rowToUpdate = rows.find(row => String(row.get('SrNo')) === String(srNoToUpdate));
        
//         if (!rowToUpdate) {
//             return res.status(404).json({ message: `Book with SrNo ${srNoToUpdate} not found.` });
//         }

//         Object.keys(updatedData).forEach(key => {
//             let value = updatedData[key];
            
//             if (key === 'rowIndex') return; 

//             const isNumericField = ['SrNo', 'Volume', 'Book Price'].includes(key);

//             if (isNumericField) {
//                 if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
//                     value = 0; 
//                 } else {
//                     value = Number(value);
//                 }
//             } else {
//                 if (value === null || value === undefined) {
//                     value = '';
//                 } else {
//                     value = String(value);
//                 }
//             }
            
//             rowToUpdate.set(key, value);
//         });

//         await rowToUpdate.save();
//         res.status(200).json({ message: `Book ${srNoToUpdate} updated successfully!` });
//     } catch (error) {
//         console.error('FATAL Error updating book:', error.message, error.stack);
//         res.status(500).json({ message: 'Error updating book', error: error.message });
//     }
// });

// // ----------------------------------------------------
// // 🗑️ DELETE BOOK FACILITY (DELETE)
// // ----------------------------------------------------
// app.delete('/api/books/:srNo', async (req, res) => {
//     try {
//         const sheet = await loadSheet();
//         const srNoToDelete = req.params.srNo;
        
//         const rows = await sheet.getRows();
//         const rowToDelete = rows.find(row => String(row.get('SrNo')) === String(srNoToDelete));
        
//         if (!rowToDelete) {
//             return res.status(404).json({ message: `Book with SrNo ${srNoToDelete} not found.` });
//         }

//         await rowToDelete.delete();

//         res.status(200).json({ message: `Book ${srNoToDelete} deleted successfully!` });
//     } catch (error) {
//         console.error('Error deleting book:', error);
//         res.status(500).json({ message: 'Error deleting book', error: error.message });
//     }
// });

// // ----------------------------------------------------
// // VERCEL EXPORT
// // ----------------------------------------------------
// module.exports = app;
