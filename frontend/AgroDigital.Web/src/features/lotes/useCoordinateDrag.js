import { useCallback, useEffect, useRef, useState } from 'react';

function useCoordinateDrag({ disabled = false, onMove }) {
  const [draggingIndex, setDraggingIndex] = useState(null);
  const [dropIndex, setDropIndex] = useState(null);
  const autoScrollRef = useRef({ container: null, speed: 0 });
  const scrollFrameRef = useRef(null);

  const stopAutoScroll = useCallback(() => {
    autoScrollRef.current = { container: null, speed: 0 };
    if (scrollFrameRef.current) {
      cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const runAutoScroll = useCallback(() => {
    const { container, speed } = autoScrollRef.current;
    if (!container || speed === 0) {
      scrollFrameRef.current = null;
      return;
    }

    container.scrollTop += speed;
    scrollFrameRef.current = requestAnimationFrame(runAutoScroll);
  }, []);

  const updateAutoScroll = useCallback((event) => {
    if (disabled || draggingIndex === null) return;

    const container = event.currentTarget.closest?.('.scroll-area, .expanded-coordinate-list') ?? event.currentTarget;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const threshold = 78;
    const maxSpeed = 18;
    const topDistance = event.clientY - rect.top;
    const bottomDistance = rect.bottom - event.clientY;
    let speed = 0;

    if (topDistance < threshold) {
      speed = -Math.ceil((1 - Math.max(topDistance, 0) / threshold) * maxSpeed);
    } else if (bottomDistance < threshold) {
      speed = Math.ceil((1 - Math.max(bottomDistance, 0) / threshold) * maxSpeed);
    }

    autoScrollRef.current = { container, speed };

    if (speed !== 0 && !scrollFrameRef.current) {
      scrollFrameRef.current = requestAnimationFrame(runAutoScroll);
    }

    if (speed === 0) {
      stopAutoScroll();
    }
  }, [disabled, draggingIndex, runAutoScroll, stopAutoScroll]);

  const resetDrag = useCallback(() => {
    setDraggingIndex(null);
    setDropIndex(null);
    stopAutoScroll();
  }, [stopAutoScroll]);

  useEffect(() => () => stopAutoScroll(), [stopAutoScroll]);

  function readDraggedIndex(event) {
    const rawIndex = event.dataTransfer.getData('application/x-agrodigital-point-index') || event.dataTransfer.getData('text/plain');
    const parsedIndex = Number(rawIndex);
    return Number.isInteger(parsedIndex) ? parsedIndex : null;
  }

  function getContainerProps() {
    return {
      onDragOver: (event) => {
        if (disabled) return;
        event.preventDefault();
        updateAutoScroll(event);
      },
      onDragLeave: (event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          stopAutoScroll();
        }
      }
    };
  }

  function getItemProps(index) {
    if (disabled) {
      return {};
    }

    return {
      draggable: true,
      onDragStart: (event) => {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('application/x-agrodigital-point-index', String(index));
        event.dataTransfer.setData('text/plain', String(index));
        setDraggingIndex(index);
        setDropIndex(index);
      },
      onDragOver: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setDropIndex(index);
        updateAutoScroll(event);
      },
      onDrop: (event) => {
        event.preventDefault();
        const fromIndex = readDraggedIndex(event);
        if (fromIndex !== null) {
          onMove(fromIndex, index);
        }
        resetDrag();
      },
      onDragEnd: resetDrag
    };
  }

  return {
    containerProps: getContainerProps(),
    getItemProps,
    draggingIndex,
    dropIndex
  };
}

export default useCoordinateDrag;
