import { useState, useEffect, useRef } from 'react';

export default function ShareModal({ isOpen, onClose, shareUrl, roomId }) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.select();
    }
  }, [isOpen]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      // Fallback for older browsers
      inputRef.current?.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Share Room</h2>
          <button className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body">
          <p className="modal-description">
            Share this link with others to collaborate in realtime. Anyone with
            the link can join and draw together.
          </p>
          <div className="share-input-group">
            <input
              ref={inputRef}
              type="text"
              value={shareUrl}
              readOnly
              className="share-input"
              onClick={(e) => e.target.select()}
            />
            <button
              className={`copy-button ${copied ? 'copied' : ''}`}
              onClick={handleCopy}
            >
              {copied ? (
                <>
                  <span className="check-icon">✓</span> Copied!
                </>
              ) : (
                <>
                  <span className="copy-icon">📋</span> Copy
                </>
              )}
            </button>
          </div>
          <div className="room-id-display">
            <span className="room-label">Room ID:</span>
            <code className="room-code">{roomId}</code>
          </div>
        </div>
      </div>
    </div>
  );
}

