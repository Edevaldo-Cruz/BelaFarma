
// Polyfill seguro de localStorage e sessionStorage para iframes cross-origin
try {
  const testLocal = window.localStorage;
  if (!testLocal) throw new Error("localStorage não definido");
  const testKey = "__storage_test__";
  window.localStorage.setItem(testKey, testKey);
  window.localStorage.removeItem(testKey);
} catch (e) {
  console.warn("[BelaFarma] localStorage bloqueado ou indisponível. Aplicando polyfill em memória...", e);
  const memoryStore: Record<string, string> = {};
  const mockStorage: Storage = {
    length: 0,
    clear() {
      for (const key in memoryStore) {
        delete memoryStore[key];
      }
      this.length = 0;
    },
    getItem(key: string): string | null {
      return memoryStore[key] || null;
    },
    key(index: number): string | null {
      const keys = Object.keys(memoryStore);
      return keys[index] || null;
    },
    removeItem(key: string) {
      delete memoryStore[key];
      this.length = Object.keys(memoryStore).length;
    },
    setItem(key: string, value: string) {
      memoryStore[key] = String(value);
      this.length = Object.keys(memoryStore).length;
    }
  };
  try {
    Object.defineProperty(window, 'localStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    console.error("[BelaFarma] Falha ao redefinir window.localStorage:", err);
  }
}

try {
  const testSession = window.sessionStorage;
  if (!testSession) throw new Error("sessionStorage não definido");
  const testKey = "__session_test__";
  window.sessionStorage.setItem(testKey, testKey);
  window.sessionStorage.removeItem(testKey);
} catch (e) {
  console.warn("[BelaFarma] sessionStorage bloqueado ou indisponível. Aplicando polyfill em memória...", e);
  const memoryStore: Record<string, string> = {};
  const mockStorage: Storage = {
    length: 0,
    clear() {
      for (const key in memoryStore) {
        delete memoryStore[key];
      }
      this.length = 0;
    },
    getItem(key: string): string | null {
      return memoryStore[key] || null;
    },
    key(index: number): string | null {
      const keys = Object.keys(memoryStore);
      return keys[index] || null;
    },
    removeItem(key: string) {
      delete memoryStore[key];
      this.length = Object.keys(memoryStore).length;
    },
    setItem(key: string, value: string) {
      memoryStore[key] = String(value);
      this.length = Object.keys(memoryStore).length;
    }
  };
  try {
    Object.defineProperty(window, 'sessionStorage', {
      value: mockStorage,
      writable: true,
      configurable: true
    });
  } catch (err) {
    console.error("[BelaFarma] Falha ao redefinir window.sessionStorage:", err);
  }
}

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import { ToastProvider } from './components/ToastContext';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ToastProvider>
      <App />
    </ToastProvider>
  </React.StrictMode>
);
