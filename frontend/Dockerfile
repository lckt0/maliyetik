# ============================================================================
#  Maliyetik Frontend — Vite build → Nginx static
# ============================================================================

# ---- builder ----
FROM node:22-alpine AS builder
# WORKDIR bilerek /app değil: mobil PWA girişi `app/index.html` ile aynı adı taşıyan
# bir proje kökü, Vite'ın kök `index.html` girişini sessizce düşürmesine yol açıyor.
WORKDIR /build

# Derleme sırasında gömülen adresler (Vite)
ARG VITE_API_BASE_URL
ARG VITE_SITE_URL
ARG VITE_SUPPORT_EMAIL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL \
    VITE_SITE_URL=$VITE_SITE_URL \
    VITE_SUPPORT_EMAIL=$VITE_SUPPORT_EMAIL

COPY package*.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

# ---- runtime (nginx) ----
FROM nginx:1.28-alpine AS production
# Güvenlik başlıkları snippet'i conf.d DIŞINA konur — conf.d/*.conf otomatik
# include edildiğinden orada durursa http bloğuna da uygulanır (çift başlık).
COPY nginx-security-headers.conf /etc/nginx/snippets/security-headers.conf
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /build/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
