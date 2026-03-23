import React from 'react';
import { renderToPipeableStream } from 'react-dom/server';
import { Writable } from 'stream';
import { StaticRouter } from 'react-router-dom/server';
import App from './App';
import './index.css';

// renderToPipeableStream (Node.js) + onAllReady waits for all lazy Suspense
// boundaries to resolve before piping — gives us the fully-rendered HTML.
export async function render(url) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const decoder = new TextDecoder();
    const writable = new Writable({
      write(chunk, _enc, cb) { chunks.push(decoder.decode(chunk, { stream: true })); cb(); },
    });

    const { pipe } = renderToPipeableStream(
      <React.StrictMode>
        <StaticRouter location={url}>
          <App />
        </StaticRouter>
      </React.StrictMode>,
      {
        onAllReady() {
          pipe(writable);
          writable.on('finish', () => resolve(chunks.join('') + decoder.decode()));
          writable.on('error', reject);
        },
        onError: reject,
      },
    );
  });
}
