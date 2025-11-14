import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { nanoid } from 'nanoid';
import Canvas from './Canvas.jsx';
import ShareModal from './ShareModal.jsx';
import { createSocket, SERVER_URL } from './socket.js';

const TOOLBAR = [
  { id: 'pen', label: 'Pen', icon: '✏️' },
  { id: 'rect', label: 'Rectangle', icon: '▭' },
  { id: 'ellipse', label: 'Ellipse', icon: '○' },
  { id: 'image', label: 'Image', icon: '🖼️' },
  { id: 'select', label: 'Select', icon: '↔️' },
  { id: 'pan', label: 'Pan', icon: '✋' }
];

const defaultColor = '#1f2933';

function ensureRoomInUrl() {
  const current = new URL(window.location.href);
  let room = current.searchParams.get('room');
  if (!room) {
    room = nanoid(8);
    current.searchParams.set('room', room);
    window.history.replaceState({}, '', current.toString());
  }
  return room;
}

const getInitialUserId = () => {
  try {
    const cached = localStorage.getItem('rc-user-id');
    if (cached) return cached;
    const fresh = nanoid(6);
    localStorage.setItem('rc-user-id', fresh);
    return fresh;
  } catch {
    return nanoid(6);
  }
};

export default function App() {
  const [roomId] = useState(() => ensureRoomInUrl());
  const [userId] = useState(() => getInitialUserId());
  const [tool, setTool] = useState('pen');
  const [strokeColor, setStrokeColor] = useState(defaultColor);
  const [strokeWidth, setStrokeWidth] = useState(3);
  const [actions, setActions] = useState([]);
  const [pendingImage, setPendingImage] = useState(null);
  const [peers, setPeers] = useState(() => [userId]);
  const [isConnected, setIsConnected] = useState(false);
  const [showShareModal, setShowShareModal] = useState(false);
  const [notification, setNotification] = useState(null);
  const actionsRef = useRef(actions);
  const socketRef = useRef(null);
  const fileInputRef = useRef(null);

  const shareUrl = useMemo(() => {
    const current = new URL(window.location.href);
    current.searchParams.set('room', roomId);
    return current.toString();
  }, [roomId]);

  useEffect(() => {
    actionsRef.current = actions;
  }, [actions]);

  useEffect(() => {
    const socket = createSocket();
    socketRef.current = socket;

    const joinRoom = () => {
      socket.emit('join-room', { roomId, userId });
    };

    socket.on('connect', () => {
      setIsConnected(true);
      joinRoom();
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('room-state', ({ actions: serverActions = [], participants = [] }) => {
      setActions(serverActions);
      const unique = new Set(participants);
      unique.add(userId);
      setPeers(Array.from(unique));
    });

    socket.on('action-added', (action) => {
      setActions((prev) => {
        if (prev.some((a) => a.id === action.id)) {
          return prev;
        }
        return [...prev, action];
      });
    });

    socket.on('action-undone', ({ actionId }) => {
      setActions((prev) =>
        prev.map((action) =>
          action.id === actionId ? { ...action, undone: true } : action
        )
      );
    });

    socket.on('action-redone', ({ actionId }) => {
      setActions((prev) =>
        prev.map((action) =>
          action.id === actionId ? { ...action, undone: false } : action
        )
      );
    });

    socket.on('action-updated', ({ actionId, data }) => {
      setActions((prev) =>
        prev.map((action) =>
          action.id === actionId ? { ...action, data } : action
        )
      );
    });

    socket.on('user-joined', ({ userId: joined }) => {
      if (!joined || joined === userId) return;
      setPeers((prev) => {
        if (prev.includes(joined)) {
          return prev;
        }
        setNotification({ type: 'join', message: 'Someone joined the room' });
        setTimeout(() => setNotification(null), 3000);
        return [...prev, joined];
      });
    });

    socket.on('user-left', ({ userId: left }) => {
      if (!left || left === userId) return;
      setPeers((prev) => {
        const filtered = prev.filter((id) => id !== left);
        if (filtered.length !== prev.length) {
          setNotification({ type: 'leave', message: 'Someone left the room' });
          setTimeout(() => setNotification(null), 3000);
        }
        return filtered;
      });
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, userId]);

  const handleCreateAction = useCallback(
    (draft) => {
      const action = {
        ...draft,
        id: nanoid(),
        userId,
        timestamp: Date.now(),
        undone: false
      };
      setActions((prev) => [...prev, action]);
      socketRef.current?.emit('add-action', action);
    },
    [userId]
  );

  const handleUpdateAction = useCallback(
    (actionId, data, options = {}) => {
      const { broadcast = true, replace = false } = options;
      setActions((prev) =>
        prev.map((action) => {
          if (action.id !== actionId) return action;
          const nextData = replace ? data : { ...action.data, ...data };
          return { ...action, data: nextData };
        })
      );
      if (broadcast && socketRef.current) {
        socketRef.current.emit('update-action', {
          actionId,
          data: replace ? data : { ...data },
          replace,
          userId
        });
      }
    },
    [userId]
  );

  const handleUndo = useCallback(() => {
    const last = [...actionsRef.current]
      .reverse()
      .find((action) => action.userId === userId && !action.undone);
    if (!last) return;
    setActions((prev) =>
      prev.map((action) =>
        action.id === last.id ? { ...action, undone: true } : action
      )
    );
    socketRef.current?.emit('undo-action', { actionId: last.id, userId });
  }, [userId]);

  const handleRedo = useCallback(() => {
    const candidate = [...actionsRef.current]
      .reverse()
      .find((action) => action.userId === userId && action.undone);
    if (!candidate) return;
    setActions((prev) =>
      prev.map((action) =>
        action.id === candidate.id ? { ...action, undone: false } : action
      )
    );
    socketRef.current?.emit('redo-action', { actionId: candidate.id, userId });
  }, [userId]);

  useEffect(() => {
    const handler = (event) => {
      const key = event.key.toLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          handleRedo();
        } else {
          handleUndo();
        }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleUndo, handleRedo]);

  const handleShare = () => {
    setShowShareModal(true);
  };

  const onImageChosen = (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 360;
        let width = img.width;
        let height = img.height;
        if (width > max || height > max) {
          const scale = Math.min(max / width, max / height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        setPendingImage({
          src: reader.result,
          width,
          height
        });
        setTool('image');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const participantLabel =
    peers.length === 1 ? '1 person' : `${peers.length} people`;

  return (
    <div className="app">
      <header className="app-bar">
        <div className="brand">
          <span className="title">Realtime Canvas</span>
          <span className={`status-dot ${isConnected ? 'online' : 'offline'}`} />
          <span className="status-label">
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        <div className="tools">
          {TOOLBAR.map(({ id, label, icon }) => (
            <button
              key={id}
              className={`tool ${tool === id ? 'active' : ''}`}
              onClick={() => setTool(id)}
              title={label}
            >
              <span className="tool-icon">{icon}</span>
              <span className="tool-label">{label}</span>
            </button>
          ))}
          <label className="input color">
            <span>Stroke</span>
            <input
              type="color"
              value={strokeColor}
              onChange={(e) => setStrokeColor(e.target.value)}
            />
          </label>
          <label className="input range">
            <span>Width</span>
            <input
              type="range"
              min="1"
              max="12"
              value={strokeWidth}
              onChange={(e) => setStrokeWidth(Number(e.target.value))}
            />
          </label>
          <button className="tool" onClick={handleUndo} title="Undo (Ctrl+Z)">
            <span className="tool-icon">↶</span>
            <span className="tool-label">Undo</span>
          </button>
          <button className="tool" onClick={handleRedo} title="Redo (Ctrl+Shift+Z)">
            <span className="tool-icon">↷</span>
            <span className="tool-label">Redo</span>
          </button>
          <button
            className="tool"
            onClick={() => fileInputRef.current?.click()}
            title="Upload an image to place on canvas"
          >
            <span className="tool-icon">📤</span>
            <span className="tool-label">Upload</span>
          </button>
          <button className="tool primary share-button" onClick={handleShare} title="Share room link">
            <span className="tool-icon">🔗</span>
            <span className="tool-label">Share</span>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            onChange={onImageChosen}
            hidden
          />
        </div>
        <div className="room-info">
          <div className="room-id-row">
            <span className="room-label-small">Room:</span>
            <span className="room-id">{roomId}</span>
          </div>
          <div className="peers-row">
            <span className="peers-icon">👥</span>
            <span className="peers">{participantLabel}</span>
          </div>
        </div>
      </header>

      {pendingImage && tool === 'image' && (
        <div className="banner">
          Click and drag on the canvas to place your image ({pendingImage.width}×
          {pendingImage.height})
        </div>
      )}

      {notification && (
        <div className={`notification notification-${notification.type}`}>
          <span className="notification-icon">
            {notification.type === 'join' ? '👋' : '👋'}
          </span>
          <span>{notification.message}</span>
        </div>
      )}

      <Canvas
        actions={actions}
        tool={tool}
        strokeColor={strokeColor}
        strokeWidth={strokeWidth}
        userId={userId}
        onCreateAction={handleCreateAction}
        onUpdateAction={handleUpdateAction}
        pendingImage={pendingImage}
        onConsumeImage={() => setPendingImage(null)}
      />

      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareUrl}
        roomId={roomId}
      />

      <footer className="footer">
        <div className="footer-section">
          <span className="footer-label">You:</span>
          <span className="user-id">{userId}</span>
        </div>
        <div className="footer-section">
          <span className="footer-label">Participants:</span>
          <span className="peer-count">{peers.length}</span>
        </div>
        <div className="footer-section">
          <span className="footer-label">Server:</span>
          <span className="user-id server-url">{SERVER_URL}</span>
        </div>
      </footer>
    </div>
  );
}
