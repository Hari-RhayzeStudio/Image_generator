import React, { useState } from 'react';
import { ImageIcon, Upload, Download, Save, Loader2, X } from 'lucide-react';
import './App.css'; // You will need to create/update this file

function App() {
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null); // This will be a blob URL
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [imageInfo, setImageInfo] = useState(null);

  // --- New state for the modal ---
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [skuInput, setSkuInput] = useState('');
  const [imageType, setImageType] = useState('Wax'); // Default type

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
    setGeneratedImage(null); // Clear previous image
    setImageInfo(null);

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
        const err = await response.json();
        throw new Error(err.error || 'Failed to generate image');
      }

      const blob = await response.blob();
      const imageUrl = URL.createObjectURL(blob);
      
      const modelUsed = response.headers.get('X-Model-Used') || 'Imagen-4.0';
      const imageSize = response.headers.get('X-Image-Size') || '0';
      const contentType = response.headers.get('Content-Type') || 'image/png';
      
      setGeneratedImage(imageUrl);
      setImageInfo({
        modelUsed,
        imageSize: parseInt(imageSize) || blob.size,
        contentType,
        url: imageUrl // This is the blob URL
      });
      
      setMessage(`Image generated successfully using ${modelUsed}!`);
    } catch (error) {
      setMessage('Error generating image: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  // --- Helper function to convert blob URL to Base64 Data URL ---
  const convertBlobToDataURL = (blobUrl) => {
    return new Promise((resolve, reject) => {
      fetch(blobUrl)
        .then(res => res.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve(reader.result); // This is the Base64 data URL
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(reject);
    });
  };

  // --- NEW: This function is called by the modal's "Save" button ---
  const handleConfirmSave = async () => {
    setIsSaving(true);
    setMessage('');

    try {
      const imageDataUrl = await convertBlobToDataURL(generatedImage);

      const response = await fetch('http://localhost:5000/api/update-product-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: skuInput,
          imageType: imageType, 
          imageDataUrl: imageDataUrl,
        }),
      });
      
      const result = await response.json();

      if (!response.ok) {
        // --- ADD DEBUGGING ---
        // This will show the error from the server (e.g., "SKU not found")
        console.error('Server returned an error:', result.error);
        // ---
        throw new Error(result.error || 'Failed to save image');
      }

      // This is your success message! It's already here.
      setMessage(result.message); 
      setShowSaveModal(false); 
      setSkuInput(''); 
    } catch (error) {
      // --- UPDATE DEBUGGING ---
      // This will catch network errors (like the 404) or the error thrown above
      console.error('handleConfirmSave error:', error);
      setMessage('Error saving image: ' + error.message);
      // ---
    } finally {
      setIsSaving(false);
    }
    
    if (!skuInput.trim()) {
      setMessage('Please enter a SKU');
      return;
    }
    if (!generatedImage) {
      setMessage('No image to save');
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      // 1. Convert the blob URL to a Base64 data URL
      const imageDataUrl = await convertBlobToDataURL(generatedImage);

      // 2. Call the new backend endpoint
      const response = await fetch('http://localhost:5000/api/update-product-image', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sku: skuInput,
          imageType: imageType, // "Wax", "Cast", or "Final"
          imageDataUrl: imageDataUrl, // The Base64 string
        }),
      });
      
      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.error || 'Failed to save image');
      }

      setMessage(result.message);
      setShowSaveModal(false); // Close modal on success
      setSkuInput(''); // Reset SKU input
    } catch (error) {
      setMessage('Error saving image: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  // --- This just opens the modal ---
  const handleSaveClick = () => {
    if (!generatedImage) {
      setMessage('Generate an image before saving');
      return;
    }
    setMessage('');
    setShowSaveModal(true);
  };

  const downloadImage = () => {
    // ... (Your existing downloadImage function is perfect)
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
      {/* --- NEW: Save Modal --- */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowSaveModal(false)}>
              <X size={24} />
            </button>
            <h2>Save Image to Product</h2>
            <div className="modal-form">
              <label htmlFor="sku">Product SKU:</label>
              <input
                type="text"
                id="sku"
                value={skuInput}
                onChange={(e) => setSkuInput(e.target.value)}
                placeholder="Enter SKU (e.g., 12345)"
              />
              <label htmlFor="imageType">Image Type:</label>
              <select
                id="imageType"
                value={imageType}
                onChange={(e) => setImageType(e.target.value)}
              >
                <option value="Wax">Wax Image</option>
                <option value="Cast">Cast Image</option>
                <option value="Final">Final Image</option>
                {/* <option value="Pre-Image">Pre-Image</option> */}
              </select>
              <button
                className="modal-save-button"
                onClick={handleConfirmSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 size={20} className="spinning" /> Saving...</>
                ) : (
                  'Confirm Save'
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      <header className="app-header">
        <div className="logo">
          <ImageIcon size={32} />
          <h1>PIXSHOP</h1>
        </div>
        <p>AI-Powered Image Generator</p>
      </header>

      <main className="app-main">
        {/* --- Input Section (Unchanged) --- */}
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
                <><Loader2 size={20} className="spinning" /> Generating...</>
              ) : (
                <><ImageIcon size={20} /> Generate Image</>
              )}
            </button>
          </div>

        {message && (
          <div className={`message ${message.toLowerCase().includes('error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}

        {/* --- Result Section (Updated Save Button) --- */}
        {generatedImage && (
          <div className="result-section">
            <h3>Generated Image:</h3>
            
            {imageInfo && (
              <div className="image-info">
                {/* ... (image info display is unchanged) ... */}
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
                onClick={handleSaveClick} // <-- UPDATED
                disabled={isSaving} // isSaving is now controlled by the modal
              >
                <Save size={20} />
                Save to Product...
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;