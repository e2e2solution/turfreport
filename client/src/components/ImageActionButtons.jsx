export function ImageActionButtons({ disabled, onDownload, onWhatsApp, small = false }) {
  const cls = small ? 'btn small' : 'btn';
  return (
    <div className="image-actions">
      <button type="button" className={`${cls} secondary`} disabled={disabled} onClick={onDownload}>
        {disabled ? '...' : 'Download Image'}
      </button>
      <button type="button" className={`${cls} whatsapp`} disabled={disabled} onClick={onWhatsApp}>
        {disabled ? '...' : 'Share WhatsApp'}
      </button>
    </div>
  );
}

export function DownloadButtons({ disabled, onExcel, onImage, onWhatsApp }) {
  return (
    <div className="download-actions">
      <button type="button" className="btn secondary" disabled={disabled} onClick={onExcel}>
        {disabled ? '...' : 'Download Excel'}
      </button>
      <ImageActionButtons disabled={disabled} onDownload={onImage} onWhatsApp={onWhatsApp} />
    </div>
  );
}
