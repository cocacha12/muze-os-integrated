# Guía de Instalación: Muze OS Reborn en VPS

Esta guía detalla los pasos para desplegar la nueva arquitectura de Muze OS en un servidor VPS propio.

## 1. Requisitos del Sistema
- **Node.js**: Versión 18 o superior.
- **NPM**: Incluido con Node.js.
- **Chromium / Chrome**: Necesario para que Puppeteer genere los PDFs.
- **Git**: Para clonar el repositorio.

## 2. Clonar el Repositorio
```bash
git clone https://github.com/cocacha12/muze-os-integrated.git
cd muze-os-integrated/os-web-reborn
```

## 3. Instalación de Dependencias
```bash
npm install
```

## 4. Configuración de Puppeteer (Importante para VPS)
En entornos Linux/VPS, Puppeteer suele requerir dependencias adicionales del sistema. Ejecuta lo siguiente si encuentras errores en la generación de PDFs:
```bash
sudo apt-get update
sudo apt-get install -y ca-certificates fonts-liberation libasound2 libatk-bridge2.0-0 libatk1.0-0 libc6 libcairo2 libcups2 libdbus-1-3 libexpat1 libfontconfig1 libgbm1 libgcc1 libgconf-2-4 libgdk-pixbuf2.0-0 libglib2.0-0 libgtk-3-0 libnspr4 libnss3 libpango-1.0-0 libpangocairo-1.0-0 libstdc++6 libx11-6 libx11-xcb1 libxcb1 libxcomposite1 libxcursor1 libxdamage1 libxext6 libxfixes3 libxi6 libxrandr2 libxrender1 libxss1 libxtst6 lsb-release wget xdg-utils
```

## 5. Levantar el Servicio de PDF (Worker)
El generador de PDFs corre como un microservicio independiente en el puerto **3211**.
```bash
# Iniciar el worker
node pdf-worker.cjs
```
> [!TIP]
> Te recomendamos usar un gestor de procesos como **PM2** para mantener el worker activo:
> `npm install -g pm2`
> `pm2 start pdf-worker.cjs --name "muze-pdf-worker"`

## 6. Levantar la Aplicación Web (Frontend)
Para desarrollo o pruebas rápidas:
```bash
npm run dev
```
Para producción, genera el build estático:
```bash
npm run build
```
Y sirve la carpeta `dist/` usando Nginx o Apache.

## 7. Notas sobre la IA y Supabase
- **Edge Functions**: La lógica de los agentes reside en Supabase. Asegúrate de tener las variables de entorno configuradas en tu dashboard de Supabase (URL y API Keys).
- **PDF Worker**: La aplicación web (`App.jsx`) está configurada para buscar el worker en `localhost:3211`. Si el VPS tiene una IP pública distinta, ajusta la constante en el frontend.

---
Muze AI Consulting · 2026
