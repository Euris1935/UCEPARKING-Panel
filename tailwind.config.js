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
        'uce-light': '#ffffff',
        'background-light': "#ffffff", 
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