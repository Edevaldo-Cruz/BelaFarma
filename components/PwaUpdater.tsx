import React, { useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { useToast } from './ToastContext';

export function PwaUpdater() {
  const { addToast } = useToast();
  
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegistered(r) {
      console.log('SW Registered: ' + r);
    },
    onRegisterError(error) {
      console.log('SW registration error', error);
    },
  });

  useEffect(() => {
    if (needRefresh) {
      addToast(
        <div className="flex flex-col gap-2">
          <span>Nova atualização disponível!</span>
          <button 
            onClick={() => updateServiceWorker(true)}
            className="bg-blue-600 text-white px-3 py-1 rounded text-sm hover:bg-blue-700 transition-colors"
          >
            Atualizar Agora
          </button>
        </div>,
        'info', // use info or success for the toast type
        10000 // duration 10s or similar, maybe longer
      );
    }
  }, [needRefresh, updateServiceWorker, addToast]);

  return null; // This component doesn't render any visible UI directly, it uses the Toast
}
