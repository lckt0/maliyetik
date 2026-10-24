import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { configureClient } from '../api/client';
import { AuthProvider } from '../auth';
import { ThemeProvider } from './theme';
import { installChunkErrorRecovery } from './pwa';
import { MobileApp } from './App';
import './app.css';

// Her şeyden ÖNCE: API istemcisini mobil kipe al.
//  - clientType 'mobile'  → backend rol engelini uygular (yalnızca mükellef)
//  - storagePrefix        → oturumu masaüstü panelinkinden ayırır (aynı origin, aynı
//                           localStorage; önek olmasa müşavirin masaüstü oturumu miras alınırdı)
//  - loginPath            → 401 sonrası mobil giriş ekranına döner
configureClient({ clientType: 'mobile', storagePrefix: 'mobile:', loginPath: '/app/giris' });

installChunkErrorRecovery();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* basename: uygulama /app/ altında servis ediliyor, rotalar bu önek olmadan yazılır. */}
    <BrowserRouter basename="/app">
      <ThemeProvider>
        <AuthProvider>
          <MobileApp />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  </StrictMode>,
);
