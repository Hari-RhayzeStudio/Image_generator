const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000; // Using 5000 as per your React code

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' })); // Increase limit for Base64 data
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Static Folders ---
// Serve the 'uploads' folder for temporary reference images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
// Serve the 'public/images' folder for persistent, saved images
app.use('/images', express.static(path.join(__dirname, 'public/images')));

// --- Ensure Directories Exist ---
const uploadDir = 'uploads/';
const publicImagesDir = path.join(__dirname, 'public/images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(publicImagesDir)) fs.mkdirSync(publicImagesDir, { recursive: true });

// --- Multer Config (for /api/generate-image) ---
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed!'), false);
  }
});

// --- MongoDB Connection ---
// Connecting to your new database 'Image_generated_data'
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Image_generated_data', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB (Image_generated_data)'))
.catch(err => console.error('MongoDB connection error:', err));

// --- NEW Product Schema ---
// Based on your 'Google_sheet_data' collection
const productSchema = new mongoose.Schema({
  // Using quotes for fields with spaces
  'SKU': { type: Number, required: true, unique: true },
  'Status': { type: String, default: 'Pending' },
  'Pre-Image URL': { type: String, default: null },
  'Category': { type: String, default: null },
  'Wax Image URL': { type: String, default: null },
  'Cast Image URL': { type: String, default: null },
  'Final Image URL': { type: String, default: null },
  'Wax Description': { type: String, default: null },
  'Cast Description': { type: String, default: null },
  'Final Description': { type: String, default: null },
  'Created at': { type: Date, default: Date.now }
});

// Helper function to check fulfillment status
function checkFulfillment(product) {
  const urlsFilled = product['Pre-Image URL'] &&
                     product['Wax Image URL'] &&
                     product['Cast Image URL'] &&
                     product['Final Image URL'];
                     
  const descsFilled = product['Wax Description'] &&
                      product['Cast Description'] &&
                      product['Final Description'];
                      
  return urlsFilled && descsFilled;
}

// Model for the 'Google_sheet_data' collection
const Product = mongoose.model('Product', productSchema, 'Google_sheet_data');


// --- API Routes ---

app.get('/', (req, res) => {
  res.json({ message: 'PIXSHOP API Server is running!' });
});

// Generate image endpoint (Unchanged from your code)
app.post('/api/generate-image', upload.single('referenceImage'), async (req, res) => {
  try {
    const { prompt } = req.body;
    const referenceImagePath = req.file ? req.file.path : null;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }
    console.log('Generating image with prompt:', prompt);

    const result = await generateImageWithGoogleAI(prompt, referenceImagePath);
    const { imageBuffer, modelUsed, imageFormat } = result;

    console.log(`Image generated successfully using ${modelUsed}`);
    
    res.set({
      'Content-Type': `image/${imageFormat}`,
      'Content-Length': imageBuffer.length,
      'X-Model-Used': modelUsed,
      'X-Image-Size': imageBuffer.length.toString()
    });

    res.send(imageBuffer);

    if (referenceImagePath && fs.existsSync(referenceImagePath)) {
      fs.unlinkSync(referenceImagePath);
    }
  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image: ' + error.message });
  }
});


// --- NEW Endpoint to update product image ---
app.post('/api/update-product-image', async (req, res) => {
  try {
    const { sku, imageType, imageDataUrl } = req.body; // e.g., imageType = "Wax"

    if (!sku || !imageType || !imageDataUrl) {
      return res.status(400).json({ error: 'SKU, imageType, and imageDataUrl are required' });
    }
    
    // 1. Find the product by SKU
    const product = await Product.findOne({ 'SKU': sku });
    if (!product) {
      return res.status(404).json({ error: `Product with SKU ${sku} not found.` });
    }

    // 2. Process and save the image from Base64 data URL
    if (!imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid imageDataUrl format' });
    }

    const base64Data = imageDataUrl.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const formatMatch = imageDataUrl.match(/data:image\/([^;]+)/);
    const extension = formatMatch ? formatMatch[1].split(';')[0] : 'png';
    
    const filename = `${sku}_${imageType}.${extension}`;
    const imagePath = path.join(publicImagesDir, filename);

    // Save the image to the persistent public folder
    fs.writeFileSync(imagePath, imageBuffer);

    // 3. Create the public URL
    const publicImageUrl = `http://localhost:${PORT}/images/${filename}`;

    // 4. Update the correct field in the product document
    const fieldToUpdate = `${imageType} Image URL`; // "Wax Image URL", "Cast Image URL", etc.
    if (!productSchema.path(fieldToUpdate)) {
        return res.status(400).json({ error: `Invalid imageType: ${imageType}` });
    }
    product[fieldToUpdate] = publicImageUrl;

    // 5. Check fulfillment status and update if necessary
    const isFulfilled = checkFulfillment(product);
    if (isFulfilled && product.Status === 'Pending') {
      product.Status = 'Fulfilled';
      product['Created at'] = new Date(); // Update timestamp as requested
      console.log(`Product ${sku} status updated to Fulfilled.`);
    }

    // 6. Save the updated product
    await product.save();

    res.json({
      message: `Image for SKU ${sku} saved as ${imageType} successfully.`,
      product
    });

  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: 'Failed to save image: ' + error.message });
  }
});


