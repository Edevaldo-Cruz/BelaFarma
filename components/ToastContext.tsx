import React, { createContext, useContext, useCallback, ReactNode } from 'react';
import { Toaster, toast as sonnerToast } from 'sonner';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

interface ToastContextType {
  addToast: (message: ReactNode, type?: ToastType, durationMs?: number) => void;
  removeToast: (id: string | number) => void;
  toast: typeof sonnerToast;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const ToastProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const addToast = useCallback((message: ReactNode, type: ToastType = 'info', durationMs: number = 4000) => {
    const opts = { duration: durationMs };
    switch (type) {
      case 'success':
        sonnerToast.success(message as string, opts);
        break;
      case 'error':
        sonnerToast.error(message as string, opts);
        break;
      case 'warning':
        sonnerToast.warning(message as string, opts);
        break;
      case 'info':
      default:
        sonnerToast.info(message as string, opts);
        break;
    }
  }, []);

  const removeToast = useCallback((id: string | number) => {
    sonnerToast.dismiss(id);
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, toast: sonnerToast }}>
      {children}
      <Toaster
        position="top-right"
        richColors
        closeButton
        theme="light"
        toastOptions={{
          style: {
            fontSize: '0.875rem',
            fontWeight: 600,
            borderRadius: '0.75rem',
            padding: '0.75rem 1rem'
          }
        }}
      />
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = useContext(ToastContext);
  if (context === undefined) {
    // Fallback gracioso para uso fora do provider
    return {
      addToast: (message: ReactNode, type: ToastType = 'info', durationMs = 4000) => {
        const opts = { duration: durationMs };
        if (type === 'success') sonnerToast.success(message as string, opts);
        else if (type === 'error') sonnerToast.error(message as string, opts);
        else if (type === 'warning') sonnerToast.warning(message as string, opts);
        else sonnerToast.info(message as string, opts);
      },
      removeToast: (id: string | number) => sonnerToast.dismiss(id),
      toast: sonnerToast
    };
  }
  return context;
};

// Exporta o toast direto para chamadas rápidas sem hook
export { sonnerToast as toast };
