const express = require('express');
const cors = require('cors');
const multer = require('multer');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const axios = require('axios'); // Moved to top-level imports
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = 'uploads/';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + '-' + file.originalname);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

// MongoDB connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/pixshopDB', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Image Schema
const imageSchema = new mongoose.Schema({
  prompt: {
    type: String,
    required: true
  },
  imageUrl: {
    type: String,
    required: true
  },
  imageData: {
    type: Buffer,
    required: false
  },
  imageFormat: {
    type: String,
    default: 'png'
  },
  imageSize: {
    type: Number,
    default: 0
  },
  referenceImage: {
    type: String,
    default: null
  },
  modelUsed: {
    type: String,
    default: 'unknown'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

const Image = mongoose.model('Image', imageSchema);

// Routes
app.get('/', (req, res) => {
  res.json({ message: 'PIXSHOP API Server is running!' });
});

// Generate image endpoint
app.post('/api/generate-image', upload.single('referenceImage'), async (req, res) => {
  try {
    const { prompt } = req.body;
    const referenceImagePath = req.file ? req.file.path : null;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    console.log('Generating image with prompt:', prompt);
    console.log('Reference image:', referenceImagePath ? 'Yes' : 'No');

    // Call Google AI Studio API
    const result = await generateImageWithGoogleAI(prompt, referenceImagePath);

    // result is now an object with buffer, model, and format info
    const { imageBuffer, modelUsed, imageFormat } = result;

    console.log(`Image generated successfully using ${modelUsed}`);
    console.log(`Image format: ${imageFormat}, Size: ${imageBuffer.length} bytes`);

    // Set appropriate headers for image response
    res.set({
      'Content-Type': `image/${imageFormat}`,
      'Content-Length': imageBuffer.length,
      'X-Model-Used': modelUsed,
      'X-Image-Size': imageBuffer.length.toString()
    });

    res.send(imageBuffer);

    // Clean up uploaded reference image
    if (referenceImagePath && fs.existsSync(referenceImagePath)) {
      fs.unlinkSync(referenceImagePath);
    }

  } catch (error) {
    console.error('Error generating image:', error);
    res.status(500).json({ error: 'Failed to generate image: ' + error.message });
  }
});

// Save image to MongoDB endpoint
app.post('/api/save-image', async (req, res) => {
  try {
    const { prompt, imageUrl, referenceImage, modelUsed, imageSize } = req.body;

    if (!prompt || !imageUrl) {
      return res.status(400).json({ error: 'Prompt and imageUrl are required' });
    }

    // Convert data URL to buffer if needed
    let imageData = null;
    let imageFormat = 'png';

    if (imageUrl.startsWith('data:image/')) {
      // Extract base64 data from data URL
      const base64Data = imageUrl.split(',')[1];
      imageData = Buffer.from(base64Data, 'base64');

      // Extract format from data URL
      const formatMatch = imageUrl.match(/data:image\/([^;]+)/);
      if (formatMatch) {
        imageFormat = formatMatch[1];
      }
    }

    const newImage = new Image({
      prompt,
      imageUrl,
      imageData,
      imageFormat,
      imageSize: imageSize || (imageData ? imageData.length : 0),
      referenceImage,
      modelUsed: modelUsed || 'unknown'
    });

    await newImage.save();

    res.json({
      message: 'Image saved successfully',
      imageId: newImage._id,
      modelUsed: newImage.modelUsed,
      imageSize: newImage.imageSize,
      imageFormat: newImage.imageFormat
    });

  } catch (error) {
    console.error('Error saving image:', error);
    res.status(500).json({ error: 'Failed to save image: ' + error.message });
  }
});

// Get all saved images
app.get('/api/images', async (req, res) => {
  try {
    const images = await Image.find().sort({ createdAt: -1 });
    res.json(images);
  } catch (error) {
    console.error('Error fetching images:', error);
    res.status(500).json({ error: 'Failed to fetch images: ' + error.message });
  }
});

// Google AI Studio API integration
async function generateImageWithGoogleAI(prompt, referenceImagePath) {
  try {
    const API_KEY = process.env.GOOGLE_AI_API_KEY;

    if (!API_KEY) {
      throw new Error('Google AI API key not configured');
    }

    console.log('Attempting to generate image with Google AI Studio API...');
    console.log('Prompt:', prompt);
    console.log('Reference image:', referenceImagePath ? 'Yes' : 'No');
    
    // IMPORTANT: Ensure these model names are correct and that your API key
    // has access to them.
    const imagenModels = [
      'imagen-4.0-generate-preview-06-06',
      'imagen-3.0-generate-002'
    ];

    for (const model of imagenModels) {
      try {
        console.log(`Trying Imagen model: ${model}`);

        // NOTE: The endpoint 'generativelanguage.googleapis.com' is typically for
        // Gemini (text) models. Imagen models are often hosted on Vertex AI
        // ('aiplatform.googleapis.com'). Verify this URL is correct for your models.
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
            headers: {
              'Content-Type': 'application/json',
            },
            responseType: 'json',
            timeout: 30000 // 30-second timeout
          }
        );

        console.log('Response structure:', JSON.stringify(imagenResponse.data, null, 2));

        // Handle Imagen API response format
        let imageBuffer;

        if (imagenResponse.data.predictions && imagenResponse.data.predictions.length > 0) {
          const prediction = imagenResponse.data.predictions[0];
          console.log(`Found ${imagenResponse.data.predictions.length} predictions, using the first one`);

          if (prediction.bytesBase64Encoded) {
            console.log(`Image data length: ${prediction.bytesBase64Encoded.length} characters`);
            imageBuffer = Buffer.from(prediction.bytesBase64Encoded, 'base64');
            console.log(`Converted to buffer size: ${imageBuffer.length} bytes`);
          } else {
            console.log('Available prediction keys:', Object.keys(prediction));
            throw new Error('No bytesBase64Encoded found in prediction');
          }
        } else {
          console.log('Available response keys:', Object.keys(imagenResponse.data));
          throw new Error('No predictions found in response');
        }

        console.log(`Image buffer size: ${imageBuffer.length} bytes`);

        // Determine image format from MIME type or buffer
        let imageFormat = 'png'; // default

        if (imagenResponse.data.predictions[0].mimeType) {
          const mimeType = imagenResponse.data.predictions[0].mimeType;
          console.log('MIME type from API:', mimeType);
          if (mimeType.includes('jpeg') || mimeType.includes('jpg')) {
            imageFormat = 'jpeg';
          } else if (mimeType.includes('png')) {
            imageFormat = 'png';
          } else if (mimeType.includes('gif')) {
            imageFormat = 'gif';
          } else if (mimeType.includes('webp')) {
            imageFormat = 'webp';
          }
        } else {
          // Fallback to buffer analysis
          if (imageBuffer[0] === 0xFF && imageBuffer[1] === 0xD8) {
            imageFormat = 'jpeg';
          } else if (imageBuffer[0] === 0x89 && imageBuffer[1] === 0x50) {
            imageFormat = 'png';
          } else if (imageBuffer[0] === 0x47 && imageBuffer[1] === 0x49) {
            imageFormat = 'gif';
          }
        }

        return {
          imageBuffer,
          modelUsed: model,
          imageFormat
        };

      } catch (imagenError) {
        console.log(`❌ Imagen ${model} failed: ${imagenError.message}`);
        if (imagenError.response) {
          console.log(`   Status: ${imagenError.response.status}`);
          console.log(`   Response: ${JSON.stringify(imagenError.response.data)}`);
        }
        continue; // Try the next model
      }
    }

    // If the loop finishes without returning, all models failed.
    throw new Error('All configured Imagen models failed to generate an image.');

  } catch (error) {
    console.error('Google AI API error:', error.message);
    // Re-throw the error to be caught by the main route handler
    throw new Error('Image generation failed: ' + error.message);
  }
}

// Error handling middleware
app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'File too large. Maximum size is 10MB.' });
    }
  }
  // Generic error handler
  res.status(500).json({ error: error.message });
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});