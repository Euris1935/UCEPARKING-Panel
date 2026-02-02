// tailwind.config.js

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}", 
  ],
  theme: {
    extend: {
      colors: {
        primary: "#1d4ed8",
        uce: "#2eb17b", 
        // ⬅️ DEFINICIÓN DEL NUEVO COLOR DE FONDO SUAVE
        'uce-light': '#ffffffff', // Un verde muy pálido (similar al tono 100 o 50 de Tailwind)
        'background-light': "#f3f4f6", 
      },
      borderRadius: {
        DEFAULT: "0.5rem", 
      },
      fontFamily: {
        display: ["Roboto", "sans-serif"],
      },
    },
  },
  plugins: [],
}