// Google AI Studio API integration (Unchanged from your code)
async function generateImageWithGoogleAI(prompt, referenceImagePath) {
  // ... (Your existing generateImageWithGoogleAI function remains here)
  // ...
  // Note: This function's API endpoint is likely misconfigured.
  // Imagen models usually use 'aiplatform.googleapis.com', not 'generativelanguage.googleapis.com'.
  // But the save logic below will work if this function successfully returns a buffer.
  // --- [Your existing function code] ---
  try {
    const API_KEY = process.env.GOOGLE_AI_API_KEY;

    if (!API_KEY) {
      throw new Error('Google AI API key not configured');
    }
    const imagenModels = [
      'imagen-4.0-generate-preview-06-06',
      'imagen-3.0-generate-002'
    ];

    for (const model of imagenModels) {
      try {
        console.log(`Trying Imagen model: ${model}`);
        const imagenResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${API_KEY}`,
          {
            instances: [
              {
                prompt: prompt,
                ...(referenceImagePath && {
                  reference_image: {
                    bytesBase64Encoded: fs.readFileSync(referenceImagePath).toString('base64')
                  }
                })
              }
            ]
          },
          {
            headers: { 'Content-Type': 'application/json' },
            responseType: 'json',
            timeout: 30000 
          }
        );
        if (imagenResponse.data.predictions && imagenResponse.data.predictions.length > 0) {
          const prediction = imagenResponse.data.predictions[0];
          if (prediction.bytesBase64Encoded) {
            const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
            let imageFormat = 'png'; // default
            if (prediction.mimeType) {
              const mimeType = prediction.mimeType;
              if (mimeType.includes('jpeg') || mimeType.includes('jpg')) imageFormat = 'jpeg';
              else if (mimeType.includes('gif')) imageFormat = 'gif';
              else if (mimeType.includes('webp')) imageFormat = 'webp';
            }
            return { imageBuffer, modelUsed: model, imageFormat };
          } else { throw new Error('No bytesBase64Encoded in prediction'); }
        } else { throw new Error('No predictions found in response'); }
      } catch (imagenError) {
        console.log(`❌ Imagen ${model} failed: ${imagenError.message}`);
        if (imagenError.response) console.log(`  Response: ${JSON.stringify(imagenError.response.data)}`);
        continue; 
      }
    }
    throw new Error('All configured Imagen models failed.');
  } catch (error) {
    console.error('Google AI API error:', error.message);
    throw new Error('Image generation failed: ' + error.message);
  }
}

// Error handling middleware (Unchanged)
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

// ... (all your other code) ...

// --- NEW Endpoint to update product image ---
app.post('/api/update-product-image', async (req, res) => {
  // --- ADD DEBUGGING ---
  console.log('✅ /api/update-product-image route was hit!');
  // ---
  
  try {
    const { sku, imageType, imageDataUrl } = req.body; 

    // --- ADD DEBUGGING ---
    console.log('Received SKU:', sku);
    console.log('Received ImageType:', imageType);
    console.log('Received Data URL (first 50 chars):', imageDataUrl ? imageDataUrl.substring(0, 50) : 'No Data URL');
    // ---

    if (!sku || !imageType || !imageDataUrl) {
      console.log('❌ Validation failed: Missing data.'); // Debug
      return res.status(400).json({ error: 'SKU, imageType, and imageDataUrl are required' });
    }
    
    // 1. Find the product by SKU
    console.log(`Searching for product with SKU: ${sku}`); // Debug
    const product = await Product.findOne({ 'SKU': sku });
    if (!product) {
      console.log('❌ Error: Product not found.'); // Debug
      return res.status(404).json({ error: `Product with SKU ${sku} not found.` });
    }
    console.log('Found product:', product.SKU); // Debug

    // ... (rest of your image processing logic) ...
    // ... (fs.writeFileSync, etc.) ...

    // 4. Update the correct field
    const fieldToUpdate = `${imageType} Image URL`;
    if (!productSchema.path(fieldToUpdate)) {
        console.log(`❌ Error: Invalid imageType: ${imageType}`); // Debug
        return res.status(400).json({ error: `Invalid imageType: ${imageType}` });
    }
    product[fieldToUpdate] = publicImageUrl;
    console.log(`Updated field '${fieldToUpdate}' with URL: ${publicImageUrl}`); // Debug

    // 5. Check fulfillment status
    const isFulfilled = checkFulfillment(product);
    if (isFulfilled && product.Status === 'Pending') {
      product.Status = 'Fulfilled';
      product['Created at'] = new Date(); 
      console.log(`✅ Product ${sku} status updated to Fulfilled.`); // Debug
    }

    // 6. Save the updated product
    await product.save();
    console.log('✅ Product saved successfully.'); // Debug

    res.json({
      // This is the success message your frontend will receive
      message: `Image for SKU ${sku} was saved successfully as ${imageType}.`,
      product
    });

  } catch (error) {
    // --- ADD DEBUGGING ---
    console.error('❌ Error in /api/update-product-image:', error.message);
    // ---
    res.status(500).json({ error: 'Failed to save image: ' + error.message });
  }
});

// ... (rest of your server code) ...