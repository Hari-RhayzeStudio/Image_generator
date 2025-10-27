# PIXSHOP - AI Image Generator

A modern web application that generates images using Google AI Studio API and saves them to MongoDB. Built with ReactJS + Vite frontend and NodeJS backend.

## 🚀 Features

- **AI Image Generation**: Generate images from text prompts using Google AI Studio API
- **Reference Image Support**: Upload reference images to guide generation
- **MongoDB Integration**: Save generated images with metadata
- **Modern UI**: Beautiful, responsive interface with gradient backgrounds
- **Download & Save**: Download images locally or save to database
- **Real-time Feedback**: Loading states and error handling

## 📁 Project Structure

```
Image_generator/
├── frontend/                 # ReactJS + Vite frontend
│   ├── src/
│   │   ├── App.jsx          # Main application component
│   │   ├── App.css          # Styling
│   │   └── main.jsx         # Entry point
│   ├── package.json
│   └── vite.config.js
├── backend/                  # NodeJS + Express backend
│   ├── server.js            # Main server file
│   ├── package.json
│   └── env.example          # Environment variables template
└── README.md
```

## 🛠️ Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (v16 or higher)
- **npm** (comes with Node.js)
- **MongoDB** (local installation or MongoDB Atlas account)
- **Google AI Studio API Key** (get from [Google AI Studio](https://aistudio.google.com/))

## 📦 Installation & Setup

### 1. Clone/Download the Project

Navigate to your project directory:
```bash
cd Image_generator
```

### 2. Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install dependencies:
```bash
npm install
```

3. Create environment file:
```bash
# Copy the example environment file
copy env.example .env
```

4. Edit the `.env` file with your configuration:
```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/pixshop
GOOGLE_AI_API_KEY=your_actual_api_key_here
GOOGLE_AI_API_URL=https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:generateImage
```

### 3. Frontend Setup

1. Navigate to the frontend directory:
```bash
cd ../frontend
```

2. Install dependencies:
```bash
npm install
```

### 4. MongoDB Setup

#### Option A: Local MongoDB
1. Install MongoDB locally
2. Start MongoDB service:
```bash
# Windows
net start MongoDB

# macOS/Linux
sudo systemctl start mongod
```

#### Option B: MongoDB Atlas (Cloud)
1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/atlas)
2. Create a new cluster
3. Get your connection string
4. Update `MONGODB_URI` in your `.env` file

### 5. Google AI Studio API Setup

1. Go to [Google AI Studio](https://aistudio.google.com/)
2. Sign in with your Google account
3. Create a new API key
4. Copy the API key to your `.env` file

## 🚀 Running the Application

### Start the Backend Server

```bash
cd backend
npm run dev
```

The backend will start on `http://localhost:5000`

### Start the Frontend Development Server

Open a new terminal:

```bash
cd frontend
npm run dev
```

The frontend will start on `http://localhost:5173`

## 🌐 Usage

1. **Open the Application**: Navigate to `http://localhost:5173`
2. **Enter a Prompt**: Describe the image you want to generate
3. **Upload Reference Image** (Optional): Add a reference image to guide generation
4. **Generate Image**: Click "Generate Image" to create your AI image
5. **Download or Save**: Download the image locally or save it to MongoDB

## 🔧 API Endpoints

### Backend API Routes

- `GET /` - Health check
- `POST /api/generate-image` - Generate image from prompt
- `POST /api/save-image` - Save image to MongoDB
- `GET /api/images` - Get all saved images

### Example API Usage

```javascript
// Generate image
const formData = new FormData();
formData.append('prompt', 'A beautiful sunset over mountains');
formData.append('referenceImage', fileInput.files[0]); // optional

fetch('http://localhost:5000/api/generate-image', {
  method: 'POST',
  body: formData
})
.then(response => response.blob())
.then(blob => {
  const imageUrl = URL.createObjectURL(blob);
  // Display the generated image
});
```

## 🎨 Customization

### Frontend Styling
- Edit `frontend/src/App.css` to customize the appearance
- Modify colors, fonts, and layout as needed

### Backend Configuration
- Update `backend/server.js` to add new API endpoints
- Modify image generation parameters in the Google AI API call

## 🐛 Troubleshooting

### Common Issues

1. **MongoDB Connection Error**
   - Ensure MongoDB is running
   - Check your `MONGODB_URI` in `.env`

2. **Google AI API Error (Imagen requires billing)**
   - **Imagen models** (for actual image generation) require billing to be enabled
   - Error: "Imagen API is only accessible to billed users at this time"
   - **Solution**: The app automatically falls back to Gemini 2.5 Flash + enhanced placeholder images
   - **To enable real image generation**: Enable billing in Google Cloud Console
   - **Current status**: Gemini 2.5 Flash works perfectly for enhanced descriptions
   - **Test your setup**:
     ```bash
     cd backend
     node test-comprehensive.js
     ```

3. **Google AI API Key Issues**
   - Verify your API key is correct and active
   - Check if billing is enabled in Google Cloud Console
   - Ensure the API is enabled in your Google Cloud project
   - Get your API key from: https://aistudio.google.com/

4. **CORS Issues**
   - Ensure backend is running on port 5000
   - Check CORS configuration in `server.js`

5. **File Upload Issues**
   - Check file size limits (10MB max)
   - Ensure file is an image format

### Testing Your Google AI Studio API

Run the test script to verify your API connection:
```bash
cd backend
node test-api.js
```

This will test different API endpoints and help identify the correct format for your API key.

### Debug Mode

Enable debug logging by setting:
```env
NODE_ENV=development
```

### API Fallback Behavior

If the Google AI Studio API fails, the application will:
1. Log detailed error information
2. Generate a placeholder image with your prompt
3. Continue working normally
4. Allow you to save the placeholder image to MongoDB

This ensures your application always works, even if the external API is unavailable.

## 📝 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Backend server port | No (default: 5000) |
| `MONGODB_URI` | MongoDB connection string | Yes |
| `GOOGLE_AI_API_KEY` | Google AI Studio API key | Yes |
| `GOOGLE_AI_API_URL` | Google AI API endpoint | No (has default) |

## 🚀 Production Deployment

### Frontend Deployment
```bash
cd frontend
npm run build
# Deploy the 'dist' folder to your hosting service
```

### Backend Deployment
```bash
cd backend
npm start
# Deploy to services like Heroku, Railway, or DigitalOcean
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License.

## 🆘 Support

If you encounter any issues:

1. Check the troubleshooting section above
2. Verify all dependencies are installed
3. Ensure all environment variables are set correctly
4. Check that MongoDB and the backend server are running

## 🔮 Future Enhancements

- [ ] User authentication and accounts
- [ ] Image gallery and history
- [ ] Advanced image editing features
- [ ] Multiple AI model support
- [ ] Batch image generation
- [ ] Social sharing features

---

**Happy Image Generating! 🎨✨**
