import { useEffect, useState } from 'react';
import { downloadBlob } from '../utils/captureImage';

export default function ShareImageModal({ open, blob, filename, title, onClose }) {
  const [url, setUrl] = useState(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return undefined;
    }
    const objectUrl = URL.createObjectURL(blob);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [blob]);

  if (!open || !blob) return null;

  const handleShare = async () => {
    const file = new File([blob], filename, { type: 'image/png', lastModified: Date.now() });

    if (navigator.share) {
      const payloads = [
        { files: [file] },
        { files: [file], title },
      ];
      for (const data of payloads) {
        if (navigator.canShare && !navigator.canShare(data)) continue;
        try {
          await navigator.share(data);
          onClose();
          return;
        } catch (err) {
          if (err.name === 'AbortError') return;
        }
      }
    }

    downloadBlob(blob, filename);
    alert('Image saved to your device. Open WhatsApp and attach it from your gallery or downloads.');
  };

  const handleSave = () => {
    downloadBlob(blob, filename);
  };

  return (
    <div className="share-modal-overlay" onClick={onClose} role="presentation">
      <div className="share-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <h3>{title}</h3>
        <p className="hint">This is the same image as Download Image</p>
        {url && <img className="share-modal-preview" src={url} alt={title} />}
        <div className="share-modal-actions">
          <button type="button" className="btn whatsapp" onClick={handleShare}>
            Share to WhatsApp
          </button>
          <button type="button" className="btn secondary" onClick={handleSave}>
            Save Image
          </button>
          <button type="button" className="btn" onClick={onClose}>
            Close
          </button>
        </div>
        <p className="hint share-modal-tip">On phone: tap Share → choose WhatsApp → image is attached</p>
      </div>
    </div>
  );
}
