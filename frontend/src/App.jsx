// frontend/src/App.jsx

import React, { useState } from 'react';
import { ImageIcon, Upload, Download, Save, Loader2, X, Pilcrow } from 'lucide-react'; // Added Pilcrow icon
import './App.css';

function App() {
  // --- State for Image Generator ---
  const [prompt, setPrompt] = useState('');
  const [referenceImage, setReferenceImage] = useState(null);
  const [generatedImage, setGeneratedImage] = useState(null); // blob URL
  const [isGenerating, setIsGenerating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [imageInfo, setImageInfo] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [skuInput, setSkuInput] = useState('');
  const [imageType, setImageType] = useState('Wax');

  // --- State for Description Generator ---
  const [descPrompt, setDescPrompt] = useState('');
  const [generatedDesc, setGeneratedDesc] = useState('');
  const [isGeneratingDesc, setIsGeneratingDesc] = useState(false);
  const [isSavingDesc, setIsSavingDesc] = useState(false);
  const [showDescSaveModal, setShowDescSaveModal] = useState(false);
  const [descSkuInput, setDescSkuInput] = useState('');
  const [descType, setDescType] = useState('Wax');

  // --- Global Message State ---
  const [message, setMessage] = useState(''); // For image side
  const [descMessage, setDescMessage] = useState(''); // For description side

  // --- Image Generator Functions ---
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
    setGeneratedImage(null);
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
        url: imageUrl
      });
      setMessage(`Image generated successfully!`);
    } catch (error) {
      setMessage('Error generating image: ' + error.message);
    } finally {
      setIsGenerating(false);
    }
  };

  const convertBlobToDataURL = (blobUrl) => {
    return new Promise((resolve, reject) => {
      fetch(blobUrl)
        .then(res => res.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(reject);
    });
  };

  const handleConfirmSave = async () => {
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
      const imageDataUrl = await convertBlobToDataURL(generatedImage);
      const response = await fetch('http://localhost:5000/api/update-product-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: skuInput,
          imageType: imageType,
          imageDataUrl: imageDataUrl,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save image');
      }
      setMessage(result.message);
      setShowSaveModal(false);
      setSkuInput('');
    } catch (error) {
      setMessage('Error saving image: ' + error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveClick = () => {
    if (!generatedImage) {
      setMessage('Generate an image before saving');
      return;
    }
    setMessage('');
    setShowSaveModal(true);
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

  // --- [NEW] Description Generator Functions ---

  const generateDescription = async () => {
    if (!descPrompt.trim()) {
      setDescMessage('Please enter a prompt');
      return;
    }
    setIsGeneratingDesc(true);
    setDescMessage('');
    setGeneratedDesc('');

    try {
      const response = await fetch('http://localhost:5000/api/generate-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: descPrompt }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to generate description');
      }
      setGeneratedDesc(result.description);
      setDescMessage('Description generated successfully!');
    } catch (error) {
      setDescMessage('Error: ' + error.message);
    } finally {
      setIsGeneratingDesc(false);
    }
  };

  const handleDescSaveClick = () => {
    if (!generatedDesc.trim()) {
      setDescMessage('Generate a description before saving');
      return;
    }
    setDescMessage('');
    setShowDescSaveModal(true);
  };

  const handleConfirmDescSave = async () => {
    if (!descSkuInput.trim()) {
      setDescMessage('Please enter a SKU'); // Show message in modal?
      return;
    }

    setIsSavingDesc(true);
    setDescMessage('');

    try {
      const response = await fetch('http://localhost:5000/api/update-product-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: descSkuInput,
          descType: descType,
          description: generatedDesc,
        }),
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || 'Failed to save description');
      }
      setDescMessage(result.message); // Show success on main page
      setShowDescSaveModal(false);
      setDescSkuInput('');
    } catch (error) {
      setDescMessage('Error saving description: ' + error.message); // Show error on main page
    } finally {
      setIsSavingDesc(false);
    }
  };


  return (
    <div className="app">
      {/* --- Image Save Modal (Unchanged) --- */}
      {showSaveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowSaveModal(false)}><X size={24} /></button>
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
                <option value="Pre-Image">Pre-Image</option>
              </select>
              <button
                className="modal-save-button"
                onClick={handleConfirmSave}
                disabled={isSaving}
              >
                {isSaving ? (
                  <><Loader2 size={20} className="spinning" /> Saving...</>
                ) : ( 'Confirm Save' )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- [NEW] Description Save Modal --- */}
      {showDescSaveModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <button className="modal-close" onClick={() => setShowDescSaveModal(false)}><X size={24} /></button>
            <h2>Save Description to Product</h2>
            <div className="modal-form">
              <label htmlFor="desc-sku">Product SKU:</label>
              <input
                type="text"
                id="desc-sku"
                value={descSkuInput}
                onChange={(e) => setDescSkuInput(e.target.value)}
                placeholder="Enter SKU (e.g., 12345)"
              />
              <label htmlFor="descType">Description Type:</label>
              <select
                id="descType"
                value={descType}
                onChange={(e) => setDescType(e.target.value)}
              >
                <option value="Wax">Wax Description</option>
                <option value="Cast">Cast Description</option>
                <option value="Final">Final Description</option>
              </select>
              <button
                className="modal-save-button"
                onClick={handleConfirmDescSave}
                disabled={isSavingDesc}
              >
                {isSavingDesc ? (
                  <><Loader2 size={20} className="spinning" /> Saving...</>
                ) : ( 'Confirm Save' )}
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* --- Header (Unchanged) --- */}
      <header className="app-header">
        <div className="logo">
          <ImageIcon size={32} />
          <h1>PIXSHOP</h1>
        </div>
        <p>AI-Powered Content Generator</p>
      </header>

      {/* --- [NEW] Main Layout Container --- */}
      <main className="app-main">
        <div className="spacer left-spacer"></div> {/* 10% */}
        
        {/* --- 50% Image Generator Box --- */}
        <div className="generator-box image-generator-box">
          <div className="input-section">
            <div className="prompt-section">
              <label htmlFor="prompt">Image Prompt:</label>
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
          {/* Message for Image Box */}
          {message && (
            <div className={`message ${message.toLowerCase().includes('error') ? 'error' : 'success'}`}>
              {message}
            </div>
          )}
          {/* Result for Image Box */}
          {generatedImage && (
            <div className="result-section">
              <h3>Generated Image:</h3>
              {imageInfo && (
                <div className="image-info">
                  <div className="info-item"><strong>Model:</strong> {imageInfo.modelUsed}</div>
                  <div className="info-item"><strong>Size:</strong> {(imageInfo.imageSize / 1024).toFixed(1)} KB</div>
                </div>
              )}
              <div className="image-container">
                <img src={generatedImage} alt="Generated" />
              </div>
              <div className="action-buttons">
                <button className="action-button download" onClick={downloadImage}>
                  <Download size={20} /> Download
                </button>
                <button className="action-button save" onClick={handleSaveClick} disabled={isSaving}>
                  <Save size={20} /> Save to Product...
                </button>
              </div>
            </div>
          )}
        </div>
        
        {/* --- 30% Description Generator Box --- */}
        <div className="generator-box description-generator-box">
          <div className="input-section">
            <div className="prompt-section">
              <label htmlFor="desc-prompt">Description Prompt:</label>
              <textarea
                id="desc-prompt"
                value={descPrompt}
                onChange={(e) => setDescPrompt(e.target.value)}
                placeholder="Enter keywords or a topic for the description..."
                rows={4}
              />
            </div>
            <button
              className="generate-button"
              onClick={generateDescription}
              disabled={isGeneratingDesc || !descPrompt.trim()}
            >
              {isGeneratingDesc ? (
                <><Loader2 size={20} className="spinning" /> Generating...</>
              ) : (
                <><Pilcrow size={20} /> Generate Description</>
              )}
            </button>
          </div>
          {/* Message for Description Box */}
          {descMessage && (
            <div className={`message ${descMessage.toLowerCase().includes('error') ? 'error' : 'success'}`}>
              {descMessage}
            </div>
          )}
          {/* Result for Description Box */}
          {generatedDesc && (
            <div className="result-section desc-result-section">
              <h3>Generated Description:</h3>
              <div className="description-container">
                <p>{generatedDesc}</p>
              </div>
              <div className="action-buttons">
                <button
                  className="action-button save"
                  onClick={handleDescSaveClick}
                  disabled={isSavingDesc}
                >
                  <Save size={20} /> Save to Product...
                </button>
              </div>
            </div>
          )}
        </div>
        
        <div className="spacer right-spacer"></div> {/* 10% */}
      </main>
    </div>
  );
}

export default App;