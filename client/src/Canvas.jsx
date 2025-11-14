import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const MIN_RESIZE = 12;
const MAX_SCALE = 4;
const MIN_SCALE = 0.25;

const TOOL_CURSOR = {
  pen: 'crosshair',
  rect: 'crosshair',
  ellipse: 'crosshair',
  image: 'crosshair',
  select: 'default',
  pan: 'grab'
};

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeBox({ x, y, width, height }) {
  const normalized = {
    x,
    y,
    width,
    height
  };
  if (width < 0) {
    normalized.x = x + width;
    normalized.width = Math.abs(width);
  } else {
    normalized.width = width;
  }
  if (height < 0) {
    normalized.y = y + height;
    normalized.height = Math.abs(height);
  } else {
    normalized.height = height;
  }
  return normalized;
}

function drawAction(ctx, action, helpers) {
  switch (action.type) {
    case 'path':
      drawPath(ctx, action.data);
      break;
    case 'rect':
      drawRect(ctx, action.data);
      break;
    case 'ellipse':
      drawEllipse(ctx, action.data);
      break;
    case 'image':
      drawImage(ctx, action.data, helpers);
      break;
    default:
      break;
  }
}

function drawPath(ctx, data) {
  const { points, strokeColor, strokeWidth } = data;
  if (!points || points.length < 2) return;
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = strokeWidth;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(points[0], points[1]);
  for (let i = 2; i < points.length; i += 2) {
    ctx.lineTo(points[i], points[i + 1]);
  }
  ctx.stroke();
}

function drawRect(ctx, data) {
  const box = normalizeBox(data);
  ctx.strokeStyle = data.strokeColor;
  ctx.lineWidth = data.strokeWidth;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
}

