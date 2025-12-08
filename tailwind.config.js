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
        'background-light': "#f3f4f6", 
      },
      borderRadius: {
        DEFAULT: "0.5rem", 
      },
    },
  },
  plugins: [],
}