// backend/server.js

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const axios = require('axios');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// --- Middleware ---
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// --- Static Folders ---
const uploadDir = 'uploads/';
const publicImagesDir = path.join(__dirname, 'public/images');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(publicImagesDir)) fs.mkdirSync(publicImagesDir, { recursive: true });

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'public/images')));

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
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/Image_generated_data')
.then(() => console.log('Connected to MongoDB (Image_generated_data)'))
.catch(err => console.error('MongoDB connection error:', err));

// --- Product Schema ---
const productSchema = new mongoose.Schema({
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
  'Created At': { type: Date, default: Date.now }
});

// Helper function to check fulfillment status
function checkFulfillment(product) {
  const urlsFilled = product['Wax Image URL'] &&
                     product['Cast Image URL'] &&
                     product['Final Image URL'];
                     
  const descsFilled = product['Wax Description'] &&
                      product['Cast Description'] &&
                      product['Final Description'];
                      
  // Only set to Fulfilled if BOTH images and descriptions are done
  return urlsFilled && descsFilled;
}

const Product = mongoose.model('Product', productSchema, 'Google_sheet_data');


// --- API Routes ---

app.get('/', (req, res) => {
  res.json({ message: 'PIXSHOP API Server is running!' });
});

// --- Image Generation Endpoint (Unchanged) ---
app.post('/api/generate-image', upload.single('referenceImage'), async (req, res) => {
  try {
    const { prompt } = req.body;
    const referenceImagePath = req.file ? req.file.path : null;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });

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

// --- Image Save Endpoint (Unchanged) ---
app.post('/api/update-product-image', async (req, res) => {
  try {
    const { sku, imageType, imageDataUrl } = req.body;
    if (!sku || !imageType || !imageDataUrl) {
      return res.status(400).json({ error: 'SKU, imageType, and imageDataUrl are required' });
    }
    
    const product = await Product.findOne({ 'SKU': sku });
    if (!product) {
      return res.status(404).json({ error: `Product with SKU ${sku} not found.` });
    }

    if (!imageDataUrl.startsWith('data:image/')) {
      return res.status(400).json({ error: 'Invalid imageDataUrl format' });
    }

    const base64Data = imageDataUrl.split(',')[1];
    const imageBuffer = Buffer.from(base64Data, 'base64');
    const formatMatch = imageDataUrl.match(/data:image\/([^;]+)/);
    const extension = formatMatch ? formatMatch[1].split(';')[0] : 'png';
    
    const filename = `${sku}_${imageType}.${extension}`;
    const imagePath = path.join(publicImagesDir, filename);
    fs.writeFileSync(imagePath, imageBuffer);

    const publicImageUrl = `${process.env.SERVER_BASE_URL}/images/${filename}`;
    const fieldToUpdate = `${imageType} Image URL`;

    if (!productSchema.path(fieldToUpdate)) {
      return res.status(400).json({ error: `Invalid imageType: ${imageType}` });
    }
    product[fieldToUpdate] = publicImageUrl;

    if (checkFulfillment(product) && product.Status === 'Pending') {
      product.Status = 'Fulfilled';
      product['Created At'] = new Date();
      console.log(`Product ${sku} status updated to Fulfilled.`);
    }

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

// --- [NEW] Description Generation Endpoint ---
app.post('/api/generate-description', async (req, res) => {
  const { prompt } = req.body;
  if (!prompt) {
    return res.status(400).json({ error: 'Prompt is required' });
  }

  try {
    const description = await generateDescriptionWithGoogleAI(prompt);
    res.json({ description: description });
  } catch (error) {
    console.error('Error generating description:', error);
    res.status(500).json({ error: 'Failed to generate description: ' + error.message });
  }
});

// --- [NEW] Description Save Endpoint ---
app.post('/api/update-product-description', async (req, res) => {
  try {
    const { sku, descType, description } = req.body; // e.g., descType = "Wax"

    if (!sku || !descType || !description) {
      return res.status(400).json({ error: 'SKU, descType, and description are required' });
    }

    const product = await Product.findOne({ 'SKU': sku });
    if (!product) {
      return res.status(404).json({ error: `Product with SKU ${sku} not found.` });
    }

    const fieldToUpdate = `${descType} Description`; // "Wax Description", etc.
    if (!productSchema.path(fieldToUpdate)) {
      return res.status(400).json({ error: `Invalid descType: ${descType}` });
    }
    product[fieldToUpdate] = description;

    // Check fulfillment and update status if needed
    if (checkFulfillment(product) && product.Status === 'Pending') {
      product.Status = 'Fulfilled';
      product['Created At'] = new Date();
      console.log(`Product ${sku} status updated to Fulfilled.`);
    }

    await product.save();

    res.json({
      message: `Description for SKU ${sku} saved as ${descType} successfully.`,
      product
    });

  } catch (error)
 {
    console.error('Error saving description:', error);
    res.status(500).json({ error: 'Failed to save description: ' + error.message });
  }
});


// --- Google AI Helper Functions ---

// Image Generation (Unchanged)
async function generateImageWithGoogleAI(prompt, referenceImagePath) {
  // ... (Your existing function remains here)
  // [Make sure your full function is here]
  try {
    const API_KEY = process.env.GOOGLE_AI_API_KEY;
    if (!API_KEY) throw new Error('Google AI API key not configured');
    const imagenModels = ['imagen-4.0-generate-preview-06-06', 'imagen-3.0-generate-002'];
    for (const model of imagenModels) {
      try {
        console.log(`Trying Imagen model: ${model}`);
        const imagenResponse = await axios.post(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:predict?key=${API_KEY}`,
          {
            instances: [{
              prompt: prompt,
              ...(referenceImagePath && {
                reference_image: { bytesBase64Encoded: fs.readFileSync(referenceImagePath).toString('base64') }
              })
            }]
          },
          { headers: { 'Content-Type': 'application/json' }, responseType: 'json', timeout: 30000 }
        );
        if (imagenResponse.data.predictions && imagenResponse.data.predictions.length > 0) {
          const prediction = imagenResponse.data.predictions[0];
          if (prediction.bytesBase64Encoded) {
            const imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
            let imageFormat = 'png';
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

// [NEW] Description Generation
async function generateDescriptionWithGoogleAI(prompt) {
  try {
    const API_KEY = process.env.GOOGLE_AI_TEXT_API_KEY;
    if (!API_KEY) {
      throw new Error('Google AI TEXT API key not configured');
    }

    // Using the Gemini-Pro model. Replace if you have a different one.
    const model = 'gemini-2.5-flash';
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${API_KEY}`;

    const response = await axios.post(
      url,
      {
        contents: [{ parts: [{ text: prompt }] }]
      },
      {
        headers: { 'Content-Type': 'application/json' },
        timeout: 30000
      }
    );

    // Extract the text from the response
    const text = response.data.candidates[0].content.parts[0].text;
    return text;

  } catch (error) {
    console.error('Google AI Text API error:', error.message);
    if (error.response) {
      console.error('Response data:', error.response.data);
    }
    throw new Error('Text generation failed');
  }
}

// --- Error handling middleware (Unchanged) ---
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