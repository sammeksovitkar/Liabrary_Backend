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

// Google Sheet Setup
try {
    const credentials = JSON.parse(process.env.GOOGLE_CREDENTIALS);
    
    // JWT authentication setup
    const serviceAccountAuth = new JWT({
        email: credentials.client_email,
        
        // CRITICAL FIX: Ensure the private key is cleaned up correctly.
        key: credentials.private_key.replace(/\\n/g, '\n'),
        
        scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID, serviceAccountAuth);

    async function loadSheet() {
        await doc.loadInfo(); // loads document properties and worksheets
        return doc.sheetsByIndex[1]; // Assuming data is in the second sheet (index 1)
    }

    // Define required fields ONCE for both POST and PUT
    const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
const generateBackendSrNo = () => {
    // Generates a large number from the current time.
    const uniquePart = Date.now().toString().slice(-6);
    return Number(uniquePart) + Math.floor(Math.random() * 1000); 
};
    // ----------------------------------------------------
    // 📖 ADD BOOK FACILITY (POST)
    // ----------------------------------------------------
   app.post('/api/books', async (req, res) => {
    try {
        const sheet = await loadSheet();
        let bookData = req.body; // Use 'let' because we might modify it

        // Validation (Uses centralized list)
        const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !bookData[field]);
        if (missing.length) {
             return res.status(400).json({ message: `Missing fields: ${missing.join(', ')}` });
        }
        
        // 🔑 CHECK AND ASSIGN SrNo IF NOT PROVIDED BY FRONTEND
        // Since you are generating it on the frontend, this acts as a safe fallback.
        if (!bookData.SrNo) {
            bookData.SrNo = generateBackendSrNo();
            console.log(`Warning: SrNo not provided by frontend. Generating fallback: ${bookData.SrNo}`);
        }
        
        // Append the new row to the sheet (includes the SrNo, either from frontend or fallback)
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
                    // Map ALL fields from the Google Sheet row to a clean JS object
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
                };
            });
            
            // 🔑 FIX: Retrieve both 'class' and 'search' query parameters
            // Your frontend calls handleSearch(selectedClass, newSearchTerm), 
            // which translates to: /api/books?class=I&search=math
            const { class: classFilter, search: searchTerm } = req.query; 

            // 1. APPLY CLASS FILTER
            // Filter if a class is provided AND it's not 'All'
            if (classFilter && classFilter !== 'All') {
                books = books.filter(book => 
                    // Use the exact data key for 'Class'
                    String(book.Class).toLowerCase() === classFilter.toLowerCase()
                );
            }

            // 2. APPLY GENERAL SEARCH TERM FILTER
            if (searchTerm) {
                const lowerSearch = searchTerm.toLowerCase();
                books = books.filter(book => 
                    // Check all string values in the book object
                    Object.values(book).some(value => 
                        String(value).toLowerCase().includes(lowerSearch)
                    )
                );
            }

            // The resulting 'books' array now contains records filtered by class and search term
            res.status(200).json(books);
        } catch (error) {
            console.error('Error fetching books:', error);
            res.status(500).json({ message: 'Error fetching books', error: error.message });
        }
    });

// ... (in server.js) ...
// ... (Your imports and other endpoints remain the same) ...

// ----------------------------------------------------
// ✏️ EDIT BOOK FACILITY (PUT) - FINAL ROBUST FIX
// ----------------------------------------------------
app.put('/api/books/:srNo', async (req, res) => {
    try {
        const sheet = await loadSheet();
        const srNoToUpdate = req.params.srNo;
        const updatedData = req.body;

        // Ensure required fields are present (safety check)
        const REQUIRED_FIELDS_FOR_BOOK = ['Class', 'Book Name', 'Book Price'];
        const missing = REQUIRED_FIELDS_FOR_BOOK.filter(field => !updatedData[field]);
        if (missing.length) {
             return res.status(400).json({ message: `Missing required fields for update: ${missing.join(', ')}` });
        }
        
        // Fetch all rows to find the one by SrNo
        const rows = await sheet.getRows();
        // Use String() conversion to match the SrNo from the URL (which is a string)
        const rowToUpdate = rows.find(row => String(row.get('SrNo')) === String(srNoToUpdate));
        
        if (!rowToUpdate) {
            return res.status(404).json({ message: `Book with SrNo ${srNoToUpdate} not found.` });
        }

        // 🔑 ROBUST UPDATE LOGIC: Iterate over all incoming keys and handle values safely
        Object.keys(updatedData).forEach(key => {
            let value = updatedData[key];
            
            // 1. Skip the rowIndex/rowNumber if it's accidentally sent
            if (key === 'rowIndex') return; 

            // 2. Define fields that must be numbers
            const isNumericField = ['SrNo', 'Volume', 'Book Price'].includes(key);

            if (isNumericField) {
                // If the value is 0, null, undefined, or "", save it as 0 to avoid API errors.
                // The Google Sheets API is sometimes happier with 0 than an empty string for number cells.
                if (value === null || value === undefined || value === '' || isNaN(Number(value))) {
                    value = 0; 
                } else {
                    value = Number(value);
                }
            } else {
                // For string/date fields, convert null/undefined to an empty string.
                if (value === null || value === undefined) {
                    value = '';
                } else {
                    value = String(value); // Ensure all others are saved as strings
                }
            }
            
            // 3. Set the final value on the row object
            rowToUpdate.set(key, value);
        });

        // 4. Save the changes back to the sheet
        await rowToUpdate.save();
// res.status(500).json({ 
//             message: 'Error updating book: Server error. Check backend console for details.', 
//             detailedError: error.message 
//         });
console.log("hello")
        res.status(200).json({ message: `Book ${srNoToUpdate} updated successfully!` });
    } catch (error) {
        // CRITICAL: Log the detailed error from the Google Sheets API
        console.error('FATAL Error updating book:', error.message, error.stack);
        // res.status(500).json({ 
        //     message: 'Error updating book: Server error. Check backend console for details.', 
        //     detailedError: error.message 
        // });
    }
});
    // ----------------------------------------------------
    // 🗑️ DELETE BOOK FACILITY (DELETE)
    // ----------------------------------------------------
    app.delete('/api/books/:srNo', async (req, res) => {
        try {
            const sheet = await loadSheet();
            const srNoToDelete = req.params.srNo;
            
            // Fetch all rows to find the one by SrNo
            const rows = await sheet.getRows();
            const rowToDelete = rows.find(row => String(row.get('SrNo')) === String(srNoToDelete));
            
            if (!rowToDelete) {
                return res.status(404).json({ message: `Book with SrNo ${srNoToDelete} not found.` });
            }

            // Delete the row
            await rowToDelete.delete();

            res.status(200).json({ message: `Book ${srNoToDelete} deleted successfully!` });
        } catch (error) {
            console.error('Error deleting book:', error);
            res.status(500).json({ message: 'Error deleting book', error: error.message });
        }
    });

    // app.listen(port, () => {
    //     console.log(`Server listening at http://localhost:${port}`);
    // });

        module.exports = app;


} catch (e) {
    console.error("!!! FATAL CONFIGURATION ERROR !!!");
    console.error("Ensure your .env file is present and GOOGLE_CREDENTIALS is a single-quoted valid JSON string.");
    console.error("Original Error:", e.message);
    // Exit if configuration is bad
    process.exit(1); 
}