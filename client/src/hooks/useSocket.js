import { useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// One shared socket per component tree. Connects lazily, joins/leaves
// the given room automatically, and cleans up on unmount so switching
// between group orders (or leaving the page) doesn't leak listeners.
export default function useSocket(room, onEvent) {
  const socketRef = useRef(null);

  useEffect(() => {
    if (!room) return undefined;

    const socket = io('/', { path: '/socket.io', transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('join', { room });
    });

    if (onEvent) {
      socket.on('group:update', onEvent);
      socket.on('order:status', onEvent);
      socket.on('order:new', onEvent);
      socket.on('notification:new', onEvent);
      socket.on('delivery:redirected', onEvent);
    }

    return () => {
      socket.emit('leave', { room });
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room]);

  return socketRef;
}
