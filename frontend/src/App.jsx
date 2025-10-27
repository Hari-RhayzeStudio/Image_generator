import React, { useState } from 'react';
import { ImageIcon, Upload, Download, Save, Loader2 } from 'lucide-react';
import './App.css';

function App() {
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [imageInfo, setImageInfo] = useState(null);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setReferenceImage(file);
      setMessage('');
    }
  };

  const generateImage = async () => {
    if (!prompt.trim()) {
      setMessage('Please enter a prompt');
      return;
    }

    setIsGenerating(true);
    setMessage('');

    try {
      const formData = new FormData();
      formData.append('prompt', prompt);
      if (referenceImage) {
        formData.append('referenceImage', referenceImage);
      }

      const response = await fetch('http://localhost:5000/api/generate-image', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error('Failed to generate image');
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      
      // Get additional info from response headers
      const modelUsed = response.headers.get('X-Model-Used') || 'Imagen-4.0';
      const imageSize = response.headers.get('X-Image-Size') || '0';
      const contentType = response.headers.get('Content-Type') || 'image/png';
      
      console.log('Image generation response:', {
        modelUsed,
        imageSize,
        contentType,
        blobSize: blob.size
      });
      
      setGeneratedImage(imageUrl);
      setImageInfo({
        modelUsed,
        imageSize: parseInt(imageSize) || blob.size,
        contentType,
        url: imageUrl
      });
      
      setMessage(`Image generated successfully using ${modelUsed}! Size: ${(parseInt(imageSize) || blob.size) / 1024} KB`);
    } catch (error) {
      setMessage('Error generating image: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const saveToMongoDB = async () => {
    if (!generatedImage) {
      setMessage('No image to save');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      const response = await fetch('http://localhost:5000/api/save-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: prompt,
          imageUrl: imageInfo ? imageInfo.url : generatedImage,
          referenceImage: referenceImage ? referenceImage.name : null,
          modelUsed: imageInfo ? imageInfo.modelUsed : 'Imagen-4.0',
          imageSize: imageInfo ? imageInfo.imageSize : 0,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to save image');
      }

      setMessage('Image saved to MongoDB successfully!');
    } catch (error) {
      setMessage('Error saving image: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const downloadImage = () => {
    if (generatedImage) {
      const link = document.createElement('a');
      link.href = generatedImage;
      link.download = `pixshop-generated-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  return (
    <div className="app">
      <header className="app-header">
        <div className="logo">
          <ImageIcon size={32} />
          <h1>PIXSHOP</h1>
        </div>
        <p>AI-Powered Image Generator</p>
      </header>

      <main className="app-main">
        <div className="input-section">
          <div className="prompt-section">
            <label htmlFor="prompt">Enter your prompt:</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe the image you want to generate..."
              rows={4}
            />
          </div>

          <div className="reference-section">
            <label htmlFor="reference-image">Reference Image (Optional):</label>
            <div className="file-upload">
              <input
                type="file"
                id="reference-image"
                accept="image/*"
                onChange={handleImageUpload}
                style={{ display: 'none' }}
              />
              <label htmlFor="reference-image" className="upload-button">
                <Upload size={20} />
                {referenceImage ? referenceImage.name : 'Choose Reference Image'}
              </label>
            </div>
            {referenceImage && (
              <div className="preview-image">
                <img
                  src={URL.createObjectURL(referenceImage)}
                  alt="Reference"
                  style={{ maxWidth: '200px', maxHeight: '200px' }}
                />
              </div>
            )}
          </div>

          <button
            className="generate-button"
            onClick={generateImage}
            disabled={isGenerating || !prompt.trim()}
          >
            {isGenerating ? (
              <>
                <Loader2 size={20} className="spinning" />
                Generating...
              </>
            ) : (
              <>
                <ImageIcon size={20} />
                Generate Image
              </>
            )}
          </button>
        </div>

        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {generatedImage && (
          <div className="result-section">
            <h3>Generated Image:</h3>
            
            {imageInfo && (
              <div className="image-info">
                <div className="info-item">
                  <strong>Model:</strong> {imageInfo.modelUsed}
                </div>
                <div className="info-item">
                  <strong>Size:</strong> {(imageInfo.imageSize / 1024).toFixed(1)} KB
                </div>
                <div className="info-item">
                  <strong>Format:</strong> {imageInfo.contentType.split('/')[1]}
                </div>
              </div>
            )}
            
            <div className="image-container">
              <img src={generatedImage} alt="Generated" />
            </div>
            <div className="action-buttons">
              <button
                className="action-button download"
                onClick={downloadImage}
              >
                <Download size={20} />
                Download
              </button>
              <button
                className="action-button save"
                onClick={saveToMongoDB}
                disabled={isSaving}
              >
                {isSaving ? (
                  <>
                    <Loader2 size={20} className="spinning" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save size={20} />
                    Save to MongoDB
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;