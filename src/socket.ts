/**
 * Create a web socket connection with a Home Assistant instance.
 * NodeJS implementation of https://github.com/home-assistant/home-assistant-js-websocket/blob/master/lib/socket.ts
 */

import WebSocket from 'ws';

export const ERR_CANNOT_CONNECT = 'Unable to connect to home assistant';
export const ERR_INVALID_AUTH = 'Invalid home assistant authentication token.';
export const ERR_HASS_HOST_REQUIRED = 'Home assistant URL not configured.';

import type { ConnectionOptions } from './connection.js';

const DEBUG = false;

const MSG_TYPE_AUTH_REQUIRED = 'auth_required';
const MSG_TYPE_AUTH_INVALID = 'auth_invalid';
const MSG_TYPE_AUTH_OK = 'auth_ok';

export interface HaWebSocket extends WebSocket {
  haVersion: string;
}

export function createSocket(options: ConnectionOptions): Promise<HaWebSocket> {
  if (!options.url) {
    throw ERR_HASS_HOST_REQUIRED;
  }

  const url = `${options.url}/api/websocket`;

  if (DEBUG) {
    console.log('[Auth phase] Initializing', url);
  }  

  function connect(
    triesLeft: number,
    promResolve: (socket: HaWebSocket) => void,
    promReject: (err: string) => void,
  ) {
    if (DEBUG) {
        console.log('[Auth Phase] New connection', url);
    }

    const socket = new WebSocket(url) as HaWebSocket;

    // If invalid auth, we will not try to reconnect.
    let invalidAuth = false;

    const closeMessage = (event: WebSocket.CloseEvent | WebSocket.ErrorEvent) => {
      // If we are in error handler make sure close handler doesn't also fire.
      socket.removeEventListener('close', closeMessage);

      if (invalidAuth) {
        promReject(ERR_INVALID_AUTH);
        return;
      }
      
      // Reject if we no longer have to retry
      if (triesLeft === 0) {
        // We never were connected and will not retry
        promReject(ERR_CANNOT_CONNECT);
        return;
      }

      const newTries = triesLeft === -1 ? -1 : triesLeft - 1;
      // Try again in a second
      setTimeout(() => connect(newTries, promResolve, promReject), 1000);
    };

    // Auth is mandatory, so we can send the auth message right away.
    const handleOpen = async (event: WebSocket.Event) => {
      try {
        socket.send(JSON.stringify({
          type: 'auth',
          access_token: options.accessToken,
        }));
      } catch (err) {
        // Refresh token failed
        invalidAuth = err === ERR_INVALID_AUTH;
        socket.close();
      }
    };

    const handleMessage = (event: WebSocket.MessageEvent) => {
      const message = JSON.parse(event.data.toString());

      if (DEBUG) {
        console.log('[Auth phase] Received', message);
      }

      switch (message.type) {
        case MSG_TYPE_AUTH_INVALID:
          invalidAuth = true;
          socket.close();
          break;

        case MSG_TYPE_AUTH_OK:
          socket.removeEventListener('open', handleOpen);
          socket.removeEventListener('message', handleMessage);
          socket.removeEventListener('close', closeMessage);
          socket.removeEventListener('error', closeMessage);
          socket.haVersion = message.ha_version;
          //if (atLeastHaVersion(socket.haVersion, 2022, 9)) {
          //  socket.send(JSON.stringify(messages.supportedFeatures()));
          //}

          // Assume we are always on a home assistant newer than 2022.9
          socket.send(JSON.stringify({
            type: 'supported_features',
            id: 1, // Always the first message after auth
            features: { coalesce_messages: 1 },
          }))

          promResolve(socket);
          break;

        default:
          if (DEBUG) {
            // We already send response to this message when socket opens
            if (message.type !== MSG_TYPE_AUTH_REQUIRED) {
                console.warn('[Auth phase] Unhandled message', message);
            }
          }
      }
    };

    socket.addEventListener('open', handleOpen);
    socket.addEventListener('message', handleMessage);
    socket.addEventListener('close', closeMessage);
    socket.addEventListener('error', closeMessage);
  }

  return new Promise((resolve, reject) => 
    connect(options.setupRetry, resolve, reject)
  );
}