import { useEffect, useState } from 'react';
import ShareImageModal from '../components/ShareImageModal';
import { registerShareImageOpener } from '../utils/shareImageBridge';

export function ShareImageProvider({ children }) {
  const [shareState, setShareState] = useState(null);

  useEffect(() => {
    registerShareImageOpener(setShareState);
    return () => registerShareImageOpener(null);
  }, []);

  return (
    <>
      {children}
      <ShareImageModal
        open={!!shareState}
        blob={shareState?.blob}
        filename={shareState?.filename}
        title={shareState?.title}
        onClose={() => setShareState(null)}
      />
    </>
  );
}