function drawEllipse(ctx, data) {
  const box = normalizeBox(data);
  ctx.strokeStyle = data.strokeColor;
  ctx.lineWidth = data.strokeWidth;
  ctx.beginPath();
  ctx.ellipse(
    box.x + box.width / 2,
    box.y + box.height / 2,
    Math.max(1, box.width / 2),
    Math.max(1, box.height / 2),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();
}

function drawImage(ctx, data, helpers) {
  if (!data?.src) return;
  const { imageCache, onImageLoad } = helpers;
  let cached = imageCache.current.get(data.src);
  if (!cached) {
    const img = new Image();
    img.onload = () => {
      cached.loaded = true;
      cached.width = img.width;
      cached.height = img.height;
      cached.element = img;
      cached.callbacks.forEach((cb) => cb());
      cached.callbacks = [];
    };
    img.src = data.src;
    cached = {
      loaded: false,
      element: img,
      callbacks: []
    };
    imageCache.current.set(data.src, cached);
  }
  if (!cached.loaded && onImageLoad && !cached.callbacks.includes(onImageLoad)) {
    cached.callbacks.push(onImageLoad);
  }
  if (cached.loaded) {
    ctx.drawImage(cached.element, data.x, data.y, data.width, data.height);
  }
}

function drawSelection(ctx, action) {
  if (!action) return;
  const { data } = action;
  if (!data) return;
  const box = normalizeBox(data);
  ctx.save();
  ctx.setLineDash([6, 4]);
  ctx.strokeStyle = '#2563eb';
  ctx.lineWidth = 1 / ctx.getTransform().a;
  ctx.strokeRect(box.x, box.y, box.width, box.height);
  ctx.fillStyle = '#2563eb';
  const handle = 8 / ctx.getTransform().a;
  ctx.fillRect(
    box.x + box.width - handle / 2,
    box.y + box.height - handle / 2,
    handle,
    handle
  );
  ctx.restore();
}

export default function Canvas({
  actions,
  tool,
  strokeColor,
  strokeWidth,
  userId,
  onCreateAction,
  onUpdateAction,
  pendingImage,
  onConsumeImage
}) {
  const containerRef = useRef(null);
  const canvasRef = useRef(null);
  const imageCache = useRef(new Map());
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [draftAction, setDraftAction] = useState(null);
  const [selectionId, setSelectionId] = useState(null);
  const [spacePressed, setSpacePressed] = useState(false);
  const [revision, setRevision] = useState(0);
  const [view, setView] = useState({
    scale: 1,
    offsetX: 0,
    offsetY: 0
  });
  const pointerRef = useRef({
    mode: null,
    startWorld: null,
    startView: null,
    draftStart: null,
    selection: null
  });

  const selection = useMemo(
    () => actions.find((action) => action.id === selectionId),
    [actions, selectionId]
  );

  const cursor = useMemo(() => {
    if (pointerRef.current.mode === 'pan') {
      return 'grabbing';
    }
    return TOOL_CURSOR[tool] || 'default';
  }, [tool]);

  const toWorld = useCallback(
    (clientX, clientY) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return { x: 0, y: 0 };
      const { offsetX, offsetY, scale } = view;
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      return {
        x: (x - offsetX) / scale,
        y: (y - offsetY) / scale
      };
    },
    [view]
  );

  const scheduleRerender = useCallback(() => {
    setRevision((value) => value + 1);
  }, []);

  useEffect(() => {
    const resize = () => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      setDimensions({ width: rect.width, height: rect.height });
    };
    resize();
    const observer = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(resize)
      : null;
    if (observer && containerRef.current) {
      observer.observe(containerRef.current);
    }
    window.addEventListener('resize', resize);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.code === 'Space' && !spacePressed) {
        event.preventDefault();
        setSpacePressed(true);
      }
    };
    const handleKeyUp = (event) => {
      if (event.code === 'Space') {
        event.preventDefault();
        setSpacePressed(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [spacePressed]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    canvas.width = dimensions.width;
    canvas.height = dimensions.height;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid(ctx, canvas.width, canvas.height, view);
    ctx.restore();

    ctx.setTransform(view.scale, 0, 0, view.scale, view.offsetX, view.offsetY);

    const helpers = {
      imageCache,
      onImageLoad: scheduleRerender
    };

    actions.forEach((action) => {
      if (action.undone) return;
      drawAction(ctx, action, helpers);
    });

    if (draftAction) {
      ctx.save();
      ctx.globalAlpha = 0.6;
      drawAction(ctx, draftAction, helpers);
      ctx.restore();
    }

    if (selection) {
      drawSelection(ctx, selection);
    }
  }, [actions, draftAction, view, dimensions, revision, selection]);

  const shouldPan = useCallback(
    (event) => {
      return (
        tool === 'pan' ||
        spacePressed ||
        event.button === 1 ||
        event.button === 2
      );
    },
    [tool, spacePressed]
  );

  const startDraft = (type, world) => {
    pointerRef.current.mode = 'draw';
    pointerRef.current.startWorld = world;
    switch (type) {
      case 'pen':
        setDraftAction({
          type: 'path',
          data: {
            points: [world.x, world.y],
            strokeColor,
            strokeWidth
          }
        });
        break;
      case 'rect':
      case 'ellipse':
        setDraftAction({
          type,
          data: {
            x: world.x,
            y: world.y,
            width: 0,
            height: 0,
            strokeColor,
            strokeWidth
          }
        });
        break;
      case 'image':
        if (!pendingImage) {
          pointerRef.current.mode = null;
          return;
        }
        setDraftAction({
          type: 'image',
          data: {
            x: world.x,
            y: world.y,
            width: pendingImage.width,
            height: pendingImage.height,
            src: pendingImage.src
          }
        });
        pointerRef.current.draftStart = world;
        break;
      default:
        break;
    }
  };

  const updateDraft = (world) => {
    if (!draftAction) return;
    const start = pointerRef.current.startWorld || world;
    if (draftAction.type === 'path') {
      setDraftAction((prev) => {
        if (!prev) return prev;
        const nextPoints = [...prev.data.points, world.x, world.y];
        return {
          ...prev,
          data: { ...prev.data, points: nextPoints }
        };
      });
    } else if (draftAction.type === 'rect' || draftAction.type === 'ellipse') {
      setDraftAction((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            width: world.x - start.x,
            height: world.y - start.y
          }
        };
      });
    } else if (draftAction.type === 'image') {
      const origin = pointerRef.current.draftStart || start;
      setDraftAction((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          data: {
            ...prev.data,
            x: Math.min(origin.x, world.x),
            y: Math.min(origin.y, world.y),
            width: Math.max(MIN_RESIZE, Math.abs(world.x - origin.x)),
            height: Math.max(MIN_RESIZE, Math.abs(world.y - origin.y))
          }
        };
      });
    }
  };

  const finishDraft = () => {
    if (!draftAction) return;
    if (draftAction.type === 'path' && draftAction.data.points.length < 4) {
      setDraftAction(null);
      return;
    }
    let nextAction = draftAction;
    if (['rect', 'ellipse', 'image'].includes(draftAction.type)) {
      const box = normalizeBox(draftAction.data);
      nextAction = {
        ...draftAction,
        data: { ...draftAction.data, ...box }
      };
    }
    onCreateAction(nextAction);
    if (draftAction.type === 'image') {
      onConsumeImage();
    }
    setDraftAction(null);
  };

  const hitTest = (world) => {
    for (let i = actions.length - 1; i >= 0; i -= 1) {
      const action = actions[i];
      if (action.undone) continue;
      if (action.userId !== userId) continue;
      if (!action.data) continue;
      if (!['rect', 'ellipse', 'image'].includes(action.type)) continue;
      const box = normalizeBox(action.data);
      if (
        world.x >= box.x &&
        world.x <= box.x + box.width &&
        world.y >= box.y &&
        world.y <= box.y + box.height
      ) {
        const cornerX = box.x + box.width;
        const cornerY = box.y + box.height;
        const distance =
          Math.abs(world.x - cornerX) + Math.abs(world.y - cornerY);
        const mode = distance * view.scale < 24 ? 'resize' : 'move';
        return { action, mode, box };
      }
    }
    return null;
  };

  const startSelection = (world) => {
    const hit = hitTest(world);
    if (!hit) {
      setSelectionId(null);
      pointerRef.current.mode = null;
      return;
    }
    pointerRef.current.mode = hit.mode === 'resize' ? 'resize' : 'move';
    pointerRef.current.selection = {
      actionId: hit.action.id,
      original: { ...hit.action.data },
      anchor: { ...world }
    };
    pointerRef.current.startWorld = world;
    setSelectionId(hit.action.id);
  };

  const updateSelection = (world, commit = false) => {
    const state = pointerRef.current.selection;
    if (!state) return;
    const { actionId, original, anchor } = state;
    let nextData = original;
    if (pointerRef.current.mode === 'move') {
      const dx = world.x - anchor.x;
      const dy = world.y - anchor.y;
      nextData = {
        ...original,
        x: original.x + dx,
        y: original.y + dy
      };
    } else if (pointerRef.current.mode === 'resize') {
      const dx = world.x - anchor.x;
      const dy = world.y - anchor.y;
      nextData = {
        ...original,
        width: Math.max(MIN_RESIZE, original.width + dx),
        height: Math.max(MIN_RESIZE, original.height + dy)
      };
    }
    pointerRef.current.selection.next = nextData;
    onUpdateAction(actionId, nextData, {
      broadcast: commit,
      replace: true
    });
  };

  const stopSelection = () => {
    pointerRef.current.selection = null;
    pointerRef.current.mode = null;
  };

  const handlePointerDown = (event) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(event.pointerId);
    const world = toWorld(event.clientX, event.clientY);

    if (shouldPan(event)) {
      event.preventDefault();
      pointerRef.current.mode = 'pan';
      pointerRef.current.startView = { ...view };
      pointerRef.current.startPointer = { x: event.clientX, y: event.clientY };
      return;
    }

    if (tool === 'select') {
      startSelection(world);
      return;
    }

    if (tool === 'pen' || tool === 'rect' || tool === 'ellipse') {
      startDraft(tool, world);
      return;
    }

    if (tool === 'image' && pendingImage) {
      startDraft('image', world);
    }
  };

  const handlePointerMove = (event) => {
    const mode = pointerRef.current.mode;
    const world = toWorld(event.clientX, event.clientY);
    if (mode === 'pan' && pointerRef.current.startView) {
      event.preventDefault();
      const { startView, startPointer } = pointerRef.current;
      const dx = event.clientX - startPointer.x;
      const dy = event.clientY - startPointer.y;
      setView((prev) => ({
        ...prev,
        offsetX: startView.offsetX + dx,
        offsetY: startView.offsetY + dy
      }));
      return;
    }

    if (mode === 'draw') {
      updateDraft(world);
      return;
    }

    if ((mode === 'move' || mode === 'resize') && pointerRef.current.selection) {
      updateSelection(world, false);
      return;
    }
  };

  const handlePointerUp = (event) => {
    const canvas = canvasRef.current;
    if (canvas?.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    const mode = pointerRef.current.mode;
    const world = toWorld(event.clientX, event.clientY);
    if (mode === 'draw') {
      finishDraft();
    } else if (mode === 'move' || mode === 'resize') {
      updateSelection(world, true);
      stopSelection();
    }
    pointerRef.current.mode = null;
  };

  const handleWheel = (event) => {
    event.preventDefault();
    if (event.ctrlKey) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = {
        x: event.clientX - rect.left,
        y: event.clientY - rect.top
      };
      const world = {
        x: (point.x - view.offsetX) / view.scale,
        y: (point.y - view.offsetY) / view.scale
      };
      const scaleDelta = event.deltaY > 0 ? 0.9 : 1.1;
      const nextScale = clamp(view.scale * scaleDelta, MIN_SCALE, MAX_SCALE);
      setView({
        scale: nextScale,
        offsetX: point.x - world.x * nextScale,
        offsetY: point.y - world.y * nextScale
      });
    } else {
      setView((prev) => ({
        ...prev,
        offsetX: prev.offsetX - event.deltaX,
        offsetY: prev.offsetY - event.deltaY
      }));
    }
  };

  return (
    <div className="canvas-area" ref={containerRef}>
      <canvas
        ref={canvasRef}
        className="board"
        width={dimensions.width}
        height={dimensions.height}
        style={{ cursor }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
        onWheel={handleWheel}
        onContextMenu={(event) => event.preventDefault()}
      />
    </div>
  );
}

function drawGrid(ctx, width, height, view) {
  const spacing = 48;
  ctx.fillStyle = '#f2f4f7';
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = '#e0e7ff';
  ctx.lineWidth = 1;
  const step = spacing * view.scale;
  const startX = ((view.offsetX % step) + step) % step;
  const startY = ((view.offsetY % step) + step) % step;
  ctx.beginPath();
  for (let x = startX; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = startY; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}
